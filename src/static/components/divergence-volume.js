/* Divergence-theorem mesh volume — Alyssa Rosenzweig (2018).
   https://alyssarosenzweig.ca/blog/hilariously-fast-volume-computation-with-the-divergence-theorem.html

   V = (1/6) Σ_i (Δ1 × Δ2)_x · (T0x + T1x + T2x)
   with Δ1 = T1 − T0, Δ2 = T2 − T0. Closed, oriented triangle mesh. */
(function () {
  /** @param {Array<[number,number,number]>} triangles flat list of verts, 3 per face */
  function meshVolume(triangles) {
    let sum = 0;
    for (let i = 0; i < triangles.length; i += 3) {
      const t0 = triangles[i];
      const t1 = triangles[i + 1];
      const t2 = triangles[i + 2];
      const d1x = t1[0] - t0[0];
      const d1y = t1[1] - t0[1];
      const d1z = t1[2] - t0[2];
      const d2x = t2[0] - t0[0];
      const d2y = t2[1] - t0[1];
      const d2z = t2[2] - t0[2];
      /* Only the X component of Δ1 × Δ2 is needed (F = <x,0,0>). */
      const cx = d1y * d2z - d1z * d2y;
      sum += cx * (t0[0] + t1[0] + t2[0]);
    }
    return sum / 6;
  }

  function tri(a, b, c) {
    return [a, b, c];
  }

  /* Outward CCW faces. */
  function cubeMesh(s) {
    const h = s * 0.5;
    const v = [
      [-h, -h, -h],
      [h, -h, -h],
      [h, h, -h],
      [-h, h, -h],
      [-h, -h, h],
      [h, -h, h],
      [h, h, h],
      [-h, h, h],
    ];
    const faces = [
      [0, 3, 2, 1], // −Z
      [4, 5, 6, 7], // +Z
      [0, 1, 5, 4], // −Y
      [3, 7, 6, 2], // +Y
      [0, 4, 7, 3], // −X
      [1, 2, 6, 5], // +X
    ];
    const tris = [];
    for (const f of faces) {
      tris.push(...tri(v[f[0]], v[f[1]], v[f[2]]));
      tris.push(...tri(v[f[0]], v[f[2]], v[f[3]]));
    }
    return { tris, analytic: s * s * s, name: "cube" };
  }

  function tetraMesh(s) {
    /* Regular tetra: edge length s. Vertices of form (±1,±1,±1) with even
       number of minuses, scaled so edge = s. */
    const a = s / (2 * Math.SQRT2);
    const v = [
      [a, a, a],
      [a, -a, -a],
      [-a, a, -a],
      [-a, -a, a],
    ];
    const faces = [
      [0, 1, 2],
      [0, 2, 3],
      [0, 3, 1],
      [1, 3, 2],
    ];
    const tris = [];
    for (const f of faces) tris.push(...tri(v[f[0]], v[f[1]], v[f[2]]));
    /* Regular tetrahedron: V = a³ / (6√2) with edge a. */
    const analytic = (s * s * s) / (6 * Math.SQRT2);
    return { tris, analytic, name: "tetrahedron" };
  }

  function octaMesh(s) {
    const h = s * 0.5;
    const v = [
      [h, 0, 0],
      [-h, 0, 0],
      [0, h, 0],
      [0, -h, 0],
      [0, 0, h],
      [0, 0, -h],
    ];
    const faces = [
      [0, 2, 4],
      [2, 1, 4],
      [1, 3, 4],
      [3, 0, 4],
      [0, 5, 2],
      [2, 5, 1],
      [1, 5, 3],
      [3, 5, 0],
    ];
    const tris = [];
    for (const f of faces) tris.push(...tri(v[f[0]], v[f[1]], v[f[2]]));
    /* Regular octahedron: V = (√2/3) a³ with a = s/√2 ⇒ V = s³/6. */
    return { tris, analytic: (s * s * s) / 6, name: "octahedron" };
  }

  /** Subdivided icosahedron → closed triangle mesh approximating a ball. */
  function sphereMesh(s, subdiv) {
    const t = (1 + Math.sqrt(5)) / 2;
    let verts = [
      [-1, t, 0],
      [1, t, 0],
      [-1, -t, 0],
      [1, -t, 0],
      [0, -1, t],
      [0, 1, t],
      [0, -1, -t],
      [0, 1, -t],
      [t, 0, -1],
      [t, 0, 1],
      [-t, 0, -1],
      [-t, 0, 1],
    ].map((p) => {
      const L = Math.hypot(...p);
      return p.map((c) => (c / L) * (s * 0.5));
    });
    let faces = [
      [0, 11, 5],
      [0, 5, 1],
      [0, 1, 7],
      [0, 7, 10],
      [0, 10, 11],
      [1, 5, 9],
      [5, 11, 4],
      [11, 10, 2],
      [10, 7, 6],
      [7, 1, 8],
      [3, 9, 4],
      [3, 4, 2],
      [3, 2, 6],
      [3, 6, 8],
      [3, 8, 9],
      [4, 9, 5],
      [2, 4, 11],
      [6, 2, 10],
      [8, 6, 7],
      [9, 8, 1],
    ];
    const midCache = new Map();
    const midpoint = (i, j) => {
      const key = i < j ? i + "," + j : j + "," + i;
      if (midCache.has(key)) return midCache.get(key);
      const a = verts[i],
        b = verts[j];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const L = Math.hypot(...m) || 1;
      const r = s * 0.5;
      const idx = verts.length;
      verts.push([((m[0] / L) * r), ((m[1] / L) * r), ((m[2] / L) * r)]);
      midCache.set(key, idx);
      return idx;
    };
    for (let n = 0; n < subdiv; n++) {
      midCache.clear();
      const next = [];
      for (const [a, b, c] of faces) {
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
      }
      faces = next;
    }
    const tris = [];
    for (const f of faces) tris.push(...tri(verts[f[0]], verts[f[1]], verts[f[2]]));
    const r = s * 0.5;
    return {
      tris,
      analytic: (4 / 3) * Math.PI * r * r * r,
      name: "sphere≈",
    };
  }

  const SHAPES = {
    cube: (s) => cubeMesh(s),
    tetra: (s) => tetraMesh(s),
    octa: (s) => octaMesh(s),
    sphere: (s) => sphereMesh(s, 2),
  };

  Fig.register("divergence-volume", function (el, opts) {
    const cv = Fig.canvas(el, +(opts.height || 300));
    Fig.frame(cv);
    const ctx = cv.ctx;

    let shape = opts.shape || "cube";
    let size = +(opts.size || 1.6);
    let yaw = 38;
    let pitch = 24;

    const shapeKeys = Object.keys(SHAPES);
    const shapeIdx = () => Math.max(0, shapeKeys.indexOf(shape));

    const handles = Fig.controls(
      el,
      [
        {
          key: "shape",
          label: "Mesh",
          min: 0,
          max: shapeKeys.length - 1,
          step: 1,
          value: shapeIdx(),
        },
        {
          key: "size",
          label: "Scale",
          min: 0.6,
          max: 2.4,
          step: 0.05,
          value: size,
        },
        {
          key: "yaw",
          label: "Yaw",
          min: 0,
          max: 360,
          step: 1,
          value: yaw,
        },
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
        if (k === "shape") {
          shape = shapeKeys[Math.round(v)] || "cube";
          if (handles.shape?.input) {
            const out = handles.shape.input.parentElement?.querySelector("output");
            if (out) out.textContent = shape;
          }
        }
        if (k === "size") size = v;
        if (k === "yaw") yaw = v;
        if (k === "pitch") pitch = v;
        draw();
      },
    );
    if (handles.shape?.input) {
      const out = handles.shape.input.parentElement?.querySelector("output");
      if (out) out.textContent = shape;
    }

    const cap = Fig.caption(el, "");

    function project(v) {
      const ry = (yaw * Math.PI) / 180;
      const rp = (pitch * Math.PI) / 180;
      let [x, y, z] = v;
      let x1 = x * Math.cos(ry) + z * Math.sin(ry);
      let z1 = -x * Math.sin(ry) + z * Math.cos(ry);
      let y1 = y * Math.cos(rp) - z1 * Math.sin(rp);
      let z2 = y * Math.sin(rp) + z1 * Math.cos(rp);
      const sc = Math.min(cv.w, cv.h) * 0.28;
      return [cv.w * 0.38 + x1 * sc, cv.h * 0.52 + y1 * sc, z2];
    }

    function faceNormal(a, b, c) {
      const ux = b[0] - a[0],
        uy = b[1] - a[1],
        uz = b[2] - a[2];
      const vx = c[0] - a[0],
        vy = c[1] - a[1],
        vz = c[2] - a[2];
      return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    }

    function draw() {
      const P = Fig.palette();
      const mesh = SHAPES[shape](size);
      const V = meshVolume(mesh.tris);
      const nTri = mesh.tris.length / 3;
      /* 11n FLOPs from the post (8n−1 add + 3n+1 mul ≈ 11n). */
      const flops = 11 * nTri;

      ctx.clearRect(0, 0, cv.w, cv.h);

      /* Soft ground ellipse. */
      ctx.fillStyle = P.wash;
      ctx.beginPath();
      ctx.ellipse(cv.w * 0.38, cv.h * 0.78, cv.w * 0.22, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      const faces = [];
      for (let i = 0; i < mesh.tris.length; i += 3) {
        const a = mesh.tris[i],
          b = mesh.tris[i + 1],
          c = mesh.tris[i + 2];
        const pa = project(a),
          pb = project(b),
          pc = project(c);
        const depth = (pa[2] + pb[2] + pc[2]) / 3;
        const n = faceNormal(a, b, c);
        /* Lighting in view space (simple). */
        const L = Math.hypot(...n) || 1;
        const lit = Math.max(0.15, (n[0] / L) * 0.35 + (n[1] / L) * 0.55 + 0.35);
        faces.push({ pa, pb, pc, depth, lit });
      }
      faces.sort((u, v) => u.depth - v.depth);

      for (const f of faces) {
        ctx.beginPath();
        ctx.moveTo(f.pa[0], f.pa[1]);
        ctx.lineTo(f.pb[0], f.pb[1]);
        ctx.lineTo(f.pc[0], f.pc[1]);
        ctx.closePath();
        ctx.fillStyle = P.accent;
        ctx.globalAlpha = 0.18 + 0.45 * f.lit;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = P.ink;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.55;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* Readout panel. */
      const panelX = cv.w * 0.68;
      const panelY = 28;
      ctx.fillStyle = P.ink;
      ctx.font = '600 12px "Hind", system-ui, sans-serif';
      ctx.fillText(mesh.name, panelX, panelY);
      ctx.font = '400 11px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillStyle = P.mute;
      ctx.fillText(nTri + " triangles", panelX, panelY + 18);
      ctx.fillText("~" + flops + " FLOPs", panelX, panelY + 34);

      ctx.fillStyle = P.ink;
      ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText("V ≈ " + V.toFixed(4), panelX, panelY + 60);
      ctx.fillStyle = P.mute;
      ctx.font = '400 11px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText("exact " + mesh.analytic.toFixed(4), panelX, panelY + 78);
      const err = Math.abs(V - mesh.analytic);
      const rel = err / Math.max(mesh.analytic, 1e-12);
      ctx.fillStyle = rel < 1e-6 ? P.accent : P.ink;
      ctx.fillText(
        rel < 1e-9 ? "err < 1e-9" : "err " + rel.toExponential(2),
        panelX,
        panelY + 96,
      );

      ctx.fillStyle = P.mute;
      ctx.font = '400 10px "Hind", system-ui, sans-serif';
      const formula = "V = ⅙ Σ (Δ₁×Δ₂)ₓ (x₀+x₁+x₂)";
      ctx.fillText(formula, panelX, panelY + 118);

      if (cap) {
        cap.textContent =
          "divergence theorem · F = ⟨x,0,0⟩ · O(n) over triangles — Rosenzweig 2018";
      }
    }

    draw();
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();
