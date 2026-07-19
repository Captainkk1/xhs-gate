// background.js —— 任务解锁小红书 service worker
// 负责：任务状态管理（增/删/勾选/设目标/按日期重置）+ 小红书导航拦截。

const STORAGE_KEY = 'xhsGateState';
const DEFAULT_GOAL = 3;
const ALARM_NAME = 'xhs-gate-daily-check';

// ---------- 工具函数 ----------

// 返回本地时区的今天日期字符串（YYYY-MM-DD）。
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function makeId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// 读取状态；如果日期变化则重置任务列表（保留目标数）。
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
    // 新的一天：清空任务，保留目标数。
    state = {
      date: today,
      goal: typeof state.goal === 'number' && state.goal > 0 ? state.goal : DEFAULT_GOAL,
      tasks: []
    };
    await saveState(state);
  }

  // 兜底字段完整性
  if (typeof state.goal !== 'number' || state.goal < 1) state.goal = DEFAULT_GOAL;
  if (!Array.isArray(state.tasks)) state.tasks = [];
  return state;
}

async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}

// 计算派生信息：完成数、是否解锁。
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
        state.tasks.push({ id: makeId(), text, done: false });
        await saveState(state);
      }
      return summarize(state);
    }

    case 'TOGGLE_TASK': {
      const task = state.tasks.find((t) => t.id === msg.id);
      if (task) {
        task.done = !task.done;
        await saveState(state);
      }
      return summarize(state);
    }

    case 'DELETE_TASK': {
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

    default:
      return { error: `未知的消息类型: ${msg.type}` };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: String(err) }));
  // 返回 true 表示异步 sendResponse。
  return true;
});

// ---------- 导航拦截 ----------

function isXhsHost(hostname) {
  return hostname === 'xiaohongshu.com' || hostname.endsWith('.xiaohongshu.com');
}

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // 只拦截主框架导航。
  if (details.frameId !== 0) return;

  let url;
  try {
    url = new URL(details.url);
  } catch (e) {
    return;
  }

  if (!isXhsHost(url.hostname)) return;

  const summary = summarize(await loadState());
  if (summary.unlocked) return; // 已达标，放行。

  // 未达标：重定向到拦截页。
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
    // loadState 内部会在日期变化时自动重置。
    loadState();
  }
});
