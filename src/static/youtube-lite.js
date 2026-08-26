/* youtube-lite.js — facade for .iframe-wrapper[data-youtube]: poster +
   click-to-load iframe. No youtube.com request until the user plays. */

(() => {
  const load = (wrap) => {
    if (wrap.dataset.loaded) return;
    wrap.dataset.loaded = "1";
    const id = wrap.dataset.youtube;
    if (!id) return;
    const title = wrap.dataset.title || "YouTube video";
    const iframe = document.createElement("iframe");
    iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
    iframe.title = title;
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    wrap.replaceChildren(iframe);
  };

  for (const wrap of document.querySelectorAll(".iframe-wrapper[data-youtube]")) {
    const id = wrap.dataset.youtube;
    const title = wrap.dataset.title || "YouTube video";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "youtube-lite-play";
    btn.setAttribute("aria-label", `Play ${title}`);

    const img = document.createElement("img");
    img.src = `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 480;
    img.height = 360;

    btn.append(img);
    btn.addEventListener("click", () => load(wrap));
    wrap.replaceChildren(btn);
  }
})();
