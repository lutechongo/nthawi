# Nthawi

**Track your time without thinking about it.** *Nthawi* means "time" in Nyanja.

A Chrome extension that tracks your active time in the web tools you work in (Figma, Google Meet, Google Docs, Claude and any site you add) automatically. Only focused, non-idle time counts. Everything stays in your browser.

## Install (2 minutes)

1. Unzip `nthawi.zip`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the **`dist`** folder.
5. Pin the extension: click the puzzle icon in the toolbar, then the pin next to **Nthawi**.

Onboarding opens automatically. When you finish it, press **Start** in the popup or on the dashboard.

## How tracking works

Time counts when all of these are true:

1. Tracking is **ON** (you pressed Start).
2. A Chrome window is focused, and its **active tab** is on one of your enabled tools' websites. Subdomains count too, and a domain can include a path, such as `github.com/your-org`.
3. You are **not idle**. The idle limit is 1–10 min for all tools and 1–30 min for Google Meet (set in Settings). When you hit the limit, the idle minutes are cut out of the session and logged as "idle excluded". Tracking resumes on its own when you're back.

**Sessions**
- Each session is named from the tab title, so "Onboarding flow v2 – Figma" becomes **Onboarding flow v2**.
- If you come back to the same file within **10 minutes** and nothing else was tracked in between, the same session continues. The time away is excluded.
- Tab flicks under 5 seconds are dropped.
- Sessions are split at midnight.

**Safety nets**
- A heartbeat runs every 30 seconds. If the computer slept or Chrome was closed, the clock stops at the last heartbeat, so you never get phantom hours.

**Toolbar badge**
- Green `ON`: counting.
- Grey `ON`: tracking is on, but you're not in a tracked tool.
- Amber `❚❚`: paused.

## Features

- **Popup** (360×520): Start/Stop/Resume, live timer, ON/paused/idle states, today's time by tool, and Open dashboard.
- **Onboarding**: name, role, tools (plus custom sites) and idle limit.
- **Dashboard**:
  - Today, This Week, or a custom range picked with a date picker (8 presets plus a two-month calendar).
  - A banner with Pause/Resume/Stop.
  - A 24h timeline, a 7-day trend line and an active-vs-idle gauge.
  - A stacked daily breakdown with hover details, time by tool, and a summary compared with the previous period.
- **Sessions**:
  - Stats, search, and tool filter chips.
  - Sessions grouped by day, which you can collapse.
  - Multi-select (bulk delete or copy).
  - Edit/rename, Duplicate, Delete with **Undo**, and Add manually.
- **Tools**: weekly totals, last active, an on/off toggle, add or edit websites, and Remove with **Restore**.
- **Settings**:
  - Profile (name, role, photo).
  - Tracked tools and both idle sliders.
  - **Light/Dark** theme.
  - Export or import JSON, and Delete all data.
- **Export CSV** for the selected range.
- **Copy summary for ClickUp**: a plain-text time log, for the selected sessions or everything shown.

## New in 1.5

- **New logo:** a purple stopwatch (light-purple ring, deep-purple hand and crown). In the sidebar and popup its hand turns once a minute while Nthawi is counting.
- **A greeting that types itself out** in Newsreader, a calm serif, with a blinking cursor, next to your photo. Greetings change with the moment, and only some use your name.
- **Subtle motion:** cards settle into place when a page opens, charts draw themselves, the "Tracking ON" dot breathes, the "now" marker on the timeline glows, goal rings fill, and cards lift a little on hover. Everything stays still if your computer is set to reduce motion.
- **Dark mode charts** use deeper, muted versions of the pastels with darker hatching, so they sit in the dark instead of glaring.
- Softer hover colour in the sidebar; pastel icons on the onboarding role cards.

## New in 1.4

- **Starts on its own.** Tracking switches on when Chrome opens and at the start of each new day. "Stop for today" is respected until tomorrow. Turn it off in Settings → Start automatically.
- **Sessions grouped by app.** "By app" folds hundreds of tab switches into one line per app, then one line per file or meeting with its visit count. Open a line to see each visit, rename all visits at once, or merge them. "Every visit" shows the full list.
- **A greeting that fits the moment** on the Overview (morning, back from lunch, goal reached, wrapping up, Friday…) using the name you want to be called.
- **"What should I call you?"** replaces the full-name field in onboarding and Settings.
- **Nudges inside your tab.** Break, water, lunch and overtime nudges appear as a small card in the top-right of the page you're on, with actions: take a 5-minute break (tracking pauses and resumes itself), pause for lunch, or stop for today. Preview each one in Settings. You can switch back to system notifications.
- **Vacation Tracker.** Paste your personal calendar link in Settings → Days off. Approved leave and your location's public holidays (Zambia included) sync a few times a day. No admin rights needed.
- **Real Meet names.** Meet sessions take the meeting's name from the call itself. The Meet home page no longer counts.
- Violet sidebar with name bubbles when collapsed; "Dashboard" is now "Overview"; Settings is centered.
- The Google Calendar & Sheets section is gone from Settings (it needed Workspace admin approval).

### Find your Vacation Tracker link

Vacation Tracker → My Profile → Calendar sync (or Export to calendar) → copy the iCal link. Chrome will ask once for access to that address when you click Connect.

## New in 1.3

- **Projects** (Manage → Projects). Each project has keywords that group sessions across tools, and can have its own ClickUp task. There's a Tools/Projects switch on the dashboard, project filters in session lists, and "Move to project" for selected sessions.
- **Smarter ClickUp.** Once you send a session name to a task, the same name goes to the same task automatically next time. Otherwise the order is project task → tool task → default task.
- **Merge and split sessions.**
- **Pages not counted.** Use "Don't count this page" in the popup, or add rules by address or title words in Settings.
- **Gentle nudges:**
  - a break reminder after a long stretch without one
  - a lunch reminder
  - a one-time heads-up when you go into overtime
  - a stand-up reminder each working morning
  - a weekly recap on your last working day
- **Daily focus goal** (default 6h), shown as a ring in the popup and a line on the trend chart.
- **Days off.** Leave and public holidays are excluded from reminders, and any work on those days counts as overtime.
- **Reports:**
  - **Stand-up**: "What I did" written from your tracked time, today's plan with suggestions, blockers, a large Meeting view, and an optional AI rewrite.
  - **Weekly recap.**
  - **Monthly overtime report**, printable or as CSV.
- **Google** (optional, needs your own OAuth client ID):
  - names Meet sessions after their calendar events
  - adds Zambian public holidays
  - shows today's meetings in your stand-up
  - keeps a live "Nthawi time log" Google Sheet, updated at the end of each day
- **AI stand-up writer** (optional, needs your own Claude API key).

### Google setup (about 10 minutes)

1. Go to console.cloud.google.com and create a project.
2. Under APIs & Services → Library, enable the **Google Calendar API**, **Google Sheets API** and **Google Drive API**.
3. On the OAuth consent screen, choose External and add yourself as a **test user**.
4. Under Credentials, create an **OAuth client ID** of type **Web application**. Set its authorized redirect URI to `https://haikganfakhkdeagbfpabeibbaohimff.chromiumapp.org/`. Settings → Google shows this address too.
5. Paste the client ID in Settings → Google and click Connect.

## New in 1.2

- Renamed to **Nthawi**, with a new hourglass icon.
- App logos for Figma, Google Meet, Docs, Calendar, Gmail, Drive and Claude are bundled in `public/logos`. Other sites show their own icon once you've visited them.
- Choosing "Other" as your role in onboarding (or in Settings) lets you type your actual role.
- The extension now has a fixed ID (the `key` in `manifest.json`), so future updates keep your data no matter which folder you load it from.

## New in 1.1

- **Working hours and overtime.** The default schedule is 08:00–17:00 with lunch 13:00–14:00, Monday to Friday. You can change it in Settings → Working hours.
  - Anything tracked outside those hours, or on days off, is **overtime**.
  - It shows up on the timeline, as session badges, in the Focus and Summary cards, on the Sessions page, in the popup and as CSV columns.
  - Work during lunch is shown separately. You can choose to count it as overtime instead.
- **App logos.** The tool pills show each app's real logo instead of a coloured dot.
  - The logo is taken from the site itself the first time you open it, or from Chrome's own icon cache.
  - "Add a tool" has one-click suggestions, including Vacation Tracker, Google Search, Gmail, Calendar, Sheets and Slides.
- **ClickUp timesheet sync** (Settings → ClickUp):
  1. Paste your personal API token (ClickUp → avatar → Settings → Apps).
  2. Pick a default task, plus optional tasks per tool.
  3. Click "Send to ClickUp" on today, or on any day, to review your sessions and send them. Each session becomes a time entry on your timesheet. Sessions already sent are marked and skipped.
- **End-of-day check-in.** At 17:30 on working days you get a notification with **Send to ClickUp** and **Remind me in 30 min**. The time and the snooze length can be changed.

## Develop

```bash
npm install
npm run build      # outputs to dist/
npm run dev        # rebuilds on save; then hit ↻ on the extension in chrome://extensions
npm run icons      # regenerate toolbar icons (needs Python + Pillow)
```

Stack: Manifest V3, React 18 and Vite 5 with no UI library. Inter is bundled locally, so it works offline.

```
src/
  background/index.js   tracking engine (service worker) — the only writer of stored data
  shared/               constants, storage layout, time helpers, stats, URL matching, exporters
  ui/                   design-system CSS tokens (light + dark), icons, components, hooks
  popup/                toolbar popup
  onboarding/           3-step setup
  dashboard/            app shell, pages (Dashboard, Sessions, Tools, Settings, Help), charts, modals
```

The popup and dashboard never write to storage directly. They send commands such as `start`, `session:update` or `tool:add` with `chrome.runtime.sendMessage`. The worker applies them one at a time through a lock, so a tracking event and an edit can't overwrite each other.

**Debugging:** on `chrome://extensions`, click **Inspect views: service worker** on Nthawi. In its console you can run:

```js
__nthawi.idle('idle')    // simulate going idle
__nthawi.idle('active')  // simulate coming back
__nthawi.beat()          // run a heartbeat now
```

## Data

Data is stored in `chrome.storage.local` under these keys:

| Key | What it holds |
| --- | --- |
| `settings` | Profile, theme, idle limits, tools |
| `sessions` | `{ id, title, toolId, start, end, pausedMs, manual }` |
| `idleLog` | Idle periods excluded from totals |
| `tracker` | Live state |

All of it lives in your Chrome profile on this computer. Nothing leaves the device unless you connect ClickUp; then only the entries you send go to api.clickup.com. Your ClickUp token is stored under its own `clickup` key and is never included in exports.

- **To view your data elsewhere:** Export CSV opens in Excel or Google Sheets.
- **To back up or move computers:** use Settings → Data → Export JSON, then Import on the other computer.
- **Uninstalling the extension deletes the data,** so export it first.

## Permissions

| Permission | Why it's needed |
| --- | --- |
| `tabs` | Read the active tab's URL and title, to know which tool you're in and to name the session |
| `idle` | Pause the timer while you're away |
| `alarms` | Run the 30-second heartbeat |
| `storage`, `unlimitedStorage` | Keep your history on the device |
| `notifications` | The end-of-day check-in, and nudges when a page can't show them |
| `scripting` + the tracked sites | Show nudges inside the page you're on, and read a Meet call's name |
| Optional: other sites | Asked only when you add a custom site or connect Vacation Tracker |
| `favicon` | Show app logos from Chrome's own icon cache |
| `https://api.clickup.com/*` | Send time entries to ClickUp, only once you connect it |

## Known limits

- Only browser tabs are tracked. Desktop apps (Figma desktop, Claude desktop) are not visible to a Chrome extension.
- Idle detection is system-wide keyboard and mouse activity, as Chrome reports it.
- Time in a tracked tab counts only while that Chrome window is the focused app.
