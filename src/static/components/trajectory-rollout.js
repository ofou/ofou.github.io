/* trajectory-rollout.js — horizontal RL rollout timeline: 8 state cells linked by
   seeded actions, reward badges, step slider, discounted-return readout. */
(function () {
  Fig.register("trajectory-rollout", function (el, opts) {
    const cv = Fig.canvas(el, 200);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const N = 8;
    const GAMMA = 0.95;
    const VOCAB = ["left", "right", "up", "down"];
    const REWARD_POOL = [0, -0.1, -0.05, 0.1];
    const SUB = "\u2080\u2081\u2082\u2083\u2084\u2085\u2086\u2087";

    function mulberry32(a) {
      return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /* Seeded rollout: actions from vocab, small shaping rewards, +1 at terminal hop. */
    const actions = [];
    const rewards = [];
    {
      const rnd = mulberry32(2026);
      for (let t = 0; t < N - 2; t++) {
        actions.push(VOCAB[Math.floor(rnd() * VOCAB.length)]);
        rewards.push(REWARD_POOL[Math.floor(rnd() * REWARD_POOL.length)]);
      }
      actions.push(VOCAB[Math.floor(rnd() * VOCAB.length)]);
      rewards.push(1);
    }

    let step = N; // 1..N: reveals s0..s(step-1); current cell index = step-1

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function fmtReward(r) {
      const s = Math.abs(r).toFixed(2);
      return (r < 0 ? "\u2212" : "+") + s;
    }

    function drawArrow(x0, x1, y) {
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1 - 5, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x1 - 6, y - 3.5);
      ctx.lineTo(x1 - 6, y + 3.5);
      ctx.closePath();
      ctx.fill();
    }

    const draw = () => {
      const P = Fig.palette();
      const w = cv.w,
        h = cv.h;
      ctx.clearRect(0, 0, w, h);

      const padX = Math.max(20, w * 0.04);
      const pitch = (w - padX * 2) / N;
      const size = Math.min(pitch * 0.58, 56);
      const cy = h * 0.55;
      const cur = step - 1;

      /* Readout row */
      ctx.textBaseline = "middle";
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "left";
      ctx.fillStyle = P.mute;
      ctx.fillText("ROLLOUT \u00b7 STEP " + step + "/" + N, padX, 16);

      let G = 0;
      for (let t = 0; t <= cur - 1; t++) G += Math.pow(GAMMA, t) * rewards[t];
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.fillStyle = P.accent;
      ctx.fillText("G = " + G.toFixed(3), w - padX, 16);
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText("\u03b3 = 0.95", w - padX, 30);

      /* State cells (ghosted ahead of the reveal frontier) */
      for (let i = 0; i < N; i++) {
        const cx = padX + pitch * (i + 0.5);
        const x = cx - size / 2,
          y = cy - size / 2;
        const isCur = i === cur;
        const seen = i <= cur;

        if (seen) {
          ctx.fillStyle = P.wash;
          ctx.fillRect(x, y, size, size);
          ctx.strokeStyle = isCur ? P.accent : P.rule;
          ctx.lineWidth = isCur ? 1.5 : 1;
          ctx.strokeRect(x, y, size, size);
          if (isCur) {
            ctx.fillStyle = P.accent;
            ctx.beginPath();
            ctx.moveTo(cx, y - 9);
            ctx.lineTo(cx - 4.5, y - 15);
            ctx.lineTo(cx + 4.5, y - 15);
            ctx.closePath();
            ctx.fill();
          }
        } else {
          ctx.strokeStyle = P.rule;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 4]);
          ctx.strokeRect(x, y, size, size);
          ctx.setLineDash([]);
        }

        ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = seen ? (isCur ? P.ink : P.mute) : P.rule;
        ctx.fillText("s" + SUB[i], cx, cy + 0.5);
      }

      /* Transitions: action arrow + label above, reward badge below */
      ctx.lineWidth = 1;
      for (let t = 0; t < N - 1; t++) {
        const c0 = padX + pitch * (t + 0.5);
        const c1 = padX + pitch * (t + 1.5);
        const x0 = c0 + size / 2 + 3;
        const x1 = c1 - size / 2 - 3;
        const mid = (x0 + x1) / 2;
        const r = rewards[t];
        const terminal = t === N - 2;
        const seen = t <= cur - 1;
        if (!seen) continue;

        ctx.strokeStyle = P.ink;
        ctx.globalAlpha = 0.75;
        drawArrow(x0, x1, cy);
        ctx.globalAlpha = 1;

        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.fillStyle = P.mute;
        ctx.textAlign = "center";
        ctx.fillText(actions[t].toUpperCase(), mid, cy - size / 2 - 26);

        const label = fmtReward(r);
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        const tw = ctx.measureText(label).width;
        const bw = tw + 12,
          bh = 16;
        const bx = mid - bw / 2,
          by = cy + size / 2 + 10;
        if (terminal) {
          ctx.fillStyle = P.accent;
          roundRect(bx, by, bw, bh, bh / 2);
          ctx.fill();
          ctx.fillStyle = P.paper;
        } else {
          ctx.strokeStyle = P.rule;
          roundRect(bx, by, bw, bh, bh / 2);
          ctx.stroke();
          ctx.fillStyle = r < 0 ? P.mute : P.ink;
        }
        ctx.fillText(label, mid, by + bh / 2 + 0.5);
      }
    };

    Fig.controls(
      el,
      [{ key: "step", label: "Step", min: 1, max: N, step: 1, value: step }],
      (k, v) => {
        step = Math.round(v);
        draw();
      },
    );

    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
