(function () {
  Fig.register("matrix-product", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const A = [
      [2, 0, 1],
      [1, 3, 0],
    ];
    const B = [
      [1, 2],
      [0, 1],
      [3, 1],
    ];
    const C = A.map((row) =>
      B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)),
    );
    let step = 0,
      paused = false;
    Fig.caption(el, "click to pause/resume · C[i][j] = Σ A[i][k]·B[k][j]");
    cv.el.addEventListener("pointerdown", () => {
      paused = !paused;
    });
    const tint = (a) => {
      const n = parseInt(P().accent.slice(1), 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    };
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const order = [];
      for (let i = 0; i < 2; i++)
        for (let j = 0; j < 2; j++)
          for (let k = 0; k < 3; k++) order.push([i, j, k]);
      const [hi, hj, hk] = [
        order[step % order.length][0],
        order[step % order.length][1],
        order[step % order.length][2],
      ];
      const cell = 34,
        gx = 24,
        gy = 30;
      function grid(x, y, rows, cols, mark) {
        for (let i = 0; i < rows; i++)
          for (let j = 0; j < cols; j++) {
            ctx.fillStyle = P.wash;
            if (mark === "row" && i === hi) ctx.fillStyle = tint(0.25);
            if (mark === "col" && j === hk) ctx.fillStyle = tint(0.25);
            if (mark === "out" && i === hi && j === hj)
              ctx.fillStyle = P.accent;
            ctx.fillRect(x + j * cell, y + i * cell, cell - 2, cell - 2);
            ctx.strokeStyle = P.rule;
            ctx.strokeRect(x + j * cell, y + i * cell, cell - 2, cell - 2);
          }
      }
      function numbers(x, y, m, color) {
        ctx.fillStyle = color || P.ink;
        ctx.font = "11px ui-monospace, Menlo, monospace";
        ctx.textAlign = "center";
        m.forEach((row, i) =>
          row.forEach((v, j) =>
            ctx.fillText(
              String(v),
              x + j * cell + cell / 2 - 2,
              y + i * cell + cell / 2 + 4,
            ),
          ),
        );
        ctx.textAlign = "left";
      }
      grid(gx, gy, 2, 3, "row");
      numbers(gx + 4, gy + 4, A);
      grid(gx + 3 * cell + 26, gy, 3, 2, "col");
      numbers(gx + 3 * cell + 30, gy + 4, B);
      ctx.font = "18px ui-monospace, Menlo, monospace";
      ctx.fillText("=", gx + 3 * cell + 8, gy + 42);
      grid(gx + 3 * cell + 26 + 2 * cell + 26, gy, 2, 2, "out");
      numbers(gx + 3 * cell + 26 + 2 * cell + 30, gy + 4, C, P.accent);
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.mute;
      ctx.fillText(
        `C[${hi}][${hj}] += A[${hi}][${hk}]·B[${hk}][${hj}]`,
        gx,
        gy + 2 * cell + 22,
      );
    };
    let lastT = performance.now();
    Fig.animate(cv, () => {
      const now = performance.now();
      if (!paused && now - lastT >= 600) {
        lastT = now;
        step++;
      }
      draw();
    });
    draw();
    Fig.onScheme(draw);
  });
})();
