(function () {
  Fig.register("vector-add", function (el, opts) {
    const cv = Fig.canvas(el, 260);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let angle = +(opts.angle || 45) * Math.PI / 180;

    const handles = Fig.controls(el, [
      { key: "angle", label: "Angle θ", min: 0, max: 360, step: 1, value: +opts.angle || 45 },
    ], (k, v) => {
      angle = v * Math.PI / 180;
      if (Fig.reduced()) draw();
    });
    Fig.caption(el, "a·b = |a||b|cosθ · |a×b| = |a||b|sinθ");

    const O = () => [cv.w * 0.24, cv.h * 0.62];
    const A = [2.4, -1.1];
    const blen = 2.3;

    function arrow(x0, y0, x1, y1, color, w) {
      ctx.strokeStyle = color; ctx.lineWidth = w || 2;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const ang = Math.atan2(y1 - y0, x1 - x0), L = 9;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - L * Math.cos(ang - 0.42), y1 - L * Math.sin(ang - 0.42));
      ctx.lineTo(x1 - L * Math.cos(ang + 0.42), y1 - L * Math.sin(ang + 0.42));
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    }

    function grid() {
      const p = Fig.palette();
      ctx.strokeStyle = p.rule; ctx.lineWidth = 0.5; ctx.globalAlpha = 0.35;
      for (let x = 10; x < cv.w; x += 26) { ctx.beginPath(); ctx.moveTo(x, 8); ctx.lineTo(x, cv.h - 8); ctx.stroke(); }
      for (let y = 10; y < cv.h; y += 26) { ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(cv.w - 8, y); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }

    function draw() {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      grid();
      const [ox, oy] = O(), S = 46;
      const b = [blen * Math.cos(angle), -blen * Math.sin(angle)];
      const sum = [A[0] + b[0], A[1] + b[1]];
      arrow(ox, oy, ox + A[0] * S, oy + A[1] * S, P.accent, 2);
      arrow(ox + A[0] * S, oy + A[1] * S, ox + sum[0] * S, oy + sum[1] * S, P.mute, 1.5);
      arrow(ox, oy, ox + sum[0] * S, oy + sum[1] * S, P.ink, 2.4);
      ctx.font = "10px ui-monospace, Menlo, monospace";
      ctx.fillStyle = P.accent; ctx.fillText("a", ox + A[0] * S / 2 + 6, oy + A[1] * S / 2);
      ctx.fillStyle = P.mute; ctx.fillText("b", ox + (A[0] + sum[0]) * S / 2 + 6, oy + (A[1] + sum[1]) * S / 2);
      ctx.fillStyle = P.ink; ctx.fillText("a+b", ox + sum[0] * S + 6, oy + sum[1] * S);
      void b;
    }

    draw();
    Fig.animate(cv, draw);
    Fig.onScheme(draw);
  });
})();
