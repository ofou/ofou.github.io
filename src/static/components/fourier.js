(function () {
  Fig.register("fourier", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let N = 5, t = 0;
    Fig.controls(el, [{ key: "N", label: "Harmonics", min: 1, max: 15, step: 1, value: N }],
      (k, v) => { N = Math.round(v); trace.length = 0; draw(); });
    Fig.caption(el, `square wave via ${N} epicycles`);
    const cx0 = cv.w * 0.3, cy = cv.h / 2;
    const trace = [];
    const radius = k => (k % 2 === 1 ? 4 : -4) / (Math.PI * k) * cv.h * 0.42;
    function chain(t) {
      let x = cx0, y = cy;
      const pts = [[x, y]];
      for (let k = 1; k <= N; k += 2) {
        const r = Math.abs(radius(k));
        x += r * Math.cos(k * t); y += r * Math.sin(k * t);
        pts.push([x, y]);
      }
      return { pts, tip: [x, y] };
    }
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const { pts, tip } = chain(t);
      ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        if (i > 0) {
          ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], Math.abs(radius(i + 1)) || 2, 0, 7);
        ctx.globalAlpha = i === 0 ? 0.9 : 0.45; ctx.stroke(); ctx.globalAlpha = 1;
      }
      trace.unshift(tip.slice());
      if (trace.length > cv.w - Math.round(cx0)) trace.pop();
      ctx.strokeStyle = P.accent; ctx.lineWidth = 2;
      ctx.beginPath();
      trace.forEach(([x, y], i) => i === 0 ? ctx.moveTo(cx0, cy) && 0 || (ctx.lineTo(cx0, cy), ctx.lineTo(x, y)) : ctx.lineTo(x, y));
      ctx.stroke();
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(tip[0], tip[1], 3, 0, 7); ctx.fill();
      void t;
    };
    Fig.onScheme(draw);
    Fig.animate(cv, function loop() { t += 0.04; draw(); requestAnimationFrame(loop); });
  });
})();
