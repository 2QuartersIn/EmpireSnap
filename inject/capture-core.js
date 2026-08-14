/* EmpireSnap clone — capture core
 * Shared, framework-free logic for detecting the TradingView indicator
 * settings dialog, expanding its scrolled-out content, and rendering the
 * whole thing into a single canvas via html2canvas.
 *
 * Exposes window.EmpireSnapCore
 */
(function () {
  "use strict";

  const TAB_LABELS = ["inputs", "style", "visibility", "properties", "defaults"];

  // ---- visibility helpers -------------------------------------------------
  // min defaults to 40px — right for dialog-sized nodes. Tab buttons are
  // much smaller (~30px tall), so tab detection passes a lower threshold;
  // using 40 here silently emptied the tab list and broke All-Tabs capture.
  function isVisible(el, min) {
    if (!el || !el.getBoundingClientRect) return false;
    const m = min == null ? 40 : min;
    const r = el.getBoundingClientRect();
    if (r.width < m || r.height < m) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0)
      return false;
    return true;
  }
  const isVisibleSmall = (el) => isVisible(el, 8);

  function textOf(el) {
    return (el.innerText || el.textContent || "").toLowerCase();
  }

  // ---- find the settings dialog ------------------------------------------
  // Strategy: collect candidate "dialog-like" nodes, score each by how much
  // it looks like an indicator settings panel, return the best one.
  function findSettingsDialog() {
    const selectors = [
      '[data-name="indicator-properties-dialog"]',
      '[data-dialog-name="indicator-properties"]',
      '[data-name="study-inputs"]',
      '[data-name="indicator-properties"]',
      '[class*="dialog-"][role="dialog"]',
      '[role="dialog"]',
      '.tv-dialog',
      '[class*="dialog"]',
    ];

    const seen = new Set();
    const candidates = [];
    for (const sel of selectors) {
      let nodes = [];
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      for (const el of nodes) {
        if (seen.has(el)) continue;
        seen.add(el);
        if (isVisible(el)) candidates.push(el);
      }
    }

    let best = null;
    let bestScore = -Infinity;
    for (const el of candidates) {
      const s = scoreDialog(el);
      if (s > bestScore) {
        bestScore = s;
        best = el;
      }
    }
    return bestScore > 0 ? best : null;
  }

  function scoreDialog(el) {
    const t = textOf(el).slice(0, 4000);
    let score = 0;

    // settings dialogs carry tab labels + a footer
    let tabHits = 0;
    for (const lbl of TAB_LABELS) if (t.includes(lbl)) tabHits++;
    score += tabHits * 2;

    if (t.includes("cancel") && (t.includes("ok") || t.includes("apply")))
      score += 2;
    if (t.includes("template")) score += 2;

    // contains real form controls
    const controls = el.querySelectorAll(
      'input, select, [role="checkbox"], [role="switch"], [class*="colorPicker"], [class*="swatch"]'
    ).length;
    if (controls >= 3) score += 3;
    else if (controls >= 1) score += 1;

    // prefer the inner-most matching dialog, not the giant overlay wrapper
    const r = el.getBoundingClientRect();
    const areaRatio = (r.width * r.height) / (innerWidth * innerHeight);
    if (areaRatio > 0.96) score -= 3; // full-screen overlay, not the panel
    if (areaRatio > 0.05 && areaRatio < 0.85) score += 1;

    const z = parseInt(getComputedStyle(el).zIndex, 10);
    if (!isNaN(z)) score += Math.min(z, 1000) / 1000;

    return score;
  }

  // ---- expand scrolled-out content ---------------------------------------
  // Returns a restore() function. Mutates live DOM so html2canvas' clone
  // inherits the expanded layout.
  function expandScroll(root) {
    const touched = [];
    const all = [root, ...root.querySelectorAll("*")];
    for (const el of all) {
      const cs = getComputedStyle(el);
      const scrolls =
        /(auto|scroll|hidden)/.test(cs.overflowY) &&
        el.scrollHeight > el.clientHeight + 2;
      const cappedH =
        cs.maxHeight !== "none" || (cs.height !== "auto" && el === root);
      if (scrolls || cappedH) {
        touched.push([el, el.getAttribute("style") || ""]);
        el.style.overflow = "visible";
        el.style.maxHeight = "none";
        el.style.height = "auto";
      }
    }
    return function restore() {
      for (const [el, prev] of touched) {
        if (prev) el.setAttribute("style", prev);
        else el.removeAttribute("style");
      }
    };
  }

  // ---- render an element to a canvas -------------------------------------
  async function captureElement(el, opts) {
    opts = opts || {};
    const scale = opts.scale || Math.min(window.devicePixelRatio || 1, 2) || 2;
    const restore = expandScroll(el);
    // let layout settle
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)));
    try {
      const canvas = await html2canvas(el, {
        scale,
        useCORS: true,
        allowTaint: false,
        backgroundColor: opts.backgroundColor || null,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: Math.max(
          document.documentElement.scrollHeight,
          el.scrollHeight
        ),
      });
      return canvas;
    } finally {
      restore();
    }
  }

  // ---- tab discovery + cycling -------------------------------------------
  function findTabs(dialog) {
    let tabs = Array.from(
      dialog.querySelectorAll('[role="tab"]')
    ).filter(isVisibleSmall);

    if (tabs.length < 2) {
      // fallback: clickable elements whose text exactly matches a known tab
      const clickable = dialog.querySelectorAll(
        'button, [data-name], [class*="tab"], span, div'
      );
      const byLabel = [];
      for (const el of clickable) {
        const txt = (el.innerText || "").trim().toLowerCase();
        if (
          TAB_LABELS.includes(txt) &&
          isVisibleSmall(el) &&
          el.getBoundingClientRect().height < 60
        ) {
          byLabel.push(el);
        }
      }
      // de-dupe by label, keep first occurrence
      const used = new Set();
      tabs = byLabel.filter((el) => {
        const k = (el.innerText || "").trim().toLowerCase();
        if (used.has(k)) return false;
        used.add(k);
        return true;
      });
    }
    return tabs;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // capture every tab and stitch vertically with labelled separators
  async function captureAllTabs(dialog, opts) {
    opts = opts || {};
    const tabs = findTabs(dialog);
    if (tabs.length < 2) {
      // nothing to cycle — just capture what's there
      return captureElement(dialog, opts);
    }

    const slices = [];
    const activeIdx = tabs.findIndex((t) =>
      /(active|selected|checked)/i.test(t.className + " " + (t.getAttribute("aria-selected") || ""))
    );

    for (const tab of tabs) {
      const label = (tab.innerText || "").trim() || "Tab";
      tab.click();
      await sleep(180);
      const canvas = await captureElement(dialog, opts);
      slices.push({ label, canvas });
    }

    // restore original tab
    if (activeIdx >= 0 && tabs[activeIdx]) {
      tabs[activeIdx].click();
      await sleep(120);
    }

    return stitch(slices, opts.scale || 2);
  }

  // ---- stitch slices into one labelled image -----------------------------
  function stitch(slices, scale) {
    const pad = 14 * scale;
    const labelH = 30 * scale;
    const width = Math.max(...slices.map((s) => s.canvas.width)) + pad * 2;
    let height = pad;
    for (const s of slices) height += labelH + s.canvas.height + pad;

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d");

    ctx.fillStyle = "#0f1014";
    ctx.fillRect(0, 0, width, height);

    let y = pad;
    for (const s of slices) {
      // label bar
      ctx.fillStyle = "#6366F1";
      ctx.fillRect(pad, y, width - pad * 2, labelH);
      ctx.fillStyle = "#ffffff";
      ctx.font = `600 ${14 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(s.label.toUpperCase(), pad + 10 * scale, y + labelH / 2);
      y += labelH;
      // slice
      ctx.drawImage(s.canvas, pad, y);
      y += s.canvas.height + pad;
    }
    return out;
  }

  // ---- output helpers -----------------------------------------------------
  function symbolFromTitle() {
    const t = document.title || "";
    const m = t.match(/([A-Z0-9!._-]{1,12})/);
    return m ? m[1].replace(/[^A-Za-z0-9!._-]/g, "") : "chart";
  }

  function filename() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(
      d.getDate()
    )}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return `empiresnap_${symbolFromTitle()}_${stamp}.png`;
  }

  function canvasToBlob(canvas) {
    return new Promise((res) => canvas.toBlob(res, "image/png"));
  }

  async function download(canvas) {
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function copyToClipboard(canvas) {
    const blob = await canvasToBlob(canvas);
    if (!navigator.clipboard || !window.ClipboardItem) {
      throw new Error("Clipboard API unavailable in this browser");
    }
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
  }

  window.EmpireSnapCore = {
    findSettingsDialog,
    captureElement,
    captureAllTabs,
    findTabs,
    expandScroll,
    download,
    copyToClipboard,
    filename,
    isVisible,
  };
})();
