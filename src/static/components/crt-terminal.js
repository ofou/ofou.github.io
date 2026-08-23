(function () {
  Fig.register("crt-terminal", function (el, opts) {
    const panel = document.createElement("div");
    panel.style.cssText = "position:relative;overflow:hidden;background:#0c1310;border:1px solid var(--rule-fine)";
    el.appendChild(panel);

    const off = document.createElement("canvas");
    off.width = 640; off.height = 400;
    const o = off.getContext("2d");
    const GREEN = "#3dff7c";

    const script = [
      "omar@olivares:~$ ls",
      "blog        projects     cv",
      "lab         fig.js       menu.js",
      "explainables/           components/",
      "omar@olivares:~$ ",
    ];

    /* scanlines live in CSS, not in the draw path */
    const scan = document.createElement("div");
    scan.style.cssText = "position:absolute;inset:0;pointer-events:none;"
      + "background:repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 1px, transparent 1px 3px)";
    panel.appendChild(scan);

    const cv = document.createElement("canvas");
    cv.style.cssText = "display:block;width:100%;height:" + (+opts.height || 340) + "px";
    panel.insertBefore(cv, scan);
    const ctx = cv.getContext("2d");

    const full = script.join("\n");
    let shown = 0, last = 0, pauseUntil = 0;

    function drawOff(now) {
      o.fillStyle = "#0c1310";
      o.fillRect(0, 0, off.width, off.height);
      o.font = "bold 21px ui-monospace, Menlo, Consolas, monospace";
      o.textBaseline = "top";
      o.shadowColor = GREEN;
      o.shadowBlur = 8;
      const lines = full.slice(0, shown).split("\n");
      lines.forEach((ln, i) => {
        o.fillStyle = GREEN;
        o.fillText(ln, 36, 34 + i * 34);
      });
      const lastY = 34 + (lines.length - 1) * 34;
      const lastW = o.measureText(lines[lines.length - 1]).width;
      if (Math.floor(now / 530) % 2 === 0) {
        o.fillStyle = GREEN;
        o.fillRect(38 + lastW, lastY + 2, 13, 22);
      }
      o.shadowBlur = 0;
    }

    function blit(now) {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const W = cv.clientWidth || 600, H = parseInt(cv.style.height) || 340;
      cv.width = W * dpr; cv.height = H * dpr;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, W, H);
      void dpr;
    }

    const frame = now => {
      if (now - last > (shown < full.length ? 34 : 90)) {
        last = now;
        if (shown < full.length) {
          if (now > pauseUntil) shown++;
          if (full[shown - 1] === "\n") pauseUntil = now + 420;
        } else if (now > pauseUntil + 2600) {
          shown = 0; pauseUntil = now + 300;
        }
      }
      drawOff(now);
      blit(now);
      if (!Fig.reduced()) requestAnimationFrame(frame);
      else { drawOff(now); blit(now); }
    };
    requestAnimationFrame(frame);
  });
})();
