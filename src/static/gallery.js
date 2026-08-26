/* gallery.js — plate gallery + optional plate fade-in for olivares.cl.
   Scroll-snap owns the track; this wires dots, prev/next, caption sync,
   keyboard, and .plate-reveal. Respects prefers-reduced-motion. */
(() => {
  const mqReduced = matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => mqReduced.matches;

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

  function slideHref(slide) {
    const img = slide.querySelector("img");
    return slide.getAttribute("data-href") || (img && img.currentSrc) || (img && img.src) || "";
  }

  function initGallery(root) {
    const track = root.querySelector(".gallery-track");
    const viewport = root.querySelector(".gallery-viewport") || track?.parentElement;
    const slides = [...root.querySelectorAll(".gallery-slide")];
    if (!track || !viewport || slides.length < 2) return;

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

    const openLink = root.querySelector(".caption-actions a.gallery-open");

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

    /* Reserve the tallest plate so slide changes never reflow the page.
       Shorter plates sit centered in the bay (CSS align-items: center). */
    const fitHeight = () => {
      let max = 0;
      slides.forEach((slide) => {
        const img = slide.querySelector("img");
        let h = 0;
        if (img && img.complete && img.naturalWidth > 0) {
          const w = img.getBoundingClientRect().width || viewport.clientWidth;
          h = Math.ceil(w * (img.naturalHeight / img.naturalWidth));
        } else {
          h = Math.ceil((img || slide).getBoundingClientRect().height);
        }
        if (h > max) max = h;
      });
      if (max > 0) viewport.style.setProperty("--gallery-h", `${max}px`);
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
      const href = slideHref(slides[index]);
      if (openLink && href) openLink.href = href;
    };

    const go = (i) => {
      const target = slides[Math.max(0, Math.min(slides.length - 1, i))];
      if (!target) return;
      scrolling = true;
      const left = Math.round(i * viewport.clientWidth);
      /* Instant scroll: smooth scroll + snap can desync caption from the
         plate. CSS scroll-snap still smooths drag. */
      viewport.scrollTo({ left, behavior: "auto" });
      sync(i);
      requestAnimationFrame(() => {
        if (Math.abs(viewport.scrollLeft - left) > 1) {
          viewport.scrollTo({ left, behavior: "auto" });
        }
        scrolling = false;
      });
    };

    const nearest = () => {
      const w = viewport.clientWidth || 1;
      return Math.max(0, Math.min(slides.length - 1, Math.round(viewport.scrollLeft / w)));
    };

    let scrollRaf = 0;
    viewport.addEventListener(
      "scroll",
      () => {
        if (scrolling) return;
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

    sync(0);
    fitHeight();
    /* Images may still be loading; re-fit max when intrinsic sizes arrive. */
    slides.forEach((s) => {
      const img = s.querySelector("img");
      if (img && !img.complete) {
        img.addEventListener("load", () => fitHeight(), { once: true });
      }
    });
    window.addEventListener("resize", () => fitHeight(), { passive: true });
  }

  initReveal();
  document.querySelectorAll("figure.gallery").forEach(initGallery);
})();
