/* pdf-cost-race.js — the four measured ingestion paths race in real time.
   Lane speed is true to measured latency; when a lane finishes, a cost bar
   grows under it (scaled to the $0.0342 max) — the punchline is that the
   slowest lane is also 6x the cost. Data: 13-page contract, 2026-08-24. */
(function () {
  Fig.register("pdf-cost-race", function (el) {
    // legend strip (HTML so it stays readable at narrow widths)
    const legend = document.createElement("p");
    legend.className = "meta";
    legend.style.cssText = "margin:0 0 .4rem;font:10px/1.35 ui-monospace,SFMono-Regular,Menlo,monospace";
    legend.textContent = "track = latency \u00B7 bar = $ vs OCR max \u00B7 \u2713/\u2717 = field fidelity";
    el.appendChild(legend);

    const cv = Fig.canvas(el, 300);
    Fig.frame(cv);
    const ctx = cv.ctx;

    // measured: [label, latency s, cost $, fidelity note, good]
    // labels mirror the post table; race math still uses the mid/anchor latency.
    const LANES = [
      ["native @ venice",                 7.4,  0.0061, "12/13 pages",        true],
      ["images 100dpi \u00B7 ~16s (10\u201324)", 16.0, 0.0078, "13/13 + signatures", true],
      ["cloudflare-ai, unpinned",         38.5, 0.0051, "13/13",              true],
      ["mistral-ocr, unpinned",           45.1, 0.0342, "9/13 \u00B7 6\u00D7 cost", false],
    ];
    const T_MAX = 45.1, COST_MAX = 0.0342;
    const T_SCALE = 6.5;          // real seconds compressed: race lasts ~7s
    const HOLD = 10;              // race-seconds between cycles
    const HOLD_LAST = 90;         // long hold so the 6× bar stays on screen
    const MAX_CYCLES = 2;
    let cycles = 0, done = false;
    let started = false, paused = false;
    let t0 = 0, pauseAccum = 0, pauseAt = 0;

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

    const chip = Fig.chip("replay", resetRace);
    el.appendChild(chip);

    // start at ≥50% visible; pause the clock while off-screen
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(es => {
        const e = es[0];
        if (!e) return;
        if (e.intersectionRatio >= 0.5) {
          if (!started) armRace();
          else if (paused) {
            pauseAccum += performance.now() - pauseAt;
            paused = false;
          }
        } else if (started && !paused && !e.isIntersecting) {
          paused = true;
          pauseAt = performance.now();
        }
      }, { threshold: [0, 0.05, 0.5, 1] }).observe(el);
    } else {
      armRace();
    }

    const draw = () => {
      const P = Fig.palette();
      const w = cv.w, h = cv.h;
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

      const x0 = 12, x1 = w - 14;
      const topY = 26, laneH = (h - topY - 8) / LANES.length;
      const trackW = x1 - x0;

      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = P.mute;
      const status = !started ? "scroll into view to start"
        : done ? " \u00B7 replay \u21BB"
        : paused ? " \u00B7 paused"
        : "";
      ctx.fillText("t = " + tNow.toFixed(1) + " s (real latency, compressed)" + status, x0, 13);

      // time cursor: one subtle vertical line synced across all lanes
      const cx = x0 + trackW * (tNow / T_MAX);
      ctx.strokeStyle = P.rule;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(cx, topY - 4); ctx.lineTo(cx, h - 8); ctx.stroke();

      LANES.forEach((L, i) => {
        const [label, lat, cost, fid, good] = L;
        const yTop = topY + i * laneH;
        const yTrack = yTop + 22;
        const yCost = yTrack + 10;
        const yRes = yCost + 15;
        const prog = started ? Math.min(raceT / lat, 1) : 0;
        const px = x0 + trackW * prog;

        // label above the lane (fits 360px: nothing to its right)
        ctx.fillStyle = P.ink;
        ctx.fillText(label, x0, yTop + 8);
        ctx.fillStyle = P.mute;
        ctx.textAlign = "right";
        ctx.fillText(lat.toFixed(1) + " s", x1, yTop + 8);
        ctx.textAlign = "left";

        // track + progress + runner
        ctx.strokeStyle = P.rule;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, yTrack); ctx.lineTo(x1, yTrack); ctx.stroke();
        ctx.strokeStyle = good ? P.accent : P.mute;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, yTrack); ctx.lineTo(px, yTrack); ctx.stroke();
        ctx.fillStyle = good ? P.accent : P.mute;
        ctx.beginPath(); ctx.arc(px, yTrack, 4, 0, Math.PI * 2); ctx.fill();

        if (prog >= 1) {
          // cost bar grows under the track once the lane finishes
          const grow = Math.min((raceT - lat) / 3, 1); // ~0.4s real growth
          const cw = trackW * (cost / COST_MAX) * grow;
          ctx.fillStyle = P.wash;
          ctx.fillRect(x0, yCost - 3, trackW * (cost / COST_MAX), 6);
          ctx.fillStyle = good ? P.accent : P.mute;
          ctx.fillRect(x0, yCost - 3, cw, 6);
          if (grow >= 1) {
            ctx.fillStyle = P.mute;
            ctx.fillText("$" + cost.toFixed(4), x0 + trackW * (cost / COST_MAX) + 6, yCost);
          }
          // verdict wraps UNDER the lane (never overflows right)
          ctx.fillStyle = good ? P.ink : P.mute;
          ctx.fillText((good ? "\u2713 " : "\u2717 ") + fid, x0, yRes);
        } else {
          ctx.strokeStyle = P.rule;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x0, yCost); ctx.lineTo(x0 + 4, yCost); ctx.stroke();
        }
      });
    };

    Fig.animate(cv, draw);
    Fig.onScheme(draw);
  });
})();
