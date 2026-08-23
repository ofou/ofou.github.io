(function () {
  Fig.register("fourier", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let N = 5, t = 0;
    const cap = Fig.caption(el, "");
    const trace = [];
    const radius = k => (k % 2 === 1 ? 4 : -4) / (Math.PI * k) * cv.h * 0.42;
    function chain(tt) {
      let x = cv.w * 0.3, y = cv.h / 2;
      const pts = [[x, y]];
      for (let k = 1; k <= N; k += 2) {
        const r = Math.abs(radius(k));
        x += r * Math.cos(k * tt); y += r * Math.sin(k * tt);
        pts.push([x, y]);
      }
      return { pts, tip: [x, y] };
    }
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const { pts, tip } = chain(t);
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
      for (let i = 1; i < pts.length; i++) {
        ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
        ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], Math.abs(radius(i * 2 - 1)), 0, 7);
        ctx.globalAlpha = 0.4; ctx.stroke(); ctx.globalAlpha = 1;
      }
      trace.unshift(tip.slice());
      const maxTrace = Math.round(cv.w - cv.w * 0.3);
      if (trace.length > maxTrace) trace.pop();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
      ctx.stroke();
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(tip[0], tip[1], 3, 0, 7); ctx.fill();
      cap.textContent = `square wave via ${N} epicycles`;
    };
    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => { t += 0.04; draw(); });
  });
})();
