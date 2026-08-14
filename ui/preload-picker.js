/* EmpireSnap — picker preload bridge */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("empiresnapPicker", {
  listSources: () => ipcRenderer.invoke("empiresnap:list-sources"),
  captureSource: (id) => ipcRenderer.invoke("empiresnap:capture-source", id),
  savePng: (dataUrl, name) => ipcRenderer.invoke("empiresnap:save-png", dataUrl, name),
  copyPng: (dataUrl) => ipcRenderer.invoke("empiresnap:copy-png", dataUrl),
  openLauncher: () => ipcRenderer.invoke("empiresnap:open-launcher"),
});
