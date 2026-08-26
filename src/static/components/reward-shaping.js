(function () {
  Fig.register("reward-shaping", function (el) {
    const cv = Fig.canvas(el, 380);
    Fig.frame(cv);
    const ctx = cv.ctx;

    // ── seeded RNG (mulberry32) ──────────────────────────────────────────
    const mulberry32 = (seed) => () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const ALPHA = 0.15; // episodic policy-gradient step size (per action, adv/T)
    const GOAL = 20,
      START = 0,
      CAP = 900; // step cap = failed episode
    const LAM = 0.001; // per-step preference decay (policy forgetting)
    const DELTA = 0.05; // greedy decision margin: prefs must differ by this
    const ASHAPE = 0.02; // per-step shaped-reward step size
    const clampP = (p) => Math.max(-3, Math.min(3, p));

    let eps = 0.15,
      speed = 40,
      rng;

    const makeAgent = () => ({ pos: START, p: [0, 0], trace: [], steps: 0 });
    const mkVariant = (name, shaped) => ({
      name,
      shaped,
      agent: makeAgent(),
      hist: [],
      done: 0,
      bAvg: 400,
    });
    let VA, VB;
    const reset = () => {
      rng = mulberry32(1234);
      VA = mkVariant("SPARSE", false);
      VB = mkVariant("SHAPED", true);
    };
    reset();

    // ── one env step for a variant ───────────────────────────────────────
    function step(v) {
      const g = v.agent;
      let a;
      if (g.p[1] > g.p[0] + DELTA)
        a = 1; // decisively prefer right
      else if (g.p[0] > g.p[1] + DELTA)
        a = 0; // decisively prefer left
      else a = rng() < 0.5 ? 1 : 0; // undecided: coin flip
      if (rng() < eps) a = rng() < 0.5 ? 1 : 0; // ε-exploration

      const old = g.pos;
      g.pos = Math.max(START, Math.min(GOAL, old + (a ? 1 : -1)));
      g.trace.push(a);
      g.steps++;

      // potential-based shaping: +1 per step toward goal (oldDist − newDist)
      const shape = g.pos - old;
      if (v.shaped) g.p[a] = clampP(g.p[a] + ASHAPE * shape);
      g.p[0] *= 1 - LAM;
      g.p[1] *= 1 - LAM;

      if (g.pos >= GOAL || g.steps >= CAP) {
        const success = g.pos >= GOAL;
        const adv =
          Math.max(-1, Math.min(1, (v.bAvg - g.steps) / v.bAvg)) /
          g.trace.length;
        for (const t of g.trace) g.p[t] = clampP(g.p[t] + ALPHA * adv);
        v.bAvg += 0.06 * (g.steps - v.bAvg);
        v.hist.push(g.steps);
        if (success) v.done++;
        v.agent = { pos: START, p: g.p, trace: [], steps: 0 };
      }
    }

    // ── controls ─────────────────────────────────────────────────────────
    Fig.controls(
      el,
      [
        {
          key: "eps",
          label: "Explore ε",
          min: 0.05,
          max: 0.5,
          step: 0.05,
          value: eps,
        },
        {
          key: "speed",
          label: "Speed",
          min: 1,
          max: 120,
          step: 1,
          value: speed,
        },
      ],
      (k, v) => {
        if (k === "eps") eps = v;
        else speed = v;
      },
    );

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    btnRow.appendChild(
      Fig.chip("↺ Reset", () => {
        reset();
        draw();
      }),
    );
    el.appendChild(btnRow);
    Fig.caption(
      el,
      "same seeded corridor 0→20 · sparse: +1 only at goal · shaped: + (newDist−oldDist) per step",
    );

    // ── layout ───────────────────────────────────────────────────────────
    const TOP = 8,
      GAP = 18,
      PH = (cv.h - TOP - GAP) / 2; // panel height
    const LX = 40,
      RX = 12;

    const drawVariant = (v, y0, colDot, colBar) => {
      const P = Fig.palette();
      const hw = cv.w - LX - RX;
      const hy = y0 + 18,
        hh = 108;
      const cy = y0 + PH - 24; // corridor centreline

      // header readout
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.mute;
      const recent = v.hist.slice(-10);
      const avg = recent.length
        ? Math.round(recent.reduce((s, x) => s + x, 0) / recent.length)
        : null;
      ctx.fillText(
        v.name +
          "  ·  EPISODES " +
          v.done +
          "  ·  AVG " +
          (avg == null ? "—" : avg) +
          "  ·  STEPS " +
          v.agent.steps +
          "  ·  POS " +
          v.agent.pos,
        LX,
        y0 + 11,
      );

      // history plot
      const pitch = 3,
        K = Math.max(1, Math.floor(hw / pitch));
      const shown = v.hist.slice(-K);
      let m = 100;
      for (const s of shown) if (s > m) m = s;
      m = Math.min(Math.ceil(m / 100) * 100, CAP);
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LX, hy + hh + 0.5);
      ctx.lineTo(LX + hw, hy + hh + 0.5);
      ctx.stroke();
      ctx.fillStyle = P.mute;
      ctx.font = "9px ui-monospace, Menlo, monospace";
      ctx.fillText("STEPS TO GOAL · MAX " + m, LX, hy + 9);
      shown.forEach((s, i) => {
        const x = LX + i * pitch;
        const bh = (s / m) * hh;
        if (s >= CAP) {
          // failed episode: outline only
          ctx.strokeStyle = colBar;
          ctx.globalAlpha = 0.45;
          ctx.strokeRect(x + 0.5, hy + hh - bh + 0.5, 1.5, Math.max(bh - 1, 1));
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = colBar;
          ctx.fillRect(x, hy + hh - bh, 2, bh);
        }
      });

      // corridor strip
      const X = (p) => LX + (p / GOAL) * hw;
      ctx.strokeStyle = P.rule;
      ctx.beginPath();
      ctx.moveTo(LX, cy + 0.5);
      ctx.lineTo(LX + hw, cy + 0.5);
      ctx.stroke();
      ctx.font = "9px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.mute;
      ctx.textAlign = "center";
      for (let p = 0; p <= GOAL; p += 5) {
        ctx.fillRect(X(p) - 0.5, cy, 1, 4);
        ctx.fillText(String(p), X(p), cy + 14);
      }
      // goal marker
      ctx.fillStyle = P.accent;
      ctx.fillRect(X(GOAL) - 1, cy - 8, 2, 8);
      ctx.textAlign = "right";
      ctx.fillText("GOAL", X(GOAL) - 4, cy - 6);
      // agent dot
      ctx.textAlign = "left";
      ctx.fillStyle = colDot;
      ctx.beginPath();
      ctx.arc(X(v.agent.pos), cy - 4, 4.5, 0, 7);
      ctx.fill();
    };

    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      drawVariant(VA, TOP, P.ink, P.mute);
      drawVariant(VB, TOP + PH + GAP, P.accent, P.accent);
    };

    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => {
      const n = Math.max(1, Math.round(speed));
      for (let s = 0; s < n; s++) {
        step(VA);
        step(VB);
      }
      draw();
    });
  });
})();
