(function () {
  Fig.register("learning-curves", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const LRS = [0.06, 0.15, 0.35];
    let noise = 0.08;
    Fig.controls(el, [{ key: "noise", label: "Noise", min: 0, max: 0.3, step: 0.01, value: noise }],
      (k, v) => { noise = v; curves(); draw(); });
    Fig.caption(el, "simulated loss for three learning rates");
    function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    let series = [];
    function curves() {
      const rnd = mulberry32(1234);
      series = LRS.map(lr => {
        const pts = [];
        for (let s = 0; s <= 500; s += 5) {
          const base = Math.exp(-s / (60 + lr * 400)) * 2.2 + 0.25 + lr;
          pts.push([s / 500, base + (rnd() - 0.5) * noise]);
        }
        return pts;
      });
    }
    const colors = () => { const P = Fig.palette(); return [P.ink, P.accent, P.mute]; };
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const cs = colors();
      series.forEach((pts, i) => {
        ctx.strokeStyle = cs[i]; ctx.lineWidth = i === 1 ? 2 : 1.2;
        ctx.beginPath();
        pts.forEach(([u, v], j) => {
          const x = 12 + u * (cv.w - 24), y = 14 + (1 - Math.min(v / 2.6, 1)) * (cv.h - 28);
          j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
      });
      ctx.font = "10px ui-monospace, Menlo, monospace";
      LRS.forEach((lr, i) => {
        ctx.fillStyle = cs[i];
        ctx.fillText("LR " + lr.toFixed(2), cv.w - 74, 18 + i * 13);
      });
    };
    curves();
    cv.redraw = draw;
    Fig.onScheme(draw);
    draw();
  });
})();
