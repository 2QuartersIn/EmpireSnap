# EmpireSnap Desktop (EmpireSnap)

A **standalone Windows app** — no browser extension, no Chrome Web Store, no
Tampermonkey. It opens TradingView in its own app window and adds the capture
button directly.

## Why it embeds a browser (and not screen-recording)

A screen-recorder-style tool captures pixels that are *already on screen*. The
whole point of this tool is capturing settings that are **scrolled out of view**
and on **other tabs** — that needs DOM access, which needs the page to run
inside the app. So the app is a real Chromium window pointed at TradingView,
with the capture engine injected into it.

## Build the .exe (Windows / PowerShell)

You need [Node.js](https://nodejs.org) (LTS) installed. Then:

```powershell
cd path\to\empiresnap-desktop
npm install
npm run dist
```

Output lands in `dist\`:

- `EmpireSnap-1.0.0-portable.exe` — single file, double-click to run, no install
- `EmpireSnap-1.0.0-setup.exe` — one-click installer with Start Menu shortcut

Distribute either file directly — download link, Discord, USB stick. Nobody
needs Node or npm to *run* it; that's only needed to *build* it.

To just try it before packaging: `npm start`.

## Zero-friction distribution (end user runs the installer, nothing else)

`npm run dist` produces **`EmpireSnap-1.0.0-setup.exe`**. That is the file you
send people. Double-click is the entire user journey:

- **No admin prompt** — installs per-user into AppData (`perMachine: false`),
  so no UAC dialog and it works on locked-down work machines.
- **No install questions** — `oneClick` skips the wizard entirely.
- **Launches itself** when install finishes (`runAfterFinish`).
- **Desktop + Start Menu shortcuts** created automatically.
- **Nothing to install first** — no Node, no npm, no browser extension, no
  Tampermonkey. Chromium is bundled inside.
- **First-run coach mark** tells them what to do the first time they open it.
- **Silent auto-updates** — see below.

### Auto-updates (optional, recommended)

So users never reinstall: create a public GitHub repo, put your username and
repo name into the `publish` block in `package.json`, then release with:

```powershell
$env:GH_TOKEN="your_github_token"
npm run publish
```

That uploads the installer plus a `latest.yml` to GitHub Releases. Installed
copies check on launch, download new versions in the background, and apply
them on quit. To ship an update, bump `version` in `package.json` and run
`npm run publish` again. If you never configure this, the app simply skips the
check — nothing breaks.

### The one thing that is NOT zero-click: SmartScreen

An unsigned `.exe` triggers "Windows protected your PC" on first run. The user
must click **More info** then **Run anyway**. This is not something code can
work around — it is Windows reacting to the absence of a code-signing
signature. Options:

1. **Do nothing** — tell users about the two clicks. Fine for a known
   community; the warning also fades as more people install it.
2. **Azure Trusted Signing** — roughly $10/month, the cheapest legitimate route
   for an individual or small business, and removes the warning.
3. **OV/EV certificate** from a CA — a few hundred dollars a year.

Everything else in the flow is genuinely one double-click.

## Building without installing Node at all (GitHub route)

You do not need Node, npm, or git on your machine. GitHub's build servers have
them. The included workflow at `.github/workflows/build.yml` builds the Windows
installer in the cloud.

**One-time setup (all in the browser):**

1. Create the repository as `2QuartersIn/EmpireSnap`, Public. Leave
   "Add README" **off** (this project ships its own) and set .gitignore and
   license to whatever you prefer — a `.gitignore` is already included.
2. Upload this project's files to it — the repo page has "uploading an existing
   file", so you can drag the folder contents straight in. Make sure the hidden
   `.github` folder goes up too (drag the whole folder in rather than picking
   files one by one).
3. The `publish` block in `package.json` is already set to
   `2QuartersIn/EmpireSnap` — no edit needed, as long as the repo keeps that
   exact owner and name (it is case-sensitive).

**To build:** open the **Actions** tab, choose *Build EmpireSnap (Windows)*,
click **Run workflow**. Wait a few minutes, then download `EmpireSnap-windows`
from the finished run — it contains the setup `.exe` and the portable `.exe`.

**To ship an update:** bump `version` in `package.json`, then publish a Release
tagged `v1.0.1`. The workflow builds it and attaches the installer plus
`latest.yml` to that Release, which is exactly what installed copies read to
auto-update themselves.

Public repos get unlimited free Actions minutes. Private repos have a monthly
allowance, and Windows runners bill at 2x — a build only takes a few minutes,
so either is fine at this volume.

## What's in 1.9.0

- **macOS build** — `.dmg` and `.zip` for Apple Silicon and Intel, built
  alongside Windows by the same workflow.
- macOS app menu, Edit menu, and a Screen Recording permission check.
- Unsigned on macOS: first launch needs **System Settings → Privacy & Security
  → Open Anyway** (the Control-click trick was removed in macOS Sequoia).

## What's in 1.8.0

- Real EmpireSnap logo on the splash, home screen, taskbar, installer and
  extension icons. Capture footer credits EmpireTrading.

## What's in 1.7.2

- Splash byline reads "by EmpireTrading".

## What's in 1.7.1

- **Fixed: "Home Screen" opened a second window** instead of returning to the
  home screen. It now navigates back and hides the chart window, so
  TradingView keeps its session (`Alt`+`H`).

## What's in 1.7.0

- Scroll Capture columns match the original IndiSnap layout: each column is
  the full dialog at a different scroll position, no section label bars.
- Home screen credits the full team.

## What's in 1.6.2

- **Fixed: Exit and the window X did nothing once TradingView was loaded** —
  the page's `beforeunload` guard was vetoing the close.

## What's in 1.6.1

- Splash screen credits 2QuartersIn, Chizz and the EmpireTrading Team.

## What's in 1.6.0

- Branded header (indicator, symbol, timeframe, tab, timestamp) and footer
  credit on every capture.
- Scrollbars hidden during capture; section boundaries snap to row edges so
  no setting is sliced in half; slimmer section labels.

## What's in 1.5.2

- **Scroll Capture sections wrap into a grid** instead of one very long row.
  A 21-section capture goes from ~9,000px wide to 2226x1198.

## What's in 1.5.1

- **Close and minimise buttons on the home screen.** It's a frameless window,
  so it had no title bar and no way to quit from it.

## What's in 1.5.0

- **Scroll Capture (this tab)** — the original IndiSnap technique. Instead of
  expanding the settings list and re-drawing it, EmpireSnap scrolls the real
  list one screenful at a time, takes a **native screenshot** of each, and
  lays the sections out side by side. In the camera menu, or `Alt`+`A`.
- **Why it matters:** the expand-and-render path re-draws the DOM with
  html2canvas. If TradingView only renders the settings rows currently in
  view (virtualised list), everything off-screen renders blank — in testing
  against a virtualised list, expand mode captured 9 of 48 settings and left
  1,400px of empty space, while scroll capture got all 48. Scroll capture
  also reproduces custom controls and colour swatches exactly, since it
  photographs real pixels rather than re-drawing them.
- Scroll capture needs the native screenshot bridge, so it is **desktop-app
  only**. In the extension/userscript it falls back to expand-and-render.

**Which mode to use:** try Scroll Capture first for a single tab — it is the
most faithful. Use Capture All Tabs when you need every tab in one image.

## What's in 1.4.0

- **Exit now actually exits.** Closing the chart or picker window used to
  re-open the home screen, so Exit appeared to bounce you back to the two
  options instead of quitting. Windows now close cleanly and Exit quits.
- **"Pick Element" removed from the camera menu.** It was a developer
  fallback, not something to offer users. Still reachable when auto-detection
  misses, via the app menu: *Pick Panel Manually (fallback)*, `Alt`+`P`.
- **"Home Screen" added to the camera menu**, so you can get back from
  TradingView without restarting.
- **One window picker, everywhere.** Choosing *Capture a Window* inside
  TradingView used to open a cut-down in-page overlay with no crop and no
  back button; it now opens the same picker window as the home screen, with
  the crop tool and Back.

## What's in 1.3.0

- **Side-by-side column layout is back (and is now the default).** Stacking
  every tab into one strip produced images ~460px wide and 5,000–20,000px
  tall — complete, but unreadable and impossible to share. Captures now flow
  into columns sized for a landscape image (a 140-setting indicator goes from
  458x5559 to 2226x1431).
- Splits **snap to the gap between settings rows** rather than slicing through
  one, by scanning for a low-variance pixel row near the break point.
  Continued columns are labelled `INPUTS (CONT.)`.
- **Layout toggle** in the camera menu — *Columns* (default) or *Single* for
  the old one-strip behaviour. The choice is remembered.

## What's in 1.2.0

- **Branded splash screen** on launch — logo, EmpireSnap, "by 2QuartersIn" —
  then the home screen. (Rendered opaque rather than transparent, because
  transparent windows render unreliably on Windows.)
- **Back button** in the window picker, so you can return to the home screen
  and switch to TradingView capture without restarting the app.
- **Drag-to-crop.** Window/screen capture grabs the whole source, which is
  rarely what you want. After capturing, drag a box over the preview to keep
  just that region; the crop is applied at full source resolution, not at
  preview scale. **Reset crop** clears it. Save and Copy both respect it.

## What's in 1.1.1

- **Fixed: close buttons in the capture preview.** The 1.1.0 event shield
  routed all EmpireSnap UI clicks through one central handler, but that
  handler only recognised buttons carrying a `data-a` attribute — so the `×`,
  the backdrop, and the window-source cards were swallowed and did nothing.
  Dispatch is now generic (it walks up to the nearest element with an
  `onclick`), so every control in our UI responds. All three ways of closing
  the preview — `×`, **Close**, and clicking the dimmed backdrop — are
  covered by tests.

## What's in 1.1.0

- **Branded home screen** on launch — choose *TradingView Settings Capture* or
  *Capture a Window or Screen*. Tick "Skip this screen next time" to go
  straight to TradingView on future launches.
- **Window / screen capture** — pick any open window or monitor and snapshot
  it, at full resolution. Available from the home screen, the in-app menu
  (`Alt`+`W`), or the camera button's menu. Note this captures only what is
  *visible* on that window; for settings that are scrolled out of view or on
  other tabs, use **Capture All Tabs**.
- **Fixed: capturing no longer closes the settings dialog.** TradingView
  dismisses its dialog on any pointer press outside it, and it reacts on
  pointerdown — before a click ever lands. Pressing the camera button was
  therefore closing the very dialog being captured. EmpireSnap now intercepts
  pointer events aimed at its own UI in the capture phase, so the page never
  sees them. Clicks genuinely outside still dismiss the dialog as normal.

## Using it

1. Launch the app. Sign in to TradingView as normal — the session persists
   between launches.
2. Open an indicator's settings dialog.
3. Click the floating camera button (bottom-right), or press `Alt`+`S`.
   - **Capture All Tabs** — cycles Inputs / Style / Visibility, expands the
     scrolled-out rows, stitches everything into one labelled PNG
   - **Capture Current Panel** — just what's open (`Alt`+`D`)
   - **Pick Element** — click any panel manually if auto-detect misses
4. **Download PNG** opens a native Windows save dialog; **Copy image** puts it
   on the clipboard.

Quality (1x/2x/3x) is in the button menu and is remembered between sessions.

## Known caveats

- **Unsigned executable.** Windows SmartScreen will warn on first run
  ("More info" then "Run anyway"). Removing that warning requires a paid code
  signing certificate. Unavoidable for any unsigned app.
- **TradingView DOM changes.** Detection is heuristic (it scores dialogs by tab
  labels and form controls) rather than tied to class names, which TradingView
  renames periodically. If auto-detect ever grabs the wrong node, use
  **Pick Element**.
- The app presents a standard Chrome user agent so TradingView and Google
  sign-in work normally inside it.
- Portable build is roughly 90MB, since it bundles Chromium. That's the cost of
  standalone.

## Verified

The capture pipeline was smoke-tested headlessly against a mock settings dialog:
injection mounts, all three tabs are detected and cycled, scrolled-out rows are
expanded, and the stitched PNG renders correctly.

## Files

```
main.js                   Electron main process - window, menu, save dialog, injection
inject/capture-core.js    detection + expand-scroll + render + stitch engine
inject/content-app.js     in-page UI: floating button, picker, preview modal
inject/content.css        injected styles
inject/html2canvas.min.js bundled renderer (no CDN calls)
build/icon.ico|png        app icon
package.json              electron-builder config (portable + nsis targets)
```
