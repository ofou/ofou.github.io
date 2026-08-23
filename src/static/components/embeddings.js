(function () {
  Fig.register("embeddings", function (el, opts) {
    const cv = Fig.canvas(el, 260);
    Fig.frame(cv);
    const ctx = cv.ctx;
    function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
    const groups = [
      ["cat", "dog", "fox", "owl"], ["apple", "pear", "plum"], ["hammer", "wrench"],
    ];
    const centers = [[0.25, 0.3], [0.72, 0.35], [0.5, 0.75]];
    let k = 2;
    const pts = [];
    groups.forEach((names, gi) => names.forEach(name => {
      const r = mulberry32(name.length * 31 + gi * 7 + name.charCodeAt(0));
      pts.push({
        name,
        x: (centers[gi][0] + (r() - 0.5) * 0.22),
        y: (centers[gi][1] + (r() - 0.5) * 0.26),
      });
    }));
    let hover = null;
    Fig.controls(el, [{ key: "k", label: "Neighbors k", min: 1, max: 5, step: 1, value: k }],
      (kk, v) => { k = Math.round(v); draw(); });
    Fig.caption(el, "hover a point · hairlines join k nearest neighbors");
    const X = p => 14 + p.x * (cv.w - 28);
    const Y = p => 14 + p.y * (cv.h - 40);
    cv.el.addEventListener("pointermove", e => {
      const r = cv.el.getBoundingClientRect();
      hover = null;
      for (const p of pts)
        if (Math.hypot(X(p) + r.left - e.clientX, Y(p) + r.top - e.clientY) < 12) hover = p;
      draw();
    });
    cv.el.addEventListener("pointerleave", () => { hover = null; draw(); });
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      for (const p of pts) {
        const near = pts.filter(q => q !== p).sort((a, b) =>
          ((a.x - p.x) ** 2 + (a.y - p.y) ** 2) - ((b.x - p.x) ** 2 + (b.y - p.y) ** 2)).slice(0, k);
        for (const q of near) {
          ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(X(p), Y(p)); ctx.lineTo(X(q), Y(q)); ctx.stroke();
        }
      }
      for (const p of pts) {
        ctx.fillStyle = P.accent;
        ctx.beginPath(); ctx.arc(X(p), Y(p), 4, 0, 7); ctx.fill();
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = hover === p ? P.ink : P.mute;
        ctx.fillText(p.name, X(p) + 7, Y(p) + 3);
      }
    };
    draw();
    Fig.onScheme(draw);
  });
})();
