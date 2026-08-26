/* mermaid.js — render ```mermaid fences as diagrams.
   Python-Markdown leaves them as <pre><code class="language-mermaid">;
   this module swaps each block for an SVG. Same library and theme pairing
   Cursor's Markdown Preview Mermaid Support uses (mermaid 11, light
   "default" / dark "dark"). If the CDN is unreachable the fences stay as
   plain source — never blank. */

const MODULE = "https://cdn.jsdelivr.net/npm/mermaid@11.12.2/dist/mermaid.esm.min.mjs";

const blocks = [
  ...document.querySelectorAll("pre code.language-mermaid"),
].map((el) => ({
  pre: el.closest("pre"),
  code: el.textContent.replace(/\n$/, ""),
}));

if (!blocks.length) {
  /* nothing to do */
} else {
  try {
    const { default: mermaid } = await import(MODULE);

    const theme = () =>
      matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "default";

    const mount = async () => {
      /* Match Cursor's Markdown Preview Mermaid Support defaults:
         theme default/dark, classic look, dagre layout, trebuchet stack.
         Do not override fontFamily — a site serif reflows every node. */
      mermaid.initialize({
        startOnLoad: false,
        theme: theme(),
        look: "classic",
        layout: "dagre",
        securityLevel: "strict",
        flowchart: {
          htmlLabels: true,
          // "basis" (Cursor default) draws soft Béziers; linear keeps
          // mostly straight segments with sharp corners at waypoints.
          curve: "linear",
          padding: 15,
          nodeSpacing: 50,
          rankSpacing: 50,
          wrappingWidth: 200,
          useMaxWidth: true,
        },
      });

      for (const [i, block] of blocks.entries()) {
        if (!block.pre?.isConnected) continue;
        try {
          const id = `mermaid-${i}-${Math.random().toString(36).slice(2, 9)}`;
          const { svg } = await mermaid.render(id, block.code);
          const figure = document.createElement("figure");
          figure.className = "mermaid";
          figure.setAttribute("role", "img");
          figure.innerHTML = svg;
          block.pre.replaceWith(figure);
          block.pre = figure;
        } catch {
          /* One bad diagram stays as source; the rest of the page carries on. */
        }
      }
    };

    await mount();

    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      async () => {
        /* Re-seed from the original source: after the first pass some
           blocks are figures, some (failed) are still <pre>. */
        for (const block of blocks) {
          if (block.pre?.classList?.contains("mermaid")) {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            code.className = "language-mermaid";
            code.textContent = block.code;
            pre.append(code);
            block.pre.replaceWith(pre);
            block.pre = pre;
          }
        }
        await mount();
      },
    );
  } catch {
    /* No module — the served markup already reads as source. */
  }
}
