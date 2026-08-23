(function () {
  Fig.register("neuron", function (el, opts) {
    const cv = Fig.canvas(el, 220);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let w1 = 1, w2 = -1, bias = 0;
    Fig.controls(el, [
      { key: "w1", label: "Weight w₁", min: -2, max: 2, step: 0.05, value: w1 },
      { key: "w2", label: "Weight w₂", min: -2, max: 2, step: 0.05, value: w2 },
      { key: "b", label: "Bias b", min: -2, max: 2, step: 0.05, value: bias },
    ], (k, v) => { if (k === "w1") w1 = v; if (k === "w2") w2 = v; if (k === "b") bias = v; draw(); });
    Fig.caption(el, "z = w₁x₁ + w₂x₂ + b · σ(z) = 1/(1+e⁻ᶻ)");
    const inputs = [[0.16, 0.30, "x₁ = 0.8"], [0.16, 0.72, "x₂ = −0.5"]];
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const nx = cv.w * 0.68, ny = cv.h * 0.5;
      const z = w1 * 0.8 + w2 * -0.5 + bias;
      const sig = 1 / (1 + Math.exp(-z));
      inputs.forEach(([fx, fy, lbl], idx) => {
        const ix = fx * cv.w, iy = fy * cv.h;
        const w = idx === 0 ? w1 : w2;
        ctx.strokeStyle = w >= 0 ? P.ink : P.accent;
        ctx.lineWidth = Math.min(6, 0.6 + Math.abs(w) * 1.4);
        ctx.setLineDash(w < 0 ? [5, 4] : []);
        ctx.beginPath(); ctx.moveTo(ix + 20, iy); ctx.lineTo(nx - 26, ny); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = P.wash;
        ctx.beginPath(); ctx.arc(ix, iy, 17, 0, 7); ctx.fill();
        ctx.strokeStyle = P.rule; ctx.stroke();
        ctx.fillStyle = P.mute; ctx.font = "11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center"; ctx.fillText(lbl.split(" ")[0], ix, iy + 4);
        ctx.fillStyle = P.ink;
        ctx.fillText(String(idx === 0 ? 0.8 : -0.5), ix, iy - 24);
        ctx.textAlign = "left";
      });
      ctx.fillStyle = sig > 0.5 ? P.accent : P.wash;
      ctx.beginPath(); ctx.arc(nx, ny, 26, 0, 7); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.fillStyle = sig > 0.5 ? "#fff" : P.ink;
      ctx.font = "12px ui-monospace, Menlo, monospace"; ctx.textAlign = "center";
      ctx.fillText(sig.toFixed(2), nx, ny + 4);
      ctx.fillStyle = P.mute;
      ctx.fillText("z = " + z.toFixed(2), cv.w * 0.62, cv.h - 14);
    };
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
