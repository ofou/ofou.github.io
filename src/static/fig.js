/* fig.js — bare-WebGL interactive figures for olivares.cl
   Point-cloud figures, palette read from CSS custom properties.
   Declarative: <figure class="fig3d"><canvas data-shape="sphere"
   data-morph-to="torus"></canvas><input type="range" ...></figure> */
(() => {
  const VERT = `
attribute vec3 a;
attribute vec3 b;
attribute float h;
uniform mat4 m, pr;
uniform float mixv, dpr;
varying float vh;
void main() {
  vec3 p = mix(a, b, mixv);
  gl_Position = pr * m * vec4(p, 1.0);
  gl_PointSize = 2.4 * dpr;
  vh = h;
}`;
  const FRAG = `
precision mediump float;
varying float vh;
uniform vec3 ink, accent;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  if (dot(c, c) > 0.25) discard;
  gl_FragColor = vec4(mix(ink, accent, vh), 0.92);
}`;

  /* ---------- parametric shapes, N points each ---------- */
  const SHAPES = {
    sphere(N) {
      const o = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        const y = 1 - (2 * i) / (N - 1), r = Math.sqrt(1 - y * y), t = i * 2.399963;
        o[i*3] = Math.cos(t) * r * 1.05; o[i*3+1] = y * 1.05; o[i*3+2] = Math.sin(t) * r * 1.05;
      }
      return o;
    },
    torus(N) {
      const o = new Float32Array(N * 3), R = 0.78, r = 0.32;
      for (let i = 0; i < N; i++) {
        const u = Math.random() * 6.2832, v = Math.random() * 6.2832;
        o[i*3] = (R + r * Math.cos(v)) * Math.cos(u);
        o[i*3+1] = r * Math.sin(v);
        o[i*3+2] = (R + r * Math.cos(v)) * Math.sin(u);
      }
      return o;
    },
    helix(N) {
      const o = new Float32Array(N * 3), TURNS = 2.5, H = 2.5, R = 0.62;
      for (let i = 0; i < N; i++) {
        const t = (i / (N - 1)) * TURNS * 6.2832;
        const jx = (Math.random() - .5) * .16, jy = (Math.random() - .5) * .16, jz = (Math.random() - .5) * .16;
        o[i*3] = Math.cos(t) * R + jx;
        o[i*3+1] = (i / (N - 1)) * H - H / 2 + jy;
        o[i*3+2] = Math.sin(t) * R + jz;
      }
      return o;
    }
  };


  /* ---------- tiny mat4 / quat ---------- */
  const persp = (fov, asp, n, f) => {
    const t = 1 / Math.tan(fov / 2), r = 1 / (n - f);
    return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)*r,-1, 0,0,2*f*n*r,0]);
  };
  const qmul = (a, b) => {
    const [ax,ay,az,aw] = a, [bx,by,bz,bw] = b;
    return [aw*bx+ax*bw+ay*bz-az*by, aw*by-ax*bz+ay*bw+az*bx,
            aw*bz+ax*by-ay*bx+az*bw, aw*bw-ax*bx-ay*by-az*bz];
  };
  const qaxis = (ax, ay, az, ang) => {
    const s = Math.sin(ang / 2), L = Math.hypot(ax, ay, az) || 1;
    return [ax/L*s, ay/L*s, az/L*s, Math.cos(ang / 2)];
  };
  const qnorm = q => { const L = Math.hypot(...q) || 1; return q.map(v => v / L); };
  const qmat = q => {
    const [x, y, z, w] = q;
    return new Float32Array([
      1-2*y*y-2*z*z, 2*x*y+2*z*w, 2*x*z-2*y*w, 0,
      2*x*y-2*z*w, 1-2*x*x-2*z*z, 2*y*z+2*x*w, 0,
      2*x*z+2*y*w, 2*y*z-2*x*w, 1-2*x*x-2*y*y, 0,
      0, 0, 0, 1
    ]);
  };
  const hex = x => { x = x.trim(); const n = parseInt(x.slice(1), 16); return [(n>>16&255)/255, (n>>8&255)/255, (n&255)/255]; };

  function init(fig) {
    const cv = fig.querySelector("canvas[data-shape]");
    if (!cv) return;
    let gl = null;
    try {
      gl = cv.getContext("webgl", { antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch (e) { console.error("fig.js context:", e); }
    if (!gl) { fig.dataset.error = "1"; console.error("fig.js: no WebGL context"); return; }

    const sh = (t, s) => {
      const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    };
    let pr = null;
    try {
      pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(pr) || "link failed");
    } catch (e) {
      console.error("fig.js program:", e);
      fig.dataset.error = "1";
      return;
    }
    gl.useProgram(pr);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const N = 4200;
    const shapeA = (SHAPES[cv.dataset.shape] || SHAPES.sphere)(N);
    const shapeB = cv.dataset.morphTo ? (SHAPES[cv.dataset.morphTo] || SHAPES[cv.dataset.shape])(N) : shapeA;
    const hi = new Float32Array(N);
    for (let i = 0; i < N; i += 13) hi[i] = 1;

    const mkBuf = d => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW); return b; };
    const attr = (name, buf) => {
      const l = gl.getAttribLocation(pr, name);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, name === "h" ? 1 : 3, gl.FLOAT, false, 0, 0);
      return l;
    };
    attr("a", mkBuf(shapeA));
    attr("b", mkBuf(shapeB));
    attr("h", mkBuf(hi));

    const U = n => gl.getUniformLocation(pr, n);
    const uM = U("m"), uPr = U("pr"), uMix = U("mixv"), uDpr = U("dpr"),
          uInk = U("ink"), uAcc = U("accent");
    gl.uniform1f(uMix, 0);

    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dpr = 1, q = qaxis(0.3, 1, 0.15, 0.7), mixCur = 0, mixTarget = 0, raf = 0;

    const slider = fig.querySelector("input[type=range]");
    if (slider && cv.dataset.morphTo)
      slider.addEventListener("input", () => { mixTarget = slider.value / 1000; wake(); });

    const size = () => {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      cv.width = cv.clientWidth * dpr || 300 * dpr;
      cv.height = (cv.clientHeight || 320) * dpr;
      gl.viewport(0, 0, cv.width, cv.height);
    };

    const draw = () => {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const s = getComputedStyle(document.documentElement);
      gl.uniform3fv(uInk, hex(s.getPropertyValue("--ink")));
      gl.uniform3fv(uAcc, hex(s.getPropertyValue("--accent")));
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uMix, mixCur);
      const P = persp(0.9, cv.width / cv.height, 0.1, 20);
      const M = qmat(q);
      M[14] = -3.0;
      gl.uniformMatrix4fv(uPr, false, P);
      gl.uniformMatrix4fv(uM, false, M);
      gl.drawArrays(gl.POINTS, 0, N);
    };
    const step = () => {
      mixCur += (mixTarget - mixCur) * 0.08;
      if (!reduced) {
        q = qnorm(qmul(qaxis(0, 1, 0, 0.0022), q));
      }
      draw();
      raf = requestAnimationFrame(step);
    };
    const wake = () => { cancelAnimationFrame(raf); if (!reduced) raf = requestAnimationFrame(step); else draw(); };

    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { size(); draw(); });
    size();
    wake();
  }

  const boot = () => document.querySelectorAll(".fig3d").forEach(init);
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
