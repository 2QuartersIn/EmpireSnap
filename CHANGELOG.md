# Changelog

All notable changes to EmpireSnap Desktop.

## 1.7.0

### Changed
- **Scroll Capture columns now match the original IndiSnap layout.** Each
  column is the whole settings dialog at a different scroll position — title,
  tabs and Cancel/Ok included — instead of headerless slabs of list with a
  purple "SECTION n" bar stamped on top. The dialog chrome makes each column
  self-explanatory, so the labels are gone.
- Scroll advances by a whole number of rows: the gap between rows nearest the
  bottom of the visible list is found, and the list scrolls exactly that far,
  so no setting is split across two columns.

### Added
- Home screen now credits 2QuartersIn, Chizz and the EmpireTrading Team,
  matching the splash screen.

## 1.6.2

### Fixed
- **Exit and the window X did nothing once TradingView was loaded.**
  TradingView registers a `beforeunload` handler (the "leave site?" guard),
  and Electron lets the page **veto** a window close — so `app.quit()` ran,
  the page refused, and the app just sat there. Two changes: the chart window
  now ignores the page's unload veto (`will-prevent-unload`), and Exit
  destroys windows rather than politely closing them, with a hard fallback.
  Verified against a page that guards unload: the window would not close
  before, and closes after.

## 1.6.1

### Added
- Splash screen credits: created by 2QuartersIn, Chizz and the EmpireTrading
  Team. Splash window height increased to fit.

## 1.6.0

### Added
- **Branded header on every capture** — indicator name, symbol, timeframe and
  active tab on the left; EmpireSnap and a timestamp on the right. Plus a
  "Captured with EmpireSnap - 2QuartersIn" footer. A capture with no context
  is hard to read weeks later.

### Improved
- **Scrollbars hidden during capture** — each section used to carry a grey
  scrollbar strip down its right edge.
- **Section boundaries snap to row edges.** Sections were cut at exactly one
  screenful, slicing whatever row happened to straddle the boundary. Each
  section is now trimmed to the nearest gap between rows and the scroll
  advances by exactly what was kept, so no setting is ever cut in half.
- Slimmer section labels, freeing vertical space.

## 1.5.2

### Fixed
- **Scroll Capture sections now wrap into a grid.** All sections were laid out
  in one row, which was fine for four and absurd for twenty-one — a real
  capture came out roughly 9,000px wide, as unusable as the tall strip it
  replaced. Sections now wrap into rows at a landscape ratio (21 sections:
  ~9000x200 to 2226x1198). Reading order is left-to-right, top-to-bottom.

## 1.5.1

### Fixed
- **The home screen had no close button.** It is a frameless window, so there
  was no title bar and no way to quit from it. Added minimise and close
  buttons top-right; close quits the app.

## 1.5.0

### Added
- **Scroll Capture (this tab)** — `Alt`+`A` or the camera menu. Scrolls the
  real settings list one screenful at a time, takes a native screenshot of
  each section, and lays the sections out side by side.

### Why
The expand-and-render path re-draws the DOM with html2canvas. If TradingView
only renders the settings rows currently in view (a virtualised list),
everything off-screen renders blank. Tested against a virtualised list, expand
mode captured 9 of 48 settings and left 1,400px of empty space; scroll capture
captured all 48. Scroll capture also reproduces custom controls and colour
swatches exactly, because it photographs real pixels instead of redrawing them.

### Notes
- Requires the native screenshot bridge, so it is desktop-app only. The
  extension and userscript fall back to expand-and-render, because html2canvas
  ignores an inner container's `scrollTop` and would silently produce blank and
  duplicated sections.

## 1.4.0

### Fixed
- **Exit now exits.** Closing the chart or picker window re-opened the home
  screen, so the app could never quit and Exit appeared to bounce back to the
  two options.

### Changed
- **"Pick Element" removed from the camera menu** — it was a developer
  fallback, not a user-facing feature. Still available from the app menu as
  *Pick Panel Manually (fallback)*, `Alt`+`P`.
- **"Home Screen" added to the camera menu**, so you can get back from
  TradingView without restarting.
- **One window picker everywhere.** *Capture a Window* inside TradingView
  opened a cut-down in-page overlay with no crop and no back button; it now
  opens the same picker window as the home screen.

## 1.3.0

### Fixed
- **Side-by-side column layout restored, and made the default.** Stacking every
  tab into one strip produced images roughly 460px wide and 5,000–20,000px
  tall — complete, but unreadable and impractical to share. A 140-setting
  indicator went from 458x5559 to 2226x1431.
- Split points **snap to the gap between settings rows** rather than slicing
  through one, by scanning for a low-variance pixel row near the break.
  Continued columns are labelled `INPUTS (CONT.)`.

### Added
- **Layout toggle** in the camera menu — *Columns* (default) or *Single*.
  Remembered between sessions.

## 1.2.0

### Added
- **Branded splash screen** on launch, then the home screen.
- **Back button** in the window picker.
- **Drag-to-crop** on window/screen captures, applied at full source
  resolution rather than preview scale. *Reset crop* clears it; Save and Copy
  both respect it.

### Fixed
- Splash renders opaque rather than transparent — transparent windows render
  unreliably on Windows (washed-out or missing text).

## 1.1.1

### Fixed
- **Close buttons in the capture preview.** The 1.1.0 event shield routed all
  UI clicks through one handler that only recognised buttons carrying a
  `data-a` attribute, so the `×`, the backdrop, and the window-source cards
  did nothing. Dispatch is now generic. All three ways of closing the preview
  are covered by tests.

## 1.1.0

### Fixed
- **Capturing no longer closes the settings dialog.** TradingView dismisses its
  dialog on any pointer press outside it, and reacts on `pointerdown` — before
  a `click` ever lands — so pressing the camera button closed the very dialog
  being captured. EmpireSnap now intercepts pointer events aimed at its own UI
  in the capture phase, so the page never sees them. Clicks genuinely outside
  still dismiss the dialog as normal.

### Added
- Branded home screen with *TradingView Settings Capture* and *Capture a Window
  or Screen*, plus "Skip this screen next time".
- Window / screen capture at full resolution.

## 1.0.0

Initial release — a rebuild of the discontinued IndiSnap.

- Captures a TradingView indicator's entire settings dialog, including rows
  scrolled out of view and tabs not currently open, as one image.
- Standalone Windows app: no browser extension, no Chrome Web Store, no
  Tampermonkey.
- One-click installer, no admin prompt, launches on finish, silent
  auto-updates.
- Cloud builds via GitHub Actions — no Node required on the developer's
  machine.

### Known limitation
The installer is unsigned, so Windows SmartScreen warns on first run
("More info" → "Run anyway"). Removing that requires a paid code-signing
certificate.
