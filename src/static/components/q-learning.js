(function () {
  Fig.register("q-learning", function (el, opts) {
    /* --- layout: canvas left, mono Q-table panel right --- */
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:1rem;align-items:stretch;flex-wrap:wrap";
    const left = document.createElement("div");
    left.style.cssText = "flex:1 1 320px;min-width:260px";
    const panel = document.createElement("div");
    panel.style.cssText = "flex:0 0 150px;font:11px ui-monospace,Menlo,monospace;color:var(--mute)";
    row.append(left, panel);
    el.appendChild(row);

    const cv = Fig.canvas(left, 260);
    Fig.frame(cv);
    const ctx = cv.ctx;

    /* --- world --- */
    const COLS = 4, ROWS = 3;
    const WALL = [1, 1], GOAL = [3, 0], PENALTY = [3, 1], START = [0, 2];
    const GAMMA = 0.9;
    const ACTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up right down left
    const GLYPHS = ["\u2191", "\u2192", "\u2193", "\u2190"];
    const isWall = (c, r) => c === WALL[0] && r === WALL[1];
    const isTerminal = (c, r) => (c === GOAL[0] && r === GOAL[1]) || (c === PENALTY[0] && r === PENALTY[1]);

    /* --- state --- */
    let eps = 0.2, alpha = 0.2;
    let Q, agent, steps, running = true;
    function reset() {
      Q = [];
      for (let r = 0; r < ROWS; r++) {
        Q.push([]);
        for (let c = 0; c < COLS; c++) Q[r].push([0, 0, 0, 0]);
      }
      agent = START.slice();
      steps = 0;
    }
    reset();

    const maxQ = (c, r) => Math.max.apply(null, Q[r][c]);
    function step() {
      const [c, r] = agent;
      const a = Math.random() < eps
        ? (Math.random() * 4) | 0
        : (function () { // argmax with tie-break
          const q = Q[r][c]; let best = 0;
          for (let i = 1; i < 4; i++) if (q[i] > q[best]) best = i;
          return best;
        })();
      let nc = c + ACTIONS[a][0], nr = r + ACTIONS[a][1];
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS || isWall(nc, nr)) { nc = c; nr = r; }
      const term = isTerminal(nc, nr);
      const reward = nc === GOAL[0] && nr === GOAL[1] ? 1 : (term ? -1 : 0);
      const target = term ? reward : reward + GAMMA * maxQ(nc, nr);
      Q[r][c][a] += alpha * (target - Q[r][c][a]);
      agent = [nc, nr];
      if (term || ++steps > 300) { agent = START.slice(); steps = 0; }
    }

    /* --- controls --- */
    Fig.controls(el, [
      { key: "eps", label: "\u03b5 explore", min: 0, max: 1, step: 0.01, value: eps },
      { key: "alpha", label: "\u03b1 learn", min: 0.05, max: 0.5, step: 0.01, value: alpha },
    ], (k, v) => { if (k === "eps") eps = v; else alpha = v; });

    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    const runChip = Fig.chip("Pause", () => { running = !running; runChip.textContent = running ? "Pause" : "Run"; });
    bar.append(runChip, Fig.chip("Reset", () => { reset(); draw(); }));
    el.appendChild(bar);
    Fig.caption(el, "Q-learning on a 4\u00d73 gridworld: \u03b5-greedy walks, shaded by max Q");

    /* --- drawing --- */
    function shade(t) { // wash -> accent
      const P = Fig.palette();
      const mix = (a, b) => {
        const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
        const ch = (sa, sb) => Math.round(sa + (sb - sa) * t);
        return "rgb(" + ch(pa >> 16, pb >> 16) + "," + ch((pa >> 8) & 255, (pb >> 8) & 255) + "," + ch(pa & 255, pb & 255) + ")";
      };
      return mix(P.wash, P.accent);
    }

    function draw() {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const pad = 14;
      const size = Math.min((cv.w - 2 * pad) / COLS, (cv.h - 2 * pad) / ROWS);
      const ox = (cv.w - size * COLS) / 2, oy = (cv.h - size * ROWS) / 2;

      let lo = Infinity, hi = -Infinity;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (isWall(c, r) || isTerminal(c, r)) continue;
        const v = maxQ(c, r);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      const span = Math.max(hi - lo, 1e-6);

      ctx.font = "10px ui-monospace, Menlo, monospace";
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = ox + c * size, y = oy + r * size;
        ctx.strokeStyle = P.rule; ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

        if (isWall(c, r)) { // hatch
          ctx.save();
          ctx.beginPath(); ctx.rect(x + 1, y + 1, size - 2, size - 2); ctx.clip();
          ctx.strokeStyle = P.mute; ctx.lineWidth = 1;
          for (let d = -size; d < size * 2; d += 6) {
            ctx.beginPath();
            ctx.moveTo(x + d, y + size + 1); ctx.lineTo(x + d + size + 2, y - 1);
            ctx.stroke();
          }
          ctx.restore();
          continue;
        }
        if (isTerminal(c, r)) { // mark goal / penalty
          ctx.fillStyle = c === GOAL[0] ? P.accent : P.mute;
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(c === GOAL[0] ? "+1" : "\u22121", x + size / 2, y + size / 2);
          continue;
        }
        // shaded by max Q
        const t = (maxQ(c, r) - lo) / span;
        ctx.fillStyle = shade(t);
        ctx.fillRect(x + 1, y + 1, size - 2, size - 2);
        // greedy arrow, faint
        const q = Q[r][c]; let best = 0;
        for (let i = 1; i < 4; i++) if (q[i] > q[best]) best = i;
        ctx.fillStyle = P.ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(GLYPHS[best], x + size / 2, y + size / 2);
      }

      // agent dot
      const ax = ox + agent[0] * size + size / 2, ay = oy + agent[1] * size + size / 2;
      ctx.beginPath(); ctx.arc(ax, ay, Math.max(4, size * 0.14), 0, Math.PI * 2);
      ctx.fillStyle = P.accent; ctx.fill();
      ctx.strokeStyle = P.paper; ctx.lineWidth = 1.5; ctx.stroke();

      // panel: Q-table for current cell
      const q = Q[agent[1]][agent[0]];
      let best = 0;
      for (let i = 1; i < 4; i++) if (q[i] > q[best]) best = i;
      let html = "Q @ (" + agent[0] + "," + agent[1] + ")<br>";
      for (let i = 0; i < 4; i++) {
        html += "<div" + (i === best ? ' style="color:var(--accent)"' : "") + ">"
          + GLYPHS[i] + " " + q[i].toFixed(2) + "</div>";
      }
      html += "<br>steps " + steps;
      panel.innerHTML = html;
    }

    /* --- loop: a few env steps per frame --- */
    let frame = 0;
    Fig.animate(cv, () => {
      if (running && ++frame % 4 === 0) { step(); step(); step(); }
      draw();
    });
    Fig.onScheme(draw);
    draw();
  });
})();
