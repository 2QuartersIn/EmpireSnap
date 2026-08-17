/* EmpireSnap — launcher preload bridge */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("empiresnapLauncher", {
  openTradingView: () => ipcRenderer.invoke("empiresnap:open-tradingview"),
  openWindowCapture: () => ipcRenderer.invoke("empiresnap:open-window-capture"),
  getSkip: () => ipcRenderer.invoke("empiresnap:get-skip-launcher"),
  setSkip: (v) => ipcRenderer.invoke("empiresnap:set-skip-launcher", v),
  getVersion: () => ipcRenderer.invoke("empiresnap:get-version"),
  quitApp: () => ipcRenderer.invoke("empiresnap:quit"),
  minimise: () => ipcRenderer.invoke("empiresnap:minimise"),
});
