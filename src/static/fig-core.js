/* fig-core.js — component runtime for olivares.cl explainables.
   Fig.register(name, factory) from src/static/components/<name>.js
   Pages declare <div data-fig="name" data-key="value"></div>;
   the core lazy-loads the component file and calls factory(el, dataset). */
(() => {
  const registry = Object.create(null);
  const running = new Set();
  const schemeWatchers = new Set();

  const mqDark = matchMedia("(prefers-color-scheme: dark)");
  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");

  mqDark.addEventListener?.("change", () => schemeWatchers.forEach(f => f()));

  const reduced = () => mqReduced.matches;

  const palette = () => {
    const s = getComputedStyle(document.documentElement);
    const g = n => s.getPropertyValue(n).trim();
    return {
      paper: g("--paper"), ink: g("--ink"), mute: g("--mute"),
      accent: g("--accent"), wash: g("--wash"), rule: g("--rule"),
      dark: mqDark.matches,
    };
  };

  /* HiDPI canvas appended to the container. Returns {el, ctx, w, h}. */
  function canvas(el, height) {
    const c = document.createElement("canvas");
    c.style.width = "100%";
    c.style.display = "block";
    el.appendChild(c);
    const state = { el: c, ctx: c.getContext("2d"), w: 0, h: 0, dpr: 1 };
    const fit = () => {
      state.dpr = Math.min(devicePixelRatio || 1, 2);
      state.w = el.clientWidth || 600;
      state.h = height || parseInt(getComputedStyle(c).height) || 240;
      c.width = state.w * state.dpr;
      c.height = state.h * state.dpr;
      c.style.height = state.h + "px";
      state.ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    };
    fit();
    addEventListener("resize", () => { fit(); state.onresize && state.onresize(); });
    state.refit = fit;
    return state;
  }

  /* Animation loop that pauses when the canvas leaves the viewport,
     when the tab hides, or under prefers-reduced-motion (draws once). */
  function animate(cvState, drawFn) {
    let raf = 0, io = null, visible = true;
    const tick = () => { drawFn(); if (visible && !document.hidden) raf = requestAnimationFrame(tick); };
    const start = () => { cancelAnimationFrame(raf); if (!reduced() && visible && !document.hidden) raf = requestAnimationFrame(tick); else drawFn(); };
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(es => es.forEach(e => {
        visible = e.isIntersecting;
        start();
      }), { threshold: 0.05 });
      io.observe(cvState.el);
    } else {
      start();
    }
    document.addEventListener("visibilitychange", start);
    mqReduced.addEventListener?.("change", start);
    cvState.refitWrapped = () => { start(); };
    const origFit = cvState.refit;
    cvState.refit = () => { origFit(); start(); };
    return () => cancelAnimationFrame(raf);
  }

  /* Mono-labelled slider row matching the CV/site control language. */
  function controls(el, defs, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "fig-controls";
    const handles = {};
    for (const d of defs) {
      const row = document.createElement("label");
      row.className = "fig-control";
      const name = document.createElement("span");
      name.textContent = d.label;
      const val = document.createElement("output");
      val.textContent = d.value;
      const input = document.createElement("input");
      input.type = "range";
      input.min = d.min; input.max = d.max; input.step = d.step ?? 0.01;
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
        set(v) { input.value = v; val.textContent = Math.round(v * 100) / 100; },
        get: () => parseFloat(input.value),
        input,
      };
    }
    el.appendChild(wrap);
    return handles;
  }

  /* Caption element. */
  function caption(el, text) {
    const p = document.createElement("span");
    p.className = "meta";
    p.style.display = "block";
    p.style.marginTop = "0.6rem";
    p.textContent = text;
    el.appendChild(p);
    return p;
  }

  /* Standard hairline frame around the canvas. */
  function frame(cvState) {
    cvState.el.style.border = "1px solid var(--rule-fine)";
  }

  function boot() {
    document.querySelectorAll("[data-fig]").forEach(async el => {
      if (el.__booted) return;
      el.__booted = true;
      const name = el.dataset.fig;
      if (!registry[name]) {
        await new Promise(res => {
          const s = document.createElement("script");
          s.src = "/static/components/" + name + ".js";
          s.onload = s.onerror = res;
          document.head.appendChild(s);
        });
      }
      const factory = registry[name];
      if (!factory) { el.dataset.error = "unknown component: " + name; return; }
      try {
        const inst = factory(el, { ...el.dataset });
        if (inst && inst.destroy) running.add(inst);
      } catch (e) {
        console.error("[fig]", name, e);
        el.dataset.error = "1";
      }
    });
  }

  window.Fig = { register: (n, f) => { registry[n] = f; }, palette, canvas, animate, controls, caption, frame, reduced, onScheme: f => schemeWatchers.add(f) };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
