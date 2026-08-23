(function () {
  Fig.register("softmax", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const logits = [-2, -1, 0, 1, 2];
    const labels = ["w1", "w2", "w3", "w4", "w5"];
    let T = 1;
    Fig.controls(el, [{ key: "T", label: "Temperature", min: 0.05, max: 4, step: 0.05, value: T }],
      (k, v) => { T = v; draw(); });
    Fig.caption(el, "softmax(z / T) over five logits");
    function probs() {
      const m = Math.max(...logits);
      const e = logits.map(z => Math.exp((z - m) / T));
      const s = e.reduce((a, b) => a + b, 0);
      return e.map(v => v / s);
    }
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const ps = probs();
      const bw = (cv.w - 60) / 5;
      ps.forEach((p, i) => {
        const h = p * (cv.h - 70);
        const x = 30 + i * bw;
        ctx.fillStyle = i === ps.indexOf(Math.max(...ps)) ? P.accent : P.ink;
        ctx.globalAlpha = i === ps.indexOf(Math.max(...ps)) ? 1 : 0.75;
        ctx.fillRect(x + 6, cv.h - 34 - h, bw - 12, h);
        ctx.globalAlpha = 1;
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = P.mute;
        ctx.textAlign = "center";
        ctx.fillText(labels[i], x + bw / 2, cv.h - 18);
        ctx.fillStyle = P.ink;
        ctx.fillText(p.toFixed(2), x + bw / 2, cv.h - 42 - h);
        ctx.textAlign = "left";
      });
    };
    draw();
    Fig.onScheme(draw);
  });
})();
