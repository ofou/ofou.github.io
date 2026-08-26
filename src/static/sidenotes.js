/* sidenotes.js — margin-note placement for pages that emit notes.

   The stylesheet's default is the no-script baseline: notes float right
   and clear each other, which anchors a note only to the note above it.
   Consecutive notes therefore stack below their markers (a 197px note
   measured 171px of drift), and every clearing wide tier drops any note
   marked beside it. This script promotes notes out of the float flow:
   each becomes absolutely positioned at its own marker's line, and the
   one shared channel is packed top-down — a note yields only to
   occupants actually in its way (a margin figure, a floated caption, a
   previous note, a .fullwidth plate that spends the note channel),
   never to a bare hang or a clear. Hang-only listings and section
   rules stop at hang-l/2; notes sit past that hang (mirroring the TOC),
   so they share no x-band with a pre or an h2. No class is added and no
   layout changes until this script runs; without it the float baseline
   stands. Below 1152px the fold-up checkbox behaviour owns the notes
   and this stays out of the way. */
(() => {
  const MQ = matchMedia("(min-width: 1152px)");
  const GAP = 9.6; // px — the 0.4rem rhythm the floated notes kept
  let article, notes, floats, tiers, raf = 0;

  const measure = () => {
    const aTop = article.getBoundingClientRect().top;
    floats = [...article.querySelectorAll("figure.margin, figcaption")]
      .filter((el) => getComputedStyle(el).float === "right")
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { fixed: true, top: r.top - aTop, bottom: r.bottom - aTop };
      });
    // Only tiers that spend the note channel (hang + reach-r) can meet
    // a note. Hang-only plates, listings and section rules stop at
    // hang-l/2; notes start past that hang, so they never share
    // vertical with one.
    tiers = [...article.querySelectorAll(
      "figure.fullwidth, pre.fullwidth, div.fullwidth"
    )].map((el) => {
      const r = el.getBoundingClientRect();
      return { fixed: true, top: r.top - aTop, bottom: r.bottom - aTop };
    });
    notes = [...article.querySelectorAll("span.sidenote")].map((el) => {
      // Emission order is label, input, span: the label carries the
      // marker number the note's ::before repeats.
      const input = el.previousElementSibling;
      const marker = (input && input.previousElementSibling) || input || el;
      const m = marker.getBoundingClientRect();
      return { el, desired: m.top - aTop, top: -1, bottom: 0, height: el.offsetHeight };
    });
  };

  const pack = () => {
    // A note only ever moves down, so the while-loop terminates: every
    // push is re-checked against every constraint set until none fires —
    // a note dislodged by an earlier note must still clear a tier, which
    // a single ordered sweep would miss. Fixed occupants never move;
    // notes yield in marker order.
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (const n of notes) {
        let y = Math.max(0, n.desired);
        while (true) {
          let pushed = false;
          for (const o of [...floats, ...tiers]) {
            if (o.top < y + n.height && y < o.bottom + GAP) {
              y = o.bottom + GAP;
              pushed = true;
            }
          }
          for (const m of notes) {
            if (m === n || m.top < 0) continue;
            if (m.top < y + n.height && y < m.bottom + GAP) {
              y = m.bottom + GAP;
              pushed = true;
            }
          }
          if (!pushed) break;
        }
        if (Math.abs(y - n.top) > 0.5) {
          n.top = y;
          changed = true;
        }
        n.bottom = y + n.height;
      }
      if (!changed) break;
    }
    for (const n of notes) n.el.style.top = Math.round(n.top) + "px";
  };
  const layout = () => {
    if (!MQ.matches) return;
    measure();
    pack();
  };

  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      layout();
    });
  };

  const boot = () => {
    article = document.querySelector("article");
    if (!article || !article.querySelector("span.sidenote")) return;
    const on = () => {
      document.documentElement.classList.toggle("snotes-abs", MQ.matches);
      if (MQ.matches) schedule();
    };
    on();
    MQ.addEventListener("change", on);
    addEventListener("resize", schedule);
    addEventListener("load", schedule);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
    // Images and canvases change line positions under the markers; the
    // observer cannot loop — absolute notes add nothing to article's height.
    new ResizeObserver(schedule).observe(article);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
