/* pdf-endpoints.js — the live endpoint table as a figure: quant, context,
   pricing bars (in/out per M tokens), cache pricing, 30m uptime.
   Rows re-sort with a glide animation when the metric chip changes.
   Data snapshot: /models/qwen/qwen3.8-27b/endpoints, 2026-08-24. */
(function () {
  Fig.register("pdf-endpoints", function (el) {
    const cv = Fig.canvas(el, 320);
    Fig.frame(cv);
    const ctx = cv.ctx;

    // [slug, quant, ctx, maxOut, $in/M, $out/M, $cacheRead/M, $cacheWrite/M, up30m, nativePdf]
    const ROWS = [
      ["chutes", "fp8", 262144, 65536, 0.35, 2.75, 0.035, null, 97.0, false],
      ["coreweave", "fp8", 262144, 262144, 0.4, 3.0, 0.15, null, 96.3, false],
      ["akashml", "bf16", 262144, 131072, 0.4, 3.0, 0.05, null, 99.8, false],
      ["alibaba", "?", 1e6, 131072, 0.425, 2.55, 0.085, 0.53125, 100, false],
      ["reka", "fp8", 262144, 131072, 0.45, 3.2, 0.05, null, 100, false],
      ["venice", "fp8", 262144, 65536, 0.45, 3.2, null, null, 98.9, true],
      ["parasail", "fp8", 262144, 262144, 0.45, 3.2, null, null, 99.7, false],
      ["io-net", "fp8", 65500, 65536, 0.48, 3.4, 0.25, null, 99.8, false],
    ];
    // uptime bar scales from 94 so a few points of difference stay visible
    const MODES = [
      {
        label: "$ / M output tok",
        get: (r) => r[5],
        max: 3.4,
        fmt: (v) => "$" + v,
        best: "low",
      },
      {
        label: "$ / M input tok",
        get: (r) => r[4],
        max: 0.48,
        fmt: (v) => "$" + v,
        best: "low",
      },
      {
        label: "$ / M cached-in",
        get: (r) => r[6],
        max: 0.25,
        fmt: (v) => "$" + v,
        best: "low",
      },
      {
        label: "uptime 30m",
        get: (r) => r[8],
        min: 94,
        max: 100,
        fmt: (v) => v.toFixed(1) + "%",
        best: "high",
      },
    ];
    let mode = 0;
    let animStart = performance.now(); // bar growth (wall-clock)
    let sortStart = performance.now() - 1e4; // row glide (wall-clock)
    let chips = [];

    // provider logos (small favicons under /static/images/providers/<slug>.png)
    const LOGOS = {};
    ROWS.forEach((r) => {
      const img = new Image();
      img.onload = () => {
        LOGOS[r[0]] = img;
        cv.redraw && cv.redraw();
      };
      img.src = "/static/images/providers/" + r[0] + ".png";
    });

    const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
    const fmtCtx = (n) =>
      n >= 1e6 ? "1M" : n >= 1000 ? Math.round(n / 1024) + "K" : n;

    // rank[i] = vertical slot of ROWS[i] under the current metric (best at top)
    const ranksFor = (mm) => {
      const idx = ROWS.map((_, i) => i);
      idx.sort((a, b) => {
        const va = MODES[mm].get(ROWS[a]),
          vb = MODES[mm].get(ROWS[b]);
        const ka = va == null ? Infinity : MODES[mm].best === "high" ? -va : va;
        const kb = vb == null ? Infinity : MODES[mm].best === "high" ? -vb : vb;
        return ka - kb || a - b;
      });
      const rank = new Array(ROWS.length);
      idx.forEach((rowIdx, slot) => {
        rank[rowIdx] = slot;
      });
      return rank;
    };
    let rankTo = ranksFor(0);
    let rankFrom = rankTo.slice();

    const slotOf = (i, t) => rankFrom[i] + (rankTo[i] - rankFrom[i]) * t;

    function syncChips() {
      chips.forEach((b, i) => {
        const on = i === mode;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.style.opacity = on ? "1" : ".45";
        b.style.borderColor = on ? "var(--accent)" : "var(--rule)";
        b.style.color = on ? "var(--accent)" : "";
      });
    }

    const draw = () => {
      const P = Fig.palette();
      const now = performance.now();
      const grow = ease((now - animStart) / 600);
      const glide = ease((now - sortStart) / 450);
      const w = cv.w,
        h = cv.h;
      ctx.clearRect(0, 0, w, h);

      const m = MODES[mode];
      const narrow = w < 520;
      const showUp = mode !== 3; // uptime metric already owns the bar
      const rowH = (h - 34) / ROWS.length;
      const xLabel = 10;
      const xQuant = narrow ? 72 : 92;
      const xCtx = 132; // hidden when narrow
      const xBar = narrow ? 112 : 178;
      const rightPad = showUp ? (narrow ? 52 : 58) : narrow ? 36 : 40;
      const barW = w - xBar - rightPad;

      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.fillStyle = P.mute;
      ctx.textAlign = "left";
      ctx.fillText("provider", xLabel, 12);
      ctx.fillText("quant", xQuant, 12);
      if (!narrow) ctx.fillText("ctx", xCtx, 12);
      ctx.fillText(m.label + " \u2193", xBar, 12);
      ctx.textAlign = "right";
      if (showUp) ctx.fillText("up 30m", w - 28, 12);
      ctx.fillStyle = P.ink;
      ctx.fillText("\u25C6", w - 10, 12);

      // draw back-to-front by animated slot so gliding rows overlap sanely
      const order = ROWS.map((_, i) => i).sort(
        (a, b) => slotOf(b, glide) - slotOf(a, glide),
      );
      order.forEach((i) => {
        const r = ROWS[i];
        const y = 26 + slotOf(i, glide) * rowH + rowH / 2;
        const val = m.get(r);

        if (r[9]) {
          // native-pdf row (venice): subtle wash band
          ctx.fillStyle = P.wash;
          ctx.fillRect(2, y - rowH / 2 + 1, w - 4, rowH - 2);
        }

        ctx.textAlign = "left";
        ctx.fillStyle = P.ink;
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const logo = LOGOS[r[0]];
        if (logo) {
          const s = 12;
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(logo, xLabel, y - s / 2, s, s);
          ctx.restore();
        }
        const nameX = xLabel + (logo ? 16 : 0);
        const name =
          narrow && r[0].length > 7 ? r[0].slice(0, 6) + "\u2026" : r[0];
        ctx.fillText(name, nameX, y);
        if (narrow) {
          // ctx column is hidden: tuck a tiny context under the name
          ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = r[2] === 1e6 ? P.accent : P.mute;
          ctx.fillText(fmtCtx(r[2]), nameX, y + 9);
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        }
        ctx.fillStyle = r[1] === "bf16" ? P.accent : P.mute;
        ctx.fillText(r[1], xQuant, y);
        if (!narrow) {
          ctx.fillStyle = r[2] === 1e6 ? P.accent : r[2] < 1e5 ? P.mute : P.ink;
          ctx.fillText(fmtCtx(r[2]), xCtx, y);
        }

        // metric bar (price or uptime), grown with wall-clock easing
        if (val != null) {
          ctx.strokeStyle = P.rule;
          ctx.strokeRect(xBar, y - 5, barW, 10);
          const lo = m.min || 0;
          const frac = Math.max((val - lo) / (m.max - lo), 0) * grow;
          ctx.fillStyle = r[9] ? P.accent : P.mute;
          ctx.fillRect(xBar, y - 5, barW * frac, 10);
          // value label rides right of the bar end, but never into the
          // right-hand uptime column: near a full bar it moves inside
          // the fill, right-aligned, in paper ink for contrast.
          const label = m.fmt(val);
          const lx = xBar + barW * frac + 6;
          const lw = ctx.measureText(label).width;
          const rightW = showUp
            ? ctx.measureText(r[8].toFixed(1) + "%").width + 18
            : 18;
          if (lx + lw > w - 10 - rightW - 8) {
            ctx.textAlign = "right";
            ctx.fillStyle = P.paper;
            ctx.fillText(label, xBar + barW * frac - 5, y);
            ctx.textAlign = "left";
          } else {
            ctx.fillStyle = P.ink;
            ctx.fillText(label, lx, y);
          }
        } else {
          // no cache pricing on this endpoint: explicit muted dash, no bar frame
          ctx.fillStyle = P.mute;
          ctx.fillText("\u2014", xBar, y);
        }

        // right chrome: uptime (when not the active metric) + ◆ pdf mark
        ctx.textAlign = "right";
        if (showUp) {
          ctx.fillStyle = r[8] >= 99.5 ? P.ink : P.mute;
          ctx.fillText(r[8].toFixed(1) + "%", w - 28, y);
        }
        if (r[9]) {
          ctx.fillStyle = P.ink;
          ctx.fillText("\u25C6", w - 10, y);
        }
      });
    };

    const setMode = (i) => {
      if (i === mode) return;
      // capture current (possibly mid-glide) slots as the new starting points
      const t = ease((performance.now() - sortStart) / 450);
      rankFrom = ROWS.map((_, j) => slotOf(j, t));
      mode = i;
      rankTo = ranksFor(i);
      sortStart = animStart = performance.now();
      syncChips();
      cv.redraw && cv.redraw();
    };

    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem";
    MODES.forEach((mm, i) => {
      const b = Fig.chip(mm.label, () => setMode(i));
      chips.push(b);
      bar.appendChild(b);
    });
    el.appendChild(bar);
    syncChips();

    Fig.caption(
      el,
      "best metric at top \u00B7 wash/\u25C6 pdf = only native file host \u00B7 \u2014 = no cache-read price",
    );

    Fig.animate(cv, draw);
    Fig.onScheme(draw);
  });
})();
