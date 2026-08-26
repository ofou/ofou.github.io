/* pdf-model-lab.js — the PDF decision graph as a lab.
   Pick a brain (the leaderboard's twenty, or the measured qwen3.8-27b),
   set a scenario, and the graph lights the path to one of the thirteen
   terminal states while the strip below resolves the same request for
   every model — or, flipped to endpoints, across the eight measured
   hosts of qwen3.8-27b, the level where file support, pixel budgets,
   and context windows actually diverge. qwen3.8-27b and the eight
   endpoints carry the numbers measured on 2026-08-24; every other
   model row's economics are flagged assumptions (author: edit MODELS).
   The router machinery — 5 MB parser cap, 25-attachment silence, ~36 MB
   transport, engine defaults — is model-independent and measured. */
(function () {
  Fig.register("pdf-model-lab", function (el) {
    /* ---------- data ---------- */

    // score = leaderboard index (2026-08-24). ctx/inn/out are EDITABLE
    // SEEDS: measured for qwen3.8-27b (venice pricing), neighborhood
    // placeholders otherwise. pxcap = assumed provider pixel budget (px²).
    const MODELS = [
      {
        id: "opus5",
        name: "Opus 5",
        vendor: "anthropic",
        score: 59.2,
        ctx: 200000,
        inn: 5.0,
        out: 25.0,
        pxcap: 16777216,
      },
      {
        id: "glm53",
        name: "GLM-5.3",
        vendor: "z-ai",
        score: 59.1,
        ctx: 200000,
        inn: 0.6,
        out: 2.2,
        pxcap: 16777216,
      },
      {
        id: "grok46",
        name: "Grok 4.6",
        vendor: "x-ai",
        score: 58.7,
        ctx: 256000,
        inn: 3.0,
        out: 15.0,
        pxcap: 16777216,
      },
      {
        id: "qmax",
        name: "Qwen3.8 Max",
        vendor: "qwen",
        score: 58.4,
        ctx: 1000000,
        inn: 0.8,
        out: 3.0,
        pxcap: 16777216,
      },
      {
        id: "gpt56sol",
        name: "GPT-5.6 Sol",
        vendor: "openai",
        score: 57.8,
        ctx: 400000,
        inn: 1.25,
        out: 10.0,
        pxcap: 16777216,
      },
      {
        id: "q24t",
        name: "Qwen3.8 2.4T",
        vendor: "qwen",
        score: 57.1,
        ctx: 262144,
        inn: 0.7,
        out: 2.8,
        pxcap: 16777216,
      },
      {
        id: "fable5",
        name: "Fable 5",
        vendor: "anthropic",
        score: 56.6,
        ctx: 200000,
        inn: 4.0,
        out: 20.0,
        pxcap: 16777216,
      },
      {
        id: "kimi3",
        name: "Kimi K3",
        vendor: "moonshotai",
        score: 54.3,
        ctx: 256000,
        inn: 0.6,
        out: 2.5,
        pxcap: 16777216,
      },
      {
        id: "q27b",
        name: "Qwen3.8 27B",
        vendor: "qwen",
        score: 50.9,
        ctx: 262144,
        inn: 0.45,
        out: 3.2,
        pxcap: 16777216,
        measured: true,
        ali: 2621440,
      },
      {
        id: "gpt56ter",
        name: "GPT-5.6 Terra",
        vendor: "openai",
        score: 50.2,
        ctx: 400000,
        inn: 1.25,
        out: 10.0,
        pxcap: 16777216,
      },
      {
        id: "sonnet5",
        name: "Sonnet 5",
        vendor: "anthropic",
        score: 49.7,
        ctx: 200000,
        inn: 3.0,
        out: 15.0,
        pxcap: 16777216,
      },
      {
        id: "dsv4pro",
        name: "DS V4 Pro",
        vendor: "deepseek",
        score: 49.6,
        ctx: 128000,
        inn: 0.27,
        out: 1.1,
        pxcap: 16777216,
      },
      {
        id: "opus48",
        name: "Opus 4.8",
        vendor: "anthropic",
        score: 49.4,
        ctx: 200000,
        inn: 5.0,
        out: 25.0,
        pxcap: 16777216,
      },
      {
        id: "muse",
        name: "Muse Spark 1.2",
        vendor: "meta",
        score: 49.3,
        ctx: 1000000,
        inn: 0.5,
        out: 2.0,
        pxcap: 16777216,
      },
      {
        id: "grok45",
        name: "Grok 4.5",
        vendor: "x-ai",
        score: 48.9,
        ctx: 256000,
        inn: 3.0,
        out: 15.0,
        pxcap: 16777216,
      },
      {
        id: "dsv4fl",
        name: "DS V4 Flash",
        vendor: "deepseek",
        score: 48.4,
        ctx: 128000,
        inn: 0.1,
        out: 0.4,
        pxcap: 16777216,
      },
      {
        id: "gpt55",
        name: "GPT-5.5",
        vendor: "openai",
        score: 47.4,
        ctx: 400000,
        inn: 1.25,
        out: 10.0,
        pxcap: 16777216,
      },
      {
        id: "gpt56lun",
        name: "GPT-5.6 Luna",
        vendor: "openai",
        score: 46.9,
        ctx: 400000,
        inn: 1.25,
        out: 10.0,
        pxcap: 16777216,
      },
      {
        id: "opus47",
        name: "Opus 4.7",
        vendor: "anthropic",
        score: 46.3,
        ctx: 200000,
        inn: 5.0,
        out: 25.0,
        pxcap: 16777216,
      },
      {
        id: "glm52",
        name: "GLM-5.2",
        vendor: "z-ai",
        score: 45.7,
        ctx: 128000,
        inn: 0.6,
        out: 2.2,
        pxcap: 16777216,
      },
    ];
    const byId = Object.fromEntries(MODELS.map((m) => [m.id, m]));

    // the eight endpoints of qwen/qwen3.8-27b — every number here is
    // measured (endpoint table + billing audits, 2026-08-24).
    // file = accepts native file parts; pxcap = serving-layer pixel budget.
    const PROVS = [
      {
        id: "chutes",
        name: "Chutes",
        quant: "fp8",
        ctx: 262144,
        inn: 0.35,
        out: 2.75,
        file: false,
        pxcap: 16777216,
      },
      {
        id: "coreweave",
        name: "CoreWeave",
        quant: "fp8",
        ctx: 262144,
        inn: 0.4,
        out: 3.0,
        file: false,
        pxcap: 16777216,
      },
      {
        id: "akashml",
        name: "AkashML",
        quant: "bf16",
        ctx: 262144,
        inn: 0.4,
        out: 3.0,
        file: false,
        pxcap: 16777216,
      },
      {
        id: "alibaba",
        name: "Alibaba",
        quant: "?",
        ctx: 1000000,
        inn: 0.425,
        out: 2.55,
        file: false,
        pxcap: 2621440,
      },
      {
        id: "reka",
        name: "Reka",
        quant: "fp8",
        ctx: 262144,
        inn: 0.45,
        out: 3.2,
        file: false,
        pxcap: 16777216,
      },
      {
        id: "venice",
        name: "Venice",
        quant: "fp8",
        ctx: 262144,
        inn: 0.45,
        out: 3.2,
        file: true,
        pxcap: 16777216,
      },
      {
        id: "parasail",
        name: "Parasail",
        quant: "fp8",
        ctx: 262144,
        inn: 0.45,
        out: 3.2,
        file: false,
        pxcap: 16777216,
      },
      {
        id: "io-net",
        name: "io-net",
        quant: "fp8",
        ctx: 65500,
        inn: 0.48,
        out: 3.4,
        file: false,
        pxcap: 16777216,
      },
    ];
    const provById = Object.fromEntries(PROVS.map((p) => [p.id, p]));
    const LOGOS = {};
    PROVS.forEach((p) => {
      const img = new Image();
      img.onload = () => refresh();
      img.src = "/static/images/providers/" + p.id + ".png";
      LOGOS[p.id] = img;
    });

    const LEAF = {
      G1: { r: 1, cls: "good", name: "best fidelity" },
      G2: { r: 2, cls: "good", name: "correct, cheap" },
      G3: { r: 3, cls: "good", name: "correct, no layout" },
      Y1: { r: 4, cls: "pricey", name: "correct, 6x price" },
      S1: { r: 5, cls: "silent", name: "wrong answer" },
      S2: { r: 6, cls: "silent", name: "truncated at 25" },
      S3: { r: 7, cls: "silent", name: "quality loss" },
      S4: { r: 8, cls: "silent", name: "5.9x bill" },
      U1: { r: 9, cls: "undef", name: "undefined" },
      H1: { r: 10, cls: "err", name: "400 file input" },
      H2: { r: 11, cls: "err", name: "400/413 size" },
      H3: { r: 12, cls: "err", name: "400 count/ctx" },
      H4: { r: 13, cls: "err", name: "raise aspect" },
    };
    const COLORS = {
      good: "#16a34a",
      pricey: "#ca8a04",
      silent: "#ea580c",
      undef: "#9333ea",
      err: "#dc2626",
    };
    const UNPUB = "#d97706"; // dashed amber = gate on an unpublished fact

    /* ---------- state ---------- */
    const S = {
      model: "q27b",
      prov: "venice",
      strip: "models",
      sort: "best",
      route: "images",
      engine: "cf",
      pin: "none",
      scan: false,
      pages: 13,
      dpi: 100,
      mb: 2,
      files: 1,
    };

    /* ---------- resolver: scenario x model -> one of the 13 leaves ---------- */
    const FACTOR = 32;
    function smartResize(w, h, budget) {
      let wb = Math.round(w / FACTOR) * FACTOR,
        hb = Math.round(h / FACTOR) * FACTOR;
      if (wb * hb > budget) {
        const beta = Math.sqrt((w * h) / budget);
        wb = Math.max(FACTOR, Math.floor(w / beta / FACTOR) * FACTOR);
        hb = Math.max(FACTOR, Math.floor(h / beta / FACTOR) * FACTOR);
      }
      return [wb, hb];
    }
    const fmt = (n) => Math.round(n).toLocaleString("en-US");
    const money = (n) => "$" + n.toFixed(4);
    const px2 = (n) => (n / 1048576).toFixed(1) + "M px²";
    const fmtCtx = (n) => (n >= 1e6 ? "1M" : Math.round(n / 1024) + "K");
    const imgTok = (cap, s) => {
      const [wb, hb] = smartResize(8.5 * s.dpi, 11 * s.dpi, cap);
      return { wb, hb, tpp: (wb / FACTOR) * (hb / FACTOR) + 2 };
    };
    const cfCost = (u, pages) => (850 * pages * u.inn + 300 * u.out) / 1e6;
    const ocrCost = (u, s) =>
      (850 * s.pages * u.inn + 300 * u.out) / 1e6 + 0.002 * s.pages;

    function resolve(m, s) {
      const ass = m.measured
        ? ""
        : " — \u2248 assumed from model-card neighborhood";
      if (s.route === "images") {
        const { tpp } = imgTok(m.pxcap, s);
        const total = s.pages * tpp + 40;
        const pre = ["START", "ROUTE", "AR", "BUD"];
        if (total > m.ctx)
          return {
            leaf: "H3",
            path: [...pre, "H3"],
            cost: null,
            why: [
              `${fmt(total)} visual tok > ${fmt(m.ctx)} context${ass} — preflight 400 before any bytes are billed`,
              "the estimator reserves ~1,539 tok/image regardless of true size",
            ],
            gate: "model context window (published)",
          };
        const cost = (total * m.inn + 300 * m.out) / 1e6;
        const full = 8.5 * s.dpi * (11 * s.dpi);
        const why = [
          `${s.pages} pages × ${tpp} tok ≈ ${fmt(total)} tok ≈ ${((total / m.ctx) * 100).toFixed(0)}% of context${ass}`,
        ];
        if (m.measured && full > m.ali)
          why.push(
            "on alibaba this same request silently downscales past its 2.6M px² cap (~165 dpi) — same 200, smaller bill",
          );
        if (!m.measured)
          why.push(
            "pixel cap assumed = model config; no provider clamp measured for this model",
          );
        why.push(
          "images don't care whether the document is a scan — and work pinned or not, on every endpoint",
        );
        return {
          leaf: "G1",
          path: [...pre, "PIX", "G1"],
          cost,
          why,
          gate: "none — only published facts",
        };
      }

      const p0 = ["START", "ROUTE", "ENG"];
      if (s.engine === "cf" || s.engine === "ocr") {
        if (s.pin !== "none")
          return {
            leaf: "U1",
            path: [...p0, "PIN", "U1"],
            cost: null,
            why: [
              "parsing happens before routing, pinning after — identical payloads 400ed in the morning and 200ed by evening",
              "nothing in the response schema versions this; treat the combination as undefined",
            ],
            gate: "router internals (unpublished, unstable)",
          };
        const pre = [...p0, "PIN", "PSZ"];
        if (
          (s.engine === "cf" && s.mb > 5) ||
          (s.engine === "ocr" && s.mb > 36)
        )
          return {
            leaf: "H2",
            path: [...pre, "H2"],
            cost: null,
            why: [
              s.engine === "cf"
                ? "400: the file parser's 5 MB cap (measured 4.8 ✓, 5.0 ✗)"
                : "413: past the ~36 MB JSON transport wall (base64 inflates 1.33×)",
            ],
            gate: "parser/transport caps (measured, unpublished)",
          };
        if (s.scan) {
          if (s.engine === "cf")
            return {
              leaf: "S1",
              path: [...pre, "DOC", "S1"],
              cost: (225 * m.inn + 300 * m.out) / 1e6,
              why: [
                "the free extractor returns an empty document on a scan",
                "the model answers from the filename: 200, confident, zero grounding",
              ],
              gate: "parser behavior on scans (measured)",
            };
          return {
            leaf: "Y1",
            path: [...pre, "DOC", "Y1"],
            cost: ocrCost(m, s),
            why: [
              "OCR is the one engine built for scans — correct, at $2 per 1,000 pages",
              "the only signal that you overpaid is the invoice",
            ],
            gate: "price list (published, if you read it)",
          };
        }
        const pre2 = [...pre, "DOC", "FCT"];
        if (s.files > 25)
          return {
            leaf: "S2",
            path: [...pre2, "S2"],
            cost: cfCost(m, 25),
            why: [
              "files 26+ are silently dropped: 200, billed ~the same, answered confidently about the subset",
              "the API will not enforce this bound for you",
            ],
            gate: "parser attachment cap (unpublished)",
          };
        if (s.engine === "ocr")
          return {
            leaf: "Y1",
            path: [...pre2, "Y1"],
            cost: ocrCost(m, s),
            why: [
              "correct, but ~6× the price of the free parser on born-digital text — OCR reports segments, not pages",
            ],
            gate: "price list",
          };
        return {
          leaf: "G3",
          path: [...pre2, "G3"],
          cost: cfCost(m, s.files),
          why: [
            "13 of 13 fields correct on born-digital text — but blind to layout: the signature page arrived garbled",
            "keep the annotations: re-asks replay the parse for free",
          ],
          gate: "none beyond the 5 MB / 25-file caps",
        };
      }

      if (s.engine === "native") {
        const unpinned = s.pin === "none";
        if (unpinned || s.pin === "incapable")
          return {
            leaf: "H1",
            path: [...p0, "SUPP", "H1"],
            cost: null,
            why: [
              m.measured
                ? "7 of 8 endpoints 400: “model does not support PDF file input” — the model card promised files; the hosts didn't"
                : "file support unmeasured for this model — assuming the common case: no endpoint accepts file parts",
              unpinned
                ? "the router will not route around incapable endpoints"
                : "pinned to a host that cannot read files",
            ],
            gate: "provider file support (unpublished)",
          };
        if (s.mb > 32)
          return {
            leaf: "H2",
            path: [...p0, "SUPP", "NSZ", "H2"],
            cost: null,
            why: [
              "413 from the gateway past 32 MB — measured: 32 ✓ (317 s), 40 ✗",
            ],
            gate: "provider ingestion cap (measured, unpublished)",
          };
        if (s.files > 5)
          return {
            leaf: "H3",
            path: [...p0, "SUPP", "NFC", "H3"],
            cost: null,
            why: [
              "the 6th attachment hard-400s: the preflight counts files, not tokens",
            ],
            gate: "provider attachment cap (measured, unpublished)",
          };
        return {
          leaf: "G2",
          path: [...p0, "SUPP", "NFC", "G2"],
          cost: (90 * s.pages * m.inn + 300 * m.out) / 1e6,
          why: [
            "the model reads the raw bytes itself — 90 input tokens for the entire scanned poster",
            "ingestion billing is provider-private; 90 tok/page is the one measured anchor" +
              (m.measured ? "" : " (assumed)"),
          ],
          gate: "provider file support (unpublished)",
        };
      }

      // engine omitted
      if (s.pin !== "capable") {
        return {
          leaf: "S4",
          path: [...p0, "DEF", "SUPP", "S4"],
          cost: ocrCost(m, s),
          why: [
            "unset engine = “native if possible, else mistral-ocr” — on a host without file input, the else fires silently",
            `measured anchor: $0.0311 omitted vs $0.0053 named — one absent JSON field, 5.9×, visible only on the invoice or the metadata header (vs ~${money(cfCost(m, s.pages))} named)`,
          ],
          gate: "provider file support (unpublished) × the default engine",
        };
      }
      if (s.mb > 32)
        return {
          leaf: "H2",
          path: [...p0, "DEF", "SUPP", "NSZ", "H2"],
          cost: null,
          why: [
            "landed on the file-capable host, but 413 from the gateway past 32 MB",
          ],
          gate: "provider ingestion cap (measured, unpublished)",
        };
      if (s.files > 5)
        return {
          leaf: "H3",
          path: [...p0, "DEF", "SUPP", "NFC", "H3"],
          cost: null,
          why: [
            "landed on the file-capable host, but the 6th attachment hard-400s",
          ],
          gate: "provider attachment cap (measured, unpublished)",
        };
      return {
        leaf: "G2",
        path: [...p0, "DEF", "SUPP", "NFC", "G2"],
        cost: (90 * s.pages * m.inn + 300 * m.out) / 1e6,
        why: [
          "the omitted default happened to land on the one file-capable host",
          "ingestion billing is provider-private; 90 tok/page is the one measured anchor",
        ],
        gate: "provider file support (unpublished)",
      };
    }

    /* resolver at endpoint level: same graph, host-level facts */
    function resolveProv(p, s) {
      if (s.route === "images") {
        const { wb, hb, tpp } = imgTok(p.pxcap, s);
        const total = s.pages * tpp + 40;
        const pre = ["START", "ROUTE", "AR", "BUD"];
        if (total > p.ctx)
          return {
            leaf: "H3",
            path: [...pre, "H3"],
            cost: null,
            why: [
              `${fmt(total)} visual tok > ${p.id}'s ${fmtCtx(p.ctx)} window — preflight 400`,
              "io-net's 65,500 window is the tightest; alibaba's 1M the widest",
            ],
            gate: "endpoint context window (published)",
          };
        const shrunk =
          (wb / FACTOR) * (hb / FACTOR) <
          Math.round((8.5 * s.dpi) / FACTOR) *
            Math.round((11 * s.dpi) / FACTOR);
        const cost = (total * p.inn + 300 * p.out) / 1e6;
        if (shrunk)
          return {
            leaf: "S3",
            path: [...pre, "PIX", "S3"],
            cost,
            why: [
              `${Math.round(8.5 * s.dpi)}×${Math.round(11 * s.dpi)} px over ${p.id}'s ${px2(p.pxcap)} serving budget — silently resized to ${wb}×${hb}`,
              "measured: this endpoint bills 2,510 tok where the other seven bill 16,242",
            ],
            gate: "endpoint pixel cap (measured, unpublished)",
          };
        return {
          leaf: "G1",
          path: [...pre, "PIX", "G1"],
          cost,
          why: [
            `${s.pages} pages × ${tpp} tok ≈ ${fmt(total)} tok ≈ ${((total / p.ctx) * 100).toFixed(0)}% of ${fmtCtx(p.ctx)}`,
            "images work pinned or not, on every endpoint",
          ],
          gate: "none — only published facts",
        };
      }

      const p0 = ["START", "ROUTE", "ENG"];
      if (s.engine === "cf" || s.engine === "ocr") {
        if (s.pin !== "none")
          return {
            leaf: "U1",
            path: [...p0, "PIN", "U1"],
            cost: null,
            why: [
              "parsing happens before routing, pinning after — the combination flipped 400 ⇄ 200 within 12 h",
            ],
            gate: "router internals (unpublished, unstable)",
          };
        const pre = [...p0, "PIN", "PSZ"];
        if (
          (s.engine === "cf" && s.mb > 5) ||
          (s.engine === "ocr" && s.mb > 36)
        )
          return {
            leaf: "H2",
            path: [...pre, "H2"],
            cost: null,
            why: [
              s.engine === "cf"
                ? "400: the file parser's 5 MB cap — the parse dies before any host is involved"
                : "413: past the ~36 MB JSON transport wall",
            ],
            gate: "parser/transport caps (measured, unpublished)",
          };
        if (s.scan) {
          if (s.engine === "cf")
            return {
              leaf: "S1",
              path: [...pre, "DOC", "S1"],
              cost: (225 * p.inn + 300 * p.out) / 1e6,
              why: [
                "the free extractor returns nothing on a scan; the model confabulates from the filename",
                "the parsed text that does arrive bills at this endpoint's token prices",
              ],
              gate: "parser behavior on scans (measured)",
            };
          return {
            leaf: "Y1",
            path: [...pre, "DOC", "Y1"],
            cost: ocrCost(p, s),
            why: [
              "OCR is the one engine built for scans — correct, at $2 per 1,000 pages",
            ],
            gate: "price list (published, if you read it)",
          };
        }
        const pre2 = [...pre, "DOC", "FCT"];
        if (s.files > 25)
          return {
            leaf: "S2",
            path: [...pre2, "S2"],
            cost: cfCost(p, 25),
            why: [
              "files 26+ silently dropped; the surviving 25 bill at this endpoint's prices",
            ],
            gate: "parser attachment cap (unpublished)",
          };
        if (s.engine === "ocr")
          return {
            leaf: "Y1",
            path: [...pre2, "Y1"],
            cost: ocrCost(p, s),
            why: [
              "correct, but ~6× the price of the free parser on born-digital text",
            ],
            gate: "price list",
          };
        return {
          leaf: "G3",
          path: [...pre2, "G3"],
          cost: cfCost(p, s.files),
          why: [
            "correct on born-digital text, blind to layout — text tokens bill at this endpoint's prices",
          ],
          gate: "none beyond the 5 MB / 25-file caps",
        };
      }

      if (s.engine === "native" || s.engine === "omit") {
        const capable =
          s.engine === "native"
            ? s.pin === "capable" || (s.pin === "none" && p.file)
            : p.file && s.pin !== "incapable";
        const pre = [...p0, ...(s.engine === "omit" ? ["DEF"] : []), "SUPP"];
        if (!capable)
          return {
            leaf: s.engine === "omit" ? "S4" : "H1",
            path: [...pre, s.engine === "omit" ? "S4" : "H1"],
            cost: s.engine === "omit" ? ocrCost(p, s) : null,
            why:
              s.engine === "omit"
                ? [
                    "unset engine on a host without file parts: mistral-ocr fires silently, at 5.9× the named-engine cost",
                  ]
                : [
                    "this endpoint 400s: “model does not support PDF file input” — raw bytes forwarded, parser never ran",
                  ],
            gate: "endpoint file support (measured, unpublished)",
          };
        if (s.mb > 32)
          return {
            leaf: "H2",
            path: [...pre, "NSZ", "H2"],
            cost: null,
            why: ["413 from the gateway past 32 MB"],
            gate: "endpoint ingestion cap (measured, unpublished)",
          };
        if (s.files > 5)
          return {
            leaf: "H3",
            path: [...pre, "NFC", "H3"],
            cost: null,
            why: [
              "the 6th attachment hard-400s: the preflight counts files, not tokens",
            ],
            gate: "endpoint attachment cap (measured, unpublished)",
          };
        return {
          leaf: "G2",
          path: [...pre, "NFC", "G2"],
          cost: (90 * s.pages * p.inn + 300 * p.out) / 1e6,
          why: [
            p.file
              ? "the one endpoint whose serving stack reads raw PDFs — 90 input tokens for the entire scanned poster"
              : "the omitted default landed on the file-capable host",
            "ingestion billing is provider-private; 90 tok/page is the measured anchor",
          ],
          gate: "endpoint file support (measured, unpublished)",
        };
      }
    }

    /* ---------- controls ---------- */
    const top = document.createElement("div");
    el.appendChild(top);

    const blurb = document.createElement("p");
    blurb.className = "meta";
    blurb.style.cssText =
      "margin:0 0 .45rem;font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace";
    blurb.textContent =
      "same request \u00D7 many brains; \u25C6 measured \u00B7 \u2248 assumed";
    top.appendChild(blurb);

    function chipRow(parent, label, options, get, set) {
      const wrap = document.createElement("span");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:.3rem";
      const lab = document.createElement("span");
      lab.textContent = label;
      lab.style.cssText = "font:10px ui-monospace,monospace;opacity:.6";
      wrap.appendChild(lab);
      const btns = options.map((o) => {
        const b = Fig.chip(o.label, () => {
          set(o.value);
          refresh();
        });
        b.dataset.val = o.value;
        wrap.appendChild(b);
        return b;
      });
      parent.appendChild(wrap);
      return {
        sync() {
          btns.forEach((b) => {
            const on = b.dataset.val === get();
            b.style.opacity = on ? "1" : ".45";
            b.style.borderColor = on ? "var(--accent)" : "var(--rule)";
          });
        },
        wrap,
      };
    }
    function slider(parent, key, label, min, max, step) {
      const row = document.createElement("label");
      row.style.cssText =
        "display:inline-flex;align-items:center;gap:.35rem;font:10px ui-monospace,monospace";
      const lab = document.createElement("span");
      lab.textContent = label;
      lab.style.opacity = ".6";
      const inp = document.createElement("input");
      inp.type = "range";
      inp.min = min;
      inp.max = max;
      inp.step = step;
      inp.value = S[key];
      const out = document.createElement("output");
      out.textContent = S[key];
      inp.addEventListener("input", () => {
        S[key] = parseFloat(inp.value);
        out.textContent = inp.value;
        activePreset = null;
        refresh();
      });
      row.append(lab, inp, out);
      parent.appendChild(row);
      return { input: inp, row, out };
    }

    // presets mirror the post's sweeps + the opening green view
    const PRESETS = [
      {
        id: "img100",
        label: "images \u00B7 100 dpi",
        apply() {
          Object.assign(S, {
            route: "images",
            engine: "cf",
            pin: "none",
            scan: false,
            dpi: 100,
            pages: 13,
            mb: 2,
            files: 1,
          });
        },
      },
      {
        id: "img300",
        label: "images \u00B7 300 dpi",
        apply() {
          Object.assign(S, {
            route: "images",
            engine: "cf",
            pin: "none",
            scan: false,
            dpi: 300,
            pages: 13,
            mb: 2,
            files: 1,
          });
        },
      },
      {
        id: "cfscan",
        label: "file \u00B7 cf \u00B7 scan",
        apply() {
          Object.assign(S, {
            route: "file",
            engine: "cf",
            pin: "none",
            scan: true,
            dpi: 100,
            pages: 13,
            mb: 2,
            files: 1,
          });
        },
      },
      {
        id: "cfpinned",
        label: "file \u00B7 cf \u00B7 pinned",
        apply() {
          Object.assign(S, {
            route: "file",
            engine: "cf",
            pin: "capable",
            scan: false,
            dpi: 100,
            pages: 13,
            mb: 2,
            files: 1,
          });
        },
      },
      {
        id: "omit",
        label: "file \u00B7 engine omitted",
        apply() {
          Object.assign(S, {
            route: "file",
            engine: "omit",
            pin: "none",
            scan: false,
            dpi: 100,
            pages: 13,
            mb: 2,
            files: 1,
          });
        },
      },
    ];
    let activePreset = "img100";

    const presetBar = document.createElement("div");
    presetBar.style.cssText =
      "display:flex;gap:.35rem;flex-wrap:wrap;align-items:center;margin-bottom:.45rem";
    const presetLab = document.createElement("span");
    presetLab.textContent = "sweep";
    presetLab.style.cssText = "font:10px ui-monospace,monospace;opacity:.6";
    presetBar.appendChild(presetLab);
    const presetBtns = PRESETS.map((p) => {
      const b = Fig.chip(p.label, () => {
        activePreset = p.id;
        p.apply();
        // keep slider outputs in sync with Object.assign
        pgR.input.value = S.pages;
        pgR.out.textContent = S.pages;
        dpiR.input.value = S.dpi;
        dpiR.out.textContent = S.dpi;
        mbR.input.value = S.mb;
        mbR.out.textContent = S.mb;
        flR.input.value = S.files;
        flR.out.textContent = S.files;
        refresh();
      });
      b.dataset.preset = p.id;
      presetBar.appendChild(b);
      return b;
    });
    top.appendChild(presetBar);
    function syncPresets() {
      presetBtns.forEach((b) => {
        const on = b.dataset.preset === activePreset;
        b.style.opacity = on ? "1" : ".45";
        b.style.borderColor = on ? "var(--accent)" : "var(--rule)";
      });
    }

    const bar1 = document.createElement("div");
    bar1.style.cssText =
      "display:flex;gap:.9rem;flex-wrap:wrap;margin-bottom:.35rem;align-items:center";
    top.appendChild(bar1);
    const routeR = chipRow(
      bar1,
      "route",
      [
        { label: "page images", value: "images" },
        { label: "send file", value: "file" },
      ],
      () => S.route,
      (v) => {
        S.route = v;
        activePreset = null;
      },
    );
    const engR = chipRow(
      bar1,
      "engine",
      [
        { label: "native", value: "native" },
        { label: "cloudflare-ai", value: "cf" },
        { label: "mistral-ocr", value: "ocr" },
        { label: "omitted", value: "omit" },
      ],
      () => S.engine,
      (v) => {
        S.engine = v;
        activePreset = null;
      },
    );
    const pinR = chipRow(
      bar1,
      "pin",
      [
        { label: "none", value: "none" },
        { label: "capable (venice)", value: "capable" },
        { label: "incapable", value: "incapable" },
      ],
      () => S.pin,
      (v) => {
        S.pin = v;
        activePreset = null;
      },
    );
    const scanR = chipRow(
      bar1,
      "document",
      [
        { label: "born-digital", value: "0" },
        { label: "scan", value: "1" },
      ],
      () => String(+S.scan),
      (v) => {
        S.scan = v === "1";
        activePreset = null;
      },
    );
    const fileOnlyHint = document.createElement("span");
    fileOnlyHint.style.cssText =
      "font:9px ui-monospace,monospace;opacity:.55;display:none";
    fileOnlyHint.textContent = "engine / pin / scan \u2014 file route only";
    bar1.appendChild(fileOnlyHint);

    const bar2 = document.createElement("div");
    bar2.style.cssText =
      "display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:.5rem";
    top.appendChild(bar2);
    const stripR = chipRow(
      bar2,
      "strip",
      [
        { label: "models", value: "models" },
        { label: "the 8 endpoints", value: "provs" },
      ],
      () => S.strip,
      (v) => {
        S.strip = v;
      },
    );
    const sortR = chipRow(
      bar2,
      "sort",
      [
        { label: "best first", value: "best" },
        { label: "index", value: "index" },
      ],
      () => S.sort,
      (v) => {
        S.sort = v;
      },
    );
    const pgR = slider(bar2, "pages", "pages", 1, 300, 1);
    const dpiR = slider(bar2, "dpi", "dpi", 50, 450, 1);
    const mbR = slider(bar2, "mb", "size MB", 0.2, 40, 0.2);
    const flR = slider(bar2, "files", "attachments", 1, 48, 1);

    /* ---------- canvases ---------- */
    const GY = 26,
      GH = 300,
      LEAFW = 118,
      SW_Y = 366,
      RH = 19,
      X0 = 8;
    const cvM = Fig.canvas(el, 800);
    const cvP = Fig.canvas(el, 560);
    Fig.frame(cvM);
    Fig.frame(cvP);
    cvP.el.style.display = "none";
    const ctx = cvM.ctx,
      ctxP = cvP.ctx;

    // decision-node geometry: x fractions of the decision span, y of GH
    const N = {
      START: [0.03, 0.42],
      ROUTE: [0.15, 0.42],
      AR: [0.27, 0.06],
      BUD: [0.27, 0.24],
      PIX: [0.27, 0.44],
      ENG: [0.27, 0.68],
      SUPP: [0.395, 0.54],
      NSZ: [0.5, 0.46],
      NFC: [0.605, 0.46],
      PIN: [0.395, 0.78],
      PSZ: [0.5, 0.78],
      DOC: [0.605, 0.66],
      FCT: [0.675, 0.86],
      DEF: [0.3, 0.96],
    };
    const NLABEL = {
      START: "PDF",
      ROUTE: "file or images?",
      AR: "> 200:1?",
      BUD: "fits ctx?",
      PIX: "pixel cap?",
      ENG: "engine?",
      SUPP: "file parts?",
      NSZ: "≤ 32 MB?",
      NFC: "≤ 5 files?",
      PIN: "pinned?",
      PSZ: "size cap?",
      DOC: "scan?",
      FCT: "≤ 25 files?",
      DEF: "default route",
    };
    const UNP = new Set(["PIX", "SUPP", "FCT"]);
    const EDGES = [
      ["START", "ROUTE", ""],
      ["ROUTE", "AR", "images"],
      ["AR", "H4", "yes"],
      ["AR", "BUD", "no"],
      ["BUD", "H3", "no"],
      ["BUD", "PIX", "yes"],
      ["PIX", "S3", "over"],
      ["PIX", "G1", "under"],
      ["ROUTE", "ENG", "file"],
      ["ENG", "SUPP", "native"],
      ["ENG", "PIN", "cf / ocr"],
      ["ENG", "DEF", "omitted"],
      ["SUPP", "H1", "no"],
      ["SUPP", "NSZ", "yes"],
      ["NSZ", "H2", "no"],
      ["NSZ", "NFC", "yes"],
      ["NFC", "H3", "6th"],
      ["NFC", "G2", "ok"],
      ["PIN", "U1", "yes"],
      ["PIN", "PSZ", "no"],
      ["PSZ", "H2", "no"],
      ["PSZ", "DOC", "ok"],
      ["DOC", "S1", "scan+cf"],
      ["DOC", "Y1", "scan+ocr"],
      ["DOC", "FCT", "digital"],
      ["FCT", "S2", "26+"],
      ["FCT", "G3", "cf"],
      ["FCT", "Y1", "ocr"],
      ["DEF", "SUPP", ""],
      ["DEF", "S4", "incapable"],
    ];

    const MONO = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
    const MONO10 = "10px ui-monospace, SFMono-Regular, Menlo, monospace";

    function nodeRect(ctx_, id, W) {
      const dw = W - LEAFW - 30;
      if (LEAF[id]) {
        const y = GY + ((LEAF[id].r - 0.5) / 13) * GH;
        return { x: W - LEAFW - 6, y: y - 11, w: LEAFW, h: 22 };
      }
      const [fx, fy] = N[id];
      ctx_.font = MONO;
      const w = ctx_.measureText(NLABEL[id]).width + 14;
      return { x: X0 + fx * dw - w / 2, y: GY + fy * GH - 11, w, h: 22 };
    }
    function borderPt(r, tx, ty) {
      const cx = r.x + r.w / 2,
        cy = r.y + r.h / 2;
      const dx = tx - cx,
        dy = ty - cy;
      const t = Math.min(
        Math.abs((r.w / 2 + 4) / (dx || 1e-9)),
        Math.abs((r.h / 2 + 4) / (dy || 1e-9)),
      );
      return [cx + dx * t, cy + dy * t];
    }
    function roundRect(ctx_, x, y, w, h, r) {
      ctx_.beginPath();
      ctx_.moveTo(x + r, y);
      ctx_.arcTo(x + w, y, x + w, y + h, r);
      ctx_.arcTo(x + w, y + h, x, y + h, r);
      ctx_.arcTo(x, y + h, x, y, r);
      ctx_.arcTo(x, y, x + w, y, r);
      ctx_.closePath();
    }

    function drawGraph(ctx_, W) {
      const pal = Fig.palette();
      const m = S.strip === "models" ? byId[S.model] : provById[S.prov];
      const res = resolve2(m, S);
      const onPath = new Set(res.path);
      const activeEdge = new Set();
      for (let i = 0; i < res.path.length - 1; i++)
        activeEdge.add(res.path[i] + ">" + res.path[i + 1]);

      const dw = W - LEAFW - 30;
      ctx_.clearRect(0, 0, W, 366);
      ctx_.textBaseline = "middle";
      ctx_.font = "10px ui-monospace, monospace";
      ctx_.fillStyle = pal.mute;
      ctx_.textAlign = "left";
      ctx_.fillText(`DECISION GRAPH — path for ${m.name.toUpperCase()}`, 6, 13);

      // legend, right-aligned on the title line
      ctx_.font = "8.5px ui-monospace, monospace";
      const leg = [
        ["good", "correct"],
        ["pricey", "overpriced"],
        ["silent", "silent"],
        ["undef", "undefined"],
        ["err", "loud error"],
      ];
      let lx = dw - 6;
      for (let i = leg.length - 1; i >= 0; i--) {
        const [k, lab] = leg[i];
        ctx_.fillStyle = pal.mute;
        ctx_.textAlign = "right";
        ctx_.fillText(lab, lx, 13);
        lx -= ctx_.measureText(lab).width + 6;
        ctx_.fillStyle = COLORS[k] + "30";
        ctx_.fillRect(lx - 10, 8, 10, 10);
        ctx_.strokeStyle = COLORS[k];
        ctx_.strokeRect(lx - 9.5, 8.5, 9, 9);
        lx -= 18;
      }
      ctx_.setLineDash([3, 2]);
      ctx_.strokeStyle = UNPUB;
      ctx_.strokeRect(lx - 9.5, 8.5, 9, 9);
      ctx_.setLineDash([]);
      ctx_.textAlign = "right";
      ctx_.fillStyle = UNPUB;
      ctx_.fillText("unpublished", lx - 14, 13);
      ctx_.textAlign = "left";

      for (const [a, b, lab] of EDGES) {
        const ra = nodeRect(ctx_, a, W),
          rb = nodeRect(ctx_, b, W);
        const [ax, ay] = borderPt(ra, rb.x + rb.w / 2, rb.y + rb.h / 2);
        const [bx, by] = borderPt(rb, ra.x + ra.w / 2, ra.y + ra.h / 2);
        const act = activeEdge.has(a + ">" + b);
        ctx_.strokeStyle = act ? pal.accent : pal.rule;
        ctx_.lineWidth = act ? 2 : 1;
        ctx_.globalAlpha = act ? 1 : 0.3;
        ctx_.beginPath();
        ctx_.moveTo(ax, ay);
        ctx_.lineTo(bx, by);
        ctx_.stroke();
        const ang = Math.atan2(by - ay, bx - ax);
        ctx_.beginPath();
        ctx_.moveTo(bx, by);
        ctx_.lineTo(bx - 7 * Math.cos(ang - 0.4), by - 7 * Math.sin(ang - 0.4));
        ctx_.lineTo(bx - 7 * Math.cos(ang + 0.4), by - 7 * Math.sin(ang + 0.4));
        ctx_.closePath();
        ctx_.fillStyle = act ? pal.accent : pal.mute;
        ctx_.fill();
        if (act && lab) {
          ctx_.font = "8.5px ui-monospace, monospace";
          const tw = ctx_.measureText(lab).width;
          const mx = (ax + bx) / 2,
            my = (ay + by) / 2;
          ctx_.globalAlpha = 1;
          ctx_.fillStyle = pal.paper;
          ctx_.fillRect(mx - tw / 2 - 3, my - 6, tw + 6, 12);
          ctx_.fillStyle = pal.accent;
          ctx_.textAlign = "center";
          ctx_.fillText(lab, mx, my);
          ctx_.textAlign = "left";
        }
        ctx_.globalAlpha = 1;
      }
      for (const id of Object.keys(N)) {
        const r = nodeRect(ctx_, id, W);
        const act = onPath.has(id);
        const unp = UNP.has(id);
        ctx_.globalAlpha = act ? 1 : 0.5;
        roundRect(ctx_, r.x, r.y, r.w, r.h, 4);
        ctx_.fillStyle = pal.paper;
        ctx_.fill();
        ctx_.setLineDash(unp ? [4, 3] : []);
        ctx_.strokeStyle = act ? pal.accent : unp ? UNPUB : pal.mute;
        ctx_.lineWidth = act ? 2 : 1;
        ctx_.stroke();
        ctx_.setLineDash([]);
        ctx_.font = MONO;
        ctx_.fillStyle = act ? pal.ink : pal.mute;
        ctx_.textAlign = "center";
        ctx_.fillText(NLABEL[id], r.x + r.w / 2, r.y + r.h / 2 + 0.5);
        if (unp) {
          ctx_.fillStyle = UNPUB;
          ctx_.fillText("?", r.x + r.w - 5, r.y + 5);
        }
        ctx_.textAlign = "left";
        ctx_.globalAlpha = 1;
      }
      for (const id of Object.keys(LEAF)) {
        const L = LEAF[id];
        const r = nodeRect(ctx_, id, W);
        const act = onPath.has(id);
        const c = COLORS[L.cls];
        ctx_.globalAlpha = act ? 1 : 0.45;
        roundRect(ctx_, r.x, r.y, r.w, r.h, 4);
        ctx_.fillStyle = c + (act ? "30" : "12");
        ctx_.fill();
        ctx_.strokeStyle = c;
        ctx_.lineWidth = act ? 2 : 1;
        ctx_.stroke();
        ctx_.font = MONO;
        ctx_.fillStyle = act ? pal.ink : pal.mute;
        ctx_.fillText(`[${L.r}] ${L.name}`, r.x + 7, r.y + r.h / 2 + 0.5);
        ctx_.globalAlpha = 1;
      }
    }

    /* dispatch: resolve whichever unit the strip is showing */
    function resolve2(u, s) {
      return S.strip === "models" ? resolve(u, s) : resolveProv(u, s);
    }

    let sweepOrder = MODELS.slice();
    let provOrder = PROVS.slice();
    const byCost = (a, b) => (a.rr.cost ?? Infinity) - (b.rr.cost ?? Infinity);

    function drawStrip() {
      const cv = S.strip === "models" ? cvM : cvP;
      const ctx_ = cv.ctx;
      const W = cv.w,
        pal = Fig.palette();
      const units = S.strip === "models" ? MODELS : PROVS;
      let rows = units.map((u) => ({ u, rr: resolve2(u, S) }));
      if (S.sort === "best") {
        rows.sort(
          (a, b) => LEAF[a.rr.leaf].r - LEAF[b.rr.leaf].r || byCost(a, b),
        );
      }
      const order = rows.map((r) => r.u);
      if (S.strip === "models") sweepOrder = order;
      else provOrder = order;

      const selId = S.strip === "models" ? S.model : S.prov;
      const cols =
        S.strip === "models"
          ? {
              mark: 6,
              name: 24,
              vendor: 150,
              score: 258,
              chip: 276,
              chipW: 168,
              cost: 500,
              gate: 540,
            }
          : {
              mark: 6,
              name: 26,
              vendor: 118,
              score: 208,
              chip: 276,
              chipW: 168,
              cost: 500,
              gate: 540,
            };

      ctx_.clearRect(0, SW_Y - 26, W, cv.h - SW_Y + 26);
      ctx_.textBaseline = "middle";
      ctx_.font = "10px ui-monospace, monospace";
      ctx_.fillStyle = pal.mute;
      ctx_.fillText(
        S.strip === "models"
          ? `SAME REQUEST — EVERY MODEL${S.sort === "best" ? " · BEST FIRST" : ""}`
          : `SAME REQUEST — THE EIGHT ENDPOINTS OF qwen3.8-27b${S.sort === "best" ? " · BEST FIRST" : ""}`,
        6,
        SW_Y - 14,
      );
      ctx_.font = "8.5px ui-monospace, monospace";
      ctx_.textAlign = "right";
      ctx_.fillText(
        S.strip === "models" ? "idx" : "ctx",
        cols.score,
        SW_Y - 14,
      );
      ctx_.fillText("$ in", cols.cost, SW_Y - 14);
      ctx_.textAlign = "left";
      ctx_.fillText("leaf", cols.chip + 8, SW_Y - 14);
      ctx_.fillText("decided by", cols.gate, SW_Y - 14);

      rows.forEach((row, i) => {
        const { u: mm, rr } = row;
        const y = SW_Y + i * RH;
        const LC = COLORS[LEAF[rr.leaf].cls];
        const sel = mm.id === selId;
        if (sel) {
          ctx_.fillStyle = pal.wash;
          ctx_.fillRect(2, y - 1.5, W - 6, RH - 3);
        }
        ctx_.strokeStyle = sel ? pal.accent : "transparent";
        ctx_.lineWidth = 1.5;
        ctx_.strokeRect(2, y - 1.5, W - 6, RH - 3);
        ctx_.font = MONO10;
        ctx_.fillStyle = sel ? pal.ink : pal.mute;
        if (S.strip === "models")
          ctx_.fillText(mm.measured ? "◆" : "≈", cols.mark, y + 7);
        else if (LOGOS[mm.id] && LOGOS[mm.id].complete)
          ctx_.drawImage(LOGOS[mm.id], cols.mark, y + 0.5, 13, 13);
        ctx_.fillText(mm.name, cols.name, y + 7);
        ctx_.font = MONO;
        ctx_.fillStyle = pal.mute;
        ctx_.fillText(
          S.strip === "models" ? mm.vendor : mm.quant,
          cols.vendor,
          y + 7,
        );
        ctx_.font = MONO10;
        ctx_.fillStyle = sel ? pal.ink : pal.mute;
        ctx_.textAlign = "right";
        ctx_.fillText(
          S.strip === "models" ? mm.score.toFixed(1) : fmtCtx(mm.ctx),
          cols.score,
          y + 7,
        );
        ctx_.textAlign = "left";
        ctx_.fillStyle = LC + (sel ? "30" : "1a");
        ctx_.fillRect(cols.chip, y + 1.5, cols.chipW, 13);
        ctx_.strokeStyle = LC;
        ctx_.strokeRect(cols.chip + 0.5, y + 2, cols.chipW - 1, 12);
        ctx_.fillStyle = LC;
        ctx_.fillText(
          `[${LEAF[rr.leaf].r}] ${LEAF[rr.leaf].name}`,
          cols.chip + 7,
          y + 8,
        );
        ctx_.fillStyle = sel ? pal.ink : pal.mute;
        ctx_.textAlign = "right";
        ctx_.fillText(
          rr.cost == null ? "—" : rr.cost.toFixed(4),
          cols.cost,
          y + 7,
        );
        ctx_.textAlign = "left";
        ctx_.font = MONO;
        ctx_.fillStyle = pal.mute;
        let g = rr.gate;
        while (ctx_.measureText(g).width > W - cols.gate - 10 && g.length > 3)
          g = g.slice(0, -1);
        ctx_.fillText(g, cols.gate, y + 7);
      });
      ctx_.fillStyle = pal.mute;
      ctx_.font = "8.5px ui-monospace, monospace";
      ctx_.fillText(
        S.strip === "models"
          ? "\u25C6 measured 2026-08-24 \u00B7 \u2248 assumed from model-card neighborhood \u00B7 click a row to switch brains"
          : "endpoint facts measured 2026-08-24 \u00B7 click a row to inspect it \u00B7 every host serves the same model slug",
        6,
        SW_Y + rows.length * RH + 10,
      );
    }

    function draw() {
      const cv = S.strip === "models" ? cvM : cvP;
      drawGraph(cv.ctx, cv.w);
      drawStrip();
    }

    // sweep rows select the model / endpoint under inspection
    function rowAt(cv, my) {
      const i = Math.floor((my - SW_Y + 1.5) / RH);
      const order = cv === cvM ? sweepOrder : provOrder;
      return i >= 0 && i < order.length ? order[i].id : null;
    }
    [
      [cvM, "model"],
      [cvP, "prov"],
    ].forEach(([cv, key]) => {
      cv.el.addEventListener("click", (e) => {
        const r = cv.el.getBoundingClientRect();
        const id = rowAt(cv, e.clientY - r.top);
        if (id) {
          S[key] = id;
          refresh();
        }
      });
      cv.el.addEventListener("mousemove", (e) => {
        const r = cv.el.getBoundingClientRect();
        cv.el.style.cursor = rowAt(cv, e.clientY - r.top)
          ? "pointer"
          : "default";
      });
    });

    /* ---------- readout ---------- */
    const ro = document.createElement("div");
    ro.style.cssText = "margin-top:.55rem";
    el.appendChild(ro);

    function renderReadout() {
      const u = S.strip === "models" ? byId[S.model] : provById[S.prov];
      const res = resolve2(u, S);
      const L = LEAF[res.leaf];
      const c = COLORS[L.cls];
      ro.innerHTML = "";
      const badge = document.createElement("span");
      badge.textContent = `${u.name.toUpperCase()} → [${L.r}] ${L.name.toUpperCase()}`;
      badge.style.cssText = `display:inline-block;padding:.18rem .55rem;border:1.5px solid ${c};border-radius:3px;font:700 11px ui-monospace,monospace;color:${c};background:${c}1a;margin-bottom:.3rem`;
      ro.appendChild(badge);
      const bits = [];
      if (res.leaf === "G1" || res.leaf === "S3") {
        const { tpp } = imgTok(u.pxcap, S);
        const total = S.pages * tpp + 40;
        bits.push(
          `bill: ${fmt(total)} visual tok (${fmt(tpp)} / page) ≈ ${((total / u.ctx) * 100).toFixed(0)}% of ${fmt(u.ctx)} ctx`,
        );
      } else if (res.cost != null) {
        bits.push(
          `bill: ≈ ${money(res.cost)} (anchored on the measured runs; native ingestion billing is provider-private)`,
        );
      } else {
        bits.push("bill: none — the request dies before tokens are billed");
      }
      bits.push(`decided by: ${res.gate}`);
      bits.push(
        S.strip === "models"
          ? u.measured
            ? "economics: measured 2026-08-24 (venice pricing, 8 endpoints, 1 serves files)"
            : `economics: \u2248 assumed from model-card neighborhood — ctx ${fmt(u.ctx)}, $${u.inn}/M in, $${u.out}/M out`
          : `endpoint: ${u.quant}, ctx ${fmtCtx(u.ctx)}, $${u.inn}/M in — measured roster, 2026-08-24`,
      );
      bits.forEach((t) => {
        const p = document.createElement("div");
        p.style.cssText = "font:12px/1.5 ui-monospace,monospace;margin:.1rem 0";
        p.textContent = t;
        ro.appendChild(p);
      });
      const ul = document.createElement("ul");
      ul.style.cssText =
        "margin:.3rem 0 0;padding-left:1.1rem;font:12px/1.55 ui-monospace,monospace";
      res.why.forEach((w) => {
        const li = document.createElement("li");
        li.textContent = w;
        ul.appendChild(li);
      });
      ro.appendChild(ul);
    }

    /* ---------- wiring ---------- */
    function refresh() {
      const file = S.route === "file";
      [routeR, engR, pinR, scanR, stripR, sortR].forEach((r) => r.sync());
      syncPresets();
      [engR, pinR, scanR].forEach((r) => {
        r.wrap.style.opacity = file ? "1" : ".35";
        r.wrap.style.pointerEvents = file ? "auto" : "none";
      });
      fileOnlyHint.style.display = file ? "none" : "inline";
      [
        [pgR, true],
        [dpiR, true],
        [mbR, file],
        [flR, file],
      ].forEach(([r, on]) => {
        r.input.disabled = !on;
        r.row.style.opacity = on ? "1" : ".35";
      });
      cvM.el.style.display = S.strip === "models" ? "block" : "none";
      cvP.el.style.display = S.strip === "provs" ? "block" : "none";
      draw();
      renderReadout();
    }
    cvM.redraw = refresh;
    cvP.redraw = refresh;
    el.__lab = { S, byId, provById };
    refresh();
  });
})();
