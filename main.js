/* EmpireSnap Desktop — Electron main process
 * Opens TradingView in an app window and injects the capture engine.
 */
const { app, BrowserWindow, Menu, shell, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const HOME = "https://www.tradingview.com/chart/";

// Electron's default UA contains "Electron/..", which TradingView and
// especially Google's OAuth screen reject ("this browser may not be secure").
// Presenting a plain Chrome UA keeps sign-in working.
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
app.userAgentFallback = CHROME_UA;
const INJECT_DIR = path.join(__dirname, "inject");
const read = (f) => fs.readFileSync(path.join(INJECT_DIR, f), "utf8");

// combine engine + UI into one blob to executeJavaScript
let JS = null;
let CSS = null;
function payload() {
  if (JS === null) {
    JS = ["html2canvas.min.js", "capture-core.js", "content-app.js"]
      .map(read)
      .join("\n;\n");
    CSS = read("content.css");
  }
  return { JS, CSS };
}

function inject(wc) {
  const { JS, CSS } = payload();
  // insertCSS + executeJavaScript both bypass the page CSP
  wc.insertCSS(CSS).catch(() => {});
  wc.executeJavaScript(JS, true).catch((err) =>
    console.error("[EmpireSnap] inject error:", err)
  );
}

let mainWin = null;

function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0c0d11",
    title: "EmpireSnap",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWin.loadURL(HOME);

  const wc = mainWin.webContents;
  // inject on every full load (initial + reloads); the __empiresnapLoaded
  // guard keeps SPA navigations from double-mounting the button
  wc.on("did-finish-load", () => inject(wc));

  // open target=_blank links in the system browser, not new app windows
  wc.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // route blob:/data: downloads (our PNG saves) through a native Save dialog
  wc.session.on("will-download", (event, item) => {
    const suggested = item.getFilename() || "empiresnap.png";
    const save = dialog.showSaveDialogSync(mainWin, {
      title: "Save settings snapshot",
      defaultPath: path.join(app.getPath("downloads"), suggested),
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (save) item.setSavePath(save);
    else item.cancel();
  });
}

function buildMenu() {
  const template = [
    {
      label: "EmpireSnap",
      submenu: [
        {
          label: "Capture All Tabs",
          accelerator: "Alt+S",
          click: () =>
            mainWin &&
            mainWin.webContents
              .executeJavaScript("window.__empiresnapCapture && window.__empiresnapCapture('all')", true)
              .catch(() => {}),
        },
        {
          label: "Capture Current Panel",
          accelerator: "Alt+D",
          click: () =>
            mainWin &&
            mainWin.webContents
              .executeJavaScript("window.__empiresnapCapture && window.__empiresnapCapture('one')", true)
              .catch(() => {}),
        },
        { type: "separator" },
        {
          label: "TradingView Home",
          accelerator: "CmdOrCtrl+H",
          click: () => mainWin && mainWin.loadURL(HOME),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        {
          label: "Back",
          accelerator: "Alt+Left",
          click: () => mainWin && mainWin.webContents.navigationHistory.canGoBack() && mainWin.webContents.navigationHistory.goBack(),
        },
        {
          label: "Forward",
          accelerator: "Alt+Right",
          click: () => mainWin && mainWin.webContents.navigationHistory.canGoForward() && mainWin.webContents.navigationHistory.goForward(),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "toggleDevTools" },
        { role: "togglefullscreen" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  initAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/* Silent auto-update. Only meaningful in a packaged build that was published
 * with a `publish` provider configured; wrapped so a missing/unconfigured
 * update feed can never block the app from starting. Downloads in the
 * background and installs on quit — the user does nothing. */
function initAutoUpdate() {
  if (!app.isPackaged) return;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on("error", (e) =>
      console.warn("[EmpireSnap] update check skipped:", e && e.message)
    );
    autoUpdater.checkForUpdates().catch(() => {});
  } catch (e) {
    console.warn("[EmpireSnap] electron-updater unavailable:", e && e.message);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
