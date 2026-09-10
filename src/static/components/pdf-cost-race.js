/* pdf-cost-race.js — the four measured ingestion paths race in real time.
   Lane speed is true to measured latency; when a lane finishes, a cost bar
   grows under it (scaled to the $0.0342 max) — the punchline is that the
   slowest lane is also 6x the cost. Data: 13-page contract, 2026-08-24. */
(function () {
  Fig.register("pdf-cost-race", function (el) {
    const cv = Fig.canvas(el, 318);
    Fig.frame(cv);
    const ctx = cv.ctx;

    // measured: [label, latency s, cost $, fidelity note, good]
    // labels mirror the post table; race math still uses the mid/anchor latency.
    const LANES = [
      ["native @ venice", 7.4, 0.0061, "12/13 pages", true],
      [
        "images 100dpi \u00B7 ~16s (10\u201324)",
        16.0,
        0.0078,
        "13/13 + signatures",
        true,
      ],
      ["cloudflare-ai, unpinned", 38.5, 0.0051, "13/13", true],
      [
        "mistral-ocr, unpinned",
        45.1,
        0.0342,
        "9/13 \u00B7 6\u00D7 cost",
        false,
      ],
    ];
    const T_MAX = 45.1,
      COST_MAX = 0.0342;
    const T_SCALE = 6.5; // real seconds compressed: race lasts ~7s
    const HOLD = 8; // race-seconds between cycles (~1.2s real)
    const HOLD_LAST = 22; // ~3s real — long enough to read the 6× bar
    const MAX_CYCLES = 2;
    let cycles = 0,
      done = false;
    let started = false,
      paused = false;
    let t0 = 0,
      pauseAccum = 0,
      pauseAt = 0;

    function raceElapsed() {
      if (!started) return 0;
      const now = paused ? pauseAt : performance.now();
      return Math.max(0, (now - t0 - pauseAccum) / 1000);
    }
    function armRace() {
      if (started) return;
      started = true;
      paused = false;
      pauseAccum = 0;
      t0 = performance.now();
      cycles = 0;
      done = false;
    }
    function resetRace() {
      started = true;
      paused = false;
      pauseAccum = 0;
      t0 = performance.now();
      cycles = 0;
      done = false;
      cv.redraw && cv.redraw();
    }

    const head = document.createElement("div");
    head.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;gap:.5rem;flex-wrap:wrap;margin:0 0 .4rem";
    const legend = document.createElement("p");
    legend.className = "meta";
    legend.style.cssText =
      "margin:0;font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace";
    legend.textContent =
      "track = latency \u00B7 bar = $ vs OCR max \u00B7 \u2713/\u2717 = field fidelity";
    const chip = Fig.chip("replay", resetRace);
    chip.style.whiteSpace = "nowrap";
    head.append(legend, chip);
    el.insertBefore(head, cv.el);

    // start as soon as any of the figure is on screen; pause while off-screen
    armRace();
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        (es) => {
          const e = es[0];
          if (!e) return;
          if (e.isIntersecting) {
            if (!started) armRace();
            else if (paused) {
              pauseAccum += performance.now() - pauseAt;
              paused = false;
            }
          } else if (started && !paused) {
            paused = true;
            pauseAt = performance.now();
          }
        },
        { threshold: [0, 0.05, 0.2, 1] },
      ).observe(el);
    }

    const draw = () => {
      const P = Fig.palette();
      const w = cv.w,
        h = cv.h;
      ctx.clearRect(0, 0, w, h);

      let raceT = raceElapsed() * (T_MAX / T_SCALE);
      const holdDur = cycles >= MAX_CYCLES - 1 ? HOLD_LAST : HOLD;
      if (!done && started && raceT > T_MAX + holdDur) {
        cycles += 1;
        if (cycles >= MAX_CYCLES) done = true;
        else {
          t0 = performance.now();
          pauseAccum = 0;
          pauseAt = 0;
          paused = false;
        }
        raceT = done ? T_MAX + holdDur : 0;
      }
      if (done) raceT = T_MAX + holdDur;
      const tNow = Math.min(raceT, T_MAX);

      const x0 = 12,
        x1 = w - 14;
      const topY = 26,
        laneH = (h - topY - 8) / LANES.length;
      const trackW = x1 - x0;

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = P.mute;
      const holdLeft = Math.max(0, T_MAX + holdDur - raceT);
      const holding = started && raceT >= T_MAX && !done;
      const holdReal = holdLeft * (T_SCALE / T_MAX);
      const status = !started
        ? ""
        : done
          ? " \u00B7 finished"
          : paused
            ? " \u00B7 paused"
            : holding
              ? " \u00B7 hold " + Math.ceil(holdReal) + "s"
              : "";
      let title = "t = " + tNow.toFixed(1) + " s" + status;
      while (ctx.measureText(title).width > trackW && title.length > 8)
        title = title.slice(0, -1);
      ctx.fillText(title, x0, 13);

      // time cursor: one subtle vertical line synced across all lanes
      const cx = x0 + trackW * (tNow / T_MAX);
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, topY - 4);
      ctx.lineTo(cx, h - 8);
      ctx.stroke();

      const now = performance.now();
      const pulse =
        (holding || done) && !Fig.reduced()
          ? 0.72 + 0.28 * Math.sin(now / 280)
          : 1;

      LANES.forEach((L, i) => {
        const [label, lat, cost, fid, good] = L;
        const yTop = topY + i * laneH;
        const yTrack = yTop + 22;
        const yCost = yTrack + 10;
        const yRes = yCost + 15;
        const prog = started ? Math.min(raceT / lat, 1) : 0;
        const px = x0 + trackW * prog;
        const costW = trackW * (cost / COST_MAX);

        ctx.fillStyle = P.ink;
        let lab = label;
        const latLab = lat.toFixed(1) + " s";
        const latW = ctx.measureText(latLab).width + 8;
        while (ctx.measureText(lab).width > trackW - latW && lab.length > 4)
          lab = lab.slice(0, -1);
        ctx.fillText(lab, x0, yTop + 8);
        ctx.fillStyle = P.mute;
        ctx.textAlign = "right";
        ctx.fillText(latLab, x1, yTop + 8);
        ctx.textAlign = "left";

        ctx.strokeStyle = P.rule;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x0, yTrack);
        ctx.lineTo(x1, yTrack);
        ctx.stroke();
        ctx.strokeStyle = good ? P.accent : P.mute;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, yTrack);
        ctx.lineTo(px, yTrack);
        ctx.stroke();
        ctx.fillStyle = good ? P.accent : P.mute;
        ctx.beginPath();
        ctx.arc(px, yTrack, 4, 0, Math.PI * 2);
        ctx.fill();

        // cost scale is always visible so idle/hold never look like empty tracks
        ctx.fillStyle = P.wash;
        ctx.fillRect(x0, yCost - 3, costW, 6);
        if (prog >= 1) {
          const grow = Math.min((raceT - lat) / 3, 1);
          const cw = costW * grow;
          ctx.save();
          ctx.globalAlpha = !good && grow >= 1 ? pulse : 1;
          ctx.fillStyle = good ? P.accent : P.mute;
          ctx.fillRect(x0, yCost - 3, cw, 6);
          ctx.restore();
          if (grow >= 1) {
            const money = "$" + cost.toFixed(4);
            ctx.fillStyle = P.mute;
            const mx = x0 + costW + 6;
            if (ctx.measureText(money).width + mx < x1)
              ctx.fillText(money, mx, yCost);
            else {
              ctx.textAlign = "right";
              ctx.fillStyle = P.paper;
              ctx.fillText(money, x0 + cw - 4, yCost);
              ctx.textAlign = "left";
            }
          }
          ctx.fillStyle = good ? P.ink : P.mute;
          let verd = (good ? "\u2713 " : "\u2717 ") + fid;
          while (ctx.measureText(verd).width > trackW && verd.length > 4)
            verd = verd.slice(0, -1);
          ctx.fillText(verd, x0, yRes);
        }
      });
    };

    Fig.animate(cv, draw);
    Fig.onScheme(draw);
    el.style.minHeight = "0";
  });
})();
