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
