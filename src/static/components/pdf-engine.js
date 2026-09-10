/* pdf-engine.js — who reads the PDF: the four pdf.engine values.
   Each engine gets its own hue (brand accent / sage / ochre / terracotta).
   Chips pin a path; unset forks yes→native and no→mistral in those colours. */
(function () {
  Fig.register("pdf-engine", function (el) {
    const cv = Fig.canvas(el, 380);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const PATHS = [
      { id: "native", chip: "native" },
      { id: "cf", chip: "cloudflare-ai" },
      { id: "ocr", chip: "mistral-ocr" },
      { id: "unset", chip: "unset" },
    ];
    let pin = -1;
    const chips = [];

    /* Warm-paper companions to --accent: sage (free), ochre (paid),
       terracotta (trap). Dark variants keep ~contrast on --paper. */
    function hues(dark) {
      return dark
        ? {
            native: "#7e9ce6",
            cf: "#7eb89a",
            ocr: "#d4a574",
            unset: "#c4897a",
            nativeWash: "rgba(126,156,230,0.14)",
            cfWash: "rgba(126,184,154,0.14)",
            ocrWash: "rgba(212,165,116,0.14)",
            unsetWash: "rgba(196,137,122,0.14)",
          }
        : {
            native: "#2d4fa1",
            cf: "#3d6b52",
            ocr: "#9a6b2f",
            unset: "#8a5344",
            nativeWash: "rgba(45,79,161,0.10)",
            cfWash: "rgba(61,107,82,0.10)",
            ocrWash: "rgba(154,107,47,0.11)",
            unsetWash: "rgba(138,83,68,0.10)",
          };
    }

    const MONO =
      '10px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    const MONO9 =
      '9px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    const MONO11 =
      '11px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

    function geom() {
      const w = cv.w,
        h = cv.h;
      const pad = 10;
      const tight = w < 520;
      const bw = Math.min(158, Math.max(tight ? 90 : 112, (w - pad * 2 - 24) / 3.15));
      const bh = tight ? 62 : 58;
      const gap = Math.max(10, (w - pad * 2 - bw * 3) / 2);
      const left = pad + Math.max(0, (w - pad * 2 - bw * 3 - gap * 2) / 2);
      const leafY = h - bh - 14;
      const midY = tight ? 118 : 128;
      const uw = tight ? 96 : 108;
      const cCx = left + bw + gap + bw / 2;
      const mCx = left + 2 * (bw + gap) + bw / 2;

      return {
        w,
        h,
        bw,
        bh,
        tight,
        root: { x: w / 2 - (tight ? 58 : 70), y: 12, w: tight ? 116 : 140, h: 28 },
        N: { x: left, y: leafY, w: bw, h: bh },
        C: { x: left + bw + gap, y: leafY, w: bw, h: bh },
        M: { x: left + 2 * (bw + gap), y: leafY, w: bw, h: bh },
        U: { x: (cCx + mCx) / 2 - uw / 2, y: midY, w: uw, h: 44 },
        railY: 52,
        forkY: midY + 44 + 16,
      };
    }

    const top = (b) => [b.x + b.w / 2, b.y];
    const bot = (b) => [b.x + b.w / 2, b.y + b.h];

    function fit(s, maxW) {
      if (ctx.measureText(s).width <= maxW) return s;
      while (s.length > 1 && ctx.measureText(s + "\u2026").width > maxW)
        s = s.slice(0, -1);
      return s + "\u2026";
    }

    function box(b, lines, { stroke, fill, dim, diamond, bar, heavy } = {}) {
      const P = Fig.palette();
      ctx.save();
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.fillStyle = fill || P.wash;
      ctx.strokeStyle = stroke || P.rule;
      ctx.lineWidth = dim ? 1 : 1.5;
      ctx.beginPath();
      if (diamond) {
        const cx = b.x + b.w / 2,
          cy = b.y + b.h / 2;
        ctx.moveTo(cx, b.y);
        ctx.lineTo(b.x + b.w, cy);
        ctx.lineTo(cx, b.y + b.h);
        ctx.lineTo(b.x, cy);
        ctx.closePath();
      } else {
        ctx.rect(b.x, b.y, b.w, b.h);
      }
      ctx.fill();
      ctx.stroke();

      if (bar && !diamond && !dim) {
        ctx.fillStyle = stroke;
        ctx.fillRect(b.x, b.y, 3, b.h);
      }

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const n = lines.length;
      const step = diamond ? 12 : 13;
      const y0 = b.y + b.h / 2 - ((n - 1) * step) / 2;
      lines.forEach((ln, i) => {
        ctx.font = ln.cost ? MONO9 : heavy ? MONO11 : diamond ? MONO9 : MONO;
        ctx.fillStyle = ln.cost ? stroke || P.accent : P.ink;
        ctx.fillText(
          fit(ln.t, b.w - (diamond ? 28 : 14)),
          b.x + b.w / 2,
          y0 + i * step,
        );
      });
      ctx.restore();
    }

    function ortho(pts, { col, aw, dim, width } = {}) {
      const P = Fig.palette();
      ctx.save();
      ctx.globalAlpha = dim ? 0.18 : 1;
      ctx.strokeStyle = col || P.mute;
      ctx.lineWidth = width || (dim ? 1 : 1.5);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      if (aw && pts.length >= 2 && !dim) {
        const a = pts[pts.length - 2],
          b = pts[pts.length - 1];
        const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const s = 7;
        ctx.fillStyle = col || P.mute;
        ctx.beginPath();
        ctx.moveTo(b[0], b[1]);
        ctx.lineTo(
          b[0] - s * Math.cos(ang - 0.42),
          b[1] - s * Math.sin(ang - 0.42),
        );
        ctx.lineTo(
          b[0] - s * Math.cos(ang + 0.42),
          b[1] - s * Math.sin(ang + 0.42),
        );
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    function edgeLabel(x, y, text, { col, dim } = {}) {
      const P = Fig.palette();
      ctx.save();
      ctx.globalAlpha = dim ? 0.22 : 1;
      ctx.font = MONO9;
      const tw = ctx.measureText(text).width;
      const px = 5,
        py = 2.5;
      /* pill behind the label so the stem doesn't cut the type */
      ctx.fillStyle = P.paper;
      ctx.beginPath();
      const rx = x - tw / 2 - px,
        ry = y - 6 - py,
        rw = tw + px * 2,
        rh = 12 + py * 2,
        r = 3;
      ctx.moveTo(rx + r, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, r);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, r);
      ctx.arcTo(rx, ry + rh, rx, ry, r);
      ctx.arcTo(rx, ry, rx + rw, ry, r);
      ctx.closePath();
      ctx.fill();
      if (!dim) {
        ctx.strokeStyle = col || P.rule;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.fillStyle = col || P.mute;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    const on = (id) => pin < 0 || PATHS[pin].id === id;

    const draw = () => {
      const P = Fig.palette();
      const H = hues(P.dark);
      const g = geom();
      ctx.clearRect(0, 0, g.w, g.h);

      const rootBot = bot(g.root);
      const railY = g.railY;
      const nTop = top(g.N),
        cTop = top(g.C),
        mTop = top(g.M),
        uTop = top(g.U);

      /* Shared neck from root — quiet structure, not a case */
      ortho([rootBot, [rootBot[0], railY]], {
        col: P.rule,
        dim: pin >= 0,
        width: 1,
      });

      const fans = [
        {
          id: "native",
          tip: nTop,
          label: g.tight ? "native" : "native",
          col: H.native,
          ly: railY + 24,
        },
        {
          id: "cf",
          tip: cTop,
          label: g.tight ? "cf-ai" : "cloudflare-ai",
          col: H.cf,
          ly: railY + 24,
        },
        {
          id: "ocr",
          tip: mTop,
          label: g.tight ? "ocr" : "mistral-ocr",
          col: H.ocr,
          ly: railY + 24,
        },
        {
          id: "unset",
          tip: uTop,
          label: "unset",
          col: H.unset,
          ly: (railY + uTop[1]) / 2,
        },
      ];

      /* Draw dim paths first so the hot path sits on top */
      const ordered = [...fans].sort(
        (a, b) => (on(a.id) ? 1 : 0) - (on(b.id) ? 1 : 0),
      );
      for (const t of ordered) {
        const hot = on(t.id);
        /* Direct stems stop short of the leaf so the arrow doesn't bury in the card;
           unset stops at the diamond. */
        const tip = t.id === "unset" ? t.tip : [t.tip[0], t.tip[1] - 1];
        ortho([[rootBot[0], railY], [tip[0], railY], tip], {
          col: t.col,
          aw: true,
          dim: !hot,
        });
        edgeLabel(t.tip[0], t.ly, t.label, { col: t.col, dim: !hot });
      }

      const uHot = on("unset");
      const uBot = bot(g.U);
      const forkY = Math.min(g.forkY, nTop[1] - 24);
      /* yes inherits native blue; no inherits ocr ochre — the whole point of unset */
      ortho(
        [uBot, [uBot[0], forkY], [nTop[0], forkY], [nTop[0], nTop[1] - 1]],
        { col: H.native, aw: true, dim: !uHot },
      );
      ortho(
        [
          [uBot[0], forkY],
          [mTop[0], forkY],
          [mTop[0], mTop[1] - 1],
        ],
        { col: H.ocr, aw: true, dim: !uHot },
      );
      edgeLabel((uBot[0] + nTop[0]) / 2, forkY - 9, "yes", {
        col: H.native,
        dim: !uHot,
      });
      edgeLabel((uBot[0] + mTop[0]) / 2, forkY - 9, "no", {
        col: H.ocr,
        dim: !uHot,
      });

      box(g.root, [{ t: "pdf.engine" }], {
        stroke: pin < 0 ? P.ink : P.rule,
        fill: P.wash,
        heavy: true,
      });

      const nHot = on("native") || on("unset");
      const cHot = on("cf");
      const mHot = on("ocr") || on("unset");

      box(
        g.N,
        g.tight
          ? [
              { t: "Model reads PDF" },
              { t: "raw bytes" },
              { t: "cost: tokens", cost: true },
            ]
          : [
              { t: "Model reads PDF" },
              { t: "raw bytes \u2192 provider" },
              { t: "cost: input tokens", cost: true },
            ],
        {
          stroke: H.native,
          fill: nHot ? H.nativeWash : P.wash,
          dim: !nHot,
          bar: true,
        },
      );

      box(
        g.C,
        g.tight
          ? [
              { t: "Text \u2192 markdown" },
              { t: "blank on scans" },
              { t: "cost: free", cost: true },
            ]
          : [
              { t: "Text layer \u2192 markdown" },
              { t: "blank on scans" },
              { t: "cost: free", cost: true },
            ],
        {
          stroke: H.cf,
          fill: cHot ? H.cfWash : P.wash,
          dim: !cHot,
          bar: true,
        },
      );

      box(
        g.M,
        g.tight
          ? [
              { t: "OCR (scans)" },
              { t: "before routing" },
              { t: "cost: $2 / 1k pg", cost: true },
            ]
          : [
              { t: "OCR (scans / images)" },
              { t: "before routing" },
              { t: "cost: US$2 / 1k pages", cost: true },
            ],
        {
          stroke: H.ocr,
          fill: mHot ? H.ocrWash : P.wash,
          dim: !mHot,
          bar: true,
        },
      );

      box(g.U, [{ t: "Native" }, { t: "possible?" }], {
        diamond: true,
        stroke: H.unset,
        fill: uHot ? H.unsetWash : P.wash,
        dim: !uHot,
      });
    };

    function syncChips() {
      const H = hues(Fig.palette().dark);
      const cols = [H.native, H.cf, H.ocr, H.unset];
      chips.forEach((b, i) => {
        const isAll = i === PATHS.length;
        const pressed = isAll ? pin < 0 : pin === i;
        const col = isAll ? "var(--ink)" : cols[i];
        b.setAttribute("aria-pressed", pressed ? "true" : "false");
        b.style.opacity = pressed ? "1" : ".48";
        b.style.borderColor = pressed ? col : "var(--rule-fine)";
        b.style.color = pressed ? col : "";
        b.style.boxShadow = pressed ? `inset 3px 0 0 ${col}` : "none";
      });
    }

    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.65rem";
    PATHS.forEach((p, i) => {
      const b = Fig.chip(p.chip, () => {
        pin = i;
        syncChips();
        draw();
      });
      b.style.whiteSpace = "nowrap";
      chips.push(b);
      bar.appendChild(b);
    });
    const allBtn = Fig.chip("all", () => {
      pin = -1;
      syncChips();
      draw();
    });
    allBtn.style.whiteSpace = "nowrap";
    chips.push(allBtn);
    bar.appendChild(allBtn);
    el.appendChild(bar);
    syncChips();

    Fig.caption(
      el,
      "blue native \u00B7 sage text-layer (blank on scans) \u00B7 ochre OCR \u00B7 terracotta unset trap",
    );
    cv.redraw = () => {
      syncChips();
      draw();
    };
    draw();
    Fig.onScheme(() => {
      syncChips();
      draw();
    });
    el.style.minHeight = "0";
  });
})();
