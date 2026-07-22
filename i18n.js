// i18n.js —— 共享的多语言字典与工具函数 / Shared i18n dictionary and helpers.
//
// 同时被弹出面板、拦截页和 service worker 使用：
// - 页面里用 <script src="i18n.js"> 引入
// - background.js 里用 importScripts('i18n.js') 引入
//
// 语言偏好存在 chrome.storage.local 的 xhsGateLocale 里，
// 用户可以在界面上自由切换，与浏览器界面语言无关。

const LOCALE_KEY = 'xhsGateLocale';

const MESSAGES = {
  zh: {
    // ---------- 通用 ----------
    appName: '任务解锁小红书',
    langLabel: '语言',

    // ---------- 弹出面板 ----------
    badgeLocked: '未解锁',
    badgeUnlocked: '已解锁',
    progressText: '{done} / {goal} 项已完成',
    goalLabel: '目标：',
    goalBtnTitle: '设置今日目标',
    hintUnlocked: '🎉 已达标，现在可以访问小红书了。',
    hintRemaining: '再打卡完成 {remain} 项即可解锁小红书（需上传截图凭证）。',
    hintNeedMoreTasks: '当前只添加了 {total} 个任务，还差 {missing} 个才够达标。',
    taskInputPlaceholder: '添加一个今日任务，回车提交',
    addBtn: '添加',
    emptyState: '还没有任务，先添加今天要完成的事情吧。',

    proofBtn: '📷 打卡',
    proofAlt: '打卡凭证',
    previewAlt: '打卡截图预览',
    undoBtn: '撤销',
    undoBtnTitle: '撤销打卡（会删除已上传的截图）',
    deleteBtnTitle: '删除任务',
    deleteConfirm: '确定删除「{text}」吗？',
    deleteConfirmDone: '确定删除「{text}」吗？已上传的打卡凭证也会一起删除。',

    editBtnTitle: '改错字（还剩 {time}）',
    editInputTitle: '回车保存，Esc 取消',
    editExpired: '过了 5 分钟的改错字窗口，这条任务不能再改了。',
    editDone: '已打卡的任务不能改文字——截图是对着原来那句话拍的。要改请先撤销打卡。',

    summaryToggle: '今日任务清单（{done}/{total}）',
    summaryDone: '已完成',
    summaryTodo: '未完成',
    summaryEmptyDone: '还没有完成的任务。',
    summaryEmptyTodo: '没有待完成的任务。',

    historyToggle: '近 7 天打卡记录',
    historyEmpty: '暂无历史记录。',
    historyPass: '✓ 达标',
    historyFail: '✗ 未达标',
    historyToday: '今天',
    historyNoDetail: '这一天没有留下任务明细。',

    goalPrompt: '设置今日需要完成的任务数（目标）：',
    goalPromptLocked: '今天的目标已经定了，只能往上加（当前 {goal}）：',
    goalInvalid: '请输入一个不小于 1 的整数。',
    goalDenied: '今天的目标只能调高，不能调低。明天可以重新设定。',
    imageLoadFailed: '图片加载失败',
    screenshotFailed: '截图处理失败，请重试。',

    // ---------- 拦截页 ----------
    blockedTitle: '先完成今天的任务 · 任务解锁小红书',
    blockedHeading: '先完成今天的任务',
    blockedSubtitle: '小红书已被暂时拦截。<br>完成设定的任务数后即可解锁访问。',
    blockedProgressLabel: '今日已完成任务 / 目标',
    blockedSteps:
      '1. 点击浏览器工具栏上的 <strong>「任务解锁小红书」</strong> 插件图标<br>' +
      '2. 添加并打卡完成今天的任务<br>' +
      '3. 达标后回到本页，点击下方按钮刷新即可解锁',
    blockedRefreshBtn: '我已完成，刷新解锁',
    blockedUnlockedNote: '✓ 已达标！正在为你打开小红书…',

    // ---------- 通知 ----------
    dailyTitleOk: '✅ 昨日打卡结算：已达标',
    dailyTitleFail: '⚠️ 昨日打卡结算：未达标',
    dailyMessageOk: '{date} 完成 {done}/{goal} 项任务，干得漂亮！',
    dailyMessageFail: '{date} 完成 {done}/{goal} 项任务，明天继续加油～',
    weeklyTitle: '📅 本周打卡结算',
    weeklyMessage: '本周共解锁 {unlockedDays}/{daysTracked} 天，累计完成 {totalDone} 项任务。',

    unknownMessageType: '未知的消息类型: {type}'
  },

  en: {
    // ---------- Common ----------
    appName: 'Task Gate for Xiaohongshu',
    langLabel: 'Language',

    // ---------- Popup ----------
    badgeLocked: 'Locked',
    badgeUnlocked: 'Unlocked',
    progressText: '{done} / {goal} completed',
    goalLabel: 'Goal: ',
    goalBtnTitle: "Set today's goal",
    hintUnlocked: '🎉 Goal reached — Xiaohongshu is unlocked.',
    hintRemaining: 'Check off {remain} more task(s) to unlock Xiaohongshu (a screenshot is required).',
    hintNeedMoreTasks: 'Only {total} task(s) added — you need {missing} more to be able to reach the goal.',
    taskInputPlaceholder: 'Add a task for today, press Enter',
    addBtn: 'Add',
    emptyState: 'No tasks yet. Add what you want to get done today.',

    proofBtn: '📷 Check in',
    proofAlt: 'Check-in proof',
    previewAlt: 'Check-in screenshot preview',
    undoBtn: 'Undo',
    undoBtnTitle: 'Undo check-in (deletes the uploaded screenshot)',
    deleteBtnTitle: 'Delete task',
    deleteConfirm: 'Delete “{text}”?',
    deleteConfirmDone: 'Delete “{text}”? The uploaded check-in proof will be deleted too.',

    editBtnTitle: 'Fix a typo ({time} left)',
    editInputTitle: 'Enter to save, Esc to cancel',
    editExpired: 'The 5-minute typo-fix window has closed — this task can no longer be edited.',
    editDone: 'A checked-in task can’t be reworded — the screenshot was taken against the original wording. Undo the check-in first.',

    summaryToggle: 'Today’s task list ({done}/{total})',
    summaryDone: 'Completed',
    summaryTodo: 'Not done',
    summaryEmptyDone: 'Nothing completed yet.',
    summaryEmptyTodo: 'Nothing left to do.',

    historyToggle: 'Last 7 days',
    historyEmpty: 'No history yet.',
    historyPass: '✓ Met',
    historyFail: '✗ Missed',
    historyToday: 'today',
    historyNoDetail: 'No task details saved for this day.',

    goalPrompt: 'How many tasks do you need to finish today?',
    goalPromptLocked: 'Today’s goal is locked in — you can only raise it (currently {goal}):',
    goalInvalid: 'Please enter a whole number of 1 or more.',
    goalDenied: 'Today’s goal can only go up, not down. You can set it fresh tomorrow.',
    imageLoadFailed: 'Failed to load image',
    screenshotFailed: 'Could not process the screenshot. Please try again.',

    // ---------- Blocked page ----------
    blockedTitle: 'Finish today’s tasks first · Task Gate',
    blockedHeading: 'Finish today’s tasks first',
    blockedSubtitle:
      'Xiaohongshu is temporarily blocked.<br>Complete your task goal to unlock access.',
    blockedProgressLabel: 'Tasks completed today / goal',
    blockedSteps:
      '1. Click the <strong>Task Gate for Xiaohongshu</strong> icon in your browser toolbar<br>' +
      '2. Add your tasks and check them in for today<br>' +
      '3. Once you hit the goal, come back here and press the button below',
    blockedRefreshBtn: 'I’m done — refresh to unlock',
    blockedUnlockedNote: '✓ Goal reached! Opening Xiaohongshu…',

    // ---------- Notifications ----------
    dailyTitleOk: '✅ Yesterday’s recap: goal met',
    dailyTitleFail: '⚠️ Yesterday’s recap: goal missed',
    dailyMessageOk: 'On {date} you finished {done}/{goal} tasks. Nicely done!',
    dailyMessageFail: 'On {date} you finished {done}/{goal} tasks. Give it another go today!',
    weeklyTitle: '📅 Weekly recap',
    weeklyMessage:
      'Unlocked on {unlockedDays} of {daysTracked} days this week, {totalDone} tasks completed in total.',

    unknownMessageType: 'Unknown message type: {type}'
  }
};

const SUPPORTED_LOCALES = [
  { code: 'zh', label: '简体中文' },
  { code: 'en', label: 'English' }
];

const FALLBACK_LOCALE = 'en';

// 没有存过偏好时，用浏览器界面语言猜一个初始值。
function detectLocale() {
  let ui = '';
  try {
    ui = chrome.i18n.getUILanguage() || '';
  } catch (e) {
    ui = '';
  }
  return ui.toLowerCase().startsWith('zh') ? 'zh' : FALLBACK_LOCALE;
}

const I18N = {
  locale: FALLBACK_LOCALE,
  ready: false,

  // 从存储里读出语言偏好；页面和 service worker 都应在使用 t() 前 await 一次。
  async init() {
    const result = await chrome.storage.local.get(LOCALE_KEY);
    const saved = result[LOCALE_KEY];
    this.locale = MESSAGES[saved] ? saved : detectLocale();
    this.ready = true;
    return this.locale;
  },

  async setLocale(locale) {
    if (!MESSAGES[locale]) return this.locale;
    this.locale = locale;
    await chrome.storage.local.set({ [LOCALE_KEY]: locale });
    return locale;
  },

  // 取一条文案，{name} 占位符会被 params 里的同名字段替换。
  t(key, params) {
    const table = MESSAGES[this.locale] || MESSAGES[FALLBACK_LOCALE];
    let text = table[key];
    if (text === undefined) text = MESSAGES[FALLBACK_LOCALE][key];
    if (text === undefined) return key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  },

  locales: SUPPORTED_LOCALES,
  storageKey: LOCALE_KEY,

  // 把带 data-i18n* 标记的静态节点翻译一遍。
  // data-i18n → textContent，data-i18n-html → innerHTML（仅用于内置文案，
  // 里面含 <br>/<strong>），其余对应同名属性。
  applyStatic(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = this.t(node.dataset.i18n);
    });
    root.querySelectorAll('[data-i18n-html]').forEach((node) => {
      node.innerHTML = this.t(node.dataset.i18nHtml);
    });
    for (const attr of ['placeholder', 'title', 'alt']) {
      const selector = `[data-i18n-${attr}]`;
      const dataKey = `i18n${attr.charAt(0).toUpperCase()}${attr.slice(1)}`;
      root.querySelectorAll(selector).forEach((node) => {
        node.setAttribute(attr, this.t(node.dataset[dataKey]));
      });
    }
    const titleNode = document.querySelector('title[data-i18n-title-key]');
    if (titleNode) document.title = this.t(titleNode.dataset.i18nTitleKey);
    document.documentElement.lang = this.locale === 'zh' ? 'zh-CN' : 'en';
  },

  // 在页面里放一个语言下拉框，切换后回调 onChange。
  mountSelect(selectEl, onChange) {
    selectEl.innerHTML = '';
    for (const { code, label } of SUPPORTED_LOCALES) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = label;
      selectEl.appendChild(option);
    }
    selectEl.value = this.locale;
    selectEl.addEventListener('change', async () => {
      await this.setLocale(selectEl.value);
      this.applyStatic();
      if (onChange) onChange(this.locale);
    });
  }
};

globalThis.I18N = I18N;
