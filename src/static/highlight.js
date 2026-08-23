/* highlight.js — colour for the fenced code blocks. Python-Markdown has
   already written the fence language into the class (`language-python`),
   so the work here is only to load @speed-highlight/core from a CDN and
   rewrite each block in place. The whole run is wrapped: if the CDN is
   unreachable the blocks are left exactly as they were served — plain,
   legible monospace — never blank, never half-lit. */

const MODULE = "https://esm.sh/@speed-highlight/core@2.0.0";
const THEME = "https://cdn.jsdelivr.net/npm/@speed-highlight/core@2.0.0/dist/themes/default.css";

/* Fence names as they are written in the posts, mapped onto the names
   speed-highlight actually bundles: it calls Python `py`, and every
   shell is `bash`. A fence outside this table keeps its plain setting. */
const LANGS = {
  js: "js",
  python: "py",
  sh: "bash",
  bash: "bash",
  json: "json",
  css: "css",
  html: "html",
  md: "md",
};

/* The stylesheet has to land before the first rewrite. A highlighted
   block carries its line numbers as empty divs that only become digits
   under the theme's counter, so a block written ahead of the CSS flashes
   a blank gutter. A theme that never arrives is a dead CDN like any
   other: nothing is rewritten. */
function theme() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = THEME;
  return new Promise((resolve, reject) => {
    link.onload = resolve;
    link.onerror = () => reject(new Error("highlight: theme unavailable"));
    document.head.append(link);
  });
}

const blocks = [];
for (const el of document.querySelectorAll('pre code[class*="language-"]')) {
  const name = el.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1];
  const lang = name && LANGS[name.toLowerCase()];
  if (lang) blocks.push([el, lang]);
}

if (blocks.length) {
  try {
    const { highlightHTML } = await import(MODULE);
    await theme();
    for (const [el, lang] of blocks) {
      try {
        /* Python-Markdown closes every fence with a newline, and the line
           numbering counts it, so an untrimmed block ends on a numbered
           line that holds nothing. */
        const code = el.textContent.replace(/\n$/, "");
        const html = await highlightHTML(code, lang, { showLineNumbers: true });
        /* Never trade a listing for an empty box. */
        if (!html) continue;
        el.className = `shj-lang-${lang} shj-block`;
        el.innerHTML = html;
      } catch {
        /* One unparseable block stays plain; the rest of the page carries on. */
      }
    }
  } catch {
    /* No module, no theme, no colour — the served markup already reads. */
  }
}
