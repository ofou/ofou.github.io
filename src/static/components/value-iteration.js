(function () {
  const N = 5, GOAL = { x: 4, y: 4 };
  const STEP_COST = -0.02, GAMMA = 0.9, MAX_SWEEPS = 30;
  // action order: up, right, down, left
  const ACTIONS = [
    { dx: 0, dy: -1, ch: "\u2191" },
    { dx: 1, dy: 0, ch: "\u2192" },
    { dx: 0, dy: 1, ch: "\u2193" },
    { dx: -1, dy: 0, ch: "\u2190" },
  ];

  Fig.register("value-iteration", function (el, opts) {
    const cv = Fig.canvas(el, 300);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let sweeps = 1;

    /* ---- deterministic value iteration ---- */
    // deterministic uniform transitions: one successor per action, walls bounce in place
    function iterate(n) {
      let V = new Float64Array(N * N);
      V[GOAL.y * N + GOAL.x] = 1;
      for (let t = 0; t < n; t++) {
        const NV = new Float64Array(N * N);
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            if (x === GOAL.x && y === GOAL.y) { NV[y * N + x] = 1; continue; }
            let best = -Infinity;
            for (const a of ACTIONS) {
              const nx = Math.min(N - 1, Math.max(0, x + a.dx));
              const ny = Math.min(N - 1, Math.max(0, y + a.dy));
              const q = STEP_COST + GAMMA * V[ny * N + nx];
              if (q > best) best = q;
            }
            NV[y * N + x] = best;
          }
        }
        V = NV;
      }
      return V;
    }

    function argmax(V, x, y) {
      let best = -Infinity, bi = 0;
      for (let i = 0; i < ACTIONS.length; i++) {
        const a = ACTIONS[i];
        const nx = Math.min(N - 1, Math.max(0, x + a.dx));
        const ny = Math.min(N - 1, Math.max(0, y + a.dy));
        const q = STEP_COST + GAMMA * V[ny * N + nx];
        if (q > best) { best = q; bi = i; }
      }
      return bi;
    }

    /* ---- colour helpers (wash -> accent mix, no CSS vars inside canvas) ---- */
    const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const lum = rgb => (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
    const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

    /* ---- controls: chips −/+ plus synced slider ---- */
    const setSweeps = v => {
      v = Math.min(MAX_SWEEPS, Math.max(1, Math.round(v)));
      if (v === sweeps) return;
      sweeps = v;
      if (handles.swp) handles.swp.set(v);
      draw();
    };

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    btnRow.appendChild(Fig.chip("\u2212", () => setSweeps(sweeps - 1)));
    btnRow.appendChild(Fig.chip("+", () => setSweeps(sweeps + 1)));
    el.appendChild(btnRow);

    const handles = Fig.controls(el,
      [{ key: "swp", label: "Sweeps", min: 1, max: MAX_SWEEPS, step: 1, value: sweeps }],
      (k, v) => setSweeps(v));

    Fig.caption(el, "bellman backup sweep \u00b7 \u03b3=0.9 \u00b7 step cost \u22120.02 \u00b7 goal (4,4)=+1");

    /* ---- static draw ---- */
    const draw = () => {
      const P = Fig.palette();
      const wash = hex(P.wash), accent = hex(P.accent);
      const V = iterate(sweeps);
      ctx.clearRect(0, 0, cv.w, cv.h);

      const pad = 8, gap = 2;
      const cell = Math.floor(Math.min((cv.w - 2 * pad - (N - 1) * gap) / N,
                                       (cv.h - 2 * pad - (N - 1) * gap) / N));
      const ox = (cv.w - (N * cell + (N - 1) * gap)) / 2;
      const oy = (cv.h - (N * cell + (N - 1) * gap)) / 2;

      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const px = ox + x * (cell + gap), py = oy + y * (cell + gap);
          const isGoal = x === GOAL.x && y === GOAL.y;
          const v = V[y * N + x];
          // normalise: worst reachable value ~ -0.2 asymptote, best = 1
          const t = Math.min(1, Math.max(0, (v + 0.2) / 1.2));
          const rgb = mix(wash, accent, isGoal ? 1 : t);
          ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
          ctx.fillRect(px, py, cell, cell);

          const txtCol = lum(rgb) > 0.55 ? P.ink : P.paper;
          ctx.fillStyle = txtCol;
          ctx.font = `${Math.round(cell * 0.22)}px ui-monospace, Menlo, monospace`;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(v.toFixed(2), px + cell / 2, py + cell * 0.68);

          if (!isGoal) {
            const ai = argmax(V, x, y);
            ctx.font = `${Math.round(cell * 0.26)}px ui-monospace, Menlo, monospace`;
            ctx.fillText(ACTIONS[ai].ch, px + cell / 2, py + cell * 0.32);
          } else {
            ctx.font = `${Math.round(cell * 0.26)}px ui-monospace, Menlo, monospace`;
            ctx.fillText("\u25c9", px + cell / 2, py + cell * 0.32);
          }
        }
      }

      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.mute;
      ctx.fillText("V after " + sweeps + " sweep" + (sweeps === 1 ? "" : "es"), pad + 2, oy - 2 > 12 ? oy - 6 : cv.h - 4);
    };

    cv.redraw = draw;
    Fig.onScheme(draw);
    draw();
  });
})();
