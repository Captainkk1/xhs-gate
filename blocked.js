// blocked.js —— 拦截提示页逻辑

const XHS_HOME = 'https://www.xiaohongshu.com/';

const el = {
  done: document.getElementById('done'),
  goal: document.getElementById('goal'),
  progressFill: document.getElementById('progress-fill'),
  refreshBtn: document.getElementById('refresh-btn'),
  unlockedNote: document.getElementById('unlocked-note'),
  langSelect: document.getElementById('lang-select')
};

function send(message) {
  return chrome.runtime.sendMessage(message);
}

function render(state) {
  if (!state || state.error) return state;

  const { done, goal, unlocked } = state;
  el.done.textContent = done;
  el.goal.textContent = goal;

  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressFill.style.background = unlocked ? '#22c55e' : '#ff2442';

  return state;
}

async function checkAndMaybeUnlock() {
  const state = render(await send({ type: 'GET_STATE' }));
  if (state && state.unlocked) {
    el.unlockedNote.style.display = 'block';
    el.refreshBtn.disabled = true;
    setTimeout(() => {
      window.location.href = XHS_HOME;
    }, 900);
  }
}

el.refreshBtn.addEventListener('click', checkAndMaybeUnlock);

// 初始加载：先确定语言、翻译静态文案，再刷新进度。
(async () => {
  await I18N.init();
  I18N.applyStatic();
  I18N.mountSelect(el.langSelect);
  checkAndMaybeUnlock();
})();

// 页面重新可见时也刷新一次进度（例如切回本标签页）。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkAndMaybeUnlock();
  }
});
