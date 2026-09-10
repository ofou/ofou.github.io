/* pdf-router.js — animated packet-flow of OpenRouter's PDF ingestion logic.
   Auto-cycles by default; chips pin one scenario (incl. native·400).
   Parsers and images fan out to all 8 providers; native hits one host. */
(function () {
  Fig.register("pdf-router", function (el) {
    const cv = Fig.canvas(el, 360);
    Fig.frame(cv);
    const ctx = cv.ctx;

    const PROVIDERS = [
      "chutes",
      "coreweave",
      "akashml",
      "alibaba",
      "reka",
      "venice",
      "parasail",
      "io-net",
    ];
    const VENICE = 5;

    // Short chip labels; canvas shows the fuller API detail.
    const SCEN = [
      {
        id: "native",
        chip: "native",
        title: "engine: native \u00B7 pinned venice",
      },
      {
        id: "native400",
        chip: "native \u00B7 400",
        title: "engine: native \u00B7 pinned alibaba",
      },
      {
        id: "cf",
        chip: "cloudflare",
        title: "engine: pdf-text \u00B7 cloudflare-ai",
      },
      { id: "ocr", chip: "mistral-ocr", title: "engine: mistral-ocr" },
      {
        id: "omitted",
        chip: "omitted",
        title: "engine omitted \u00B7 silent default",
      },
      {
        id: "images",
        chip: "images",
        title: "images route \u00B7 pdftoppm \u2192 png",
      },
    ];
    const LEG = 800,
      HOLD = 2000; // ms per leg, ms result hold
    let scen = 0,
      phase = 0,
      autoCycle = true;
    let phaseStart = performance.now(),
      doneAt = 0;
    let chips = [];

    function geom() {
      const w = cv.w,
        h = cv.h;
      const tight = w < 520;
      const colW = Math.min(100, Math.max(tight ? 70 : 80, w * 0.2));
      const provX = w - colW,
        dotX = provX - 10,
        x0 = 10;
      const span = dotX - x0 - 40 - 10;
      const bw = Math.max(52, Math.min(90, span * 0.34));
      const gap = Math.max(12, span * 0.1);
      const ex = x0 + 40 + gap;
      return {
        w,
        h,
        tight,
        provX,
        dotX,
        colW,
        pdf: { x: x0, y: h * 0.44, w: 40, h: 30 },
        engine: { x: ex, y: h * 0.2, w: bw, h: 30 },
        parser: { x: ex + bw + gap, y: h * 0.2, w: bw, h: 32 },
        render: {
          x: ex + 4,
          y: h * 0.72,
          w: Math.min(tight ? 88 : 112, bw + 28),
          h: 30,
        },
        provY: (i) => 22 + i * ((h - 48) / (PROVIDERS.length - 1)),
      };
    }
    const rightOf = (b) => [b.x + b.w, b.y + b.h / 2];
    const leftOf = (b) => [b.x, b.y + b.h / 2];
    const MONO10 = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    const MONO9 = "9px ui-monospace, SFMono-Regular, Menlo, monospace";

    function fitText(s, maxW) {
      if (ctx.measureText(s).width <= maxW) return s;
      while (s.length > 1 && ctx.measureText(s + "\u2026").width > maxW)
        s = s.slice(0, -1);
      return s + "\u2026";
    }
    function box(b, label, hot) {
      const P = Fig.palette();
      ctx.fillStyle = P.wash;
      ctx.strokeStyle = hot ? P.accent : P.rule;
      ctx.lineWidth = hot ? 1.5 : 1;
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = P.ink;
      ctx.font = MONO10;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fitText(label, b.w - 8), b.x + b.w / 2, b.y + b.h / 2);
    }

    /* gentle quadratic curves: control point bends perpendicular to the chord */
    function ctrlPt(a, b) {
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        L = Math.hypot(dx, dy) || 1;
      const k = Math.min(14, L * 0.14);
      return [
        (a[0] + b[0]) / 2 - (dy / L) * k,
        (a[1] + b[1]) / 2 + (dx / L) * k,
      ];
    }
    const qPoint = (a, c, b, u) => {
      const v = 1 - u;
      return [
        v * v * a[0] + 2 * v * u * c[0] + u * u * b[0],
        v * v * a[1] + 2 * v * u * c[1] + u * u * b[1],
      ];
    };
    function arrow(tip, ang, size, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(
        tip[0] - size * Math.cos(ang - 0.42),
        tip[1] - size * Math.sin(ang - 0.42),
      );
      ctx.lineTo(
        tip[0] - size * Math.cos(ang + 0.42),
        tip[1] - size * Math.sin(ang + 0.42),
      );
      ctx.closePath();
      ctx.fill();
    }
    function edge(a, b, col, aw) {
      const c = ctrlPt(a, b);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]);
      ctx.stroke();
      if (aw) arrow(b, Math.atan2(b[1] - c[1], b[0] - c[0]), aw, col);
    }
    const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u)); // smoothstep

    /* per-scenario waypoint legs + outcome (measured results — do not edit) */
    function plan(g, s) {
      const pdfR = rightOf(g.pdf),
        engL = leftOf(g.engine),
        engR = rightOf(g.engine);
      const parL = leftOf(g.parser),
        parR = rightOf(g.parser);
      const ven = [g.dotX + 2, g.provY(VENICE)],
        ali = [g.dotX + 2, g.provY(3)];
      const renL = leftOf(g.render),
        renR = rightOf(g.render);
      switch (s) {
        case 0:
          return {
            legs: [
              [pdfR, engL],
              [engR, ven],
            ],
            ok: true,
            target: VENICE,
            note: "raw PDF \u2192 venice \u00B7 7 s \u00B7 $0.006",
          };
        case 1:
          return {
            legs: [
              [pdfR, engL],
              [engR, ali],
            ],
            ok: false,
            target: 3,
            note: "other 7 \u2192 400 no file input",
          };
        case 2:
          return {
            legs: [
              [pdfR, engL],
              [engR, parL],
              [parR, ven],
            ],
            ok: true,
            target: -2,
            note: "parsed \u2192 markdown \u00B7 FREE \u00B7 any provider",
            parse: true,
            fanout: true,
          };
        case 3:
          return {
            legs: [
              [pdfR, engL],
              [engR, parL],
              [parR, ven],
            ],
            ok: true,
            target: -2,
            note: "OCR \u00B7 $2 / 1000 pages \u00B7 6\u00D7 cost",
            parse: true,
            paid: true,
            fanout: true,
          };
        case 4:
          return {
            legs: [
              [pdfR, engL],
              [engR, parL],
              [parR, ven],
            ],
            ok: true,
            target: -2,
            note: "silent default \u2192 PAID mistral-ocr",
            parse: true,
            paid: true,
            fanout: true,
          };
        case 5:
          return {
            legs: [
              [pdfR, renL],
              [renR, [g.dotX + 2, g.provY(0)]],
            ],
            ok: true,
            target: -2,
            note: "918 tok/page \u00B7 all 8 providers \u00B7 pinned or not",
            images: true,
            fanout: true,
          };
      }
    }

    function packet(a, b, u, col, r) {
      const c = ctrlPt(a, b);
      for (let k = 6; k >= 1; k--) {
        // fading trail behind the head
        const uu = ease(u) - k * 0.055;
        if (uu <= 0) continue;
        const q = qPoint(a, c, b, uu);
        ctx.globalAlpha = (1 - k / 7) * 0.35;
        ctx.beginPath();
        ctx.arc(q[0], q[1], Math.max(0.6, r - k * 0.45), 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const q = qPoint(a, c, b, ease(u));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(q[0], q[1], r, 0, Math.PI * 2);
      ctx.fill();
    }

    function syncChips() {
      chips.forEach((b, i) => {
        const on = i < SCEN.length ? !autoCycle && scen === i : autoCycle;
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.style.opacity = on ? "1" : ".45";
        b.style.borderColor = on ? "var(--accent)" : "var(--rule)";
        b.style.color = on ? "var(--accent)" : "";
      });
    }

    const draw = () => {
      const P = Fig.palette();
      const now = performance.now();
      const g = geom();
      ctx.clearRect(0, 0, g.w, g.h);

      const s = SCEN[scen];
      const p = plan(g, scen);
      const images = !!p.images;
      const parse = !!p.parse;

      // advance phase from wall-clock (never frame deltas — survives pause/resume)
      let u = (now - phaseStart) / LEG;
      while (u >= 1 && phase < p.legs.length) {
        phase++;
        phaseStart += LEG;
        u -= 1;
        if (phase >= p.legs.length) doneAt = now;
      }
      const done = Fig.reduced() || phase >= p.legs.length;
      const pd = Fig.reduced() ? 9 : done ? (now - doneAt) / 1000 : 0;
      const pulse = done && pd < 0.7 ? Math.sin((pd / 0.7) * Math.PI) : 0;

      // skeleton: active path mute; unused edges drawn faintly (no arrow)
      const onEng = !images;
      const onPar = parse;
      const onRen = images;
      function skel(a, b, on, aw) {
        ctx.globalAlpha = on ? 1 : 0.28;
        edge(a, b, on ? P.mute : P.rule, on ? aw : 0);
        ctx.globalAlpha = 1;
      }
      skel(rightOf(g.pdf), leftOf(g.engine), onEng, 4);
      skel(rightOf(g.engine), leftOf(g.parser), onPar, 4);
      skel(rightOf(g.pdf), leftOf(g.render), onRen, 4);
      const fromBox = images ? g.render : parse ? g.parser : g.engine;
      for (let i = 0; i < PROVIDERS.length; i++) {
        const hit = p.target === -2 || i === p.target;
        skel(rightOf(fromBox), [g.dotX + 2, g.provY(i)], hit, 3);
      }

      box(g.pdf, "PDF");
      box(g.engine, "engine?", onEng && phase >= 0);
      box(
        g.parser,
        p.paid ? (g.tight ? "OCR $" : "OCR  $") : "parse\u2192md",
        !!p.parse && phase >= 1,
      );
      box(g.render, g.tight ? "pdftoppm" : "pdftoppm \u2192 png", images);

      // provider column
      ctx.font = MONO9;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      for (let i = 0; i < PROVIDERS.length; i++) {
        const y = g.provY(i);
        let c = P.mute,
          mark = "",
          hit = false;
        if (done) {
          if (p.target === -2) {
            c = P.accent;
            mark = " \u2713";
            hit = true;
          } else if (i === p.target) {
            c = P.accent;
            mark = p.ok ? " \u2713" : " \u2717 400";
            hit = true;
          }
        }
        if (i === VENICE) {
          ctx.fillStyle = P.ink;
          ctx.fillText("\u25C6", g.provX - 12, y);
        }
        ctx.fillStyle = c;
        const markLab = g.tight && mark.includes("400") ? " \u2717" : mark;
        ctx.fillText(
          fitText(PROVIDERS[i] + markLab, g.colW - 8),
          g.provX + 2,
          y,
        );
        ctx.fillStyle =
          done && mark.includes("\u2717")
            ? c
            : done && mark
              ? P.accent
              : P.mute;
        ctx.beginPath();
        ctx.arc(g.dotX + 2, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        if (hit && pulse > 0) {
          // outcome pulse: expanding ring
          ctx.globalAlpha = 1 - pd / 0.7;
          ctx.strokeStyle = P.accent;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(g.dotX + 2, y, 3 + pulse * 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // scenario caption + outcome note
      ctx.font = MONO10;
      ctx.textAlign = "left";
      ctx.fillStyle = P.ink;
      ctx.fillText(fitText("\u25B8 " + s.title, g.w - 28), 14, 14);
      if (done) {
        ctx.globalAlpha = Math.min(1, pd * 5) * (0.72 + 0.28 * pulse);
        ctx.fillStyle = p.ok ? P.accent : P.mute;
        ctx.fillText(fitText(p.note, g.w - 28), 14, g.h - 12);
        if (pulse > 0) {
          // brief underline swell under the note
          ctx.strokeStyle = p.ok ? P.accent : P.mute;
          ctx.lineWidth = 1;
          const nw = Math.min(ctx.measureText(p.note).width, g.w - 28) * pulse;
          ctx.beginPath();
          ctx.moveTo(14, g.h - 5);
          ctx.lineTo(14 + nw, g.h - 5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // packet(s)
      if (!done) {
        const col = p.parse && phase >= 2 ? P.ink : P.accent;
        const last = phase === p.legs.length - 1;
        if (p.fanout && last) {
          // fan out to ALL 8 providers
          const from = rightOf(images ? g.render : g.parser);
          for (let i = 0; i < PROVIDERS.length; i++)
            packet(from, [g.dotX + 2, g.provY(i)], u, P.accent, 2.4);
        } else {
          const leg = p.legs[phase];
          packet(leg[0], leg[1], u, col, 4);
        }
      } else if (autoCycle && !Fig.reduced() && now - doneAt > HOLD) {
        phase = 0;
        phaseStart = now;
        doneAt = 0;
        scen = (scen + 1) % SCEN.length;
        syncChips();
      }
    };

    // chips to pin a scenario
    const bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.5rem";
    SCEN.forEach((s, i) => {
      const b = Fig.chip(s.chip, () => {
        scen = i;
        phase = 0;
        phaseStart = performance.now();
        doneAt = 0;
        autoCycle = false;
        syncChips();
        cv.redraw && cv.redraw();
      });
      b.style.whiteSpace = "nowrap";
      chips.push(b);
      bar.appendChild(b);
    });
    const autoBtn = Fig.chip("auto", () => {
      autoCycle = true;
      syncChips();
      cv.redraw && cv.redraw();
    });
    autoBtn.style.whiteSpace = "nowrap";
    chips.push(autoBtn);
    bar.appendChild(autoBtn);
    el.appendChild(bar);
    syncChips();

    Fig.caption(
      el,
      "packet = request \u00B7 chips pin path \u00B7 \u25C6 = only native PDF host \u00B7 bottom = outcome",
    );

    Fig.animate(cv, draw);
    Fig.onScheme(draw);
    el.style.minHeight = "0";
  });
})();
