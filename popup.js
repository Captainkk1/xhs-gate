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
  emptyState: document.getElementById('empty-state')
};

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function render(state) {
  if (!state || state.error) return;

  const { done, total, goal, unlocked, tasks } = state;

  // 徽章
  el.badge.textContent = unlocked ? '已解锁' : '未解锁';
  el.badge.className = `badge ${unlocked ? 'badge-unlocked' : 'badge-locked'}`;

  // 进度
  el.progressText.textContent = `${done} / ${total} 项已完成`;
  el.goalValue.textContent = goal;

  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressFill.style.background = unlocked ? 'var(--green)' : 'var(--xhs-red)';

  // 提示
  if (unlocked) {
    el.hint.textContent = '🎉 已达标，现在可以访问小红书了。';
  } else {
    const remain = Math.max(0, goal - done);
    el.hint.textContent = `再完成 ${remain} 项即可解锁小红书。`;
  }

  // 任务列表
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

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.done;
  checkbox.addEventListener('change', async () => {
    render(await send({ type: 'TOGGLE_TASK', id: task.id }));
  });

  const text = document.createElement('span');
  text.className = 'task-text';
  text.textContent = task.text;

  const del = document.createElement('button');
  del.className = 'delete-btn';
  del.textContent = '×';
  del.title = '删除任务';
  del.addEventListener('click', async () => {
    render(await send({ type: 'DELETE_TASK', id: task.id }));
  });

  li.append(checkbox, text, del);
  return li;
}

async function addTask() {
  const text = el.taskInput.value.trim();
  if (!text) return;
  el.taskInput.value = '';
  render(await send({ type: 'ADD_TASK', text }));
  el.taskInput.focus();
}

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
  const input = window.prompt('设置今日需要完成的任务数（目标）：', current);
  if (input === null) return;
  const goal = parseInt(input, 10);
  if (!Number.isFinite(goal) || goal < 1) {
    window.alert('请输入一个不小于 1 的整数。');
    return;
  }
  render(await send({ type: 'SET_GOAL', goal }));
});

// ---------- 初始化 ----------

(async () => {
  render(await send({ type: 'GET_STATE' }));
  el.taskInput.focus();
})();
