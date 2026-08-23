(function () {
  Fig.register("normal-curve", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let mu = 0, sigma = 1;
    Fig.controls(el, [
      { key: "mu", label: "μ", min: -3, max: 3, step: 0.05, value: mu },
      { key: "sigma", label: "σ", min: 0.4, max: 2, step: 0.05, value: sigma },
    ], (k, v) => { if (k === "mu") mu = v; if (k === "sigma") sigma = v; draw(); });
    Fig.caption(el, "±1σ holds 68% · ±2σ holds 95%");
    const X = x => cv.w / 2 + x * (cv.w / 8);
    const dens = x => Math.exp(-((x - mu) ** 2) / (2 * sigma ** 2)) / (sigma * Math.sqrt(6.2832));
    const Y = d => cv.h - 18 - d * (sigma * Math.sqrt(6.2832)) * (cv.h - 40);
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      ctx.fillStyle = P.wash;
      ctx.beginPath();
      ctx.moveTo(X(mu - sigma), cv.h - 14);
      for (let px = X(mu - sigma); px <= X(mu + sigma); px += 2) {
        const wx = (px - cv.w / 2) / (cv.w / 8);
        ctx.lineTo(px, Y(dens(wx)));
      }
      ctx.lineTo(X(mu + sigma), cv.h - 14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = P.rule;
      [mu - 2 * sigma, mu - sigma, mu, mu + sigma, mu + 2 * sigma].forEach(t => {
        ctx.beginPath(); ctx.moveTo(X(t), cv.h - 14); ctx.lineTo(X(t), 16); ctx.stroke();
      });
      ctx.fillStyle = P.mute; ctx.font = "10px ui-monospace, Menlo, monospace"; ctx.textAlign = "center";
      [[mu, "μ"], [mu - sigma, "−1σ"], [mu + sigma, "+1σ"]].forEach(([t, l]) => ctx.fillText(l, X(t), cv.h - 2));
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px <= cv.w; px += 2) {
        const wx = (px - cv.w / 2) / (cv.w / 8);
        px === 0 ? ctx.moveTo(px, Y(dens(wx))) : ctx.lineTo(px, Y(dens(wx)));
      }
      ctx.stroke();
      ctx.textAlign = "left";
    };
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
