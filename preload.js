/* EmpireSnap — preload bridge
 * The injected page code runs sandboxed and cannot reach Node or the main
 * process. This exposes a tiny, explicit API surface (no Node objects) that
 * the in-page UI uses for native window capture and native file saving.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("empiresnapNative", {
  /* list capturable windows/screens -> [{id, name, thumbnail(dataURL)}] */
  listSources: () => ipcRenderer.invoke("empiresnap:list-sources"),

  /* full-resolution capture of one source -> PNG dataURL */
  captureSource: (id) => ipcRenderer.invoke("empiresnap:capture-source", id),

  /* native Save dialog; returns the written path or null if cancelled */
  savePng: (dataUrl, suggestedName) =>
    ipcRenderer.invoke("empiresnap:save-png", dataUrl, suggestedName),

  /* copy a PNG to the OS clipboard */
  copyPng: (dataUrl) => ipcRenderer.invoke("empiresnap:copy-png", dataUrl),

  isDesktopApp: true,
});
