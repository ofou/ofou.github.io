/* pdf-bill-audit.js — predicted vs billed visual tokens per provider.
   The Finding-4/5 audit as a figure: pick an image size, bars MORPH from
   their previous length to the new billed prompt-token delta; the hollow
   marker is the smart_resize prediction (+2 tokens). 7/8 match exactly;
   alibaba's silent cap shows as the short bar. Audit data: 2026-08-24. */
(function () {
  Fig.register("pdf-bill-audit", function (el) {
    const cv = Fig.canvas(el, 300);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const PROVIDERS = [
      "chutes",
      "coreweave",
      "akashml",
      "alibaba",
      "reka",
      "venice",
      "parasail",
      "io-net",
    ];
    // billed deltas per size (measured); prediction = smart_resize tokens + 2
    // chip = control label; label = WxH shown on canvas
    const SIZES = [
      {
        chip: "50 dpi",
        label: "425\u00D7550",
        pred: 223,
        billed: [223, 223, 223, 223, 223, 223, 223, 223],
      },
      {
        chip: "100 dpi",
        label: "850\u00D71100",
        pred: 920,
        billed: [920, 920, 920, 920, 920, 920, 920, 920],
      },
      {
        chip: "423 \u00B7 ceiling",
        label: "3596\u00D74653",
        pred: 16242,
        billed: [16242, 16242, 16242, 2510, 16242, 16242, 16242, 16242],
      },
      {
        chip: "600 \u00B7 still capped",
        label: "5100\u00D76600",
        pred: 16242,
        billed: [16242, 16242, 16242, 2510, 16242, 16242, 16242, 16242],
      },
    ];
    let size = 2,
      animStart = performance.now(); // default 423 dpi

    // provider logos (favicons under /static/images/providers/<slug>.png)
    const LOGOS = {};
    PROVIDERS.forEach((p) => {
      const img = new Image();
      img.onload = () => {
        LOGOS[p] = img;
        cv.redraw && cv.redraw();
      };
      img.src = "/static/images/providers/" + p + ".png";
    });

    // eased-from state: bar fractions of full track, values, prediction frac.
    const targetFrac = (i) =>
      SIZES[size].billed[i] /
      (Math.max(SIZES[size].pred, ...SIZES[size].billed) * 1.12);
    let from = {
      frac: PROVIDERS.map((_, i) => targetFrac(i)),
      val: SIZES[size].billed.slice(),
      pred:
        SIZES[size].pred /
        (Math.max(SIZES[size].pred, ...SIZES[size].billed) * 1.12),
    };
    let last = {
      frac: from.frac.slice(),
      val: from.val.slice(),
      pred: from.pred,
    };

    const draw = () => {
      const P = Fig.palette();
      const t = Math.min((performance.now() - animStart) / 700, 1);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic, wall-clock
      const w = cv.w,
        h = cv.h;
      const narrow = w < 520;
      ctx.clearRect(0, 0, w, h);

      const s = SIZES[size];
      const maxV = Math.max(s.pred, ...s.billed) * 1.12;
      const rowH = (h - 36) / PROVIDERS.length;
      const numW = narrow ? 58 : 86;
      const x0 = narrow ? 64 : 96,
        x1 = w - numW;
      const nMatch = s.billed.filter((b) => b === s.pred).length;
      const diverging = nMatch < PROVIDERS.length;
      const status = diverging
        ? nMatch + "/8 match \u00B7 alibaba capped"
        : nMatch + "/8 match";

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = P.ink;
      let head =
        "image " +
        s.label +
        (narrow
          ? "  \u00B7  " + status
          : "  \u00B7  predicted " +
            s.pred.toLocaleString() +
            " tok (smart_resize + 2)  \u00B7  " +
            status);
      while (ctx.measureText(head).width > w - 20 && head.length > 8)
        head = head.slice(0, -1);
      ctx.fillText(head, 10, 13);

      const predX =
        x0 + (x1 - x0) * (from.pred + (s.pred / maxV - from.pred) * e);
      last.pred = (predX - x0) / (x1 - x0);

      PROVIDERS.forEach((prov, i) => {
        const y = 30 + i * rowH + rowH / 2;
        const billed = s.billed[i];
        const match = billed === s.pred;

        ctx.textAlign = "left";
        ctx.fillStyle = P.ink;
        const logo = LOGOS[prov];
        if (logo) {
          ctx.save();
          ctx.globalAlpha = 0.92;
          ctx.drawImage(logo, 8, y - 6, 12, 12);
          ctx.restore();
        }
        const nameX = 8 + (logo ? 16 : 0);
        let name = prov;
        while (ctx.measureText(name).width > x0 - nameX - 6 && name.length > 3)
          name = name.slice(0, -1);
        if (name !== prov) name = name.slice(0, -1) + "\u2026";
        ctx.fillText(name, nameX, y);

        // billed bar: morph from previous length (never restarts at zero)
        const frac = from.frac[i] + (billed / maxV - from.frac[i]) * e;
        last.frac[i] = frac;
        const bw = (x1 - x0) * frac;
        ctx.fillStyle = match ? P.accent : P.mute;
        ctx.fillRect(x0, y - 5, bw, 10);

        // prediction marker (hollow tick), labelled on the first row
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(predX, y - 8);
        ctx.lineTo(predX, y + 8);
        ctx.stroke();
        if (i === 0) {
          ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
          const tw = ctx.measureText("prediction").width;
          const bx = Math.min(Math.max(predX - tw / 2 - 4, x0), x1 - tw - 8);
          ctx.fillStyle = P.wash;
          ctx.fillRect(bx, y - 20, tw + 8, 13);
          ctx.strokeStyle = P.rule;
          ctx.strokeRect(bx, y - 20, tw + 8, 13);
          ctx.fillStyle = P.ink;
          ctx.fillText("prediction", bx + 4, y - 13.5);
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        }

        // numeric label: rolls from previous value toward the target
        const shown = Math.round(from.val[i] + (billed - from.val[i]) * e);
        last.val[i] = shown;
        ctx.fillStyle = match ? P.ink : P.mute;
        ctx.textAlign = "right";
        const num = shown.toLocaleString() + (match ? " \u2713" : " \u2717");
        ctx.fillText(num, w - 8, y);
        ctx.textAlign = "left";

        if (!match) {
          ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
          ctx.fillStyle = P.mute;
          const call = narrow ? "\u2190 ~165 dpi" : "\u2190 silently downscaled to ~165 dpi";
          const cx = x0 + bw + 8;
          if (ctx.measureText(call).width + cx < x1 - 4)
            ctx.fillText(call, cx, y);
          ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        }
      });
    };

    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem";
    const chips = SIZES.map((s, i) => {
      const c = Fig.chip(s.chip, () => {
        if (i === size) return;
        from = {
          frac: last.frac.slice(),
          val: last.val.slice(),
          pred: last.pred,
        };
        size = i;
        animStart = performance.now();
        syncChips();
        cv.redraw && cv.redraw();
      });
      c.style.whiteSpace = "nowrap";
      bar.appendChild(c);
      return c;
    });
    el.appendChild(bar);

    function syncChips() {
      chips.forEach((c, i) => {
        const on = i === size;
        c.style.opacity = on ? "1" : ".45";
        c.style.borderColor = on ? "var(--accent)" : "var(--rule)";
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    syncChips();

    Fig.caption(
      el,
      "tick = prediction \u00B7 bar = billed \u00B7 \u2713 match",
    );

    Fig.animate(cv, draw);
    Fig.onScheme(draw);
    el.style.minHeight = "0";
  });
})();
