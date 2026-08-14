/* EmpireSnap Desktop — Electron main process
 *
 * Windows:
 *   launcher  — branded home screen (ui/launcher.html)
 *   chart     — TradingView with the capture engine injected
 *   picker    — native window/screen source picker (ui/picker.html)
 */
const {
  app,
  BrowserWindow,
  Menu,
  shell,
  dialog,
  ipcMain,
  desktopCapturer,
  screen,
  clipboard,
  nativeImage,
} = require("electron");
const fs = require("fs");
const path = require("path");

const HOME = "https://www.tradingview.com/chart/";
const INJECT_DIR = path.join(__dirname, "inject");
const UI_DIR = path.join(__dirname, "ui");
const read = (f) => fs.readFileSync(path.join(INJECT_DIR, f), "utf8");

// Electron's default UA contains "Electron/..", which TradingView and
// especially Google's OAuth screen reject ("this browser may not be secure").
const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
app.userAgentFallback = CHROME_UA;

let launcherWin = null;
let chartWin = null;
let pickerWin = null;

/* ---------- tiny JSON settings store ---------- */
const CFG = path.join(app.getPath("userData"), "empiresnap-config.json");
function cfgRead() {
  try {
    return JSON.parse(fs.readFileSync(CFG, "utf8"));
  } catch (e) {
    return {};
  }
}
function cfgWrite(patch) {
  try {
    fs.writeFileSync(CFG, JSON.stringify({ ...cfgRead(), ...patch }, null, 2));
  } catch (e) {}
}

/* ---------- injection ---------- */
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
  wc.insertCSS(CSS).catch(() => {});
  wc.executeJavaScript(JS, true).catch((err) =>
    console.error("[EmpireSnap] inject error:", err)
  );
}

/* ---------- launcher ---------- */
function createLauncher() {
  if (launcherWin) {
    launcherWin.focus();
    return;
  }
  launcherWin = new BrowserWindow({
    width: 460,
    height: 560,
    resizable: false,
    frame: false,
    backgroundColor: "#0e0f14",
    title: "EmpireSnap",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(UI_DIR, "preload-launcher.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  launcherWin.loadFile(path.join(UI_DIR, "launcher.html"));
  launcherWin.on("closed", () => {
    launcherWin = null;
  });
}

/* ---------- TradingView chart window ---------- */
function createChartWindow() {
  if (chartWin) {
    chartWin.focus();
    return chartWin;
  }
  chartWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0c0d11",
    title: "EmpireSnap — TradingView",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  chartWin.loadURL(HOME);

  const wc = chartWin.webContents;
  wc.on("did-finish-load", () => inject(wc));

  wc.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // route blob:/data: downloads through a native Save dialog
  wc.session.on("will-download", (event, item) => {
    const suggested = item.getFilename() || "empiresnap.png";
    const save = dialog.showSaveDialogSync(chartWin, {
      title: "Save settings snapshot",
      defaultPath: path.join(app.getPath("downloads"), suggested),
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (save) item.setSavePath(save);
    else item.cancel();
  });

  chartWin.on("closed", () => {
    chartWin = null;
    // no chart open and launcher was skipped -> show launcher again
    if (!launcherWin && !pickerWin) createLauncher();
  });

  return chartWin;
}

/* ---------- window/screen source picker ---------- */
function createPicker() {
  if (pickerWin) {
    pickerWin.focus();
    return;
  }
  pickerWin = new BrowserWindow({
    width: 860,
    height: 620,
    backgroundColor: "#0e0f14",
    title: "EmpireSnap — Capture a Window",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(UI_DIR, "preload-picker.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  pickerWin.loadFile(path.join(UI_DIR, "picker.html"));
  pickerWin.on("closed", () => {
    pickerWin = null;
    if (!chartWin && !launcherWin) createLauncher();
  });
}

/* ---------- IPC ---------- */
function pngFromDataUrl(dataUrl) {
  return Buffer.from(String(dataUrl).split(",")[1] || "", "base64");
}

function registerIpc() {
  ipcMain.handle("empiresnap:get-version", () => app.getVersion());

  ipcMain.handle("empiresnap:get-skip-launcher", () => !!cfgRead().skipLauncher);
  ipcMain.handle("empiresnap:set-skip-launcher", (e, v) => {
    cfgWrite({ skipLauncher: !!v });
    return true;
  });

  ipcMain.handle("empiresnap:open-tradingview", () => {
    createChartWindow();
    if (launcherWin) launcherWin.close();
    return true;
  });

  ipcMain.handle("empiresnap:open-window-capture", () => {
    createPicker();
    if (launcherWin) launcherWin.close();
    return true;
  });

  /* list capturable sources with preview thumbnails */
  ipcMain.handle("empiresnap:list-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false,
    });
    return sources
      .filter((s) => s.name && s.name !== "EmpireSnap")
      .map((s) => ({
        id: s.id,
        name: s.name,
        isScreen: s.id.startsWith("screen"),
        thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      }));
  });

  /* full-resolution capture of a chosen source.
   * desktopCapturer thumbnails ARE the real capture — requesting a
   * thumbnailSize as large as the display yields a full-res image, which
   * avoids needing a getUserMedia video pipeline just to grab one frame. */
  ipcMain.handle("empiresnap:capture-source", async (e, id) => {
    let w = 1920;
    let h = 1080;
    try {
      const d = screen.getPrimaryDisplay();
      const sf = d.scaleFactor || 1;
      w = Math.round(d.bounds.width * sf * 1.5);
      h = Math.round(d.bounds.height * sf * 1.5);
    } catch (err) {}
    const sources = await desktopCapturer.getSources({
      types: ["window", "screen"],
      thumbnailSize: { width: w, height: h },
      fetchWindowIcons: false,
    });
    const hit = sources.find((s) => s.id === id);
    if (!hit || hit.thumbnail.isEmpty()) throw new Error("Source unavailable");
    return { name: hit.name, dataUrl: hit.thumbnail.toDataURL() };
  });

  ipcMain.handle("empiresnap:save-png", async (e, dataUrl, suggested) => {
    const parent = BrowserWindow.fromWebContents(e.sender) || undefined;
    const out = dialog.showSaveDialogSync(parent, {
      title: "Save capture",
      defaultPath: path.join(
        app.getPath("downloads"),
        suggested || "empiresnap.png"
      ),
      filters: [{ name: "PNG Image", extensions: ["png"] }],
    });
    if (!out) return null;
    fs.writeFileSync(out, pngFromDataUrl(dataUrl));
    return out;
  });

  ipcMain.handle("empiresnap:copy-png", async (e, dataUrl) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataUrl));
    return true;
  });
}

/* ---------- menu ---------- */
function buildMenu() {
  const template = [
    {
      label: "EmpireSnap",
      submenu: [
        {
          label: "Capture All Tabs",
          accelerator: "Alt+S",
          click: () =>
            chartWin &&
            chartWin.webContents
              .executeJavaScript(
                "window.__empiresnapCapture && window.__empiresnapCapture('all')",
                true
              )
              .catch(() => {}),
        },
        {
          label: "Capture Current Panel",
          accelerator: "Alt+D",
          click: () =>
            chartWin &&
            chartWin.webContents
              .executeJavaScript(
                "window.__empiresnapCapture && window.__empiresnapCapture('one')",
                true
              )
              .catch(() => {}),
        },
        {
          label: "Capture a Window or Screen…",
          accelerator: "Alt+W",
          click: () => createPicker(),
        },
        { type: "separator" },
        { label: "Home Screen", click: () => createLauncher() },
        {
          label: "TradingView",
          accelerator: "CmdOrCtrl+H",
          click: () => createChartWindow(),
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
          click: () => {
            if (!chartWin) return;
            const nh = chartWin.webContents.navigationHistory;
            if (nh && nh.canGoBack()) nh.goBack();
          },
        },
        {
          label: "Forward",
          accelerator: "Alt+Right",
          click: () => {
            if (!chartWin) return;
            const nh = chartWin.webContents.navigationHistory;
            if (nh && nh.canGoForward()) nh.goForward();
          },
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

/* ---------- startup ---------- */
app.whenReady().then(() => {
  registerIpc();
  buildMenu();
  if (cfgRead().skipLauncher) createChartWindow();
  else createLauncher();
  initAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createLauncher();
  });
});

/* Silent auto-update. Only meaningful in a packaged build published with a
 * `publish` provider configured; wrapped so a missing/unconfigured update
 * feed can never block the app from starting. */
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
