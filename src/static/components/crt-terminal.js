(function () {
  Fig.register("crt-terminal", function (el, opts) {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:relative;overflow:hidden;background:#0c1310;border:1px solid var(--rule-fine)";
    el.appendChild(panel);

    const GREEN = "#3dff7c";
    const BG = "#0c1310";
    // Layout is authored on a 640×400 screen and scaled uniformly to fit,
    // so text keeps its proportions at any width and stays sharp on HiDPI.
    const SW = 640,
      SH = 400;

    const script = [
      "omar@olivares:~$ ls",
      "blog        projects     cv",
      "lab         fig.js       style.css",
      "explainables/           components/",
      "omar@olivares:~$ ",
    ];
    const full = script.join("\n");

    const cv = Fig.canvas(panel, +opts.height || 340);
    const ctx = cv.ctx;

    /* scanlines live in CSS, not in the draw path */
    const scan = document.createElement("div");
    scan.style.cssText =
      "position:absolute;inset:0;pointer-events:none;" +
      "background:repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 3px)";
    panel.appendChild(scan);

    // Reduced motion: no typing — show the finished session.
    let shown = Fig.reduced() ? full.length : 0,
      last = 0,
      pauseUntil = 0;

    function draw(now) {
      const s = Math.min(cv.w / SW, cv.h / SH);
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cv.w, cv.h);
      ctx.save();
      ctx.scale(s, s);
      ctx.font = "bold 21px ui-monospace, Menlo, Consolas, monospace";
      ctx.textBaseline = "top";
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = 8;
      ctx.fillStyle = GREEN;
      const lines = full.slice(0, shown).split("\n");
      lines.forEach((ln, i) => ctx.fillText(ln, 36, 34 + i * 34));
      const lastY = 34 + (lines.length - 1) * 34;
      const lastW = ctx.measureText(lines[lines.length - 1]).width;
      // cursor blinks while animating; solid when static
      if (Fig.reduced() || Math.floor(now / 530) % 2 === 0)
        ctx.fillRect(38 + lastW, lastY + 2, 13, 22);
      ctx.restore();
    }

    Fig.animate(cv, () => {
      const now = performance.now();
      if (Fig.reduced()) {
        shown = full.length;
      } else if (now - last > (shown < full.length ? 34 : 90)) {
        last = now;
        if (shown < full.length) {
          // pause once per line break — re-arming it every tick while the
          // last char is "\n" froze the session after its first line
          if (now > pauseUntil) {
            shown++;
            if (full[shown - 1] === "\n") pauseUntil = now + 420;
          }
        } else if (now > pauseUntil + 2600) {
          shown = 0;
          pauseUntil = now + 300;
        }
      }
      draw(now);
    });
  });
})();
