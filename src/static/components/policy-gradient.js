(function () {
  Fig.register("policy-gradient", function (el, opts) {
    const cv = Fig.canvas(el, 220);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let pi = 0.5,
      pi0 = 0.5,
      lr = 0.1,
      t = 0;
    const history = [];
    function mulberry32(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    let rnd = mulberry32(99);
    Fig.controls(
      el,
      [
        {
          key: "pi0",
          label: "Initial π",
          min: 0.05,
          max: 0.95,
          step: 0.05,
          value: pi0,
        },
        {
          key: "lr",
          label: "Learning rate",
          min: 0.01,
          max: 0.3,
          step: 0.01,
          value: lr,
        },
      ],
      (k, v) => {
        if (k === "pi0") {
          pi = pi0 = v;
          t = 0;
          history.length = 0;
          rnd = mulberry32(99);
        }
        if (k === "lr") lr = v;
        draw();
      },
    );
    const reset = Fig.chip("↺ Reset", () => {
      pi = pi0;
      t = 0;
      history.length = 0;
      rnd = mulberry32(99);
      draw();
    });
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    btnRow.appendChild(reset);
    el.appendChild(btnRow);
    Fig.caption(el, "π updates toward rewarded actions · true bias 0.7 right");
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const bw = cv.w - 24;
      ctx.fillStyle = P.ink;
      ctx.fillRect(12, 24, bw * (1 - pi), 34);
      ctx.fillStyle = P.accent;
      ctx.fillRect(12 + bw * (1 - pi), 24, bw * pi, 34);
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.fillStyle = pi > 0.5 ? P.paper : P.ink;
      ctx.textAlign = "center";
      if (1 - pi > 0.12)
        ctx.fillText(
          "← left " + (1 - pi).toFixed(2),
          12 + (bw * (1 - pi)) / 2,
          45,
        );
      ctx.fillStyle = pi > 0.5 ? P.paper : P.accent;
      if (pi > 0.12)
        ctx.fillText(
          "right " + pi.toFixed(2) + " →",
          12 + bw * (1 - pi) + (bw * pi) / 2,
          45,
        );
      ctx.fillStyle = P.mute;
      ctx.textAlign = "left";
      ctx.fillText("episode " + t + " · π(right) = " + pi.toFixed(3), 12, 78);
      if (history.length > 1) {
        ctx.strokeStyle = P.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        history.forEach((v, i) => {
          const x = 12 + (i / 200) * bw,
            y = 96 + (1 - v) * (cv.h - 130);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.strokeStyle = P.rule;
        ctx.strokeRect(12, 96, bw, cv.h - 130);
        ctx.fillStyle = P.mute;
        ctx.fillText("π trajectory", 12, 92);
      }
      ctx.textAlign = "left";
    };
    const tick = () => {
      const actionRight = rnd() < pi;
      const reward = rnd() < 0.7 === actionRight ? 1 : 0;
      pi += lr * reward * (actionRight ? 1 - pi : -pi);
      pi = Math.max(0.02, Math.min(0.98, pi));
      t++;
      history.push(pi);
      if (history.length > 200) history.shift();
    };
    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => {
      tick();
      if (t % 3 === 0) draw();
    });
  });
})();
