(function () {
  Fig.register("wave", function (el, opts) {
    const cv = Fig.canvas(el, 220);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let amp = 0.6, freq = 2, phase = 0, t = 0;
    Fig.controls(el, [
      { key: "amp", label: "Amplitude", min: 0, max: 1, step: 0.01, value: amp },
      { key: "freq", label: "Frequency", min: 0.5, max: 6, step: 0.05, value: freq },
      { key: "phase", label: "Phase", min: 0, max: 6.28, step: 0.02, value: phase },
    ], (k, v) => {
      if (k === "amp") amp = v;
      if (k === "freq") freq = v;
      if (k === "phase") phase = v;
    });
    Fig.caption(el, "y = A·sin(2πft + φ)");
    const yAt = (x, off) => Math.sin((x / cv.w) * freq * 6.2832 - t * 1.6 + off) * amp * (cv.h * 0.36);
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(10, cv.h / 2); ctx.lineTo(cv.w - 10, cv.h / 2); ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha = 0.45; ctx.strokeStyle = P.accent;
      ctx.beginPath();
      for (let x = 10; x <= cv.w - 10; x += 3) {
        const yy = cv.h / 2 + yAt(x, phase + Math.PI / 3);
        x === 10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.strokeStyle = P.ink;
      ctx.beginPath();
      for (let x = 10; x <= cv.w - 10; x += 3) {
        const yy = cv.h / 2 + yAt(x, phase);
        x === 10 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    };
    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => { t += 0.016; draw(); });
  });
})();
