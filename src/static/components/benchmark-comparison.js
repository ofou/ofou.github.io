(function () {
  Fig.register("benchmark-comparison", function (el, opts) {
    const cv = Fig.canvas(el, 300);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const BENCHMARKS = [
      { label: "Terminal-Bench-Science 0.1", short: "TB-Science" },
      { label: "Terminal-Bench 4.0", short: "TB 4.0" },
      { label: "Humanity's Last Exam", short: "HLE" },
      { label: "CursorBench 3.2.0", short: "CursorBench" },
      { label: "OSWorld 2.0 (partial)", short: "OSWorld" },
      { label: "AutomationBench", short: "AutoBench" },
    ];

    const MODELS = [
      { name: "Fable 5.1", scores: [52.6, 55.8, 60.9, 73.4, 77.9, 31.4] },
      { name: "Fable 5",   scores: [24.7, 42.0, 57.8, 70.5, 72.9, 17.1] },
      { name: "Opus 5",    scores: [29.0, 52.3, 56.6, 70.0, 75.4, 26.9] },
    ];

    let selected = 0;

    // chip row
    if (!Fig.isPreview(el)) {
      const chipRow = document.createElement("div");
      chipRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px";
      BENCHMARKS.forEach((b, i) => {
        const chip = Fig.chip(b.short, () => {
          selected = i;
          updateChips();
          draw();
        });
        chip.dataset.idx = i;
        chipRow.appendChild(chip);
      });
      el.appendChild(chipRow);

      function updateChips() {
        chipRow.querySelectorAll(".chip").forEach((c, i) => {
          c.style.opacity = i === selected ? "1" : "0.45";
          c.style.fontWeight = i === selected ? "600" : "400";
        });
      }
      updateChips();
    }

    Fig.caption(
      el,
      "Fable 5.1 · Fable 5 · Opus 5 — benchmark accuracy (Anthropic, Sep 2026)",
    );

    function draw() {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);

      const bench = BENCHMARKS[selected];
      const scores = MODELS.map((m) => m.scores[selected]);
      const maxScore = Math.max(...scores) * 1.2;

      const PAD_L = 8, PAD_R = 8, PAD_T = 32, PAD_B = 44;
      const n = MODELS.length;
      const slotW = Math.floor((cv.w - PAD_L - PAD_R) / n);
      const barW = Math.floor(slotW * 0.55);
      const barArea = cv.h - PAD_T - PAD_B;
      const COLORS = [P.accent, P.mute, P.ink + "99"];

      // title
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.ink;
      ctx.textAlign = "center";
      ctx.fillText(bench.label, cv.w / 2, 18);

      MODELS.forEach((m, i) => {
        const barH = (scores[i] / maxScore) * barArea;
        const slotX = PAD_L + i * slotW;
        const x = slotX + (slotW - barW) / 2;
        const y = PAD_T + barArea - barH;

        ctx.fillStyle = COLORS[i];
        if (i === 0) {
          ctx.shadowColor = P.accent;
          ctx.shadowBlur = 8;
        }
        ctx.fillRect(x, y, barW, barH);
        ctx.shadowBlur = 0;

        // score above bar
        ctx.font = "bold 11px ui-monospace, Menlo, monospace";
        ctx.fillStyle = i === 0 ? P.accent : P.ink;
        ctx.textAlign = "center";
        ctx.fillText(scores[i].toFixed(1) + "%", slotX + slotW / 2, y - 5);

        // model name below bar
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = i === 0 ? P.accent : P.mute;
        ctx.fillText(m.name, slotX + slotW / 2, cv.h - PAD_B + 15);
      });

      // delta line
      const delta = scores[0] - scores[1];
      const sign = delta >= 0 ? "+" : "";
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = delta >= 0 ? P.accent : P.mute;
      ctx.textAlign = "right";
      ctx.fillText(sign + delta.toFixed(1) + "pp vs Fable 5", cv.w - PAD_R, cv.h - 4);

      // axis
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_L, PAD_T + barArea);
      ctx.lineTo(cv.w - PAD_R, PAD_T + barArea);
      ctx.stroke();
    }

    cv.redraw = draw;
    Fig.onScheme(draw);
    draw();
  });
})();
