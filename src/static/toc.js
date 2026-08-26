/* toc.js — marks the section currently in view in the floating
   contents rail and folds the rail to it: the group holding the active
   heading opens, every other group closes. The active link is the last
   heading whose top has crossed the upper third of the viewport:
   steadier than observer ratios, and correct on short sections that
   never fill a band. */
(() => {
  const nav = document.querySelector("nav.toc");
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const folds = [...nav.querySelectorAll("details")];
  const heads = links
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);
  if (!heads.length) return;

  let current = -1;
  const paint = () => {
    const active = links[current] || null;
    links.forEach((a, i) => {
      if (i === current) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    /* Auto-collapse: the fold holding the active heading stands open,
       the rest shut, so the rail always shows one section deep. */
    folds.forEach((d) => {
      d.open = !!(active && d.contains(active));
    });
  };

  const measure = () => {
    const line = innerHeight * 0.35;
    let idx = -1;
    heads.forEach((h, i) => {
      if (h.getBoundingClientRect().top <= line) idx = i;
    });
    if (idx !== current) {
      current = idx;
      paint();
    }
  };

  let raf = 0;
  addEventListener(
    "scroll",
    () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          measure();
        });
    },
    { passive: true }
  );
  addEventListener("resize", measure);
  measure();
})();
