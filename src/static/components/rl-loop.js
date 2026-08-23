(function () {
  Fig.register("rl-loop", function (el, opts) {
    const cv = Fig.canvas(el, 320);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let speed = 1;

    const BOX_W_FRAC = 0.34, BOX_H = 56;
    let phase = 0, last = performance.now();

    function geom() {
      const w = cv.w, h = cv.h, cx = w / 2;
      const bw = Math.min(Math.max(w * BOX_W_FRAC, 150), 260);
      const topY = 30, botY = h - 30 - BOX_H;
      return {
        w, h, cx, bw,
        ax: cx - bw / 2, ay: topY,               // agent box
        ex: cx - bw / 2, ey: botY,               // environment box
        aBot: topY + BOX_H, eTop: botY,
        inset: 16,
        bulge: Math.max(46, Math.min(110, w * 0.13)),
      };
    }

    /* quadratic bezier */
    function qp(p0, c, p1, t) {
      const u = 1 - t;
      return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
              u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]];
    }
    function qd(p0, c, p1, t) {
      return [2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]),
              2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])];
    }

    function box(g, x, y, label) {
      const P = Fig.palette();
      ctx.fillStyle = P.wash;
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.rect(x, y, g.bw, BOX_H);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + g.bw / 2, y + BOX_H / 2);
    }

    function arrowHead(tip, dir, color) {
      const P = Fig.palette();
      const L = 8, W = 4.5;
      const n = Math.hypot(dir[0], dir[1]) || 1;
      const ux = dir[0] / n, uy = dir[1] / n;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(tip[0] - L * ux - W * uy, tip[1] - L * uy + W * ux);
      ctx.lineTo(tip[0] - L * ux + W * uy, tip[1] - L * uy - W * ux);
      ctx.closePath();
      ctx.fill();
    }

    function arc(g, side) {
      // side: +1 right (agent -> env), -1 left (env -> agent)
      const x0 = g.cx + side * (g.bw / 2 + g.inset);
      if (side > 0) {
        return { p0: [x0, g.aBot], c: [g.cx + g.bulge, (g.aBot + g.eTop) / 2], p1: [x0, g.eTop] };
      }
      return { p0: [x0, g.eTop], c: [g.cx - g.bulge, (g.aBot + g.eTop) / 2], p1: [x0, g.aBot] };
    }

    function drawArc(a, color) {
      const P = Fig.palette();
      ctx.strokeStyle = P.mute;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.p0[0], a.p0[1]);
      ctx.quadraticCurveTo(a.c[0], a.c[1], a.p1[0], a.p1[1]);
      ctx.stroke();
      arrowHead(a.p1, qd(a.p0, a.c, a.p1, 1), color);
    }

    function labelArc(a, text) {
      const P = Fig.palette();
      const t = 0.5;
      const [mx, my] = qp(a.p0, a.c, a.p1, t);
      const d = qd(a.p0, a.c, a.p1, t);
      const n = Math.hypot(d[0], d[1]) || 1;
      // unit tangent + right-hand normal (points away from the loop centre)
      const ux = d[0] / n, uy = d[1] / n;
      let na = Math.atan2(uy, ux);
      if (na > Math.PI / 2 || na < -Math.PI / 2) na += Math.PI; // keep text upright
      const off = 17;
      const tx = mx + uy * off;
      const ty = my - ux * off;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(na);
      ctx.fillStyle = P.ink;
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    function dot(a, t, r, color) {
      const [x, y] = qp(a.p0, a.c, a.p1, ((t % 1) + 1) % 1);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const draw = () => {
      const P = Fig.palette();
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      const g = geom();
      ctx.clearRect(0, 0, g.w, g.h);

      box(g, g.ax, g.ay, "AGENT");
      box(g, g.ex, g.ey, "ENVIRONMENT");

      const right = arc(g, +1);
      const left = arc(g, -1);
      drawArc(right, P.accent);
      drawArc(left, P.ink);

      labelArc(right, "ACTION a\u209C");
      labelArc(left, "REWARD r\u209C \u00B7 STATE s\u209C\u208A\u2081");

      phase += dt * speed * 0.45;
      dot(right, phase, 4, P.accent);
      dot(left, phase, 3.5, P.ink);
    };

    Fig.controls(el, [{ key: "speed", label: "Speed", min: 0.2, max: 3, step: 0.05, value: speed }],
      (k, v) => { speed = v; });

    last = performance.now();
    Fig.animate(cv, draw);
    Fig.onScheme(draw);
  });
})();
