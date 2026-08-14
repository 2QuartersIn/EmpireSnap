/* EmpireSnap window/screen picker */
(function () {
  "use strict";
  const api = window.empiresnapPicker;
  const grid = document.getElementById("grid");
  const ov = document.getElementById("ov");
  const pvimg = document.getElementById("pvimg");
  const pvname = document.getElementById("pvname");
  const toastEl = document.getElementById("toast");
  let current = null;

  function toast(msg, err) {
    toastEl.textContent = msg;
    toastEl.className = "toast show" + (err ? " err" : "");
    setTimeout(() => (toastEl.className = "toast"), 2400);
  }

  function stamp(name) {
    const d = new Date(), p = (n) => String(n).padStart(2, "0");
    const safe = (name || "capture").replace(/[^\w.-]+/g, "_").slice(0, 40);
    return `empiresnap_${safe}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.png`;
  }

  async function load() {
    grid.innerHTML = '<div class="state">Loading sources…</div>';
    try {
      const list = await api.listSources();
      if (!list.length) {
        grid.innerHTML = '<div class="state">No capturable windows found.</div>';
        return;
      }
      grid.innerHTML = "";
      for (const s of list) {
        const el = document.createElement("div");
        el.className = "src";
        el.innerHTML =
          '<div class="thumb">' +
          (s.thumbnail ? '<img src="' + s.thumbnail + '" alt="">' : "") +
          '</div><div class="cap"><span class="tag">' +
          (s.isScreen ? "Screen" : "Window") +
          '</span><span class="nm"></span></div>';
        el.querySelector(".nm").textContent = s.name;
        el.addEventListener("click", () => grab(s));
        grid.appendChild(el);
      }
    } catch (e) {
      grid.innerHTML = '<div class="state">Could not list sources: ' + (e.message || e) + "</div>";
    }
  }

  async function grab(s) {
    try {
      const res = await api.captureSource(s.id);
      current = res;
      pvimg.src = res.dataUrl;
      pvname.textContent = res.name || "Capture";
      ov.classList.add("show");
    } catch (e) {
      toast("Capture failed: " + (e.message || e), true);
    }
  }

  document.getElementById("refresh").addEventListener("click", load);
  document.getElementById("back").addEventListener("click", () => ov.classList.remove("show"));
  ov.addEventListener("click", (e) => { if (e.target === ov) ov.classList.remove("show"); });

  document.getElementById("save").addEventListener("click", async () => {
    if (!current) return;
    const out = await api.savePng(current.dataUrl, stamp(current.name));
    if (out) toast("Saved");
  });
  document.getElementById("copy").addEventListener("click", async () => {
    if (!current) return;
    await api.copyPng(current.dataUrl);
    toast("Copied to clipboard");
  });

  load();
})();
