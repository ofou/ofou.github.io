/* menu.js — right-side dropdown with a WebGL dot-sweep reveal.
   No-JS fallback: the inline nav stays in the header. */
(() => {
  const btn = document.getElementById("menu-btn");
  const panel = document.getElementById("site-menu");
  if (!btn || !panel) return;

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  document.body.appendChild(backdrop);

  let open = false, glRaf = 0, glStart = 0;

  function setOpen(v) {
    open = v;
    btn.setAttribute("aria-expanded", String(v));
    panel.classList.toggle("open", v);
    backdrop.classList.toggle("show", v);
    document.body.style.overflow = v ? "hidden" : "";
    if (v && !reduced) startGL();
    else stopGL();
  }

  btn.addEventListener("click", () => setOpen(!open));
  backdrop.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", e => { if (e.target.closest("a")) setOpen(false); });
  addEventListener("keydown", e => { if (e.key === "Escape" && open) setOpen(false); });

  /* ---------- GL dot-sweep: a phosphor dot-curtain dissolves
     right-to-left across the panel as it slides in ---------- */
  let gl = null, glCanvas = null;

  function startGL() {
    stopGL();
    glCanvas = document.createElement("canvas");
    glCanvas.className = "menu-gl";
    panel.prepend(glCanvas);
    gl = glCanvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: true });
    if (!gl) { glCanvas.remove(); glCanvas = null; return; }

    const V = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const F = `precision mediump float;
uniform vec2 u_res;uniform float u_time,u_prog,u_dpr;
uniform vec3 u_ink,u_accent,u_paper;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  float edge=1.0-u_prog;
  float d=uv.x-edge;
  vec3 col=u_paper;
  float a=0.0;
  if(d>0.0){
    vec2 g=6.0*u_dpr;
    vec2 id=floor(gl_FragCoord.xy/g);
    vec2 f=fract(gl_FragCoord.xy/g)-0.5;
    float n=hash(id);
    float r=(0.8+0.9*n)*u_dpr;
    float dotm=smoothstep(r,r-0.8*u_dpr,length(f));
    float fade=clamp(d/0.35,0.0,1.0);
    a=dotm*(0.55-fade*0.4);
    col=u_ink;
    if(d<0.06) { col=u_accent; a=0.8*(1.0-d/0.06); }
  }
  gl_FragColor=vec4(col*a,a);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, V));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, F));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { glCanvas.remove(); glCanvas = null; return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = n => gl.getUniformLocation(pr, n);

    const dpr = Math.min(devicePixelRatio || 1, 2);
    glCanvas.width = panel.clientWidth * dpr;
    glCanvas.height = panel.clientHeight * dpr;
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
    const ink = hexRGB(getComputedStyle(document.documentElement).getPropertyValue("--ink"));
    const accent = hexRGB(getComputedStyle(document.documentElement).getPropertyValue("--accent"));
    const paper = hexRGB(getComputedStyle(document.documentElement).getPropertyValue("--paper"));
    gl.uniform3fv(U("u_ink"), ink);
    gl.uniform3fv(U("u_accent"), accent);
    gl.uniform3fv(U("u_paper"), paper);
    gl.uniform2f(U("u_res"), glCanvas.width, glCanvas.height);
    gl.uniform1f(U("u_dpr"), dpr);

    glStart = performance.now();
    const DUR = 620;
    const frame = now => {
      if (!open || !glCanvas) return;
      const x = Math.min(1, (now - glStart) / DUR);
      const p = 1 - Math.pow(1 - x, 3);
      gl.uniform1f(U("u_prog"), p);
      gl.uniform1f(U("u_time"), now / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (x < 1) {
        glRaf = requestAnimationFrame(frame);
      } else {
        glCanvas.style.transition = "opacity 0.25s ease";
        glCanvas.style.opacity = "0";
        setTimeout(stopGL, 280);
      }
    };
    glRaf = requestAnimationFrame(frame);
  }

  function stopGL() {
    cancelAnimationFrame(glRaf);
    if (glCanvas) { glCanvas.remove(); glCanvas = null; }
  }

  function hexRGB(x) {
    x = x.trim();
    const n = parseInt(x.slice(1), 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }
})();
