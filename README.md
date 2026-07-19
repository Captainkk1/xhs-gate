# 任务解锁小红书 (xhs-gate)

一个 Chrome / Edge 浏览器扩展（Manifest V3），用「完成任务才能娱乐」的机制帮你在工作前不被小红书打断。

> 每天先在插件里设定并完成一定数量的任务，达标后才能访问小红书网页版（xiaohongshu.com）。
> 未达标时访问小红书会被自动拦截，跳转到提示页面。每天 0 点自动重置任务列表，目标数保留。

## ✨ 功能特性

- **任务门槛**：设定今日目标任务数，完成数达标才解锁小红书。
- **自动拦截**：未达标时访问 `xiaohongshu.com` 会自动跳转到提示页。
- **每日重置**：以本地日期（`YYYY-MM-DD`）为准，跨天自动清空任务列表并保留目标数。
- **兜底刷新**：用 `chrome.alarms` 每小时检查一次日期变化，防止 service worker 长时间休眠导致不重置。
- **本地存储**：所有数据存在 `chrome.storage.local`，不上传、不联网。
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
4. 完成一项就勾选它的复选框；完成的任务会显示删除线。
5. 当「已完成数 ≥ 目标数」时，顶部徽章变为 **已解锁**，即可正常访问小红书。
6. 未达标时访问小红书会被拦截到提示页，按提示完成任务后刷新即可解锁。

## 🛠 技术说明

- **Manifest V3**，`background` 使用 service worker。
- **导航拦截**：监听 `chrome.webNavigation.onBeforeNavigate`，只处理 `frameId === 0`（主框架）且域名为 `*.xiaohongshu.com` 的导航；未达标时用 `chrome.tabs.update` 重定向到扩展内的 `blocked.html`。
- **状态管理**：`background.js` 通过 `chrome.runtime.onMessage` 响应以下消息：
  - `GET_STATE` —— 获取当前状态（任务、目标、完成数、是否解锁）
  - `ADD_TASK` —— 添加任务
  - `TOGGLE_TASK` —— 勾选 / 取消勾选任务
  - `DELETE_TASK` —— 删除任务
  - `SET_GOAL` —— 设置今日目标数
- **每日重置**：读取状态时比较存储中的 `date` 与本地今天日期，不一致则清空 `tasks` 并保留 `goal`。
- **兜底检查**：`chrome.alarms` 每 60 分钟触发一次 `loadState()`，即便面板未打开也能在跨天后完成重置。

### 数据结构（chrome.storage.local）

```json
{
  "xhsGateState": {
    "date": "2026-07-19",
    "goal": 3,
    "tasks": [
      { "id": "t_...", "text": "写完周报", "done": false }
    ]
  }
}
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
