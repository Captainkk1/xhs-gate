// popup.js —— 弹出面板逻辑

const el = {
  badge: document.getElementById('badge'),
  progressText: document.getElementById('progress-text'),
  goalValue: document.getElementById('goal-value'),
  goalBtn: document.getElementById('goal-btn'),
  progressFill: document.getElementById('progress-fill'),
  hint: document.getElementById('hint'),
  taskInput: document.getElementById('task-input'),
  addBtn: document.getElementById('add-btn'),
  taskList: document.getElementById('task-list'),
  emptyState: document.getElementById('empty-state'),
  summaryToggle: document.getElementById('summary-toggle'),
  summaryBody: document.getElementById('summary-body'),
  summaryDone: document.getElementById('summary-done'),
  summaryTodo: document.getElementById('summary-todo'),
  historyToggle: document.getElementById('history-toggle'),
  historyList: document.getElementById('history-list'),
  previewOverlay: document.getElementById('preview-overlay'),
  previewImg: document.getElementById('preview-img'),
  fileInput: document.getElementById('file-input'),
  langSelect: document.getElementById('lang-select')
};

// 当前正在等待上传截图的任务 id。
let pendingTaskId = null;

// 缓存最近一次渲染用的数据，切换语言时可以就地重绘，不用再问 background。
let lastState = null;
let lastHistory = null;

// 历史里被展开的日期，重绘（如切换语言）后保持展开状态。
const expandedHistoryDates = new Set();

// 正在行内编辑的任务 id；编辑期间不做自动重绘，免得输入框被冲掉。
let editingTaskId = null;
// 上一次算出的"可编辑任务"指纹，用来发现改错字窗口到点了要重绘。
let lastEditableSig = '';

function send(message) {
  return chrome.runtime.sendMessage(message);
}

// 把用户选中的图片文件压缩后转成 dataURL，控制存储体积。
function fileToResizedDataUrl(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(I18N.t('imageLoadFailed')));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function render(state) {
  if (!state || state.error) return;
  lastState = state;

  const { done, total, goal, unlocked, tasks } = state;

  el.badge.textContent = I18N.t(unlocked ? 'badgeUnlocked' : 'badgeLocked');
  el.badge.className = `badge ${unlocked ? 'badge-unlocked' : 'badge-locked'}`;

  // 分母统一用目标，跟右边的「目标：N」和进度条口径一致。
  el.progressText.textContent = I18N.t('progressText', { done, goal });
  el.goalValue.textContent = goal;

  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressFill.style.background = unlocked ? 'var(--green)' : 'var(--xhs-red)';

  if (unlocked) {
    el.hint.textContent = I18N.t('hintUnlocked');
  } else {
    const remain = Math.max(0, goal - done);
    const parts = [I18N.t('hintRemaining', { remain })];
    // 任务数比目标还少时，光打卡也达不了标，单独提醒一句。
    // total 为 0 时下方已有"还没有任务"的空状态，不再重复。
    if (total > 0 && total < goal) {
      parts.push(I18N.t('hintNeedMoreTasks', { total, missing: goal - total }));
    }
    el.hint.textContent = parts.join(' ');
  }

  el.taskList.innerHTML = '';
  if (tasks.length === 0) {
    el.emptyState.style.display = 'block';
  } else {
    el.emptyState.style.display = 'none';
    for (const task of tasks) {
      el.taskList.appendChild(makeTaskItem(task));
    }
  }

  lastEditableSig = editableSignature(state);
  renderSummary(state);
  // 历史列表里的"今天"那一行来自当前状态，任务变化后要跟着刷新。
  refreshHistoryIfOpen();
}

// 面板开着的时候，改错字窗口可能悄悄到点，这时要把 ✎ 收掉。
setInterval(() => {
  if (!lastState || editingTaskId) return;
  if (editableSignature(lastState) !== lastEditableSig) render(lastState);
}, 1000);

// ---------- 今日任务清单（折叠汇总） ----------

function updateSummaryToggleLabel() {
  const arrow = el.summaryBody.hidden ? '▾' : '▴';
  const done = lastState ? lastState.done : 0;
  const total = lastState ? lastState.total : 0;
  el.summaryToggle.textContent = `${I18N.t('summaryToggle', { done, total })} ${arrow}`;
}

function fillSummaryList(listEl, tasks, emptyKey) {
  listEl.innerHTML = '';
  if (tasks.length === 0) {
    const li = document.createElement('li');
    li.className = 'summary-empty';
    li.textContent = I18N.t(emptyKey);
    listEl.appendChild(li);
    return;
  }
  for (const task of tasks) {
    const li = document.createElement('li');
    li.className = `summary-item${task.done ? ' done' : ''}`;
    li.textContent = `${task.done ? '✓' : '○'} ${task.text}`;
    listEl.appendChild(li);
  }
}

function renderSummary(state) {
  const tasks = state.tasks || [];
  fillSummaryList(el.summaryDone, tasks.filter((t) => t.done), 'summaryEmptyDone');
  fillSummaryList(el.summaryTodo, tasks.filter((t) => !t.done), 'summaryEmptyTodo');
  updateSummaryToggleLabel();
}

el.summaryToggle.addEventListener('click', () => {
  el.summaryBody.hidden = !el.summaryBody.hidden;
  updateSummaryToggleLabel();
});

// ---------- 改错字窗口 ----------

// 剩余可编辑毫秒数；已打卡或过了窗口都返回 0。
function editMsLeft(task) {
  if (!lastState || task.done || !task.createdAt) return 0;
  const windowMs = lastState.editWindowMs || 0;
  return Math.max(0, task.createdAt + windowMs - Date.now());
}

function formatMsLeft(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function editableSignature(state) {
  return (state.tasks || [])
    .filter((t) => editMsLeft(t) > 0)
    .map((t) => t.id)
    .join(',');
}

// 把文字换成输入框；回车保存，Esc 取消，失焦也保存。
function startEdit(li, textEl, task) {
  if (editingTaskId) return;
  editingTaskId = task.id;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'task-edit-input';
  input.maxLength = 120;
  input.value = task.text;
  input.title = I18N.t('editInputTitle');
  li.replaceChild(input, textEl);
  input.focus();
  input.select();

  let settled = false;
  const finish = async (save) => {
    if (settled) return;
    settled = true;
    const text = input.value.trim();
    editingTaskId = null;
    if (!save || !text || text === task.text) {
      render(lastState);
      return;
    }
    const res = await send({ type: 'EDIT_TASK', id: task.id, text });
    render(res);
    if (res && res.editDenied) {
      window.alert(I18N.t(res.editDenied === 'done' ? 'editDone' : 'editExpired'));
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.done ? ' done' : ''}`;

  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;
  li.appendChild(text);

  const msLeft = editMsLeft(task);
  if (msLeft > 0) {
    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✎';
    editBtn.title = I18N.t('editBtnTitle', { time: formatMsLeft(msLeft) });
    editBtn.addEventListener('click', () => startEdit(li, text, task));
    li.appendChild(editBtn);
  }

  if (task.done) {
    // 已打卡：显示缩略图（点击可预览）+ 撤销按钮。
    const thumb = document.createElement('img');
    thumb.className = 'task-thumb';
    thumb.alt = I18N.t('proofAlt');
    loadThumb(thumb, task.screenshotId);
    thumb.addEventListener('click', () => showPreview(task.screenshotId));
    li.appendChild(thumb);

    const undoBtn = document.createElement('button');
    undoBtn.className = 'undo-btn';
    undoBtn.textContent = I18N.t('undoBtn');
    undoBtn.title = I18N.t('undoBtnTitle');
    undoBtn.addEventListener('click', async () => {
      render(await send({ type: 'UNDO_TASK', id: task.id }));
    });
    li.appendChild(undoBtn);
  } else {
    // 未打卡：显示"上传截图完成"按钮。
    const proofBtn = document.createElement('button');
    proofBtn.className = 'proof-btn';
    proofBtn.textContent = I18N.t('proofBtn');
    proofBtn.addEventListener('click', () => triggerUpload(task.id));
    li.appendChild(proofBtn);
  }

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.title = I18N.t('deleteBtnTitle');
  del.addEventListener('click', async () => {
    // 删任务是唯一能绕过约束的口子，加一层确认，别手一滑就没了。
    const key = task.done ? 'deleteConfirmDone' : 'deleteConfirm';
    if (!window.confirm(I18N.t(key, { text: task.text }))) return;
    render(await send({ type: 'DELETE_TASK', id: task.id }));
  });
  li.appendChild(del);

  return li;
}

async function loadThumb(imgEl, screenshotId) {
  if (!screenshotId) return;
  const res = await send({ type: 'GET_SCREENSHOT', id: screenshotId });
  if (res && res.dataUrl) imgEl.src = res.dataUrl;
}

async function showPreview(screenshotId) {
  if (!screenshotId) return;
  const res = await send({ type: 'GET_SCREENSHOT', id: screenshotId });
  if (res && res.dataUrl) {
    el.previewImg.src = res.dataUrl;
    el.previewOverlay.hidden = false;
  }
}

el.previewOverlay.addEventListener('click', () => {
  el.previewOverlay.hidden = true;
  el.previewImg.src = '';
});

function triggerUpload(taskId) {
  pendingTaskId = taskId;
  // 清空 value，保证连续给不同任务选同一张图也能触发 change。
  el.fileInput.value = '';
  el.fileInput.click();
}

el.fileInput.addEventListener('change', async () => {
  const file = el.fileInput.files && el.fileInput.files[0];
  const taskId = pendingTaskId;
  pendingTaskId = null;
  if (!file || !taskId) return;

  try {
    const dataUrl = await fileToResizedDataUrl(file);
    render(await send({ type: 'COMPLETE_TASK', id: taskId, dataUrl }));
  } catch (e) {
    window.alert(I18N.t('screenshotFailed'));
  } finally {
    el.fileInput.value = '';
  }
});

async function addTask() {
  const text = el.taskInput.value.trim();
  if (!text) return;
  el.taskInput.value = '';
  render(await send({ type: 'ADD_TASK', text }));
  el.taskInput.focus();
}

// ---------- 近 7 天历史 ----------

function updateHistoryToggleLabel() {
  const arrow = el.historyList.hidden ? '▾' : '▴';
  el.historyToggle.textContent = `${I18N.t('historyToggle')} ${arrow}`;
}

function renderHistory(history) {
  lastHistory = history;
  el.historyList.innerHTML = '';
  if (!history || history.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = I18N.t('historyEmpty');
    el.historyList.appendChild(empty);
    return;
  }
  for (const h of [...history].reverse()) {
    const li = document.createElement('li');
    li.className = 'history-entry';

    const row = document.createElement('div');
    row.className = `history-item${h.isToday ? ' today' : ''}`;
    row.setAttribute('role', 'button');
    row.tabIndex = 0;

    const date = document.createElement('span');
    date.className = 'history-date';

    const result = document.createElement('span');
    result.className = `history-result ${h.unlocked ? 'ok' : 'fail'}`;
    result.textContent = `${h.done}/${h.goal} ${I18N.t(h.unlocked ? 'historyPass' : 'historyFail')}`;

    row.append(date, result);
    li.appendChild(row);

    const detail = document.createElement('ul');
    detail.className = 'history-detail';
    fillHistoryDetail(detail, h.items);
    detail.hidden = !expandedHistoryDates.has(h.date);
    li.appendChild(detail);

    const updateDateLabel = () => {
      const label = h.isToday ? `${h.date} · ${I18N.t('historyToday')}` : h.date;
      date.textContent = `${detail.hidden ? '▸' : '▾'} ${label}`;
    };
    updateDateLabel();

    const toggle = () => {
      detail.hidden = !detail.hidden;
      if (detail.hidden) expandedHistoryDates.delete(h.date);
      else expandedHistoryDates.add(h.date);
      updateDateLabel();
    };
    row.addEventListener('click', toggle);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });

    el.historyList.appendChild(li);
  }
}

// 渲染某一天的任务明细；旧版本的历史记录没有 items 字段，只能提示无明细。
function fillHistoryDetail(listEl, items) {
  listEl.innerHTML = '';
  if (!Array.isArray(items) || items.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-detail-empty';
    li.textContent = I18N.t('historyNoDetail');
    listEl.appendChild(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `history-detail-item${item.done ? ' done' : ''}`;
    li.textContent = `${item.done ? '✓' : '✗'} ${item.text}`;
    listEl.appendChild(li);
  }
}

async function refreshHistoryIfOpen() {
  if (el.historyList.hidden) return;
  const res = await send({ type: 'GET_HISTORY' });
  renderHistory(res && res.history);
}

el.historyToggle.addEventListener('click', async () => {
  el.historyList.hidden = !el.historyList.hidden;
  updateHistoryToggleLabel();
  await refreshHistoryIfOpen();
});

// ---------- 事件绑定 ----------

el.addBtn.addEventListener('click', addTask);

el.taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addTask();
  }
});

el.goalBtn.addEventListener('click', async () => {
  const current = el.goalValue.textContent;
  const locked = lastState && lastState.goalLockedToday;
  const prompt = locked
    ? I18N.t('goalPromptLocked', { goal: current })
    : I18N.t('goalPrompt');
  const input = window.prompt(prompt, current);
  if (input === null) return;
  const goal = parseInt(input, 10);
  if (!Number.isFinite(goal) || goal < 1) {
    window.alert(I18N.t('goalInvalid'));
    return;
  }
  const res = await send({ type: 'SET_GOAL', goal });
  render(res);
  if (res && res.goalDenied) window.alert(I18N.t('goalDenied'));
});

// ---------- 初始化 ----------

(async () => {
  await I18N.init();
  I18N.applyStatic();
  I18N.mountSelect(el.langSelect, () => {
    // 切换语言后重绘动态内容（静态节点已由 applyStatic 处理）。
    updateHistoryToggleLabel();
    if (lastState) render(lastState);
    if (!el.historyList.hidden) renderHistory(lastHistory);
  });
  updateHistoryToggleLabel();
  updateSummaryToggleLabel();

  render(await send({ type: 'GET_STATE' }));
  el.taskInput.focus();
})();
