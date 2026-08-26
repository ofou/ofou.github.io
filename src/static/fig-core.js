/* fig-core.js — component runtime for olivares.cl explainables.
   Components: Fig.register(name, factory); pages declare <div data-fig="name">.
   Canvases refit on container resize and ALWAYS redraw afterwards. */
(() => {
  const registry = Object.create(null);
  const schemeWatchers = new Set();
  const mqDark = matchMedia("(prefers-color-scheme: dark)");
  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");

  const reduced = () => mqReduced.matches;

  const palette = () => {
    const s = getComputedStyle(document.documentElement);
    const g = (n) => s.getPropertyValue(n).trim();
    return {
      paper: g("--paper"),
      ink: g("--ink"),
      mute: g("--mute"),
      accent: g("--accent"),
      wash: g("--wash"),
      rule: g("--rule"),
      dark: mqDark.matches,
    };
  };

  const onScheme = (f) => schemeWatchers.add(f);
  const fireScheme = () => schemeWatchers.forEach((f) => f());
  mqDark.addEventListener?.("change", fireScheme);

  /* HiDPI canvas. state.redraw is set by the component (or by animate)
     and is invoked after every refit so the buffer is never left blank. */
  function canvas(el, height) {
    const c = document.createElement("canvas");
    c.style.width = "100%";
    c.style.display = "block";
    el.appendChild(c);
    const state = {
      el: c,
      ctx: c.getContext("2d"),
      w: 0,
      h: 0,
      dpr: 1,
      redraw: null,
    };
    const fit = () => {
      state.dpr = Math.min(devicePixelRatio || 1, 2);
      state.w = el.clientWidth || 600;
      state.h = height || 240;
      c.width = Math.max(1, Math.round(state.w * state.dpr));
      c.height = Math.round(state.h * state.dpr);
      c.style.height = state.h + "px";
      state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };
    fit();
    let queued = false;
    const ro = new ResizeObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fit();
        state.redraw && state.redraw();
      });
    });
    ro.observe(el);
    return state;
  }

  /* Managed loop: pauses offscreen/hidden, stops on reduced-motion,
     immune to double-scheduling, and wires state.redraw to restart. */
  function animate(cvState, drawFn) {
    const epoch = { alive: true };
    let raf = 0,
      visible = true;
    const tick = () => {
      if (!epoch.alive) return;
      drawFn();
      if (epoch.alive && visible && !document.hidden && !reduced())
        raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const start = () => {
      epoch.alive = true;
      cancelAnimationFrame(raf);
      if (!reduced() && visible && !document.hidden)
        raf = requestAnimationFrame(tick);
      else drawFn();
    };
    const stop = () => {
      epoch.alive = false;
      cancelAnimationFrame(raf);
    };
    cvState.redraw = start;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            visible = e.isIntersecting;
            visible ? start() : stop();
          }),
        { threshold: 0.05 },
      ).observe(cvState.el);
    }
    document.addEventListener("visibilitychange", () =>
      visible && !document.hidden ? start() : stop(),
    );
    mqReduced.addEventListener?.("change", () =>
      reduced() ? stop() : start(),
    );
    start();
    return () => stop();
  }

  /* Project index thumbs (and explicit data-preview) skip chrome. */
  const isPreview = (el) =>
    !!(el && (el.closest?.(".project-thumb") || el.dataset?.preview != null));

  /* Mono-labelled slider row. */
  function controls(el, defs, onChange) {
    const handles = {};
    if (isPreview(el)) {
      for (const d of defs) {
        let v = d.value;
        handles[d.key] = {
          set(n) {
            v = n;
          },
          get: () => v,
          input: null,
        };
      }
      return handles;
    }
    const wrap = document.createElement("div");
    wrap.className = "fig-controls";
    for (const d of defs) {
      const row = document.createElement("label");
      row.className = "fig-control";
      const name = document.createElement("span");
      name.textContent = d.label;
      const val = document.createElement("output");
      val.textContent = d.value;
      const input = document.createElement("input");
      input.type = "range";
      input.min = d.min;
      input.max = d.max;
      input.step = d.step ?? 0.01;
      input.value = d.value;
      input.setAttribute("aria-label", d.label);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        handles[d.key].set(v);
        onChange(d.key, v);
      });
      row.append(name, input, val);
      wrap.appendChild(row);
      handles[d.key] = {
        set(v) {
          input.value = v;
          val.textContent = Math.round(v * 100) / 100;
        },
        get: () => parseFloat(input.value),
        input,
      };
    }
    el.appendChild(wrap);
    return handles;
  }

  function chip(label, onClick) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = label;
    b.style.cursor = "pointer";
    if (onClick) b.addEventListener("click", onClick);
    return b;
  }

  function caption(el, text) {
    if (isPreview(el)) return null;
    const p = document.createElement("p");
    p.className = "meta";
    p.style.margin = "0.5rem 0 0";
    p.textContent = text;
    el.appendChild(p);
    return p;
  }

  function frame(cvState) {
    if (isPreview(cvState.el.parentElement)) return;
    cvState.el.style.border = "1px solid var(--rule-fine)";
  }

  const pending = Object.create(null);

  async function mount(el) {
    if (el.__booted) return;
    el.__booted = true;
    const name = el.dataset.fig || "";
    if (!/^[a-z0-9-]+$/.test(name)) {
      el.dataset.error = "unknown component: " + name;
      return;
    }
    if (!registry[name]) {
      if (!pending[name]) {
        pending[name] = new Promise((res) => {
          const s = document.createElement("script");
          s.src = "/static/components/" + name + ".js";
          s.onload = s.onerror = res;
          document.head.appendChild(s);
        });
      }
      await pending[name];
    }
    const factory = registry[name];
    if (!factory) {
      el.dataset.error = "unknown component: " + name;
      return;
    }
    try {
      factory(el, { ...el.dataset });
    } catch (e) {
      console.error("[fig]", name, e);
      el.dataset.error = "1";
    }
  }

  function boot() {
    if (!("IntersectionObserver" in window)) {
      document.querySelectorAll("[data-fig]").forEach(mount);
      return;
    }
    const near = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            near.unobserve(e.target);
            mount(e.target);
          }
        }),
      { rootMargin: "200px 0px" },
    );
    document.querySelectorAll("[data-fig]").forEach((el) => near.observe(el));
  }

  window.Fig = {
    register: (n, f) => {
      registry[n] = f;
    },
    palette,
    canvas,
    animate,
    controls,
    caption,
    frame,
    chip,
    reduced,
    onScheme,
    isPreview,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
