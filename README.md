# 任务解锁小红书 (xhs-gate)

一个 Chrome / Edge 浏览器扩展（Manifest V3），用「完成任务才能娱乐」的机制帮你在工作前不被小红书打断。

> 每天先在插件里设定并完成一定数量的任务，达标后才能访问小红书网页版（xiaohongshu.com）。
> 未达标时访问小红书会被自动拦截，跳转到提示页面。每天 0 点自动重置任务列表，目标数保留。

## ✨ 功能特性

- **任务门槛**：设定今日目标任务数，完成数达标才解锁小红书。
- **截图打卡**：每个任务必须上传一张截图作为完成凭证才能标记为已完成，比单纯勾选更严格。
- **自动拦截**：未达标时访问 `xiaohongshu.com` 会自动跳转到提示页。
- **每日重置 + 结算通知**：以本地日期（`YYYY-MM-DD`）为准，跨天自动清空任务列表并保留目标数；跨天时会弹出系统通知结算「昨天」的完成情况。
- **每周结算通知**：每周日结算时额外弹出一次本周汇总通知（本周解锁天数 / 累计完成任务数）。
- **近 7 天记录**：弹出面板底部可展开查看最近 7 天的打卡历史。
- **兜底刷新**：用 `chrome.alarms` 每小时检查一次日期变化，防止 service worker 长时间休眠导致不重置、不结算。
- **本地存储**：任务状态存 `chrome.storage.local`，打卡截图存浏览器本地 `IndexedDB`，不上传、不联网。
- **纯原生**：无框架、无构建工具，直接加载即可运行。

## 📦 安装方法（开发者模式加载已解压扩展）

### Chrome

1. 打开 `chrome://extensions/`
2. 打开右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择本项目根目录（包含 `manifest.json` 的文件夹）

### Edge

1. 打开 `edge://extensions/`
2. 打开左下角的 **开发人员模式**
3. 点击 **加载解压缩的扩展**
4. 选择本项目根目录

加载后，建议把扩展图标固定到工具栏，方便随时打开任务面板。

## 🚀 使用方法

1. 点击工具栏上的 **「任务解锁小红书」** 图标打开面板。
2. 点右上角 **目标** 按钮设置今天需要完成的任务数。
3. 在输入框里添加今天要完成的任务（回车或点「添加」）。
4. 完成一项任务后，点击它右侧的 **📷 打卡** 按钮，选择一张截图作为完成凭证；上传后任务自动标记为已完成，并显示缩略图（点击可放大预览）。
5. 打卡有误可以点 **撤销**，会同时删除已上传的截图。
6. 当「已完成数 ≥ 目标数」时，顶部徽章变为 **已解锁**，即可正常访问小红书。
7. 未达标时访问小红书会被拦截到提示页，按提示完成任务后刷新即可解锁。
8. 每天跨天、每周日结算时会弹出系统通知汇总完成情况；也可以在面板底部展开「近 7 天打卡记录」查看历史。

## 🛠 技术说明

- **Manifest V3**，`background` 使用 service worker。
- **导航拦截**：监听 `chrome.webNavigation.onBeforeNavigate`，只处理 `frameId === 0`（主框架）且域名为 `*.xiaohongshu.com` 的导航；未达标时用 `chrome.tabs.update` 重定向到扩展内的 `blocked.html`。
- **状态管理**：`background.js` 通过 `chrome.runtime.onMessage` 响应以下消息：
  - `GET_STATE` —— 获取当前状态（任务、目标、完成数、是否解锁）
  - `ADD_TASK` —— 添加任务
  - `COMPLETE_TASK` —— 上传截图凭证并标记任务完成（写入 IndexedDB，返回截图 id）
  - `UNDO_TASK` —— 撤销打卡（删除对应截图，任务标回未完成）
  - `DELETE_TASK` —— 删除任务（如已打卡，一并删除截图）
  - `SET_GOAL` —— 设置今日目标数
  - `GET_SCREENSHOT` —— 按 id 读取某张打卡截图（用于缩略图/预览）
  - `GET_HISTORY` —— 获取最近 7 天的打卡历史
- **每日重置 + 结算**：读取状态时比较存储中的 `date` 与本地今天日期；不一致时会先对「昨天」调用 `settleDay()`——写入历史记录、弹出每日结算通知、清理昨天的打卡截图，再清空 `tasks` 并保留 `goal`。
- **每周结算**：若结算的「昨天」是周日，则额外触发 `maybeSettleWeek()`，汇总最近 7 天历史并弹出周结算通知（用一个已结算日期标记去重，避免重复通知）。
- **截图存储**：打卡截图经 popup 端 `canvas` 压缩（最大宽度 800px，JPEG 质量 0.8）后转成 dataURL，存入 service worker 里的 `IndexedDB`（`xhsGateDB` / `screenshots` 表，按 `date` 建索引），跨天结算后自动清理当天的截图以控制体积。
- **兜底检查**：`chrome.alarms` 每 60 分钟触发一次 `loadState()`，即便面板未打开也能在跨天后完成重置与结算。

### 数据结构

**chrome.storage.local**

```json
{
  "xhsGateState": {
    "date": "2026-07-19",
    "goal": 3,
    "tasks": [
      { "id": "t_...", "text": "写完周报", "done": false, "screenshotId": null }
    ]
  },
  "xhsGateHistory": [
    { "date": "2026-07-18", "goal": 3, "done": 3, "total": 4, "unlocked": true }
  ],
  "xhsGateLastWeeklySettledDate": "2026-07-19"
}
```

**IndexedDB（`xhsGateDB` / `screenshots` 表）**

```json
{ "id": 1, "taskId": "t_...", "date": "2026-07-18", "dataUrl": "data:image/jpeg;base64,...", "createdAt": 1752835200000 }
```

## 📁 目录结构

```
xhs-gate/
├── manifest.json      # 扩展清单（权限、action、background、web_accessible_resources）
├── background.js      # service worker：状态管理 + 导航拦截 + 定时兜底
├── popup.html         # 弹出面板结构
├── popup.css          # 弹出面板样式
├── popup.js           # 弹出面板逻辑
├── blocked.html       # 拦截提示页
├── blocked.js         # 拦截页逻辑（进度显示 + 刷新解锁）
├── icons/             # 16 / 48 / 128 尺寸图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── LICENSE            # MIT
└── .gitignore
```

## 📄 许可证

[MIT](./LICENSE)
