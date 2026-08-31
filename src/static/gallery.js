/* gallery.js — plate gallery + optional plate fade-in for olivares.cl.
   Scroll-snap owns the track; this wires dots, prev/next, caption sync,
   keyboard, .plate-reveal, and a Hilbert-curve WebGL slide reveal.
   Respects prefers-reduced-motion; falls back to instant cut without GL. */
(() => {
  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => mqReduced.matches;

  /* Hilbert order map side (power of 2). Plate textures upload at
     display-canvas resolution so the wipe matches the CSS plates. */
  const ORDER_TEX = 512;
  const DURATION_MS = 780;
  const SOFT = 0.028;

  function initReveal() {
    const nodes = document.querySelectorAll(".plate-reveal");
    if (!nodes.length) return;
    if (reduced() || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-revealed");
          io.unobserve(e.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    nodes.forEach((el) => io.observe(el));
  }

  function slideCaption(slide) {
    const nest = slide.querySelector(".gallery-slide-caption");
    if (nest) return nest.innerHTML.trim();
    return (slide.getAttribute("data-caption") || "").trim();
  }

  function slideImg(slide) {
    return slide.querySelector("img");
  }

  /* Off-screen carousel slides stay unloaded under loading=lazy, which
     starves the Hilbert wipe (naturalWidth 0 → useGl false → instant cut). */
  function ensureImgLoading(img) {
    if (!img) return;
    if (img.loading === "lazy") img.loading = "eager";
  }

  function imgReady(img) {
    if (!img) return Promise.resolve(false);
    ensureImgLoading(img);
    /* complete with naturalWidth 0 means decode failed — don't wait forever. */
    if (img.complete) return Promise.resolve(img.naturalWidth > 0);
    return new Promise((resolve) => {
      const done = (ok) => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onErr);
        resolve(ok);
      };
      const onLoad = () => done(img.naturalWidth > 0);
      const onErr = () => done(false);
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onErr);
      /* Kick decode for lazy→eager flips that some engines leave pending. */
      if (typeof img.decode === "function") {
        img.decode().then(() => done(img.naturalWidth > 0)).catch(() => {});
      }
    });
  }

  /* ---------- Hilbert order map (xy → normalised curve progress) ---------- */
  function hilbertRot(n, x, y, rx, ry) {
    if (ry === 0) {
      if (rx === 1) {
        x = n - 1 - x;
        y = n - 1 - y;
      }
      return [y, x];
    }
    return [x, y];
  }

  function hilbertXy2d(n, x, y) {
    let d = 0;
    for (let s = n >>> 1; s > 0; s >>>= 1) {
      const rx = (x & s) > 0 ? 1 : 0;
      const ry = (y & s) > 0 ? 1 : 0;
      d += s * s * ((3 * rx) ^ ry);
      const r = hilbertRot(s, x, y, rx, ry);
      x = r[0];
      y = r[1];
    }
    return d;
  }

  function buildOrderMap(n) {
    const total = n * n;
    const data = new Uint8Array(total);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        data[y * n + x] = Math.min(255, Math.floor((hilbertXy2d(n, x, y) / total) * 255));
      }
    }
    return data;
  }

  /* Contain-fit source into tw×th (letterbox with wash). Scale hits
     max-width or max-height first — same rule as object-fit: contain. */
  function drawContain(ctx, img, tw, th, wash) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return false;
    const scale = Math.min(tw / iw, th / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (tw - dw) * 0.5;
    const dy = (th - dh) * 0.5;
    ctx.fillStyle = wash || "#ecebe5";
    ctx.fillRect(0, 0, tw, th);
    ctx.drawImage(img, 0, 0, iw, ih, dx, dy, dw, dh);
    return true;
  }

  function cssRgb(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function hexToRgb01(hex) {
    hex = (hex || "").trim();
    if (!hex.startsWith("#")) return [0.925, 0.922, 0.898]; /* --wash fallback */
    const n = parseInt(hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`.slice(1)
      : hex.slice(1), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  /* ---------- WebGL1 Hilbert reveal (one context per gallery) ---------- */
  function createGlReveal(viewport) {
    let canvas = viewport.querySelector("canvas.gallery-gl");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "gallery-gl";
      canvas.setAttribute("aria-hidden", "true");
      viewport.prepend(canvas);
    }

    let gl = null;
    try {
      gl = canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
    } catch (_) {
      /* fall through */
    }
    if (!gl) {
      canvas.remove();
      return null;
    }

    const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;
    const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform sampler2D uOrder;
uniform float uProgress;
uniform float uSoft;
uniform vec3 uWash;
void main() {
  vec2 uv = vUv;
  float o = texture2D(uOrder, uv).r;
  /* Pixels whose Hilbert rank is below progress show the incoming plate.
     Soft band reads as a write-head with slight persistence. */
  float edge = uSoft > 0.0 ? uSoft : 0.001;
  float m = 1.0 - smoothstep(uProgress - edge, uProgress + edge, o);
  vec4 a = texture2D(uFrom, uv);
  vec4 b = texture2D(uTo, uv);
  vec3 col = mix(a.rgb, b.rgb, m);
  /* Wash peek only if a sample is empty (failed upload). */
  col = mix(uWash, col, max(a.a, b.a));
  gl_FragColor = vec4(col, 1.0);
}`;

    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        gl.deleteShader(s);
        return null;
      }
      return s;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.remove();
      return null;
    }
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      canvas.remove();
      return null;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uFrom = gl.getUniformLocation(prog, "uFrom");
    const uTo = gl.getUniformLocation(prog, "uTo");
    const uOrder = gl.getUniformLocation(prog, "uOrder");
    const uProgress = gl.getUniformLocation(prog, "uProgress");
    const uSoft = gl.getUniformLocation(prog, "uSoft");
    const uWash = gl.getUniformLocation(prog, "uWash");

    const mkTex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };

    const texFrom = mkTex();
    const texTo = mkTex();
    const texOrder = mkTex();

    const orderData = buildOrderMap(ORDER_TEX);
    gl.bindTexture(gl.TEXTURE_2D, texOrder);
    /* Flip Y so Hilbert ranks share the same origin as contain-fitted
       plate textures (those upload with UNPACK_FLIP_Y_WEBGL = 1). */
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.LUMINANCE,
      ORDER_TEX,
      ORDER_TEX,
      0,
      gl.LUMINANCE,
      gl.UNSIGNED_BYTE,
      orderData,
    );

    const scratch = document.createElement("canvas");
    scratch.width = 1;
    scratch.height = 1;
    const sctx = scratch.getContext("2d", { willReadFrequently: true });
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;

    let alive = true;
    let raf = 0;
    let watchdog = 0;
    let running = false;
    let settle = null; /* resolve() for the in-flight run() promise */

    /* Plate textures match the DPR canvas so the wipe is not soft relative
       to the underlying <img> (Hilbert order stays ORDER_TEX² on UV). */
    const texSize = () => {
      sizeCanvas();
      let tw = Math.max(1, canvas.width);
      let th = Math.max(1, canvas.height);
      if (tw > maxTex || th > maxTex) {
        const s = Math.min(maxTex / tw, maxTex / th);
        tw = Math.max(1, Math.round(tw * s));
        th = Math.max(1, Math.round(th * s));
      }
      return { tw, th };
    };

    const sizeCanvas = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(viewport.clientWidth * dpr));
      const h = Math.max(1, Math.round(viewport.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      /* Absolute children of a scrollport are positioned in content
         coordinates — pin the wipe to the visible bay so onReady's
         scroll does not drag the overlay off-screen (only scroll→0
         used to bring it back, i.e. the last Back). */
      canvas.style.transform = `translateX(${viewport.scrollLeft}px)`;
    };

    /* Draw img with the same contain rule as object-fit:contain into a
       bay-aspect texture so the Hilbert wipe matches the CSS plate. */
    const uploadContain = (tex, img) => {
      if (!sctx || !img || !img.naturalWidth) return false;
      try {
        const { tw, th } = texSize();
        if (scratch.width !== tw || scratch.height !== th) {
          scratch.width = tw;
          scratch.height = th;
        }
        const wash = cssRgb("--wash") || "#ecebe5";
        if (!drawContain(sctx, img, tw, th, wash)) return false;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
        return true;
      } catch (_) {
        /* tainted canvas / CORS */
        return false;
      }
    };

    const drawFrame = (progress) => {
      sizeCanvas();
      const wash = hexToRgb01(cssRgb("--wash"));
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texFrom);
      gl.uniform1i(uFrom, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texTo);
      gl.uniform1i(uTo, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, texOrder);
      gl.uniform1i(uOrder, 2);

      gl.uniform1f(uProgress, progress);
      gl.uniform1f(uSoft, SOFT);
      gl.uniform3fv(uWash, wash);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const stopRaf = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = 0;
      }
    };

    const deactivate = () => {
      canvas.classList.remove("is-active");
      running = false;
    };

    const finish = (ok) => {
      stopRaf();
      deactivate();
      const done = settle;
      settle = null;
      if (done) done(ok);
    };

    const destroy = () => {
      if (!alive) return;
      alive = false;
      finish(false);
      try {
        gl.deleteTexture(texFrom);
        gl.deleteTexture(texTo);
        gl.deleteTexture(texOrder);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
        const lose = gl.getExtension("WEBGL_lose_context");
        if (lose) lose.loseContext();
      } catch (_) {
        /* ignore */
      }
      gl = null;
      canvas.remove();
    };

    /**
     * Animate fromImg → toImg with contain-fitted plates in the locked
     * bay. Calls onReady once the canvas shows the outgoing plate
     * (progress 0) so the track can scroll underneath. Resolves true if
     * GL ran; false if caller should instant-cut. cancel() always settles.
     */
    const run = (fromImg, toImg, onReady) =>
      new Promise((resolve) => {
        if (!alive || !gl || reduced()) {
          resolve(false);
          return;
        }
        /* A prior run must not leave this one hanging if cancel raced. */
        if (settle) finish(false);
        if (!uploadContain(texFrom, fromImg) || !uploadContain(texTo, toImg)) {
          resolve(false);
          return;
        }
        settle = resolve;
        running = true;
        canvas.classList.add("is-active");
        try {
          drawFrame(0);
          if (typeof onReady === "function") onReady();
          /* onReady scrolls the track — re-pin so the wipe stays in view. */
          sizeCanvas();
        } catch (_) {
          finish(false);
          return;
        }
        const t0 = performance.now();
        /* Wall-clock backup: rAF throttles hard in background tabs and
           would otherwise leave the overlay stuck on is-active. */
        watchdog = setTimeout(() => {
          watchdog = 0;
          if (settle) finish(true);
        }, DURATION_MS + 80);

        const tick = (now) => {
          if (!alive || !running || !settle) return;
          try {
            const t = Math.min(1, (now - t0) / DURATION_MS);
            /* Ease-out so the write-head decelerates into a full plate. */
            const p = 1 - Math.pow(1 - t, 2.2);
            drawFrame(p);
            if (t < 1) {
              raf = requestAnimationFrame(tick);
            } else {
              finish(true);
            }
          } catch (_) {
            finish(false);
          }
        };
        raf = requestAnimationFrame(tick);
      });

    const cancel = () => {
      if (settle || running) finish(false);
      else deactivate();
    };

    return {
      run,
      cancel,
      destroy,
      get running() {
        return running;
      },
      get alive() {
        return alive;
      },
    };
  }

  function initGallery(root) {
    const track = root.querySelector(".gallery-track");
    const viewport = root.querySelector(".gallery-viewport") || track?.parentElement;
    const slides = [...root.querySelectorAll(".gallery-slide")];
    if (!track || !viewport || slides.length < 2) return;

    /* Tear down a prior init (hot reload / re-mount) so GL contexts
       do not accumulate. */
    if (typeof root.__galleryDestroy === "function") {
      root.__galleryDestroy();
      root.__galleryDestroy = null;
    }

    root.setAttribute("role", "group");
    if (!root.hasAttribute("aria-roledescription"))
      root.setAttribute("aria-roledescription", "carousel");

    let nav = root.querySelector(".gallery-nav");
    if (!nav) {
      nav = document.createElement("nav");
      nav.className = "gallery-nav";
      nav.setAttribute("aria-label", "Gallery");
      const live = root.querySelector("figcaption");
      if (live) root.insertBefore(nav, live);
      else root.append(nav);
    }

    let prev = nav.querySelector(".gallery-prev");
    let next = nav.querySelector(".gallery-next");
    let dots = nav.querySelector(".gallery-dots");
    if (!prev) {
      prev = document.createElement("button");
      prev.type = "button";
      prev.className = "gallery-prev";
      prev.setAttribute("aria-label", "Previous plate");
      prev.textContent = "Prev";
      nav.prepend(prev);
    }
    if (!dots) {
      dots = document.createElement("div");
      dots.className = "gallery-dots";
      dots.setAttribute("role", "tablist");
      dots.setAttribute("aria-label", "Plates");
      nav.append(dots);
    }
    if (!next) {
      next = document.createElement("button");
      next.type = "button";
      next.className = "gallery-next";
      next.setAttribute("aria-label", "Next plate");
      next.textContent = "Next";
      nav.append(next);
    }

    const live =
      root.querySelector(".gallery-live-caption") ||
      (() => {
        const cap = root.querySelector("figcaption");
        if (!cap) return null;
        let span = document.createElement("span");
        span.className = "gallery-live-caption";
        span.setAttribute("aria-live", "polite");
        cap.prepend(span);
        return span;
      })();

    dots.replaceChildren();
    const buttons = slides.map((_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "gallery-dot";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-label", `Plate ${i + 1} of ${slides.length}`);
      b.addEventListener("click", () => go(i));
      dots.append(b);
      return b;
    });

    let index = 0;
    let scrolling = false;
    let transitioning = false;
    let queued = null; /* one pending index while a reveal runs */
    let onscreen = true;
    const gl = createGlReveal(viewport);

    /* Lock one bay from the first plate so Hilbert reveals never reflow.
       Contain-fit that plate into (maxW × maxH): scale hits width or
       height first; every later slide and the wipe share that frame. */
    const slideNatural = (img) => {
      /* Only decoded pixels — HTML width/height can lie (style-guide used
         to claim 1200×900 for a 556×720 file) and that provisional bay
         then snaps, which flickers on load. */
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        return { w: img.naturalWidth, h: img.naturalHeight };
      }
      return null;
    };

    const fitBay = () => {
      const maxW = viewport.clientWidth;
      if (maxW <= 0) return;
      const maxH = Math.max(1, Math.round(window.innerHeight * 0.7));
      let nat = null;
      for (const slide of slides) {
        nat = slideNatural(slide.querySelector("img"));
        if (nat) break;
      }
      if (!nat) return;
      const scale = Math.min(maxW / nat.w, maxH / nat.h);
      viewport.style.setProperty("--gallery-h", `${Math.ceil(nat.h * scale)}px`);
    };

    const sync = (i) => {
      index = Math.max(0, Math.min(slides.length - 1, i));
      slides.forEach((s, j) => {
        s.setAttribute("aria-hidden", j === index ? "false" : "true");
      });
      buttons.forEach((b, j) => {
        const on = j === index;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      prev.disabled = index === 0;
      next.disabled = index === slides.length - 1;
      const html = slideCaption(slides[index]);
      if (live && html) live.innerHTML = html;
    };

    const scrollToIndex = (i) => {
      scrolling = true;
      const left = Math.round(i * viewport.clientWidth);
      viewport.scrollTo({ left, behavior: "auto" });
      sync(i);
      requestAnimationFrame(() => {
        if (Math.abs(viewport.scrollLeft - left) > 1) {
          viewport.scrollTo({ left, behavior: "auto" });
        }
        scrolling = false;
      });
    };

    const finishQueue = () => {
      if (queued == null) return;
      const nextI = queued;
      queued = null;
      go(nextI);
    };

    const go = async (i) => {
      const target = Math.max(0, Math.min(slides.length - 1, i));
      const dir = target > index ? "fwd" : target < index ? "back" : "noop";
      if (target === index && !transitioning) return;

      if (transitioning) {
        queued = target;
        return;
      }

      transitioning = true;
      const fromI = index;
      const fromImg = slideImg(slides[fromI]);
      const toImg = slideImg(slides[target]);

      /* Horizontal lazy slides are often still undecoded; wait so the
         wipe can upload both plates (else useGl stays false forever). */
      const ready = await Promise.all([imgReady(fromImg), imgReady(toImg)]);

      const useGl =
        gl &&
        gl.alive &&
        !reduced() &&
        onscreen &&
        fromImg &&
        toImg &&
        fromImg.complete &&
        toImg.complete &&
        fromImg.naturalWidth > 0 &&
        toImg.naturalWidth > 0 &&
        fromI !== target;


      if (!useGl) {
        transitioning = false;
        scrollToIndex(target);
        finishQueue();
        return;
      }

      let ok = false;
      try {
        ok = await gl.run(fromImg, toImg, () => {
          /* Park the track under the canvas once it shows the outgoing
             plate, so the full-res plate is ready when the reveal ends. */
          scrollToIndex(target);
        });
      } finally {
        transitioning = false;
      }
      if (!ok) {
        /* Upload/GL failed or cancelled — snap to target without a reveal. */
        scrollToIndex(target);
      }
      finishQueue();
    };

    const nearest = () => {
      const w = viewport.clientWidth || 1;
      return Math.max(0, Math.min(slides.length - 1, Math.round(viewport.scrollLeft / w)));
    };

    let scrollRaf = 0;
    viewport.addEventListener(
      "scroll",
      () => {
        if (scrolling || transitioning) return;
        cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(() => sync(nearest()));
      },
      { passive: true },
    );

    prev.addEventListener("click", () => go(index - 1));
    next.addEventListener("click", () => go(index + 1));

    root.tabIndex = 0;
    root.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(index - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(index + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(slides.length - 1);
      }
    });

    let io = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            onscreen = e.isIntersecting;
            if (!onscreen && transitioning && gl) {
              gl.cancel();
              transitioning = false;
              queued = null;
            }
          });
        },
        { threshold: 0.05 },
      );
      io.observe(root);
    }

    const onReducedChange = () => {
      if (reduced() && gl) gl.cancel();
      transitioning = false;
      queued = null;
    };
    mqReduced.addEventListener?.("change", onReducedChange);

    const onResize = () => fitBay();
    window.addEventListener("resize", onResize, { passive: true });

    root.__galleryDestroy = () => {
      mqReduced.removeEventListener?.("change", onReducedChange);
      window.removeEventListener("resize", onResize);
      if (io) io.disconnect();
      if (gl) gl.destroy();
      cancelAnimationFrame(scrollRaf);
    };

    sync(0);
    fitBay();
    /* Eager-decode every plate so Next isn't blocked on lazy off-screen imgs. */
    slides.forEach((s) => {
      const img = s.querySelector("img");
      if (!img) return;
      ensureImgLoading(img);
      imgReady(img).then(() => fitBay());
    });
  }

  initReveal();
  document.querySelectorAll("figure.gallery").forEach(initGallery);
})();
