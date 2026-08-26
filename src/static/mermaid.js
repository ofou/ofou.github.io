/* mermaid.js — render ```mermaid fences as diagrams.
   Python-Markdown leaves them as <pre><code class="language-mermaid">;
   this module swaps each block for an SVG. Theme is the site palette
   (--paper, --ink, --wash, --mute, --accent, …) via Mermaid's base
   theme + themeVariables, not default/dark. If the CDN is unreachable
   the fences stay as plain source — never blank. */

const MODULE =
  "https://cdn.jsdelivr.net/npm/mermaid@11.12.2/dist/mermaid.esm.min.mjs";

const blocks = [...document.querySelectorAll("pre code.language-mermaid")].map(
  (el) => ({
    pre: el.closest("pre"),
    code: el.textContent.replace(/\n$/, ""),
  }),
);

const css = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const brandTheme = () => {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const paper = css("--paper");
  const ink = css("--ink");
  const mute = css("--mute");
  const wash = css("--wash");
  const mark = css("--mark");
  const accent = css("--accent");
  const ok = css("--ok");
  const fail = css("--fail");
  const warn = css("--warn");
  /* Serif at init so dagre measures labels with the face that ships —
     overriding font in CSS after render clips text inside fixed boxes. */
  const fontFamily = css("--serif").replace(/"/g, "") || "Georgia, serif";

  return {
    darkMode: dark,
    background: paper,
    fontFamily,
    fontSize: "15px",
    primaryColor: wash,
    primaryTextColor: ink,
    primaryBorderColor: mute,
    secondaryColor: mark,
    secondaryTextColor: ink,
    secondaryBorderColor: mute,
    tertiaryColor: paper,
    tertiaryTextColor: ink,
    tertiaryBorderColor: mute,
    lineColor: mute,
    textColor: ink,
    mainBkg: wash,
    nodeBorder: mute,
    clusterBkg: paper,
    clusterBorder: mute,
    titleColor: ink,
    edgeLabelBackground: paper,
    nodeTextColor: ink,
    defaultLinkColor: mute,
    /* Sequence */
    actorBkg: wash,
    actorBorder: mute,
    actorTextColor: ink,
    actorLineColor: mute,
    signalColor: ink,
    signalTextColor: ink,
    labelBoxBkgColor: wash,
    labelBoxBorderColor: mute,
    labelTextColor: ink,
    loopTextColor: ink,
    noteBkgColor: mark,
    noteTextColor: ink,
    noteBorderColor: mute,
    activationBkgColor: wash,
    activationBorderColor: accent,
    /* State / class */
    labelColor: ink,
    altBackground: wash,
    /* Pie — brand spectrum, not Mermaid's defaults */
    pie1: accent,
    pie2: mute,
    pie3: ok,
    pie4: warn,
    pie5: fail,
    pie6: mark,
    pie7: wash,
    pieTitleTextColor: ink,
    pieSectionTextColor: ink,
    pieLegendTextColor: ink,
    pieStrokeColor: paper,
    /* Git graph */
    git0: accent,
    git1: ok,
    git2: warn,
    git3: fail,
    git4: mute,
    git5: mark,
    gitBranchLabel0: paper,
    gitBranchLabel1: paper,
    gitBranchLabel2: ink,
    gitBranchLabel3: paper,
    gitBranchLabel4: paper,
    gitBranchLabel5: ink,
    commitLabelColor: ink,
    commitLabelBackground: wash,
    commitLabelFontSize: "12px",
  };
};

if (!blocks.length) {
  /* nothing to do */
} else {
  try {
    const { default: mermaid } = await import(MODULE);

    const mount = async () => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: brandTheme(),
        look: "classic",
        layout: "dagre",
        securityLevel: "strict",
        flowchart: {
          htmlLabels: true,
          // "basis" draws soft Béziers; linear keeps mostly straight
          // segments with sharp corners at waypoints.
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
