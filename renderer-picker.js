/* EmpireSnap window/screen picker — list, capture, crop, save */
(function () {
  "use strict";
  const api = window.empiresnapPicker;
  const grid = document.getElementById("grid");
  const ov = document.getElementById("ov");
  const pvimg = document.getElementById("pvimg");
  const pvname = document.getElementById("pvname");
  const sel = document.getElementById("sel");
  const wrap = document.getElementById("cropwrap");
  const toastEl = document.getElementById("toast");

  let current = null; // {name, dataUrl}
  let crop = null; // {x,y,w,h} in natural image pixels

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

  /* ---------- source list ---------- */
  async function load() {
    grid.innerHTML = '<div class="state">Loading sources…</div>';
    try {
      const list = await api.listSources();
      if (!list || !list.length) {
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
      resetCrop();
      pvimg.src = res.dataUrl;
      pvname.textContent = res.name || "Capture";
      ov.classList.add("show");
    } catch (e) {
      toast("Capture failed: " + (e.message || e), true);
    }
  }

  /* ---------- crop selection ----------
   * Selection is tracked in displayed pixels for drawing, then converted to
   * natural image pixels on apply, so the saved crop is full resolution
   * regardless of how much the preview was scaled down to fit. */
  let dragging = false;
  let sx = 0, sy = 0;

  function resetCrop() {
    crop = null;
    sel.className = "sel";
    sel.style.width = sel.style.height = "0px";
  }

  function localPoint(e) {
    const r = pvimg.getBoundingClientRect();
    return {
      x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
      y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
      r,
    };
  }

  wrap.addEventListener("mousedown", (e) => {
    if (!pvimg.naturalWidth) return; // nothing loaded to crop
    const p = localPoint(e);
    dragging = true;
    sx = p.x; sy = p.y;
    sel.className = "sel on";
    sel.style.left = sx + "px";
    sel.style.top = sy + "px";
    sel.style.width = "0px";
    sel.style.height = "0px";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const p = localPoint(e);
    const x = Math.min(p.x, sx), y = Math.min(p.y, sy);
    const w = Math.abs(p.x - sx), h = Math.abs(p.y - sy);
    sel.style.left = x + "px";
    sel.style.top = y + "px";
    sel.style.width = w + "px";
    sel.style.height = h + "px";
  });

  window.addEventListener("mouseup", (e) => {
    if (!dragging) return;
    dragging = false;
    const p = localPoint(e);
    const x = Math.min(p.x, sx), y = Math.min(p.y, sy);
    const w = Math.abs(p.x - sx), h = Math.abs(p.y - sy);
    if (w < 8 || h < 8) { resetCrop(); return; }
    const scale = pvimg.naturalWidth / p.r.width;
    crop = {
      x: Math.round(x * scale),
      y: Math.round(y * scale),
      w: Math.round(w * scale),
      h: Math.round(h * scale),
    };
  });

  /* returns the dataURL to output — cropped if a selection exists */
  function outputDataUrl() {
    const source = current ? current.dataUrl : pvimg.src;
    return new Promise((resolve) => {
      if (!crop) return resolve(source);
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = crop.w; c.height = crop.h;
        c.getContext("2d").drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        resolve(c.toDataURL("image/png"));
      };
      img.onerror = () => resolve(source);
      img.src = source;
    });
  }

  /* ---------- buttons ---------- */
  document.getElementById("refresh").addEventListener("click", load);
  document.getElementById("back-home").addEventListener("click", () => {
    api.openLauncher && api.openLauncher();
  });
  document.getElementById("back").addEventListener("click", () => {
    ov.classList.remove("show");
    resetCrop();
  });
  document.getElementById("reset").addEventListener("click", resetCrop);
  ov.addEventListener("click", (e) => {
    if (e.target === ov) { ov.classList.remove("show"); resetCrop(); }
  });

  document.getElementById("save").addEventListener("click", async () => {
    if (!current) return;
    const url = await outputDataUrl();
    const out = await api.savePng(url, stamp(current.name));
    if (out) toast(crop ? "Saved cropped image" : "Saved");
  });
  document.getElementById("copy").addEventListener("click", async () => {
    if (!current) return;
    await api.copyPng(await outputDataUrl());
    toast(crop ? "Copied cropped image" : "Copied to clipboard");
  });

  // exposed for automated tests; harmless in normal use
  window.__empiresnapCropState = () => crop;

  load();
})();
