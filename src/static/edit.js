/* edit.js — per-paragraph “suggest an edit” for articles with data-edit.

   One shared GitHub source URL on <article data-edit="…">. Each direct
   prose paragraph gets a mono micro-link that CSS reveals on hover
   (fine pointer, wide layout). Footer .edit stays for no-JS / touch. */
(() => {
  const article = document.querySelector("article[data-edit]");
  if (!article) return;
  const href = article.dataset.edit;
  if (!href) return;

  for (const p of article.querySelectorAll(":scope > p:not(.meta)")) {
    if (!p.textContent.trim()) continue;
    const a = document.createElement("a");
    a.className = "p-edit";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = "edit";
    a.setAttribute("aria-label", "Suggest an edit");
    p.appendChild(a);
  }
})();
