/* mermaid.js — render ```mermaid fences as diagrams.
   Python-Markdown leaves them as <pre><code class="language-mermaid">;
   this module swaps each block for an SVG.

   Brand voice matches the rest of the page: paper field, hairline
   structure, monospace labels (the micro-label / code face — diagrams
   here are mostly UOp trees and pipelines, not prose). Colours come
   from :root tokens via Mermaid's base theme. Default: self-hosted
   under /static/vendor/mermaid/ (fetched by build.py). Pass ?cdn=1 to
   A/B against jsDelivr. VER is stamped at build to the resolved npm
   version so ?cdn=1 matches. If the module is unreachable the fences
   stay as plain source — never blank. */

const VER = "0.0.0";
const useCdn = new URLSearchParams(location.search).has("cdn");
const MODULE = useCdn
  ? `https://cdn.jsdelivr.net/npm/mermaid@${VER}/dist/mermaid.esm.min.mjs`
  : "/static/vendor/mermaid/mermaid.esm.min.mjs";

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
  /* Mono at init so dagre measures labels with the face that ships —
     a CSS font swap after render clips text inside fixed boxes. */
  const fontFamily =
    css("--mono-code").replace(/"/g, "") ||
    "JetBrains Mono, ui-monospace, monospace";

  return {
    darkMode: dark,
    background: paper,
    fontFamily,
    fontSize: "12.5px",
    /* Nodes sit on the sheet like kbd / plates: paper fill, mute
       hairline. Wash is reserved for secondary / alt bands, mark for
       notes — not for every box (that reads as card chrome). */
    primaryColor: paper,
    primaryTextColor: ink,
    primaryBorderColor: mute,
    secondaryColor: wash,
    secondaryTextColor: ink,
    secondaryBorderColor: mute,
    tertiaryColor: paper,
    tertiaryTextColor: ink,
    tertiaryBorderColor: mute,
    lineColor: mute,
    textColor: ink,
    mainBkg: paper,
    nodeBorder: mute,
    clusterBkg: paper,
    clusterBorder: mute,
    titleColor: ink,
    edgeLabelBackground: paper,
    nodeTextColor: ink,
    defaultLinkColor: mute,
    /* Sharp corners, 1px strokes — same hairline grammar as tables. */
    radius: "0",
    strokeWidth: "1px",
    /* Sequence — messages stay mute like flowchart edges; activation
       keeps the one accent pop. */
    actorBkg: paper,
    actorBorder: mute,
    actorTextColor: ink,
    actorLineColor: mute,
    signalColor: mute,
    signalTextColor: ink,
    labelBoxBkgColor: paper,
    labelBoxBorderColor: mute,
    labelTextColor: ink,
    loopTextColor: ink,
    noteBkgColor: mark,
    noteTextColor: ink,
    noteBorderColor: mute,
    activationBkgColor: wash,
    activationBorderColor: accent,
    actorFontSize: "12.5px",
    noteFontSize: "12.5px",
    messageFontSize: "12.5px",
    /* State / class */
    labelColor: ink,
    altBackground: wash,
    classText: ink,
    /* Pie — brand spectrum, micro-label sizes (Mermaid defaults 17–25) */
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
    pieTitleTextSize: "13px",
    pieSectionTextSize: "12.5px",
    pieLegendTextSize: "12.5px",
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
    commitLabelBackground: paper,
    commitLabelFontSize: "11px",
  };
};

/* Mermaid still paints a few defaults past themeVariables; strip the
   leftover chrome so the SVG matches table / kbd hairlines. */
const themeCSS = [
  ".node rect,.node circle,.node ellipse,.node polygon,.node path,",
  ".actor,.labelBox{stroke-width:1px!important}",
  ".cluster rect{fill:transparent!important;stroke-width:1px!important;",
  "stroke-dasharray:4 3}",
  ".edgePath .path,.flowchart-link,.messageLine0,.messageLine1,",
  ".loopLine,.relation{stroke-width:1.15px!important}",
  "marker path{stroke-width:1px!important}",
  "g.classGroup text,.classLabel .label{fill:inherit!important;color:inherit}",
  ".pieTitleText{font-size:13px!important}",
  "text.slice,.legend text{font-size:12.5px!important}",
].join("");

const harden = (svgRoot) => {
  /* Force sharp corners even when a diagram look sets rx/ry. */
  svgRoot.querySelectorAll("rect").forEach((r) => {
    r.setAttribute("rx", "0");
    r.setAttribute("ry", "0");
  });
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
        themeCSS,
        look: "classic",
        layout: "dagre",
        securityLevel: "strict",
        flowchart: {
          htmlLabels: true,
          // "basis" draws soft Béziers; linear keeps mostly straight
          // segments with sharp corners at waypoints.
          curve: "linear",
          padding: 12,
          nodeSpacing: 40,
          rankSpacing: 44,
          wrappingWidth: 180,
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
          const root = figure.querySelector("svg");
          if (root) harden(root);
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
