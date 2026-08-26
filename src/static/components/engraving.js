/* engraving.js — copperplate-engraving hatching shader for olivares.cl lab.
   WebGL2, single pass. Luminance gradient steers a flow-guided line family;
   two fixed-angle screens take over in darks (staggered by tone band, so no
   three-screen moiré). Declared as <div data-fig="engraving" data-height="480">. */
(function () {
  Fig.register("engraving", function (el, opts) {
    const boxHeight = parseInt(opts.height, 10) || 480;

    const c = document.createElement("canvas");
    c.style.width = "100%";
    c.style.display = "block";
    el.appendChild(c);

    let gl;
    try {
      gl = c.getContext("webgl2", { antialias: false, alpha: false });
    } catch (e) { /* fall through */ }
    if (!gl) { el.dataset.error = "1"; c.remove(); return; }

    const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

    const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uPeriod;
uniform float uContrast;
uniform float uExposure;
uniform float uCross;
uniform float uWobble;
uniform float uStipple;
uniform vec3  uPaper;
uniform vec3  uInk;
uniform vec3  uLoupe;   // xy = center in px, z = radius in px (0 = off)
uniform float uZoom;

const float TAU = 6.28318530718;
const float PI  = 3.14159265359;

float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float L(vec2 uv){ return luma(texture(uTex, clamp(uv, vec2(0.0015), vec2(0.9985))).rgb); }

float hash(vec2 p){
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i),              hash(i + vec2(1, 0)), f.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}

// blurred luminance tap (5-tap, ~9px radius)
float Lb(vec2 uv, vec2 px){
  vec2 r = px * 9.0;
  return (2.0 * L(uv)
        + L(uv + vec2(r.x, 0.0)) + L(uv - vec2(r.x, 0.0))
        + L(uv + vec2(0.0, r.y)) + L(uv - vec2(0.0, r.y))) / 6.0;
}

// flow field at uv: xyz = (direction tangent to contours, gradient magnitude)
vec3 flowField(vec2 uv, vec2 px){
  vec2 r = px * 10.0;
  vec2 g = vec2(Lb(uv + vec2(r.x, 0.0), px) - Lb(uv - vec2(r.x, 0.0), px),
                Lb(uv + vec2(0.0, r.y), px) - Lb(uv - vec2(0.0, r.y), px));
  float m = length(g);
  vec2 d = (m < 5e-3) ? normalize(vec2(0.77, 0.64)) : vec2(-g.y, g.x) / m;
  return vec3(d, m);
}

// threshold a phase into AA lines; sub-pixel lines fall back to tone
float screen(float phase, float period, float width, vec2 p, float seed){
  phase += uWobble * (vnoise(p / (period * 7.0) + seed * 13.7) - 0.5) * TAU * 0.4;
  float s = abs(sin(phase));
  float th = sin(PI * clamp(width, 0.02, 0.98));
  float fw = max(fwidth(phase), 1e-3);
  float k = clamp(fw * 0.6, 0.02, 0.5);
  float cov = 1.0 - smoothstep(th - k, th + k, s);
  float resolve = clamp(width / max(fw / TAU, 1e-4), 0.0, 1.0);
  return mix(width * 1.6, cov, resolve);
}

// flow-guided family: contour direction blended with a fixed base sweep so
// strokes never close into rings around local extrema; anchored to 64px cells
float hatchFlow(vec2 p, vec2 px, float period, float width, float seed, float contour){
  const float C = 64.0;
  const vec2 BASE = normalize(vec2(0.77, 0.64));
  vec2 g = p / C;
  vec2 ci = floor(g), cf = fract(g);
  cf = cf * cf * (3.0 - 2.0 * cf);
  float phase = 0.0;
  for (int j = 0; j < 2; j++){
    for (int i = 0; i < 2; i++){
      vec2 c = (ci + vec2(float(i), float(j)) + 0.5) * C;
      vec3 f = flowField(c / uRes, px);
      vec2 d = normalize(mix(BASE, f.xy, clamp(f.z * 28.0 * contour, 0.0, 1.0)));
      float w = mix(1.0 - cf.x, cf.x, float(i)) * mix(1.0 - cf.y, cf.y, float(j));
      phase += w * dot(p - c, d);
    }
  }
  return screen(phase / period * TAU, period, width, p, seed);
}

// fixed-angle screen family
float hatchFixed(vec2 p, vec2 dir, float period, float width, float seed){
  return screen(dot(p, dir) / period * TAU, period, width, p, seed);
}

void main(){
  vec2 px = 1.0 / uRes;
  vec2 p = vUv * uRes;
  vec2 pS = p;
  if (uLoupe.z > 0.0){
    vec2 d = p - uLoupe.xy;
    if (dot(d, d) < uLoupe.z * uLoupe.z){
      pS = uLoupe.xy + d / uZoom;   // source pixel under the loupe
    }
  }
  vec2 uvS = pS / uRes;
  float t = clamp(luma(texture(uTex, clamp(uvS, vec2(0.0015), vec2(0.9985))).rgb) * uExposure, 0.0, 1.0);
  t = clamp((t - 0.5) * uContrast + 0.5, 0.0, 1.0);   // 1 = paper, 0 = ink

  float dark = 1.0 - t;

  // family A: contour-following hatching
  float wA = (0.07 + 0.30 * pow(dark, 1.5))
           * smoothstep(0.995, 0.92, t)      // fade to paper at highlights
           * smoothstep(0.22, 0.40, t);      // fixed screens take over in deep shadow
  float cov = hatchFlow(pS, px, uPeriod, wA, 0.0, smoothstep(0.92, 0.55, t));

  // family B: fixed cross screen ~106 deg, mid + dark tones
  if (t < 0.60 && uCross > 0.0){
    vec2 dirB = vec2(cos(1.85), sin(1.85));
    float wB = 0.05 + 0.30 * smoothstep(0.60, 0.10, t);
    cov = max(cov, uCross * hatchFixed(pS + vec2(3.1, 1.7), dirB, uPeriod * 1.15, wB, 7.7));
  }

  // family C: second screen ~15 deg, deep shadows only
  if (t < 0.30 && uCross > 0.0){
    vec2 dirC = vec2(cos(0.26), sin(0.26));
    float wC = 0.04 + 0.30 * smoothstep(0.30, 0.02, t);
    cov = max(cov, uCross * hatchFixed(pS + vec2(-2.3, 4.9), dirC, uPeriod * 1.3, wC, 3.3));
  }

  // stipple grain in midtones (burin roughening)
  if (uStipple > 0.0){
    float band = smoothstep(0.78, 0.42, t) * smoothstep(0.12, 0.34, t);
    float dens = uStipple * band * 0.85;
    float dots = step(1.0 - dens, vnoise(pS / max(uPeriod * 0.85, 1.0) + 41.0));
    cov = max(cov, dots * 0.6 * band);
  }

  float grain = vnoise(pS * 0.9) * 0.05 + vnoise(pS * 0.11) * 0.06;
  vec3 paper = uPaper * (1.0 - grain);
  vec3 ink   = uInk * (0.85 + 0.3 * vnoise(pS * 0.45));
  vec3 col   = mix(paper, ink, clamp(cov, 0.0, 1.0));

  vec2 q = vUv - 0.5;
  col *= 1.0 - 0.22 * dot(q, q);   // plate vignette
  if (uLoupe.z > 0.0){
    float ring = 1.0 - smoothstep(1.0, 3.5, abs(length(p - uLoupe.xy) - uLoupe.z));
    col = mix(col, uInk * 0.9, ring);
  }
  outColor = vec4(col, 1.0);
}`;

    function sh(type, src){
      const o = gl.createShader(type);
      gl.shaderSource(o, src); gl.compileShader(o);
      if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o));
      return o;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const n of ["uTex", "uRes", "uPeriod", "uContrast", "uExposure", "uCross", "uWobble", "uStipple", "uPaper", "uInk", "uLoupe", "uZoom"])
      U[n] = gl.getUniformLocation(prog, n);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const params = { period: 7, contrast: 1.15, exposure: 1.5, cross: 1, wobble: 0.35, stipple: 0.35 };
    let imgW = 1, imgH = 1, texReady = false, queued = false, loupe = [0, 0, 0];

    function fit(){
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = el.clientWidth || 600;
      const s = Math.min(w / imgW, boxHeight / imgH);
      c.width = Math.max(2, Math.round(imgW * s * dpr));
      c.height = Math.max(2, Math.round(imgH * s * dpr));
      c.style.height = Math.round(imgH * s) + "px";
      gl.viewport(0, 0, c.width, c.height);
    }

    function rgb(hex){
      const n = parseInt(hex.replace("#", ""), 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    }

    function render(){
      if (!texReady) return;
      const P = Fig.palette();
      gl.uniform1i(U.uTex, 0);
      gl.uniform2f(U.uRes, c.width, c.height);
      gl.uniform1f(U.uPeriod, params.period);
      gl.uniform1f(U.uContrast, params.contrast);
      gl.uniform1f(U.uExposure, params.exposure);
      gl.uniform1f(U.uCross, params.cross);
      gl.uniform1f(U.uWobble, params.wobble);
      gl.uniform1f(U.uStipple, params.stipple);
      gl.uniform3fv(U.uPaper, rgb(P.paper));
      gl.uniform3fv(U.uInk, rgb(P.ink));
      gl.uniform3fv(U.uLoupe, loupe);
      gl.uniform1f(U.uZoom, 3.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function setImage(source, w, h){
      imgW = w; imgH = h;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      texReady = true;
      fit(); render();
    }

    // self-contained fallback so the figure never ships blank
    function procedural(){
      const off = document.createElement("canvas");
      off.width = 900; off.height = 900;
      const x = off.getContext("2d");
      x.fillStyle = "#202020"; x.fillRect(0, 0, 900, 900);
      const blobs = [[300,320,300,.95],[620,380,240,.8],[450,640,280,.7],[700,700,180,.55],[180,680,160,.5],[520,180,150,.6]];
      for (const [bx, by, r, a] of blobs){
        const g = x.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.05, bx, by, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.7, `rgba(140,140,140,${a * 0.7})`);
        g.addColorStop(1, "rgba(20,20,20,0)");
        x.fillStyle = g; x.beginPath(); x.arc(bx, by, r, 0, 7); x.fill();
      }
      setImage(off, 900, 900);
    }

    function loadURL(url){
      const im = new Image();
      im.onload = () => setImage(im, im.naturalWidth, im.naturalHeight);
      im.onerror = procedural;
      im.src = url;
    }

    new ResizeObserver(() => {
      if (queued || !texReady) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; fit(); render(); });
    }).observe(el);

    // hover loupe: re-evaluates the field at the magnified source point
    c.style.cursor = "crosshair";
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect();
      loupe = [
        (e.clientX - r.left) / r.width * c.width,
        c.height - (e.clientY - r.top) / r.height * c.height,
        Math.min(c.width, c.height) * 0.28,
      ];
      render();
    });
    c.addEventListener("pointerleave", () => { loupe = [0, 0, 0]; render(); });

    Fig.controls(el, [
      { key: "period",   label: "Period",     min: 2.5, max: 14,  step: 0.1,  value: params.period },
      { key: "contrast", label: "Contrast",   min: 0.5, max: 3,   step: 0.05, value: params.contrast },
      { key: "exposure", label: "Exposure",   min: 0.4, max: 2.2, step: 0.05, value: params.exposure },
      { key: "cross",    label: "Cross-hatch", min: 0,  max: 1,   step: 0.05, value: params.cross },
      { key: "wobble",   label: "Wobble",     min: 0,   max: 1,   step: 0.05, value: params.wobble },
      { key: "stipple",  label: "Stipple",    min: 0,   max: 1,   step: 0.05, value: params.stipple },
    ], (k, v) => { params[k] = v; render(); });

    const file = document.createElement("input");
    file.type = "file"; file.accept = "image/*"; file.style.display = "none";
    file.addEventListener("change", () => {
      const f = file.files[0];
      if (!f) return;
      const im = new Image();
      im.onload = () => setImage(im, im.naturalWidth, im.naturalHeight);
      im.src = URL.createObjectURL(f);
    });
    el.appendChild(file);
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    btnRow.appendChild(Fig.chip("Load image…", () => file.click()));
    el.appendChild(btnRow);

    Fig.caption(el, "flow-guided hatching · hover to zoom · WebGL2, single pass");

    loadURL("/static/images/engraving-rembrandt.jpg");
    Fig.onScheme(render);
  });
})();
