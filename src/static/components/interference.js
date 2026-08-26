(function () {
  Fig.register("interference", function (el, opts) {
    const cv = Fig.canvas(el, 280);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const CELL = 8;
    let wl = 30,
      dist = 60,
      t = 0;
    Fig.controls(
      el,
      [
        {
          key: "wl",
          label: "Wavelength",
          min: 12,
          max: 60,
          step: 1,
          value: wl,
        },
        {
          key: "dist",
          label: "Separation",
          min: 20,
          max: 80,
          step: 1,
          value: 60,
        },
      ],
      (k, v) => {
        if (k === "wl") wl = v;
        if (k === "dist") dist = v;
      },
    );
    Fig.caption(
      el,
      "two coherent sources · constructive and destructive bands",
    );
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      ctx.fillStyle = P.ink;
      const s1 = [cv.w * (0.5 - dist / 200), cv.h * 0.5];
      const s2 = [cv.w * (0.5 + dist / 200), cv.h * 0.5];
      for (let x = 0; x < cv.w; x += CELL) {
        for (let y = 0; y < cv.h; y += CELL) {
          const cx = x + CELL / 2,
            cy = y + CELL / 2;
          const r1 = Math.hypot(cx - s1[0], cy - s1[1]);
          const r2 = Math.hypot(cx - s2[0], cy - s2[1]);
          const v =
            Math.abs(
              Math.sin((r1 / wl) * 6.2832 - t) +
                Math.sin((r2 / wl) * 6.2832 - t),
            ) / 2;
          if (v > 0.06) {
            ctx.globalAlpha = v * 0.32;
            ctx.fillRect(x, y, CELL - 1, CELL - 1);
          }
        }
      }
      ctx.globalAlpha = 1;
      for (const s of [s1, s2]) {
        ctx.fillStyle = P.accent;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 4, 0, 7);
        ctx.fill();
      }
    };
    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => {
      t += 0.05;
      draw();
    });
  });
})();
