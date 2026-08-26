/* epsilon-greedy — three-armed bandit: explore with prob ε, else exploit
   the best empirical mean. Bars show estimates; accent ticks mark true means. */
(function () {
  Fig.register("epsilon-greedy", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const TRUE_MEANS = [0.3, 0.55, 0.8];
    const NAMES = ["A", "B", "C"];

    let eps = 0.25;
    let running = false;
    let rnd, count, sum, est, pulls, lastChoice;

    function mulberry32(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function reset() {
      rnd = mulberry32(7);
      count = [0, 0, 0];
      sum = [0, 0, 0];
      est = [0, 0, 0];
      pulls = 0;
      lastChoice = "—";
      draw();
    }

    /* One pull: decide explore/exploit, observe noisy reward,
       update count + running mean for the chosen arm. */
    function tick() {
      const explore = rnd() < eps;
      let arm;
      if (explore) {
        arm = Math.floor(rnd() * 3);
      } else {
        let best = -Infinity,
          ties = [];
        for (let i = 0; i < 3; i++) {
          if (est[i] > best + 1e-12) {
            best = est[i];
            ties = [i];
          } else if (Math.abs(est[i] - best) <= 1e-12) ties.push(i);
        }
        arm = ties[Math.floor(rnd() * ties.length)];
      }
      const reward = TRUE_MEANS[arm] + (rnd() - 0.5) * 0.3;
      count[arm]++;
      sum[arm] += reward;
      est[arm] = sum[arm] / count[arm];
      pulls++;
      lastChoice =
        "ARM " + NAMES[arm] + (explore ? " · EXPLORE" : " · EXPLOIT");
    }

    /* Controls: chips + ε slider + live readout */
    const runChip = Fig.chip("RUN", () => {
      running = !running;
      runChip.textContent = running ? "PAUSE" : "RUN";
    });
    const resetChip = Fig.chip("RESET", reset);
    const chipRow = document.createElement("div");
    chipRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem;";
    chipRow.append(runChip, resetChip);
    el.appendChild(chipRow);

    Fig.controls(
      el,
      [
        {
          key: "eps",
          label: "Epsilon",
          min: 0,
          max: 1,
          step: 0.01,
          value: eps,
        },
      ],
      (k, v) => {
        eps = v;
      },
    );

    const readout = document.createElement("p");
    readout.className = "meta";
    readout.style.margin = "0.25rem 0 0";
    el.appendChild(readout);

    Fig.caption(
      el,
      "each tick: explore with prob ε, otherwise pull the current best arm",
    );

    function draw() {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const m = { l: 14, r: 14, t: 20, b: 36 };
      const iw = cv.w - m.l - m.r,
        ih = cv.h - m.t - m.b;
      const Y = (v) => m.t + (1 - Math.min(v, 1)) * ih;
      const font = "10px ui-monospace, Menlo, monospace";

      /* baseline */
      ctx.lineWidth = 1;
      ctx.strokeStyle = P.rule;
      ctx.beginPath();
      ctx.moveTo(m.l, Y(0));
      ctx.lineTo(cv.w - m.r, Y(0));
      ctx.stroke();

      const slot = iw / 3;
      for (let i = 0; i < 3; i++) {
        const cx = m.l + slot * i + slot / 2;
        const bw = slot * 0.42;
        /* estimated-mean bar (ink) */
        const h = ih * Math.max(Math.min(est[i], 1), 0);
        ctx.fillStyle = P.ink;
        ctx.fillRect(cx - bw / 2, Y(0) - h, bw, h);
        /* true-mean hairline tick (accent) */
        ctx.strokeStyle = P.accent;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2 - 7, Y(TRUE_MEANS[i]));
        ctx.lineTo(cx + bw / 2 + 7, Y(TRUE_MEANS[i]));
        ctx.stroke();
        /* estimate value above bar */
        ctx.font = font;
        ctx.textAlign = "center";
        ctx.fillStyle = P.ink;
        if (count[i] > 0) ctx.fillText(est[i].toFixed(2), cx, Y(est[i]) - 5);
        /* arm + count labels */
        ctx.fillStyle = P.mute;
        ctx.fillText("ARM " + NAMES[i], cx, cv.h - 22);
        ctx.fillText("N=" + count[i], cx, cv.h - 9);
      }
      ctx.textAlign = "left";

      /* legend */
      ctx.strokeStyle = P.accent;
      ctx.beginPath();
      ctx.moveTo(m.l, 11);
      ctx.lineTo(m.l + 14, 11);
      ctx.stroke();
      ctx.fillStyle = P.mute;
      ctx.fillText("TRUE MEAN", m.l + 19, 14);

      readout.textContent = "PULLS " + pulls + " · LAST " + lastChoice;
    }

    cv.redraw = draw;
    Fig.onScheme(draw);
    reset();

    Fig.animate(cv, () => {
      if (running) {
        tick();
      }
      draw();
    });
  });
})();
