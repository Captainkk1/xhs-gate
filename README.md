# Task Gate for Xiaohongshu (xhs-gate)

**English** · [简体中文](./README.zh-CN.md)

A Chrome / Edge extension (Manifest V3) that gates Xiaohongshu behind your to-do list, so the feed can't interrupt you before you've done the work.

> Each day you set a task goal and check tasks off in the extension. Only once you hit the goal can you open the Xiaohongshu web app (xiaohongshu.com).
> Below the goal, navigating there is intercepted and redirected to a reminder page. The task list resets automatically at midnight; your goal number carries over.

## ✨ Features

- **Task gate** — set a daily task goal; Xiaohongshu unlocks only when you reach it.
- **Screenshot check-in** — every task needs a screenshot as proof before it counts as done, which is stricter than a plain checkbox.
- **Automatic blocking** — visiting `xiaohongshu.com` below the goal redirects to the reminder page.
- **Daily reset + recap notification** — the local date (`YYYY-MM-DD`) drives the reset; when the day rolls over the task list clears (the goal is kept) and a system notification recaps *yesterday*.
- **Weekly recap notification** — the Sunday settlement also fires a week summary (days unlocked / total tasks completed).
- **Last 7 days** — expand the history at the bottom of the popup to review the past week.
- **Alarm fallback** — `chrome.alarms` re-checks the date hourly, so a sleeping service worker can't skip a reset or recap.
- **Switchable language** — full English and 简体中文 UI, chosen freely from a dropdown; the choice is independent of your browser language. See [Internationalization](#-internationalization).
- **Local only** — task state lives in `chrome.storage.local`, screenshots in the browser's `IndexedDB`. Nothing is uploaded and nothing hits the network.
- **No build step** — plain HTML/CSS/JS, no framework, no bundler. Load it and it runs.

## 📦 Installation (load unpacked, developer mode)

### Chrome

1. Open `chrome://extensions/`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this project's root folder (the one containing `manifest.json`)

### Edge

1. Open `edge://extensions/`
2. Turn on **Developer mode** (bottom left)
3. Click **Load unpacked**
4. Select this project's root folder

Pinning the extension icon to the toolbar makes the panel easier to reach.

## 🚀 Usage

1. Click the **Task Gate for Xiaohongshu** icon in the toolbar to open the panel.
2. Use the **Goal** button in the top right to set how many tasks you need to finish today.
3. Add today's tasks in the input (press Enter or click **Add**).
4. When a task is done, click **📷 Check in** next to it and pick a screenshot as proof. The task is marked complete and shows a thumbnail — click it to view full size.
5. Checked in by mistake? Click **Undo**; the uploaded screenshot is deleted with it.
6. Once *completed ≥ goal*, the badge at the top flips to **Unlocked** and Xiaohongshu opens normally.
7. Below the goal, visiting Xiaohongshu lands on the reminder page; finish your tasks and hit refresh there to unlock.
8. System notifications recap each day at rollover and each week on Sunday. You can also expand **Last 7 days** at the bottom of the panel.
9. Switch languages any time with the dropdown at the bottom of the panel (also available on the reminder page).

## 🌍 Internationalization

The UI ships in **English** and **简体中文**, and the language is a user setting rather than a reflection of the browser's locale.

- All UI strings live in one dictionary in [`i18n.js`](./i18n.js), shared by the popup, the reminder page, and the service worker (which imports it via `importScripts`).
- The choice is stored under `xhsGateLocale` in `chrome.storage.local`. On first run it is seeded from `chrome.i18n.getUILanguage()` (`zh*` → Chinese, everything else → English), after which the dropdown wins.
- Static markup is translated by tagging nodes: `data-i18n` (textContent), `data-i18n-html` (innerHTML, for the few strings containing `<br>` / `<strong>`), plus `data-i18n-placeholder`, `data-i18n-title`, `data-i18n-alt`, and `data-i18n-title-key` for the document title. `I18N.applyStatic()` walks these and also updates `<html lang>`.
- Dynamic strings use `I18N.t(key, params)`, where `{name}` placeholders are substituted from `params`.
- Notification copy is localized too: the service worker calls `I18N.init()` right before each notification so it never sends copy in a stale language.
- `_locales/` covers only what the dictionary cannot reach — the extension **name** and **description** in the browser and store, which Chrome resolves from the browser locale (`default_locale` is `en`).

### Adding a language

1. Add a block to `MESSAGES` in `i18n.js`, keyed by locale code, with the same keys as `en`.
2. Add `{ code, label }` to `SUPPORTED_LOCALES` in the same file — the dropdowns are generated from it.
3. Optionally add `_locales/<code>/messages.json` with `appName` / `appDescription` so the store listing is localized too.

Missing keys fall back to English rather than rendering blank.

## 🛠 Technical notes

- **Manifest V3**, with `background` as a service worker.
- **Navigation blocking** — listens to `chrome.webNavigation.onBeforeNavigate`, handling only `frameId === 0` (main frame) on `*.xiaohongshu.com`; below the goal it redirects to the bundled `blocked.html` via `chrome.tabs.update`.
- **State management** — `background.js` answers these messages over `chrome.runtime.onMessage`:
  - `GET_STATE` — current state (tasks, goal, completed count, unlocked or not)
  - `ADD_TASK` — add a task
  - `COMPLETE_TASK` — store the screenshot proof and mark the task done (writes to IndexedDB, returns the screenshot id)
  - `UNDO_TASK` — undo a check-in (deletes the screenshot, marks the task incomplete)
  - `DELETE_TASK` — delete a task (and its screenshot, if checked in)
  - `SET_GOAL` — set today's goal
  - `GET_SCREENSHOT` — read one screenshot by id (for thumbnails and preview)
  - `GET_HISTORY` — the last 7 days of history
- **Daily reset + settlement** — on every state read the stored `date` is compared with today. If they differ, `settleDay()` runs first for *yesterday* — append history, fire the daily notification, drop yesterday's screenshots — then `tasks` is cleared and `goal` preserved.
- **Weekly settlement** — if the settled day was a Sunday, `maybeSettleWeek()` also runs, summing the last 7 days of history and firing the weekly notification (deduplicated with a "last settled" date flag).
- **Screenshot storage** — the popup compresses each screenshot on a `canvas` (max width 800px, JPEG quality 0.8) into a dataURL, stored in the service worker's `IndexedDB` (`xhsGateDB` / `screenshots` store, indexed by `date`). The day's screenshots are cleared at settlement to keep storage small.
- **Alarm fallback** — `chrome.alarms` triggers `loadState()` every 60 minutes so the reset and recap happen even if the panel is never opened.

### Data shapes

**chrome.storage.local**

```json
{
  "xhsGateState": {
    "date": "2026-07-19",
    "goal": 3,
    "tasks": [
      { "id": "t_...", "text": "Finish the weekly report", "done": false, "screenshotId": null }
    ]
  },
  "xhsGateHistory": [
    { "date": "2026-07-18", "goal": 3, "done": 3, "total": 4, "unlocked": true }
  ],
  "xhsGateLastWeeklySettledDate": "2026-07-19",
  "xhsGateLocale": "en"
}
```

**IndexedDB (`xhsGateDB` / `screenshots` store)**

```json
{ "id": 1, "taskId": "t_...", "date": "2026-07-18", "dataUrl": "data:image/jpeg;base64,...", "createdAt": 1752835200000 }
```

## 📁 Project layout

```
xhs-gate/
├── manifest.json        # Manifest (permissions, action, background, web_accessible_resources)
├── background.js        # Service worker: state, navigation blocking, alarm fallback
├── i18n.js              # Shared translation dictionary + helpers (pages and service worker)
├── popup.html           # Popup markup
├── popup.css            # Popup styles
├── popup.js             # Popup logic
├── blocked.html         # Reminder page shown when blocked
├── blocked.js           # Reminder page logic (progress + refresh to unlock)
├── _locales/            # Localized extension name/description (manifest only)
│   ├── en/messages.json
│   └── zh_CN/messages.json
├── icons/               # 16 / 48 / 128 icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md
├── README.zh-CN.md
├── LICENSE              # MIT
└── .gitignore
```

## 📄 License

[MIT](./LICENSE)
