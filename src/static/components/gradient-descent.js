(function () {
  Fig.register("gradient-descent", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const f = x => x ** 4 - 3 * x * x + x;
    const df = x => 4 * x ** 3 - 6 * x + 1;
    let lr = 0.08, x0 = -1.9, x = x0, running = false, steps = 0, diverged = false;
    Fig.controls(el, [{ key: "lr", label: "Learning rate", min: 0.01, max: 0.6, step: 0.005, value: lr }],
      (k, v) => { lr = v; });
    const reset = Fig.chip("↺ Reset", () => { x = x0; steps = 0; diverged = false; running = false; draw(); });
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    btnRow.appendChild(reset);
    el.appendChild(btnRow);
    Fig.caption(el, "click the figure to run/pause · reset if it diverges");
    const X = wx => cv.w / 2 + wx * (cv.w / 7);
    const Y = v => cv.h / 2 - v * (cv.h / 14);
    cv.el.addEventListener("pointerdown", () => { if (!diverged) running = !running; });
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
      if (diverged) {
        ctx.fillStyle = P.accent; ctx.font = "12px ui-monospace, Menlo, monospace";
        ctx.fillText("diverged — reduce the learning rate", 12, 34);
      } else {
        ctx.fillStyle = P.accent;
        ctx.beginPath(); ctx.arc(X(x), Y(f(x)), 5, 0, 7); ctx.fill();
      }
      ctx.font = "11px ui-monospace, Menlo, monospace"; ctx.fillStyle = P.mute;
      ctx.fillText("step " + steps + "   x = " + (Number.isFinite(x) ? x.toFixed(3) : "∞") + "   f(x) = " + (Number.isFinite(x) ? f(x).toFixed(3) : "∞"), 12, 18);
    };
    const stepFn = () => {
      const nx = x - lr * df(x);
      if (!Number.isFinite(nx) || Math.abs(nx) > 3) { diverged = true; running = false; return; }
      x = nx; steps++;
    };
    cv.redraw = draw;
    Fig.onScheme(draw);
    Fig.animate(cv, () => { if (running) stepFn(); draw(); });
  });
})();
