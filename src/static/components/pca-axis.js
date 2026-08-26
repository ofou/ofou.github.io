(function () {
  Fig.register("pca-axis", function (el, opts) {
    const cv = Fig.canvas(el, 260);
    Fig.frame(cv);
    const ctx = cv.ctx;
    function mulberry32(a) {
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(42);
    const cloud = [];
    for (let i = 0; i < 120; i++) {
      const u = rnd(),
        v = rnd();
      cloud.push({
        x: 0.15 + u * 0.6 + v * 0.12,
        y: 0.15 + u * 0.18 + v * 0.55,
      });
    }
    let theta = 30;
    Fig.controls(
      el,
      [
        {
          key: "theta",
          label: "Axis θ",
          min: 0,
          max: 180,
          step: 1,
          value: theta,
        },
      ],
      (k, v) => {
        theta = v;
        draw();
      },
    );
    const readout = document.createElement("p");
    readout.className = "meta";
    readout.style.margin = "0.4rem 0 0";
    el.appendChild(readout);
    const CX = cv.w / 2,
      CY = cv.h / 2,
      R = Math.min(cv.w, cv.h) * 0.42;
    const dir = () => [
      Math.cos((theta * Math.PI) / 180),
      -Math.sin((theta * Math.PI) / 180),
    ];
    function project(p, d) {
      const px = (p.x - 0.5) * 2,
        py = -(p.y - 0.5) * 2;
      const s = px * d[0] + py * d[1];
      return { along: s, perp: px * d[1] - py * d[0] };
    }
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const d = dir();
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(CX - d[0] * R * 1.05, CY - d[1] * R * 1.05);
      ctx.lineTo(CX + d[0] * R * 1.05, CY + d[1] * R * 1.05);
      ctx.stroke();
      let varSum = 0;
      for (const p of cloud) {
        const pr = project(p, d);
        varSum += pr.along * pr.along;
        const gx = CX + d[0] * pr.along * R,
          gy = CY + d[1] * pr.along * R;
        ctx.strokeStyle = P.rule;
        ctx.beginPath();
        ctx.moveTo(CX + p.x * 60 - 30, CY + p.y * 90 - 45);
        ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.fillStyle = P.accent;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(gx - 2, gy - 2, 4, 4);
        ctx.globalAlpha = 0.55;
        ctx.fillRect(CX + p.x * 60 - 30 - 2, CY + p.y * 90 - 45 - 2, 4, 4);
        ctx.globalAlpha = 1;
      }
      readout.textContent = `σ² along θ = ${(varSum / cloud.length).toFixed(3)} · θ = ${theta}°`;
    };
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
