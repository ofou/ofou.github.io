(function () {
  Fig.register("entropy", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let p = 0.5;
    const H = q => { if (q <= 0 || q >= 1) return 0; return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q)); };
    Fig.controls(el, [{ key: "p", label: "p", min: 0.01, max: 0.99, step: 0.01, value: p }],
      (k, v) => { p = v; draw(); });
    Fig.caption(el, "H(p) = −p·log₂p − (1−p)·log₂(1−p)");
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const bars = [p, 1 - p], bw = 46;
      bars.forEach((q, i) => {
        const h = q * (cv.h - 70);
        ctx.fillStyle = i === 0 ? P.ink : P.accent;
        ctx.fillRect(30 + i * (bw + 18), cv.h - 24 - h, bw, h);
        ctx.fillStyle = P.mute; ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.textAlign = "center";
        ctx.fillText(q.toFixed(2), 30 + i * (bw + 18) + bw / 2, cv.h - 8);
      });
      ctx.textAlign = "left";
      const curveX = 190, curveW = cv.w - curveX - 20, curveH = cv.h - 60;
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
      ctx.strokeRect(curveX, 24, curveW, curveH);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= curveW; x += 2) {
        const q = x / curveW;
        const yy = 24 + curveH - H(q) / 1 * curveH;
        x === 0 ? ctx.moveTo(curveX + x, yy) : ctx.lineTo(curveX + x, yy);
      }
      ctx.stroke();
      const dotX = curveX + p * curveW, dotY = 24 + curveH - H(p) * curveH;
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(dotX, dotY, 4.5, 0, 7); ctx.fill();
      ctx.font = "12px ui-monospace, Menlo, monospace"; ctx.fillStyle = P.ink;
      ctx.fillText("H = " + H(p).toFixed(3) + " bits", Math.min(dotX + 8, cv.w - 92), dotY - 8);
    };
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
