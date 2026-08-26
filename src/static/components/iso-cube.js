(function () {
  Fig.register("iso-cube", function (el, opts) {
    const cv = Fig.canvas(el, 280);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let yaw = 32,
      pitch = 22;
    Fig.controls(
      el,
      [
        { key: "yaw", label: "Yaw", min: 0, max: 360, step: 1, value: yaw },
        {
          key: "pitch",
          label: "Pitch",
          min: 0,
          max: 90,
          step: 1,
          value: pitch,
        },
      ],
      (k, v) => {
        if (k === "yaw") yaw = v;
        if (k === "pitch") pitch = v;
        draw();
      },
    );
    Fig.caption(el, "hidden edges rule-colored · visible edges ink");
    const V = [];
    for (const x of [-1, 1])
      for (const y of [-1, 1]) for (const z of [-1, 1]) V.push([x, y, z]);
    const EDGES = [];
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const diff = V[i].filter((v, k) => v !== V[j][k]).length;
        if (diff === 1) EDGES.push([i, j]);
      }
    function project(v) {
      const ry = (yaw * Math.PI) / 180,
        rp = (pitch * Math.PI) / 180;
      let [x, y, z] = v;
      let x1 = x * Math.cos(ry) + z * Math.sin(ry),
        z1 = -x * Math.sin(ry) + z * Math.cos(ry);
      let y1 = y * Math.cos(rp) - z1 * Math.sin(rp),
        z2 = y * Math.sin(rp) + z1 * Math.cos(rp);
      return [cv.w / 2 + x1 * 62, cv.h / 2 + y1 * 62, z2];
    }
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const pts = V.map(project);
      const depth = pts.map((p) => p[2]);
      const mid = depth.reduce((a, b) => a + b, 0) / 8;
      for (const [a, b] of EDGES) {
        const hidden = depth[a] < mid && depth[b] < mid;
        ctx.strokeStyle = hidden ? P.rule : P.ink;
        ctx.lineWidth = hidden ? 1 : 1.5;
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
      }
      pts.forEach(([x, y]) => {
        ctx.fillStyle = P.accent;
        ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      });
      void depth;
    };
    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
