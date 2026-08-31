/* fn-nav.js — scroll to #fn: / #fnref: targets reliably.

   Native fragment navigation skips (or mis-scrolls) elements inside a
   CSS-transformed ancestor. The book-shelf bay uses perspective +
   rotateX / translateZ, so ↩ backrefs to cover fnrefs never land.
   We preventDefault on those clicks, set the hash for :target, then
   scroll via getBoundingClientRect (instant, so we win any native jump). */
(() => {
  const isFnId = (id) => id.startsWith("fn:") || id.startsWith("fnref:");

  const idFromHash = (hash) => {
    if (!hash || hash === "#") return "";
    try {
      return decodeURIComponent(hash.slice(1));
    } catch {
      return hash.slice(1);
    }
  };

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ block: "start", behavior: "instant" });
    if (typeof el.focus === "function") {
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }
    return true;
  };

  const go = (id) => {
    if (!isFnId(id) || !document.getElementById(id)) return false;
    const next = "#" + id;
    if (location.hash !== next) location.hash = id;
    scrollToId(id);
    return true;
  };

  const jumpHash = () => {
    const id = idFromHash(location.hash);
    if (isFnId(id)) scrollToId(id);
  };

  document.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = e.target.closest("a[href^='#']");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href === "#") return;
      const id = idFromHash(href);
      if (!isFnId(id)) return;
      e.preventDefault();
      go(id);
    },
    true,
  );

  window.addEventListener("hashchange", jumpHash);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", jumpHash);
  } else {
    jumpHash();
  }
  window.addEventListener("load", jumpHash);
})();
