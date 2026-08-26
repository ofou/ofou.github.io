(function () {
  Fig.register("random-walk", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let steps = 400,
      seedBase = 1;
    function mulberry32(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    Fig.controls(
      el,
      [
        {
          key: "steps",
          label: "Steps",
          min: 50,
          max: 2000,
          step: 25,
          value: steps,
        },
      ],
      (k, v) => {
        steps = Math.round(v);
        walks();
        draw();
      },
    );
    const reseedBtn = document.createElement("button");
    reseedBtn.className = "chip";
    reseedBtn.textContent = "↺ Reseed";
    reseedBtn.style.cursor = "pointer";
    reseedBtn.addEventListener("click", () => {
      seedBase = (seedBase * 7 + 3) % 100000;
      walks();
      draw();
    });
    el.appendChild(reseedBtn);
    let paths = [],
      pathW = cv.w;
    function walks() {
      paths = [];
      for (let n = 0; n < 8; n++) {
        const rnd = mulberry32(seedBase * 97 + n);
        const pts = [[cv.w / 2, cv.h / 2]];
        let x = cv.w / 2,
          y = cv.h / 2;
        for (let s = 0; s < steps; s++) {
          x += (rnd() - 0.5) * 6;
          y += (rnd() - 0.5) * 6;
          x = Math.max(6, Math.min(cv.w - 6, x));
          y = Math.max(6, Math.min(cv.h - 6, y));
          pts.push([x, y]);
        }
        paths.push(pts);
      }
      pathW = cv.w;
    }
    const draw = () => {
      const P = Fig.palette();
      if (cv.w !== pathW) {
        walks();
      }
      ctx.clearRect(0, 0, cv.w, cv.h);
      paths.forEach((pts, i) => {
        ctx.strokeStyle = i === 0 ? P.accent : P.ink;
        ctx.globalAlpha = i === 0 ? 0.95 : 0.28;
        ctx.lineWidth = i === 0 ? 1.5 : 1;
        ctx.beginPath();
        pts.forEach(([x, y], j) =>
          j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
        );
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    };
    walks();
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
