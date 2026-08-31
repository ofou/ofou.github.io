/* footer-aurora.js — lean full-bleed ambient wash; rays | fluid | smoke.
   Opt-in via ?aurora=, localStorage, picker, or keys 1/2/3. Default: off. */
(() => {
  if (!document.querySelector("footer.site")) return;

  const MODES = ["rays", "fluid", "smoke"];
  const MAX_DPR = 1.25;


  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const mqDark = matchMedia("(prefers-color-scheme: dark)");

  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("aurora");
  const fromStore = (() => {
    try {
      return localStorage.getItem("aurora-mode");
    } catch (_) {
      return null;
    }
  })();
  /* Off unless URL, stored preference, or later picker/key opt-in. */
  let mode = MODES.includes(fromUrl)
    ? fromUrl
    : MODES.includes(fromStore)
      ? fromStore
      : null;

  const canvas = document.createElement("canvas");
  canvas.className = "footer-aurora";
  canvas.setAttribute("aria-hidden", "true");
  if (!mode) canvas.hidden = true;
  document.body.insertBefore(canvas, document.body.firstChild);

  let gl = null;
  let programs = {};
  let prog = null;
  let buf = null;
  let uTime = null;
  let uDark = null;
  let uMotion = null;
  let uAccent = null;
  let uScroll = null;

  let raf = 0;
  let visible = true;
  let t0 = performance.now();
  let accent = [0.18, 0.31, 0.63];
  let scrollY = window.scrollY || document.documentElement.scrollTop || 0;
  let flow = 0;
  let phase = 0;
  let lastTickT = performance.now();

  const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const COMMON = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform float uTime;
uniform float uDark;
uniform float uMotion;
uniform vec3 uAccent;
uniform vec2 uScroll;

vec3 brandSpectrum(float w) {
  w = fract(w);
  vec3 violet = vec3(0.5, 0.34, 0.94);
  vec3 azure  = mix(uAccent, vec3(0.3, 0.55, 1.0), 0.5);
  vec3 mid    = uAccent;
  vec3 teal   = mix(uAccent, vec3(0.06, 0.76, 0.7), 0.5);
  vec3 amber  = vec3(0.98, 0.64, 0.28);
  vec3 rose   = vec3(0.94, 0.4, 0.5);
  vec3 c = mix(violet, azure, smoothstep(0.0, 0.24, w));
  c = mix(c, mid,   smoothstep(0.16, 0.42, w));
  c = mix(c, teal,  smoothstep(0.34, 0.56, w));
  c = mix(c, amber, smoothstep(0.5, 0.76, w));
  c = mix(c, rose,  smoothstep(0.72, 1.0, w));
  float sat = mix(1.15, 1.1, uDark);
  float val = mix(1.0, 1.15, uDark);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  return clamp((c - luma) * sat + luma, 0.0, 1.0) * val;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * noise(p);
    p = p * 2.01 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

/* Soft vertical fade — stronger near the bottom. */
float wash(float y) {
  return pow(1.0 - y, 0.95) * mix(0.62, 1.0, smoothstep(1.0, 0.12, y));
}
`;

  /* Soft godrays from below. */
  const FRAG_RAYS =
    COMMON +
    `
void main() {
  float t = uTime * uMotion;
  float flow = uScroll.x * uMotion;
  float phase = uScroll.y * 0.35;
  float x = vUv.x;
  float y = vUv.y;
  float depth = pow(1.0 - y, 1.05);

  float sway = 0.1 * sin(t * 0.19 + phase * 0.3);
  vec2 origin = vec2(0.5 + 0.03 * sin(t * 0.13) + flow * 0.02 * depth, -0.16);
  vec2 d = vec2((x - origin.x) * 1.5, y - origin.y);
  float ang = atan(d.x, max(d.y, 0.001));
  float dist = length(d);
  float off = ang - sway;

  float beam = exp(-pow(abs(off) / 0.5, 1.3));
  beam *= exp(-max(dist - 0.1, 0.0) * 0.7);
  beam *= 0.62 + 0.38 * (0.5 + 0.5 * sin(ang * 5.2 + t * 0.02));

  float hue = clamp(0.12 + off * 0.35 + dist * 0.18 + phase * 0.05, 0.06, 0.92);
  vec3 col = brandSpectrum(hue);
  col = mix(col, vec3(1.0), exp(-dist * 2.2) * exp(-pow(off / 0.24, 2.0)) * 0.45);

  float a = wash(y) * (0.2 + 0.8 * beam) * mix(0.72, 0.8, uDark);
  col += (hash(gl_FragCoord.xy) - 0.5) / 220.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.4) * a, a);
}`;

  /* Curl-advected oily film. */
  const FRAG_FLUID =
    COMMON +
    `
void main() {
  float t = uTime * uMotion;
  float flow = uScroll.x * uMotion;
  float phase = uScroll.y;
  float x = vUv.x;
  float y = vUv.y;
  float depth = pow(1.0 - y, 1.15);

  vec2 uv = vec2(x, y);
  uv.x += phase * 0.09 * depth + flow * 0.1 * depth;

  /* Cheap curl via finite differences on fbm. */
  float e = 0.02;
  float c0 = fbm(uv * 1.55 + vec2(phase * 0.35, t * 0.03));
  vec2 curl = vec2(
    fbm(uv * 1.55 + vec2(phase * 0.35, t * 0.03) + vec2(0.0, e)) - c0,
    -(fbm(uv * 1.55 + vec2(phase * 0.35, t * 0.03) + vec2(e, 0.0)) - c0)
  ) * 14.0;
  uv += curl * (0.012 + 0.008 * depth);

  float film =
    0.5 * sin(uv.x * 4.2 + uv.y * 2.5 + phase * 0.85 + t * 0.26) +
    0.3 * sin(uv.x * 7.4 - uv.y * 3.8 - phase * 0.5) +
    0.2 * (fbm(uv * 2.1 + phase * 0.3) * 2.0 - 1.0);

  float hue = clamp(0.14 + 0.55 * uv.x + 0.1 * uv.y + 0.12 * film + phase * 0.04, 0.08, 0.88);
  vec3 col = brandSpectrum(hue);
  col = mix(col, brandSpectrum(clamp(hue + 0.08 * film, 0.08, 0.88)), 0.35);

  float swirl = 0.52 + 0.48 * (0.5 + 0.5 * film);
  float a = wash(y) * mix(0.55, 1.0, exp(-y * 1.1)) * swirl * mix(0.75, 0.68, uDark);
  a *= 1.0 + 0.1 * abs(flow) * depth;

  col += (hash(gl_FragCoord.xy) - 0.5) / 220.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.35) * a, a);
}`;

  /* Soft rising plume — 2D noise wash, not a volume march. */
  const FRAG_SMOKE =
    COMMON +
    `
void main() {
  float t = uTime * uMotion;
  float flow = uScroll.x * uMotion;
  float phase = uScroll.y;
  float x = vUv.x;
  float y = vUv.y;

  if (y > 0.62) {
    gl_FragColor = vec4(0.0);
    return;
  }

  float blast = 0.4 + 0.35 * (0.5 + 0.5 * sin(t * 0.18 + phase * 0.12));
  blast += clamp(abs(flow) * 0.08, 0.0, 0.12);

  vec2 p = vec2(x - 0.5, y - 0.02);
  p.x -= flow * 0.04;
  float r = length(p * vec2(1.15, 0.9));
  float shell = exp(-pow((r - blast * 0.45) / 0.14, 2.0));
  float core = pow(1.0 - smoothstep(0.0, blast * 0.55, r), 1.6) * 0.35;

  vec2 w = p * 3.2 + vec2(phase * 0.2, -t * 0.08);
  float n = fbm(w);
  float ridge = pow(clamp(1.0 - abs(n * 2.0 - 1.0), 0.0, 1.0), 2.2);
  float dens = (shell * 1.2 + core) * pow(max(ridge - 0.25, 0.0), 1.2) * 2.2;
  dens *= smoothstep(0.0, 0.12, y) * smoothstep(0.62, 0.28, y);

  float heat = clamp(1.0 - r / max(blast * 0.9, 0.15), 0.0, 1.0);
  float hue = clamp(0.12 + 0.55 * heat + 0.25 * (x - 0.5) + phase * 0.05, 0.06, 0.92);
  vec3 col = brandSpectrum(hue);
  col = mix(col, brandSpectrum(hue + 0.1), 0.35 * heat);
  col *= 0.7 + 0.9 * heat;

  float a = dens * wash(y) * mix(0.85, 1.0, uDark);
  a = clamp(a, 0.0, 0.9);
  col += (hash(gl_FragCoord.xy) - 0.5) / 200.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.5) * a, a);
}`;

  const FRAGS = { rays: FRAG_RAYS, fluid: FRAG_FLUID, smoke: FRAG_SMOKE };

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("footer-aurora: shader", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };

  const linkProgram = (fsSrc) => {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, fsSrc);
    if (!vs || !fs) return null;
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("footer-aurora: link", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  };

  const bindModeUniforms = (p) => {
    uTime = gl.getUniformLocation(p, "uTime");
    uDark = gl.getUniformLocation(p, "uDark");
    uMotion = gl.getUniformLocation(p, "uMotion");
    uAccent = gl.getUniformLocation(p, "uAccent");
    uScroll = gl.getUniformLocation(p, "uScroll");
  };

  const useProgram = (name) => {
    prog = programs[name];
    if (!prog) return false;
    bindModeUniforms(prog);
    return true;
  };

  const initGl = () => {
    try {
      gl = canvas.getContext("webgl", {
        alpha: true,
        antialias: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
      });
    } catch (_) {
      gl = null;
    }
    if (!gl) return false;

    programs = {};
    for (const m of MODES) {
      const p = linkProgram(FRAGS[m]);
      if (!p) return false;
      programs[m] = p;
    }

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    if (mode) return useProgram(mode);
    prog = null;
    return true;
  };

  const readAccent = () => {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim();
    const m = raw.match(/^#([0-9a-f]{6})$/i);
    if (!m) return;
    const n = parseInt(m[1], 16);
    accent = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round((window.innerWidth || 1) * dpr));
    const h = Math.max(1, Math.round((window.innerHeight || 1) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, w, h);
  };

  const stepScroll = (now) => {
    const dt = Math.min(Math.max((now - lastTickT) / 1000, 0.001), 0.05);
    lastTickT = now;
    if (mqReduced.matches) {
      flow = 0;
      return;
    }
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const dy = y - scrollY;
    scrollY = y;
    const vh = Math.max(window.innerHeight || 1, 1);
    const soft = Math.max(-2.6, Math.min(2.6, (dy / vh / dt) * 0.6));
    flow += (soft - flow) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(dy) < 0.1) flow *= Math.exp(-dt * 1.5);
    if (Math.abs(flow) < 0.001) flow = 0;
    const gain = mode === "fluid" ? 2.0 : mode === "smoke" ? 1.2 : 0.7;
    phase += flow * dt * gain;
    phase *= Math.exp(-dt * (mode === "fluid" ? 0.1 : 0.2));
  };

  const draw = (now) => {
    if (!gl || gl.isContextLost() || !prog) return;
    stepScroll(now);
    resize();
    const t = (now - t0) * 0.001;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const loc = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uDark, mqDark.matches ? 1 : 0);
    gl.uniform1f(uMotion, mqReduced.matches ? 0 : 1);
    gl.uniform3f(uAccent, accent[0], accent[1], accent[2]);
    gl.uniform2f(uScroll, flow, phase);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const tick = (now) => {
    draw(now);
    if (!mqReduced.matches && visible && !document.hidden) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  };

  const start = () => {
    if (!mode || document.hidden || !gl || gl.isContextLost()) return;
    visible = true;
    canvas.hidden = false;
    lastTickT = performance.now();
    if (mqReduced.matches) {
      draw(performance.now());
      return;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const compare = document.createElement("div");
  compare.className = "aurora-compare";
  compare.setAttribute("role", "group");
  compare.setAttribute("aria-label", "Aurora mode");
  const compareBtns = {};
  for (const m of MODES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mode = m;
    btn.textContent = m;
    btn.setAttribute("aria-pressed", m === mode ? "true" : "false");
    compare.appendChild(btn);
    compareBtns[m] = btn;
  }
  document.body.appendChild(compare);

  const setMode = (next) => {
    if (!MODES.includes(next) || next === mode) return;
    const wasOff = !mode;
    mode = next;
    for (const m of MODES) {
      compareBtns[m].setAttribute("aria-pressed", m === mode ? "true" : "false");
    }
    try {
      localStorage.setItem("aurora-mode", mode);
    } catch (_) {}
    const url = new URL(location.href);
    url.searchParams.set("aurora", mode);
    history.replaceState(null, "", url);
    if (!gl || !useProgram(mode)) return;
    canvas.hidden = false;
    draw(performance.now());
    if (wasOff) start();
  };

  compare.addEventListener("click", (e) => {
    const m = e.target?.dataset?.mode;
    if (m) setMode(m);
  });
  window.addEventListener("keydown", (e) => {
    if (e.target?.matches?.("input, textarea, select, [contenteditable=true]")) return;
    const next = { 1: "rays", 2: "fluid", 3: "smoke" }[e.key];
    if (next) setMode(next);
  });

  if (!initGl()) {
    canvas.remove();
    compare.remove();
    return;
  }

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    stop();
  });
  canvas.addEventListener("webglcontextrestored", () => {
    if (!initGl()) return;
    t0 = performance.now();
    readAccent();
    if (mode) start();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (mode) start();
  });
  window.addEventListener(
    "resize",
    () => {
      if (mode && visible) draw(performance.now());
    },
    { passive: true },
  );
  mqReduced.addEventListener?.("change", () => {
    flow = 0;
    phase = 0;
    stop();
    if (mode) start();
  });
  mqDark.addEventListener?.("change", () => {
    readAccent();
    if (mode) draw(performance.now());
  });

  readAccent();
  if (mode) {
    const url = new URL(location.href);
    if (url.searchParams.get("aurora") !== mode) {
      url.searchParams.set("aurora", mode);
      history.replaceState(null, "", url);
    }
  }


  if (mode) {
    draw(performance.now());
    start();
  }
})();
