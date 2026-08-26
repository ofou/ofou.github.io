/* pdf-token-grid.js — how a rendered page becomes visual tokens.
   Drag the dpi slider: the page is snapped to the 32px token grid
   (smart_resize) and the exact billed token count updates. Shows the
   16.7M px² budget ceiling (423 dpi for Letter) and one provider's
   silent 2.6M px² cap (~165 dpi effective). Math verified against
   billing on 7/8 providers (predicted + 2). */
(function () {
  Fig.register("pdf-token-grid", function (el) {
    const cv = Fig.canvas(el, 340);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const FACTOR = 32,
      MAX_PX = 16777216,
      ALI_PX = 2621440;
    const PAGE_IN = [8.5, 11]; // US Letter (aligns with bill-audit renders)
    const CEIL_DPI = 423; // last integer dpi whose /32 snap fits MAX_PX
    const ALI_PRICE = 0.425; // $ per M input tokens
    const TICKS = [
      { d: 100, lab: "100 · read" },
      { d: 165, lab: "165 · ali" },
      { d: 300, lab: "300" },
      { d: 423, lab: "423 · ceil" },
    ];
    const DMIN = 50,
      DMAX = 600,
      EASE_MS = 380;
    const DEFAULT_DPI = 300; // dashed ali box on; cliff not yet

    let target = DEFAULT_DPI;
    let anim = { from: DEFAULT_DPI, to: DEFAULT_DPI, t0: 0 };

    function smartResize(hPx, wPx, budget) {
      let hb = Math.round(hPx / FACTOR) * FACTOR,
        wb = Math.round(wPx / FACTOR) * FACTOR;
      if (hb * wb > budget) {
        const beta = Math.sqrt((hPx * wPx) / budget);
        hb = Math.floor(hPx / beta / FACTOR) * FACTOR;
        wb = Math.floor(wPx / beta / FACTOR) * FACTOR;
      }
      return [hb, wb];
    }
    const tokens = (hb, wb) => (hb / FACTOR) * (wb / FACTOR);
    const easeOut = (t) => 1 - Math.pow(1 - t, 3);
    const frac = (x) => x - Math.floor(x);

    const draw = () => {
      const P = Fig.palette();
      const w = cv.w,
        h = cv.h;
      const now = performance.now();
      ctx.clearRect(0, 0, w, h);

      // eased display dpi (wall-clock progress; snap under reduced motion)
      const p = Fig.reduced() ? 1 : Math.min(1, (now - anim.t0) / EASE_MS);
      const dpi = anim.from + (anim.to - anim.from) * easeOut(p);
      const dpiR = Math.round(dpi);

      const wPx = Math.round(PAGE_IN[0] * dpi),
        hPx = Math.round(PAGE_IN[1] * dpi);
      const [hb, wb] = smartResize(hPx, wPx, MAX_PX);
      const [ha, wa] = smartResize(hPx, wPx, ALI_PX);
      const tok = tokens(hb, wb),
        tokA = tokens(ha, wa);
      const hs = Math.round(hPx / FACTOR) * FACTOR,
        ws = Math.round(wPx / FACTOR) * FACTOR;
      const clipped = hb * wb < hs * ws;
      const aliClipped = tokA < tok;
      const lost = clipped ? 1 - (hb * wb) / (hs * ws) : 0; // pixel fraction lost

      // layout: readout beside page, or stacked underneath when narrow
      const narrow = w < 520;
      const px = 16,
        py = 28,
        axisH = 34;
      const pageH = narrow ? 148 : h - py - axisH - 12;
      const pageW = pageH * (PAGE_IN[0] / PAGE_IN[1]);

      // page mock
      ctx.fillStyle = P.wash;
      ctx.strokeStyle = clipped ? P.mute : P.accent;
      ctx.lineWidth = clipped ? 1 : 1.5;
      ctx.beginPath();
      ctx.rect(px, py, pageW, pageH);
      ctx.fill();
      ctx.stroke();

      // fake text lines — crispness degrades with the lost pixel fraction
      const nL = 15,
        mx = pageW * 0.09,
        lh = pageH / (nL + 2);
      ctx.save();
      if (lost > 0 && "filter" in ctx)
        ctx.filter = "blur(" + (lost * 2.4).toFixed(2) + "px)";
      ctx.globalAlpha = 1 - 0.55 * lost;
      ctx.fillStyle = P.ink;
      for (let i = 0; i < nL; i++) {
        const wf =
          i % 6 === 5
            ? 0.45
            : 0.6 + 0.38 * frac(Math.sin((i + 1) * 12.9898) * 43758.5453);
        ctx.fillRect(
          px + mx,
          py + lh * (i + 1.5),
          (pageW - 2 * mx) * wf,
          Math.max(1, lh * 0.32),
        );
      }
      ctx.restore();

      // token grid (cap drawn cells for perf; density is real ratio)
      const cols = wb / FACTOR,
        rows = hb / FACTOR;
      const step = Math.max(1, Math.ceil(cols / 60));
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 0.5;
      for (let c = step; c < cols; c += step) {
        const x = px + (c / cols) * pageW;
        ctx.beginPath();
        ctx.moveTo(x, py);
        ctx.lineTo(x, py + pageH);
        ctx.stroke();
      }
      for (let r = step; r < rows; r += step) {
        const y = py + (r / rows) * pageH;
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px + pageW, y);
        ctx.stroke();
      }

      // alibaba cap overlay: gently pulsing dashed region of surviving detail
      if (aliClipped) {
        const fr = Math.sqrt(tokA / tok);
        const pulse = Fig.reduced() ? 0.5 : 0.5 + 0.5 * Math.sin(now / 480);
        const bx = px + (pageW * (1 - fr)) / 2,
          by = py + (pageH * (1 - fr)) / 2;
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.5 * pulse;
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.lineDashOffset = Fig.reduced() ? 0 : -now / 90;
        ctx.strokeRect(bx, by, pageW * fr, pageH * fr);
        ctx.setLineDash([]);
        ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = P.accent;
        ctx.fillText("what alibaba keeps", bx + (pageW * fr) / 2, by + 3);
        ctx.restore();
      }

      // readout: tokens + $ from the same count (tok); alibaba line when capped
      const cost13 = ((tok * 13) / 1e6) * ALI_PRICE;
      const costA13 = ((tokA * 13) / 1e6) * ALI_PRICE;
      const rx = narrow ? px : px + pageW + 22;
      const lhR = narrow ? 15 : 18;
      let y = narrow ? py + pageH + 10 : py;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      const line = (txt, c) => {
        ctx.fillStyle = c || P.ink;
        ctx.fillText(txt, rx, y);
        y += lhR;
      };
      line("render   " + wPx + "\u00D7" + hPx + " px", P.mute);
      line(
        "snapped  " +
          wb +
          "\u00D7" +
          hb +
          " px" +
          (clipped ? "  \u2193 downscaled" : ""),
        clipped ? P.mute : P.ink,
      );
      line("1 token = 32\u00D732 px", P.mute);
      y += 3;
      line(tok.toLocaleString() + " tokens/page", P.accent);
      line("\u00D713 pages = " + (tok * 13).toLocaleString(), P.ink);
      line("\u2248 $" + cost13.toFixed(4) + " @ $0.425/M", P.ink);
      if (aliClipped) {
        line(
          "alibaba would bill " +
            tokA.toLocaleString() +
            " \u2192 $" +
            costA13.toFixed(4),
          P.mute,
        );
      }
      y += 3;
      line(
        dpi > CEIL_DPI
          ? "over 16.7M px\u00B2 budget \u2192 resized"
          : "fits budget (ceiling: " + CEIL_DPI + " dpi)",
        P.mute,
      );
      if (!aliClipped) line("alibaba cap: not hit yet", P.mute);

      ctx.fillStyle = P.ink;
      ctx.fillText(
        "Letter @ " + dpiR + " dpi \u2192 smart_resize \u2192 tokens",
        px,
        8,
      );

      // dpi axis with notable tick marks
      const ax0 = px,
        ax1 = w - 16,
        ay = h - 20;
      const dx = (d) => ax0 + ((d - DMIN) / (DMAX - DMIN)) * (ax1 - ax0);
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ax0, ay);
      ctx.lineTo(ax1, ay);
      ctx.stroke();
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "top";
      for (let i = 0; i < TICKS.length; i++) {
        const t = TICKS[i];
        const x = dx(t.d);
        ctx.strokeStyle = P.mute;
        ctx.beginPath();
        ctx.moveTo(x, ay - 4);
        ctx.lineTo(x, ay + 4);
        ctx.stroke();
        ctx.fillStyle = P.mute;
        ctx.textAlign =
          i === 0 ? "left" : i === TICKS.length - 1 ? "right" : "center";
        ctx.fillText(t.lab, x, ay + 7);
      }
      ctx.fillStyle = P.accent; // current (eased) dpi marker
      ctx.beginPath();
      ctx.arc(dx(Math.max(DMIN, Math.min(DMAX, dpi))), ay, 3, 0, Math.PI * 2);
      ctx.fill();
    };

    Fig.controls(
      el,
      [
        {
          key: "dpi",
          label: "dpi",
          min: DMIN,
          max: DMAX,
          step: 1,
          value: target,
        },
      ],
      (k, v) => {
        // re-target the ease from the currently displayed value
        const p = Fig.reduced()
          ? 1
          : Math.min(1, (performance.now() - anim.t0) / EASE_MS);
        const cur = anim.from + (anim.to - anim.from) * easeOut(p);
        target = v;
        anim = { from: cur, to: v, t0: performance.now() };
        cv.redraw && cv.redraw();
      },
    );

    Fig.caption(
      el,
      "solid = fits budget \u00B7 dashed = alibaba keeps \u00B7 blur = over-budget",
    );

    Fig.animate(cv, draw); // managed loop: pauses offscreen, honors reduced motion
    Fig.onScheme(() => cv.redraw && cv.redraw());
  });
})();
