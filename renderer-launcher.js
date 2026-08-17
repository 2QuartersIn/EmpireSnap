/* EmpireSnap launcher — talks to main via the launcher preload bridge */
(function () {
  "use strict";
  const api = window.empiresnapLauncher || {};

  const skip = document.getElementById("skip");

  // reflect stored preference
  if (api.getSkip) {
    api.getSkip().then((v) => {
      if (skip) skip.checked = !!v;
    });
  }
  if (api.getVersion) {
    api.getVersion().then((v) => {
      const el = document.getElementById("ver");
      if (el && v) el.textContent = "v" + v;
    });
  }

  if (skip) {
    skip.addEventListener("change", () => {
      api.setSkip && api.setSkip(skip.checked);
    });
  }

  const minBtn = document.getElementById("min");
  const quitBtn = document.getElementById("quit");
  if (minBtn) minBtn.addEventListener("click", () => api.minimise && api.minimise());
  if (quitBtn) quitBtn.addEventListener("click", () => api.quitApp && api.quitApp());

  document.getElementById("tv").addEventListener("click", () => {
    api.openTradingView && api.openTradingView();
  });

  document.getElementById("win").addEventListener("click", () => {
    api.openWindowCapture && api.openWindowCapture();
  });
})();
