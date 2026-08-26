/* toc.js — marks the section currently in view in the floating
   contents rail and folds the rail to it: the group holding the active
   heading opens, every other group closes. The active link is the last
   heading whose top has crossed the upper third of the viewport:
   steadier than observer ratios, and correct on short sections that
   never fill a band.

   Also pins --toc-top to the title-block meta so the Contents hairline
   and the meta hairline share one baseline (see style.css). */
(() => {
  const nav = document.querySelector("nav.toc");
  if (!nav) return;
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const folds = [...nav.querySelectorAll("details")];
  const heads = links
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);
  if (!heads.length) return;

  const place = () => {
    const meta = document.querySelector("article > .meta:first-child");
    if (!meta || !matchMedia("(min-width: 1152px)").matches) {
      document.documentElement.style.removeProperty("--toc-top");
      return;
    }
    /* Document Y of the meta → fixed top, so at scroll 0 the rail and
       the meta share a top edge; matched padding then aligns the rules. */
    const top = meta.getBoundingClientRect().top + scrollY;
    document.documentElement.style.setProperty("--toc-top", `${top}px`);
  };

  let current = -1;
  const paint = () => {
    const active = links[current] || null;
    links.forEach((a, i) => {
      if (i === current) a.setAttribute("aria-current", "location");
      else a.removeAttribute("aria-current");
    });
    /* Auto-collapse: the fold holding the active heading opens,
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
    { passive: true },
  );
  addEventListener("resize", () => {
    place();
    measure();
  });
  place();
  measure();
})();
