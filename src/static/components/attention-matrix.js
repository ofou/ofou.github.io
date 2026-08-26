(function () {
  Fig.register("attention-matrix", function (el, opts) {
    const cv = Fig.canvas(el, 260);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const toks = ["the", "cat", "sat", "on", "mat"];
    let T = 1,
      hover = null;
    Fig.controls(
      el,
      [
        {
          key: "T",
          label: "Temperature",
          min: 0.1,
          max: 2,
          step: 0.05,
          value: T,
        },
      ],
      (k, v) => {
        T = v;
        draw();
      },
    );
    Fig.caption(el, "hover a cell · softmax(q·k / T)");
    function weights() {
      const seedVec = (w) => {
        let h = 2166136261;
        for (const ch of w) {
          h ^= ch.charCodeAt(0);
          h = Math.imul(h, 16777619);
        }
        return [(h % 97) / 97, ((h >> 5) % 89) / 89];
      };
      const q = toks.map(seedVec),
        k = toks.map((t) => seedVec(t.split("").reverse().join("")));
      return q.map((qv) => {
        const raw = k.map((kv) => qv[0] * kv[0] + qv[1] * kv[1]);
        const m = Math.max(...raw.map((v) => v / T));
        const e = raw.map((v) => Math.exp(v / T - m));
        const s = e.reduce((a, b) => a + b, 0);
        return e.map((v) => v / s);
      });
    }
    let grid = weights();
    const geom = () => {
      const pad = 44;
      const cell = Math.min(
        (cv.w - pad - 12) / toks.length,
        (cv.h - pad - 16) / toks.length,
      );
      return { pad, cell };
    };
    const readout = document.createElement("p");
    readout.className = "meta";
    readout.style.margin = "0.4rem 0 0";
    readout.textContent = "hover a cell";
    const draw = () => {
      grid = weights();
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const { pad, cell } = geom();
      ctx.font = "10px ui-monospace, Menlo, monospace";
      toks.forEach((t, j) => {
        ctx.fillStyle = P.mute;
        ctx.textAlign = "center";
        ctx.fillText(t.slice(0, 3), pad + j * cell + cell / 2, 14);
      });
      toks.forEach((t, i) => {
        ctx.fillStyle = P.mute;
        ctx.textAlign = "right";
        ctx.fillText(t.slice(0, 3), pad - 6, pad + i * cell + cell / 2 + 3);
      });
      grid.forEach((row, i) =>
        row.forEach((w, j) => {
          const x = pad + j * cell,
            y = pad + i * cell;
          ctx.fillStyle = P.accent;
          ctx.globalAlpha = Math.min(1, w * (2 + 2 / T));
          ctx.fillRect(x + 2, y + 2, cell - 4, cell - 4);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = P.rule;
          ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4);
          ctx.fillStyle = P.dark ? "#fff" : "#000";
          ctx.font = "10px ui-monospace, Menlo, monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            w >= 0.995 ? "1.0" : w.toFixed(2).slice(1),
            x + cell / 2,
            y + cell / 2 + 3,
          );
        }),
      );
    };
    cv.el.addEventListener("pointermove", (e) => {
      const r = cv.el.getBoundingClientRect();
      const { pad, cell } = geom();
      const j = Math.floor((e.clientX - r.left - pad) / cell);
      const i = Math.floor((e.clientY - r.top - pad) / cell);
      hover =
        i >= 0 && j >= 0 && i < 5 && j < 5 && grid[i]
          ? [grid[i][j], i, j]
          : null;
      readout.textContent = hover
        ? `${toks[hover[1]]} → ${toks[hover[2]]} : ${hover[0].toFixed(3)}`
        : "hover a cell";
      draw();
    });
    el.appendChild(readout);
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
