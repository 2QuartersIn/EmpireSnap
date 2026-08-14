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

  // ---- scroll capture -----------------------------------------------------
  /* Photograph the settings list one screenful at a time while scrolling it,
   * then lay the sections out side by side.
   *
   * Why this exists alongside the expand-and-render path: expanding the
   * container and handing it to html2canvas produces a re-drawing of the DOM,
   * which can differ from what you actually see (custom controls, colour
   * swatches, fonts), and it shows nothing for rows a virtualised list has
   * not rendered yet. Scrolling the real list and capturing each screenful
   * sidesteps both — and in the desktop app each screenful is a true native
   * screenshot rather than a re-render. */

  function findScroller(root) {
    let best = null;
    let bestOver = 0;
    const all = [root, ...root.querySelectorAll("*")];
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY)) continue;
      const over = el.scrollHeight - el.clientHeight;
      if (over > bestOver && el.clientHeight > 80) {
        bestOver = over;
        best = el;
      }
    }
    return bestOver > 8 ? best : null;
  }

  function cropTopPx(canvas, px) {
    px = Math.max(0, Math.round(px));
    if (px <= 0 || px >= canvas.height) return canvas;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height - px;
    out
      .getContext("2d")
      .drawImage(canvas, 0, px, canvas.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  function imageToCanvas(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext("2d").drawImage(img, 0, 0);
        resolve(c);
      };
      img.onerror = () => reject(new Error("section image failed to load"));
      img.src = src;
    });
  }

  function nativeBridge() {
    return typeof window !== "undefined" &&
      window.empiresnapNative &&
      typeof window.empiresnapNative.captureRegion === "function"
      ? window.empiresnapNative
      : null;
  }

  /* Capture the exact on-screen region of `el` as true pixels. */
  async function shootRegion(el) {
    const native = nativeBridge();
    const r = el.getBoundingClientRect();
    const res = await native.captureRegion({
      x: r.left,
      y: r.top,
      width: r.width,
      height: r.height,
    });
    const canvas = await imageToCanvas(res.dataUrl);
    return { canvas, rect: r };
  }

  async function scrollCapture(dialog, opts) {
    opts = opts || {};

    /* Scroll capture depends on photographing the real screen: html2canvas
     * re-renders from the DOM and ignores an inner container's scrollTop, so
     * the fallback would silently produce blank and duplicated sections.
     * Outside the desktop app we use the expand-and-render path instead. */
    if (!nativeBridge()) {
      const canvas = await captureElement(dialog, opts);
      canvas.__empiresnapFellBack = true;
      return canvas;
    }

    const scroller = findScroller(dialog);
    if (!scroller) {
      const shot = await shootRegion(dialog);
      return stitchSideBySide([shot.canvas], opts.scale || 2, ["Settings"], opts);
    }

    /* hide the scrollbar for the duration — otherwise every section carries
     * a grey scrollbar strip down its right edge */
    const hideBars = document.createElement("style");
    hideBars.textContent =
      "*::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}" +
      "*{scrollbar-width:none!important}";
    document.head.appendChild(hideBars);

    const restoreTo = scroller.scrollTop;
    const view = scroller.clientHeight;
    const total = scroller.scrollHeight;
    const shots = [];
    const labels = [];

    scroller.scrollTop = 0;
    await sleep(200);

    let prevTop = null;
    let i = 0;
    const maxSections = 24; // safety valve

    while (i < maxSections) {
      const actual = scroller.scrollTop;
      // first section keeps the dialog chrome (title + tabs) for context
      const shot = await shootRegion(i === 0 ? dialog : scroller);
      let canvas = shot.canvas;

      if (i > 0 && prevTop !== null) {
        const advanced = actual - prevTop;
        if (advanced < view) {
          // scrolled less than a full screen — trim the repeated rows,
          // converting CSS px to captured px via this shot's own scale
          const pxPerCss = canvas.height / (shot.rect.height || view);
          canvas = cropTopPx(canvas, (view - advanced) * pxPerCss);
        }
      }

      /* Trim the partial row hanging off the bottom edge, and advance the
       * scroll by exactly what we kept — so the next section begins on a
       * clean row boundary instead of slicing one in half. */
      let advanceCss = view;
      const atEnd = actual + view >= total - 2;
      if (!atEnd) {
        const pxPerCss = canvas.height / (shot.rect.height || view);
        const ctx2 = canvas.getContext("2d");
        const searchPx = Math.min(38 * pxPerCss, canvas.height * 0.25);
        const cut = quietRow(
          ctx2,
          canvas.width,
          canvas.height - searchPx / 2,
          searchPx / 2
        );
        if (cut > canvas.height * 0.5 && cut < canvas.height) {
          const trimmed = document.createElement("canvas");
          trimmed.width = canvas.width;
          trimmed.height = cut;
          trimmed
            .getContext("2d")
            .drawImage(canvas, 0, 0, canvas.width, cut, 0, 0, canvas.width, cut);
          canvas = trimmed;
          advanceCss = cut / pxPerCss;
        }
      }

      shots.push(canvas);
      labels.push("Section " + (i + 1));
      prevTop = actual;

      if (atEnd) break;
      scroller.scrollTop = actual + advanceCss;
      await sleep(200);
      if (scroller.scrollTop === actual) break; // didn't move; stop
      i++;
    }

    scroller.scrollTop = restoreTo;
    hideBars.remove();
    await sleep(60);
    return decorate(
      stitchSideBySide(shots, opts.scale || 2, labels, opts),
      captureMeta(dialog),
      opts.scale || 2,
      opts
    );
  }

  /* lay sections out left-to-right, tops aligned */
  /* Lay sections out in a GRID rather than a single row.
   *
   * One row was fine for 4 sections and absurd for 21 — a 9,000px-wide strip
   * is as unusable as the 20,000px-tall one it replaced. We wrap sections
   * into rows, choosing the column count that lands nearest a comfortable
   * landscape ratio. Reading order is left-to-right, top-to-bottom. */
  function stitchSideBySide(canvases, scale, labels, opts) {
    opts = opts || {};
    const pad = 14 * scale;
    const gap = 12 * scale;
    const labelH = 22 * scale;
    const n = canvases.length;

    const cellW = Math.max(...canvases.map((c) => c.width));
    const cellH = Math.max(...canvases.map((c) => c.height)) + labelH;

    // cols such that (cols*cellW) / (rows*cellH) ~= targetRatio
    const targetRatio = opts.ratio || 1.45;
    let cols = Math.round(Math.sqrt((targetRatio * n * cellH) / cellW));
    cols = Math.max(1, Math.min(cols, n));
    const rows = Math.ceil(n / cols);

    // per-row height = tallest cell in that row (section 1 is taller: it
    // includes the dialog title and tabs)
    const rowH = [];
    for (let r = 0; r < rows; r++) {
      let h = 0;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i < n) h = Math.max(h, canvases[i].height + labelH);
      }
      rowH.push(h);
    }

    const outW = pad * 2 + cols * cellW + (cols - 1) * gap;
    const outH =
      pad * 2 + rowH.reduce((a, b) => a + b, 0) + (rows - 1) * gap;

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#0f1014";
    ctx.fillRect(0, 0, outW, outH);

    let y = pad;
    for (let r = 0; r < rows; r++) {
      let x = pad;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (i >= n) break;
        const cv = canvases[i];
        ctx.fillStyle = "#6366F1";
        ctx.fillRect(x, y, cv.width, labelH);
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 ${11 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(
          String(labels[i] || "Section " + (i + 1)).toUpperCase(),
          x + 9 * scale,
          y + labelH / 2
        );
        ctx.drawImage(cv, x, y + labelH);
        x += cellW + gap;
      }
      y += rowH[r] + gap;
    }
    return out;
  }

  // ---- branding / context header -----------------------------------------
  /* A capture with no context is hard to read weeks later: which indicator,
   * which symbol, which timeframe, when. The original tool framed its output
   * with a header and a credit line; this does the same. */

  function captureMeta(dialog) {
    const meta = { indicator: "", symbol: "", timeframe: "", tab: "" };

    // indicator name: first non-empty line of the dialog
    try {
      const lines = (dialog.innerText || "")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length) meta.indicator = lines[0].slice(0, 70);
      // active tab, if one is marked
      const act = dialog.querySelector(
        '[role="tab"][aria-selected="true"], [role="tab"].active, [role="tab"][class*="active"]'
      );
      if (act) meta.tab = (act.innerText || "").trim();
    } catch (e) {}

    // symbol + timeframe from the page title, e.g.
    // "MNQU2026 30,069.50 ▼ −0.39% ict · 1m — TradingView"
    try {
      const t = (document.title || "").replace(/[—–-]\s*TradingView.*$/i, "").trim();
      if (t) meta.symbol = t.slice(0, 80);
      const tf = t.match(/(?:^|[·|,\s])(\d+\s?(?:s|m|h|D|W|M)|\d+\s?(?:min|hour|day))\b/);
      if (tf) meta.timeframe = tf[1].replace(/\s+/g, "");
    } catch (e) {}

    return meta;
  }

  function fmtStamp(d) {
    const p = (n) => String(n).padStart(2, "0");
    let h = d.getHours();
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return (
      `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}, ` +
      `${h}:${p(d.getMinutes())}:${p(d.getSeconds())} ${ampm}`
    );
  }

  /* wrap a finished capture in a header bar + footer credit */
  function decorate(canvas, meta, scale, opts) {
    opts = opts || {};
    if (opts.brand === false) return canvas;
    const headH = 62 * scale;
    const footH = 30 * scale;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height + headH + footH;
    const ctx = out.getContext("2d");

    ctx.fillStyle = "#0f1014";
    ctx.fillRect(0, 0, out.width, out.height);

    // header band
    const grad = ctx.createLinearGradient(0, 0, out.width, 0);
    grad.addColorStop(0, "#6366F1");
    grad.addColorStop(1, "#4F46E5");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, out.width, headH);

    const padX = 18 * scale;
    ctx.textBaseline = "middle";

    // left: indicator name + symbol/timeframe
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${20 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
    const name = meta.indicator || "Indicator settings";
    ctx.fillText(name, padX, headH * 0.36);

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    ctx.font = `500 ${13 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
    const sub = [meta.symbol, meta.tab ? meta.tab.toUpperCase() : ""]
      .filter(Boolean)
      .join("   ·   ");
    if (sub) ctx.fillText(sub, padX, headH * 0.71);

    // right: brand + timestamp
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${16 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillText("EmpireSnap", out.width - padX, headH * 0.36);
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.font = `500 ${12 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.fillText(fmtStamp(new Date()), out.width - padX, headH * 0.71);
    ctx.textAlign = "left";

    // body
    ctx.drawImage(canvas, 0, headH);

    // footer credit
    ctx.fillStyle = "#15171e";
    ctx.fillRect(0, out.height - footH, out.width, footH);
    ctx.fillStyle = "#7b7f92";
    ctx.font = `500 ${12 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(
      "Captured with EmpireSnap  ·  2QuartersIn",
      out.width / 2,
      out.height - footH / 2
    );
    ctx.textAlign = "left";

    return out;
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

    const body =
      opts.layout === "single"
        ? stitch(slices, opts.scale || 2)
        : stitchColumns(slices, opts.scale || 2, opts);
    return decorate(body, captureMeta(dialog), opts.scale || 2, opts);
  }

  // ---- stitch slices into one labelled image -----------------------------
  /* ---- column layout ------------------------------------------------
   * A single tall strip (one tab stacked under the next) can run to
   * 20,000px — technically complete but useless to share or read. The
   * original IndiSnap laid settings out in side-by-side columns, which
   * keeps the whole configuration legible in one landscape image.
   *
   * We render each tab to a tall canvas, then flow those canvases into
   * columns of a computed height, splitting a tab across columns when
   * needed. Split points snap to a "quiet" pixel row so we don't slice
   * through the middle of a settings row.
   */

  // find a horizontal row near `y` that looks like a gap between rows
  function quietRow(ctx, w, y, searchPx) {
    const from = Math.max(1, y - searchPx);
    const to = Math.min(ctx.canvas.height - 1, y + searchPx);
    if (to <= from) return y;
    let bestY = y;
    let bestScore = Infinity;
    const step = Math.max(1, Math.floor(w / 160)); // sample across the width
    for (let ry = from; ry <= to; ry++) {
      let data;
      try {
        data = ctx.getImageData(0, ry, w, 1).data;
      } catch (e) {
        return y; // tainted canvas — fall back to the exact point
      }
      // score = how much this row varies horizontally; low = flat = a gap
      let prev = -1;
      let changes = 0;
      for (let x = 0; x < w; x += step) {
        const i = x * 4;
        const lum = (data[i] * 3 + data[i + 1] * 6 + data[i + 2]) >> 3;
        if (prev >= 0 && Math.abs(lum - prev) > 10) changes++;
        prev = lum;
      }
      const dist = Math.abs(ry - y) / (searchPx + 1); // prefer staying close
      const score = changes + dist * 2;
      if (score < bestScore) {
        bestScore = score;
        bestY = ry;
      }
    }
    return bestY;
  }

  function stitchColumns(slices, scale, opts) {
    opts = opts || {};
    const pad = 14 * scale;
    const gap = 12 * scale;
    const labelH = 30 * scale;
    const colW = Math.max(...slices.map((s) => s.canvas.width));

    // total stacked height if we used one strip
    let totalH = 0;
    for (const s of slices) totalH += labelH + s.canvas.height + gap;

    /* choose a column count that lands near a comfortable landscape ratio */
    const targetRatio = opts.ratio || 1.45;
    let cols = Math.round(Math.sqrt((targetRatio * totalH) / colW));
    cols = Math.max(1, Math.min(cols, 8));
    if (opts.maxColumnHeight) {
      cols = Math.max(cols, Math.ceil(totalH / opts.maxColumnHeight));
      cols = Math.min(cols, 12);
    }
    if (cols === 1) return stitch(slices, scale);

    const colH = Math.ceil(totalH / cols);

    /* flow the slices into columns, splitting where necessary */
    const columns = [];
    let cur = [];
    let curY = 0;

    for (const s of slices) {
      let srcY = 0;
      let first = true;
      while (srcY < s.canvas.height) {
        const room = colH - curY - labelH;
        if (room < 60 * scale && cur.length) {
          columns.push(cur);
          cur = [];
          curY = 0;
          continue;
        }
        const remaining = s.canvas.height - srcY;
        let take = Math.min(remaining, colH - curY - labelH);
        if (take < remaining) {
          // don't cut through a settings row
          const ctx = s.canvas.getContext("2d");
          const snapped = quietRow(ctx, s.canvas.width, srcY + take, 14 * scale);
          if (snapped > srcY + 40 * scale) take = snapped - srcY;
        }
        cur.push({
          label: first ? s.label : s.label + " (cont.)",
          canvas: s.canvas,
          sy: srcY,
          sh: take,
        });
        curY += labelH + take + gap;
        srcY += take;
        first = false;
        if (curY >= colH - 40 * scale) {
          columns.push(cur);
          cur = [];
          curY = 0;
        }
      }
    }
    if (cur.length) columns.push(cur);

    /* measure and paint */
    const heights = columns.map((c) =>
      c.reduce((h, p) => h + labelH + p.sh + gap, 0)
    );
    const outW = pad * 2 + columns.length * colW + (columns.length - 1) * gap;
    const outH = pad * 2 + Math.max(...heights);

    const out = document.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#0f1014";
    ctx.fillRect(0, 0, outW, outH);

    columns.forEach((col, ci) => {
      let x = pad + ci * (colW + gap);
      let y = pad;
      for (const piece of col) {
        ctx.fillStyle = "#6366F1";
        ctx.fillRect(x, y, colW, labelH);
        ctx.fillStyle = "#ffffff";
        ctx.font = `600 ${14 * scale}px -apple-system, Segoe UI, Roboto, sans-serif`;
        ctx.textBaseline = "middle";
        ctx.fillText(piece.label.toUpperCase(), x + 10 * scale, y + labelH / 2);
        y += labelH;
        ctx.drawImage(
          piece.canvas,
          0, piece.sy, piece.canvas.width, piece.sh,
          x, y, piece.canvas.width, piece.sh
        );
        y += piece.sh + gap;
      }
    });
    return out;
  }

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
    stitchColumns,
    decorate,
    captureMeta,
    scrollCapture,
    findScroller,
    findTabs,
    expandScroll,
    download,
    copyToClipboard,
    filename,
    isVisible,
  };
})();
