(function () {
  Fig.register("gradient-descent", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const f = x => x ** 4 - 3 * x * x + x;
    const df = x => 4 * x ** 3 - 6 * x + 1;
    let lr = 0.08, x = -1.9, running = false, steps = 0;
    Fig.controls(el, [{ key: "lr", label: "Learning rate", min: 0.01, max: 0.6, step: 0.005, value: lr }],
      (k, v) => { lr = v; });
    Fig.caption(el, f.name + ": click the figure to run/pause");
    const X = x => cv.w / 2 + x * (cv.w / 7);
    const Y = v => cv.h / 2 - v * (cv.h / 14);
    cv.el.addEventListener("pointerdown", () => { running = !running; wake(); });
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let px = 0; px <= cv.w; px += 2) {
        const wx = (px - cv.w / 2) / (cv.w / 7);
        px === 0 ? ctx.moveTo(px, Y(f(wx))) : ctx.lineTo(px, Y(f(wx)));
      }
      ctx.stroke();
      ctx.fillStyle = P.accent;
      ctx.beginPath(); ctx.arc(X(x), Y(f(x)), 5, 0, 7); ctx.fill();
      ctx.font = "11px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.mute;
      ctx.fillText("step " + steps + "   x = " + x.toFixed(3) + "   f(x) = " + f(x).toFixed(3), 12, 18);
    };
    const step = () => { x -= lr * df(x); steps++; };
    let raf = 0;
    const loop = () => { if (running) step(); draw(); raf = requestAnimationFrame(loop); };
    const wake = () => { cancelAnimationFrame(raf); if (!Fig.reduced()) raf = requestAnimationFrame(loop); else draw(); };
    Fig.onScheme(wake);
    wake();
  });
})();
