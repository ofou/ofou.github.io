(function () {
  Fig.register("crt-terminal", function (el, opts) {
    /* ---------- text layer (offscreen 2D) ---------- */
    const off = document.createElement("canvas");
    off.width = 640; off.height = 400;
    const o = off.getContext("2d");
    const GREEN = "#3dff7c", DIM = "#1a3d2a", BG = "#0c1310";

    const script = [
      "omar@olivares:~$ ls",
      "blog        projects     cv",
      "lab         fig.js       menu.js",
      "explainables/           components/",
      "omar@olivares:~$ "
    ];

    const cv = Fig.canvas(el, +opts.height || 340);
    Fig.frame(cv);
    const gl = cv.el.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) {
      /* graceful fallback: plain 2D terminal, no CRT fx */
      el.appendChild(off);
      off.style.width = "100%";
      cv.el.remove();
      return;
    }

    /* ---------- WebGL CRT post-process ---------- */
    const V = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
    const F = `precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;uniform float u_time;
float hash(float n){return fract(sin(n)*43758.5453);}
void main(){
  vec2 uv=gl_FragCoord.xy/u_res;
  /* barrel curvature */
  vec2 c=uv*2.0-1.0;
  c*=1.0+0.045*dot(c,c);
  uv=c*0.5+0.5;
  vec3 col=vec3(0.0);
  if(uv.x>0.002&&uv.x<0.998&&uv.y>0.002&&uv.y<0.998){
    col=texture2D(u_tex,uv).rgb;
    /* phosphor bloom: 4-tap blur added */
    vec2 px=vec2(1.5)/u_res;
    vec3 bloom=texture2D(u_tex,uv+px).rgb+texture2D(u_tex,uv-px).rgb
              +texture2D(u_tex,uv+px.yx).rgb+texture2D(u_tex,uv-px.yx).rgb;
    col+=bloom*0.14;
    /* scanlines */
    col*=0.82+0.18*sin(uv.y*u_res.y*3.14159);
    /* aperture grille */
    col*=0.94+0.06*sin(uv.x*u_res.x*3.14159);
    /* rolling band */
    col*=1.0+0.035*sin(uv.y*7.0-u_time*0.7);
    /* flicker */
    col*=1.0+0.02*(hash(floor(u_time*24.0))-0.5);
    /* vignette */
    float v=pow(16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y),0.35);
    col*=v;
  }
  gl_FragColor=vec4(col,1.0);
}`;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, V));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, F));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.error("[crt]", gl.getProgramInfoLog(pr)); return; }
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const U = n => gl.getUniformLocation(pr, n);
    const uRes = U("u_res"), uTime = U("u_time");

    /* ---------- typewriter ---------- */
    const full = script.join("\n");
    let shown = 0, lastChar = 0, pauseUntil = 0;
    function drawOff(now) {
      o.fillStyle = BG; o.fillRect(0, 0, off.width, off.height);
      o.font = "bold 21px ui-monospace, Menlo, Consolas, monospace";
      o.textBaseline = "top";
      o.shadowColor = GREEN; o.shadowBlur = 6;
      const lines = full.slice(0, shown).split("\n");
      lines.forEach((ln, i) => {
        o.fillStyle = GREEN;
        o.fillText(ln, 36, 34 + i * 34);
      });
      /* blinking block cursor on the last line */
      const lastY = 34 + (lines.length - 1) * 34;
      const lastW = o.measureText(lines[lines.length - 1]).width;
      if (Math.floor(now / 530) % 2 === 0) {
        o.fillStyle = GREEN;
        o.fillRect(38 + lastW, lastY + 2, 13, 22);
      }
      o.shadowBlur = 0;
    }

    const reduced = Fig.reduced();
    let raf = 0, last = 0;
    const frame = now => {
      if (now - last > (shown < full.length ? 34 : 90)) {
        last = now;
        if (shown < full.length) {
          if (now > pauseUntil) shown++;
          /* pause at end of each line, longer at the end of the script */
          if (full[shown - 1] === "\n") pauseUntil = now + 420;
        } else if (now > pauseUntil + 2600) {
          shown = 0; pauseUntil = now + 300;
        }
        drawOff(now);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off);
        gl.uniform1i(U("u_tex"), 0);
      }
      gl.uniform1f(uTime, now / 1000);
      gl.uniform2f(uRes, cv.el.width, cv.el.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!Fig.reduced()) raf = requestAnimationFrame(frame);
      else { drawOff(now); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, off); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }
    };
    const size = () => {
      cv.el.width = cv.w * cv.dpr; cv.el.height = cv.h * cv.dpr;
      gl.viewport(0, 0, cv.el.width, cv.el.height);
      gl.uniform2f(uRes, cv.el.width, cv.el.height);
    };
    addEventListener("resize", () => { size(); });
    size();
    raf = requestAnimationFrame(frame);
  });
})();
