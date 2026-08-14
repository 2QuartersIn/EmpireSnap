/* EmpireSnap Desktop — injected on-page UI (Electron build)
 * Same as the extension content script, but prefs use localStorage
 * instead of chrome.storage.
 */
(function () {
  "use strict";
  if (window.__empiresnapLoaded) return;
  window.__empiresnapLoaded = true;

  const Core = window.EmpireSnapCore;
  const PKEY = "empiresnap_prefs";
  let prefs = { scale: 2, defaultMode: "all" };
  try {
    const saved = JSON.parse(localStorage.getItem(PKEY) || "{}");
    if (saved.scale) prefs.scale = +saved.scale;
    if (saved.defaultMode) prefs.defaultMode = saved.defaultMode;
  } catch (e) {}
  const savePrefs = () => {
    try {
      localStorage.setItem(PKEY, JSON.stringify(prefs));
    } catch (e) {}
  };

  const $ = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  };

  function toast(msg, kind) {
    const t = $("div", "empiresnap-toast " + (kind === "err" ? "is-err" : ""));
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }

  const fab = $("div", "empiresnap-fab");
  fab.innerHTML = `
    <button class="empiresnap-fab-main" title="EmpireSnap — capture indicator settings">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
        <circle cx="12" cy="13" r="4"/>
      </svg>
    </button>
    <div class="empiresnap-menu">
      <div class="empiresnap-menu-title">EmpireSnap</div>
      <button data-act="all">📚 Capture All Tabs</button>
      <button data-act="one">📷 Capture Current Panel</button>
      <button data-act="pick">🎯 Pick Element</button>
      <button data-act="window" class="empiresnap-native-only">🖥️ Capture a Window</button>
      <div class="empiresnap-scale">
        <span>Quality</span>
        <div class="empiresnap-seg">
          <button data-scale="1">1x</button>
          <button data-scale="2">2x</button>
          <button data-scale="3">3x</button>
        </div>
      </div>
    </div>`;
  document.documentElement.appendChild(fab);

  /* First-run coach mark. Shows once ever, so a brand-new user who did
   * nothing but run the installer still knows what to do. */
  (function firstRun() {
    try {
      if (localStorage.getItem("empiresnap_seen_intro")) return;
    } catch (e) {
      return;
    }
    const tip = $(
      "div",
      "empiresnap-intro",
      `<strong>Welcome to EmpireSnap</strong>
       <p>Open any indicator's <b>settings</b> dialog, then click the camera
       button below (or press <kbd>Alt</kbd>+<kbd>S</kbd>) to capture every
       tab into one image.</p>
       <button class="empiresnap-btn primary" data-a="got">Got it</button>`
    );
    document.body.appendChild(tip);
    const dismiss = () => {
      try {
        localStorage.setItem("empiresnap_seen_intro", "1");
      } catch (e) {}
      tip.remove();
    };
    tip.querySelector('[data-a="got"]').onclick = dismiss;
    setTimeout(() => tip.classList.add("show"), 400);
  })();

  const menu = fab.querySelector(".empiresnap-menu");
  const mainBtn = fab.querySelector(".empiresnap-fab-main");

  function syncScaleUI() {
    fab.querySelectorAll("[data-scale]").forEach((b) => {
      b.classList.toggle("active", +b.dataset.scale === prefs.scale);
    });
  }
  setTimeout(syncScaleUI, 50);

  /* ---- event shield -------------------------------------------------
   * TradingView closes its settings dialog when it sees a pointer event
   * outside the dialog — and it reacts on pointerdown/mousedown, which
   * fire BEFORE click. So merely handling our own click was too late:
   * pressing the camera button dismissed the very dialog we were about
   * to capture.
   *
   * Fix: one listener on `window` in the CAPTURE phase. Capture runs
   * window -> document -> ... -> target, so this sees the event before
   * any document-level handler TradingView registered. For anything
   * aimed at our own UI we act on it here and stop it dead, so the page
   * never learns the click happened. Our UI is driven entirely from
   * this handler, since stopping propagation also prevents the event
   * reaching our own child elements.
   */
  const OURS = ".empiresnap-fab, .empiresnap-overlay, .empiresnap-intro, .empiresnap-pick-hint";

  function inOurUI(node) {
    return !!(node && node.closest && node.closest(OURS));
  }

  ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"].forEach(
    (type) => {
      window.addEventListener(
        type,
        (e) => {
          if (pickerActive) return; // element picker needs raw page events
          if (!inOurUI(e.target)) {
            // a genuine click elsewhere just closes our menu
            if (type === "mousedown") fab.classList.remove("open");
            return;
          }
          // our UI: swallow it so TradingView never sees an "outside click"
          e.stopPropagation();
          if (typeof e.stopImmediatePropagation === "function")
            e.stopImmediatePropagation();
          // block focus stealing from the dialog, but leave real clicks alone
          if (type === "pointerdown" || type === "mousedown") e.preventDefault();
          if (type === "click") handleUiClick(e);
        },
        true // capture phase
      );
    }
  );

  async function handleUiClick(e) {
    const t = e.target;

    if (t.closest(".empiresnap-fab-main")) {
      fab.classList.toggle("open");
      return;
    }

    const scaleBtn = t.closest("[data-scale]");
    if (scaleBtn) {
      prefs.scale = +scaleBtn.dataset.scale;
      syncScaleUI();
      savePrefs();
      return;
    }

    const act = t.closest("[data-act]");
    if (act) {
      fab.classList.remove("open");
      const mode = act.dataset.act;
      if (mode === "pick") return startPicker();
      if (mode === "window") return captureWindow();
      return runCapture(mode);
    }

    /* Generic dispatch. The shield stops events before they reach our own
     * elements, so anything that registered its own handler (the × close
     * button, Download, Copy, a source card) has to be invoked from here.
     * Walk up from the target to the nearest ancestor inside our UI that
     * has an onclick and call it — this is why our controls use .onclick
     * rather than addEventListener. */
    let n = t;
    while (n && n.closest && n.closest(OURS)) {
      if (typeof n.onclick === "function") {
        n.onclick(e);
        return;
      }
      n = n.parentElement;
    }

    // click on the dimmed backdrop itself closes the overlay
    if (t.classList && t.classList.contains("empiresnap-overlay")) t.remove();
  }

  const native =
    typeof window !== "undefined" && window.empiresnapNative
      ? window.empiresnapNative
      : null;

  // hide desktop-only entries when running as an extension/userscript
  if (!native) {
    fab.querySelectorAll(".empiresnap-native-only").forEach((el) => el.remove());
  }

  /* Native window/screen capture — hands off to the main process, which owns
   * the OS-level capture. Only what is visible on that window is captured;
   * for full settings (scrolled + other tabs) use Capture All Tabs. */
  async function captureWindow() {
    if (!native) {
      toast("Window capture is only available in the desktop app", "err");
      return;
    }
    showBusy(true);
    try {
      const list = await native.listSources();
      showBusy(false);
      if (!list || !list.length) {
        toast("No capturable windows found", "err");
        return;
      }
      showSourcePicker(list);
    } catch (err) {
      showBusy(false);
      toast("Could not list windows: " + (err.message || err), "err");
    }
  }

  function showSourcePicker(list) {
    const ov = $("div", "empiresnap-overlay");
    const cards = list
      .map(
        (s, i) =>
          '<button class="empiresnap-src" data-i="' + i + '">' +
          '<span class="th">' +
          (s.thumbnail ? '<img src="' + s.thumbnail + '">' : "") +
          '</span><span class="nm"></span></button>'
      )
      .join("");
    ov.innerHTML =
      '<div class="empiresnap-modal">' +
      '<div class="empiresnap-modal-head"><span class="empiresnap-logo-dot"></span>' +
      "<strong>Capture a Window or Screen</strong>" +
      '<span class="empiresnap-dim">visible content only</span>' +
      '<button class="empiresnap-x">&times;</button></div>' +
      '<div class="empiresnap-modal-body"><div class="empiresnap-srcgrid">' +
      cards +
      "</div></div></div>";
    document.body.appendChild(ov);
    // set names as text (avoids HTML injection from window titles)
    ov.querySelectorAll(".empiresnap-src").forEach((el, i) => {
      el.querySelector(".nm").textContent = list[i].name;
      el.onclick = async () => {
        ov.remove();
        showBusy(true);
        try {
          const res = await native.captureSource(list[i].id);
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas");
            c.width = img.naturalWidth;
            c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            showBusy(false);
            showPreview(c);
          };
          img.onerror = () => {
            showBusy(false);
            toast("Could not read capture", "err");
          };
          img.src = res.dataUrl;
        } catch (err) {
          showBusy(false);
          toast("Capture failed: " + (err.message || err), "err");
        }
      };
    });
    ov.querySelector(".empiresnap-x").onclick = () => ov.remove();
  }

  async function runCapture(mode, targetEl) {
    const dialog = targetEl || Core.findSettingsDialog();
    if (!dialog) {
      toast("No settings dialog found. Open an indicator's settings first.", "err");
      return;
    }
    showBusy(true);
    try {
      const opts = { scale: prefs.scale };
      const canvas =
        mode === "all"
          ? await Core.captureAllTabs(dialog, opts)
          : await Core.captureElement(dialog, opts);
      showPreview(canvas);
    } catch (err) {
      console.error("[EmpireSnap]", err);
      toast("Capture failed: " + (err.message || err), "err");
    } finally {
      showBusy(false);
    }
  }

  // exposed so the Electron app menu / accelerators can trigger a capture
  window.__empiresnapCapture = runCapture;

  let pickerActive = false;
  function startPicker() {
    if (pickerActive) return;
    pickerActive = true;
    const hl = $("div", "empiresnap-hl");
    document.body.appendChild(hl);
    const hint = $("div", "empiresnap-pick-hint", "Click the panel to capture · Esc to cancel");
    document.body.appendChild(hint);
    let current = null;

    function move(ev) {
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      if (!el || fab.contains(el) || el === hl || el === hint) return;
      current = el;
      const r = el.getBoundingClientRect();
      Object.assign(hl.style, {
        left: r.left + "px",
        top: r.top + "px",
        width: r.width + "px",
        height: r.height + "px",
      });
    }
    function done() {
      pickerActive = false;
      hl.remove();
      hint.remove();
      document.removeEventListener("mousemove", move, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
    }
    function click(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      const target = current;
      done();
      if (target) runCapture("one", target);
    }
    function key(ev) {
      if (ev.key === "Escape") done();
    }
    document.addEventListener("mousemove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
  }

  let busyEl = null;
  function showBusy(on) {
    if (on) {
      busyEl = $("div", "empiresnap-busy", `<div class="empiresnap-spinner"></div><span>Capturing settings…</span>`);
      document.body.appendChild(busyEl);
    } else if (busyEl) {
      busyEl.remove();
      busyEl = null;
    }
  }

  function showPreview(canvas) {
    const overlay = $("div", "empiresnap-overlay");
    const dataUrl = canvas.toDataURL("image/png");
    overlay.innerHTML = `
      <div class="empiresnap-modal">
        <div class="empiresnap-modal-head">
          <span class="empiresnap-logo-dot"></span>
          <strong>EmpireSnap</strong>
          <span class="empiresnap-dim">${canvas.width}×${canvas.height}px</span>
          <button class="empiresnap-x" title="Close">&times;</button>
        </div>
        <div class="empiresnap-modal-body"><img src="${dataUrl}" alt="captured settings"></div>
        <div class="empiresnap-modal-foot">
          <button class="empiresnap-btn ghost" data-a="close">Close</button>
          <button class="empiresnap-btn" data-a="copy">Copy image</button>
          <button class="empiresnap-btn primary" data-a="dl">Download PNG</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector(".empiresnap-x").onclick = close;
    overlay.querySelector('[data-a="close"]').onclick = close;
    overlay.querySelector('[data-a="dl"]').onclick = async () => {
      await Core.download(canvas);
      toast("Saved " + Core.filename());
    };
    overlay.querySelector('[data-a="copy"]').onclick = async () => {
      try {
        await Core.copyToClipboard(canvas);
        toast("Copied to clipboard");
      } catch (err) {
        toast("Copy failed — use Download instead", "err");
      }
    };
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "s" || e.key === "S")) {
      e.preventDefault();
      runCapture(prefs.defaultMode === "one" ? "one" : "all");
    }
  });
})();
