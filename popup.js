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

  el.progressText.textContent = I18N.t('progressText', { done, total });
  el.goalValue.textContent = goal;

  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressFill.style.background = unlocked ? 'var(--green)' : 'var(--xhs-red)';

  if (unlocked) {
    el.hint.textContent = I18N.t('hintUnlocked');
  } else {
    const remain = Math.max(0, goal - done);
    el.hint.textContent = I18N.t('hintRemaining', { remain });
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
}

function makeTaskItem(task) {
  const li = document.createElement('li');
  li.className = `task-item${task.done ? ' done' : ''}`;

  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;
  li.appendChild(text);

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
    li.className = 'history-item';

    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = h.date;

    const result = document.createElement('span');
    result.className = `history-result ${h.unlocked ? 'ok' : 'fail'}`;
    result.textContent = `${h.done}/${h.goal} ${I18N.t(h.unlocked ? 'historyPass' : 'historyFail')}`;

    li.append(date, result);
    el.historyList.appendChild(li);
  }
}

el.historyToggle.addEventListener('click', async () => {
  const wasHidden = el.historyList.hidden;
  el.historyList.hidden = !wasHidden;
  updateHistoryToggleLabel();
  if (wasHidden) {
    const res = await send({ type: 'GET_HISTORY' });
    renderHistory(res && res.history);
  }
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
  const input = window.prompt(I18N.t('goalPrompt'), current);
  if (input === null) return;
  const goal = parseInt(input, 10);
  if (!Number.isFinite(goal) || goal < 1) {
    window.alert(I18N.t('goalInvalid'));
    return;
  }
  render(await send({ type: 'SET_GOAL', goal }));
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

  render(await send({ type: 'GET_STATE' }));
  el.taskInput.focus();
})();
