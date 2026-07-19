// background.js —— 任务解锁小红书 service worker
// 负责：任务状态管理（增/删/勾选/设目标/按日期重置）+ 打卡截图存储（IndexedDB）
// + 每日/每周结算通知 + 小红书导航拦截。

const STORAGE_KEY = 'xhsGateState';
const HISTORY_KEY = 'xhsGateHistory';
const WEEKLY_FLAG_KEY = 'xhsGateLastWeeklySettledDate';
const DEFAULT_GOAL = 3;
const ALARM_NAME = 'xhs-gate-daily-check';
const HISTORY_MAX = 60;

const DB_NAME = 'xhsGateDB';
const DB_VERSION = 1;
const STORE = 'screenshots';

// ---------- IndexedDB：打卡截图存储 ----------

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addScreenshot(taskId, date, dataUrl) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add({ taskId, date, dataUrl, createdAt: Date.now() });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getScreenshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteScreenshot(id) {
  if (!id) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 清除某一天的所有打卡截图（用于跨天结算后释放空间）。
async function deleteScreenshotsByDate(date) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const idx = tx.objectStore(STORE).index('date');
    const req = idx.openCursor(IDBKeyRange.only(date));
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- 工具函数 ----------

function todayStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function makeId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 历史记录（用于周结算，不含图片，体积很小） ----------

async function loadHistory() {
  const result = await chrome.storage.local.get(HISTORY_KEY);
  return Array.isArray(result[HISTORY_KEY]) ? result[HISTORY_KEY] : [];
}

async function appendHistory(entry) {
  const history = await loadHistory();
  history.push(entry);
  while (history.length > HISTORY_MAX) history.shift();
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history;
}

// ---------- 每日 / 每周结算 ----------

// 在跨天时对"昨天"的状态做结算：写入历史、发通知、清理昨天的截图。
async function settleDay(oldState) {
  const done = oldState.tasks.filter((t) => t.done).length;
  const total = oldState.tasks.length;
  const goal = oldState.goal;
  const unlocked = done >= goal && goal > 0;

  await appendHistory({ date: oldState.date, goal, done, total, unlocked });

  chrome.notifications.create(`daily-${oldState.date}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: unlocked ? '✅ 昨日打卡结算：已达标' : '⚠️ 昨日打卡结算：未达标',
    message: `${oldState.date} 完成 ${done}/${goal} 项任务${unlocked ? '，干得漂亮！' : '，明天继续加油～'}`,
    priority: 1
  });

  await deleteScreenshotsByDate(oldState.date);

  // 如果昨天是周日（一周的最后一天），顺带做一次周结算。
  const weekday = new Date(`${oldState.date}T00:00:00`).getDay(); // 0 = 周日
  if (weekday === 0) {
    await maybeSettleWeek(oldState.date);
  }
}

// 周结算：汇总最近 7 天的历史记录，避免重复发送。
async function maybeSettleWeek(weekEndDate) {
  const flag = await chrome.storage.local.get(WEEKLY_FLAG_KEY);
  if (flag[WEEKLY_FLAG_KEY] === weekEndDate) return; // 本周已结算过

  const history = await loadHistory();
  const endTime = new Date(`${weekEndDate}T00:00:00`).getTime();
  const startTime = endTime - 6 * 24 * 60 * 60 * 1000;

  const weekEntries = history.filter((h) => {
    const t = new Date(`${h.date}T00:00:00`).getTime();
    return t >= startTime && t <= endTime;
  });

  const unlockedDays = weekEntries.filter((h) => h.unlocked).length;
  const totalDone = weekEntries.reduce((sum, h) => sum + h.done, 0);
  const daysTracked = weekEntries.length;

  chrome.notifications.create(`weekly-${weekEndDate}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '📅 本周打卡结算',
    message: `本周共解锁 ${unlockedDays}/${daysTracked} 天，累计完成 ${totalDone} 项任务。`,
    priority: 1
  });

  await chrome.storage.local.set({ [WEEKLY_FLAG_KEY]: weekEndDate });
}

// ---------- 状态读写 ----------

// 读取状态；如果日期变化则结算昨天并重置任务列表（保留目标数）。
async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  let state = result[STORAGE_KEY];
  const today = todayStr();

  if (!state || typeof state !== 'object') {
    state = { date: today, goal: DEFAULT_GOAL, tasks: [] };
    await saveState(state);
    return state;
  }

  if (state.date !== today) {
    await settleDay(state);
    state = {
      date: today,
      goal: typeof state.goal === 'number' && state.goal > 0 ? state.goal : DEFAULT_GOAL,
      tasks: []
    };
    await saveState(state);
  }

  if (typeof state.goal !== 'number' || state.goal < 1) state.goal = DEFAULT_GOAL;
  if (!Array.isArray(state.tasks)) state.tasks = [];
  return state;
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

function summarize(state) {
  const done = state.tasks.filter((t) => t.done).length;
  const total = state.tasks.length;
  const unlocked = done >= state.goal && state.goal > 0;
  return {
    date: state.date,
    goal: state.goal,
    tasks: state.tasks,
    done,
    total,
    unlocked
  };
}

// ---------- 消息处理 ----------

async function handleMessage(msg) {
  const state = await loadState();

  switch (msg.type) {
    case 'GET_STATE':
      return summarize(state);

    case 'ADD_TASK': {
      const text = (msg.text || '').trim();
      if (text) {
        state.tasks.push({ id: makeId(), text, done: false, screenshotId: null });
        await saveState(state);
      }
      return summarize(state);
    }

    // 打卡：必须附带截图凭证才能标记任务完成。
    case 'COMPLETE_TASK': {
      const task = state.tasks.find((t) => t.id === msg.id);
      if (task && !task.done && msg.dataUrl) {
        const screenshotId = await addScreenshot(task.id, state.date, msg.dataUrl);
        task.done = true;
        task.screenshotId = screenshotId;
        await saveState(state);
      }
      return summarize(state);
    }

    // 撤销打卡：删除对应截图并把任务标回未完成。
    case 'UNDO_TASK': {
      const task = state.tasks.find((t) => t.id === msg.id);
      if (task && task.done) {
        await deleteScreenshot(task.screenshotId);
        task.done = false;
        task.screenshotId = null;
        await saveState(state);
      }
      return summarize(state);
    }

    case 'DELETE_TASK': {
      const task = state.tasks.find((t) => t.id === msg.id);
      if (task && task.screenshotId) {
        await deleteScreenshot(task.screenshotId);
      }
      state.tasks = state.tasks.filter((t) => t.id !== msg.id);
      await saveState(state);
      return summarize(state);
    }

    case 'SET_GOAL': {
      const goal = parseInt(msg.goal, 10);
      if (Number.isFinite(goal) && goal >= 1) {
        state.goal = goal;
        await saveState(state);
      }
      return summarize(state);
    }

    case 'GET_SCREENSHOT': {
      const record = await getScreenshot(msg.id);
      return { dataUrl: record ? record.dataUrl : null };
    }

    case 'GET_HISTORY': {
      const history = await loadHistory();
      return { history: history.slice(-7) };
    }

    default:
      return { error: `未知的消息类型: ${msg.type}` };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  return true;
});

// ---------- 导航拦截 ----------

function isXhsHost(hostname) {
  return hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com');
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return;
  }

  if (!isXhsHost(url.hostname)) return;

  const summary = summarize(await loadState());
  if (summary.unlocked) return;

  const blockedUrl = chrome.runtime.getURL('blocked.html');
  chrome.tabs.update(details.tabId, { url: blockedUrl });
});

// ---------- 定时兜底：每小时检查日期变化 ----------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
  loadState();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 60 });
  loadState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    loadState();
  }
});
