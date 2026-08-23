(function () {
  Fig.register("next-token", function (el, opts) {
    const vocab = ["The", "cat", "sat", "on", "mat", "again", "today"];
    const bigram = {
      The: [["cat", 6], ["mat", 2], ["today", 1]],
      cat: [["sat", 7], ["again", 1]],
      sat: [["on", 8], ["today", 1]],
      on: [["the", 5], ["a", 4], ["mat", 1]],
      the: [["mat", 6], ["cat", 3]],
      mat: [["again", 3], ["today", 3], [".", 4]],
      again: [["today", 2], [".", 2]],
      today: [[".", 6], ["The", 2]],
      ".": [["The", 4]],
      a: [["cat", 5], ["mat", 3]],
    };
    let ctxWords = ["The"];
    el.style.userSelect = "none";
    const barWrap = document.createElement("div");
    el.appendChild(barWrap);
    const chipRow = document.createElement("div");
    chipRow.className = "cv-chips";
    el.appendChild(chipRow);

    function dist(w) {
      const rows = bigram[w] || [[".", 1]];
      const tot = rows.reduce((s, r) => s + r[1], 0);
      return rows.map(([t, c]) => [t, c / tot]).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }
    function chips() {
      chipRow.innerHTML = "";
      ctxWords.forEach(w => {
        const c = document.createElement("span");
        c.className = "chip";
        c.textContent = w;
        chipRow.appendChild(c);
      });
    }
    const cv = Fig.canvas(el, 150);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      const d = dist(ctxWords[ctxWords.length - 1]);
      const bw = (cv.w - 20) / d.length;
      d.forEach(([w, p], i) => {
        const h = p * (cv.h - 46);
        ctx.fillStyle = P.accent;
        ctx.globalAlpha = i === 0 ? 1 : 0.55;
        ctx.fillRect(10 + i * bw + 5, cv.h - 26 - h, bw - 10, h);
        ctx.globalAlpha = 1;
        ctx.font = "10px ui-monospace, Menlo, monospace";
        ctx.fillStyle = P.mute; ctx.textAlign = "center";
        ctx.fillText(w, 10 + i * bw + bw / 2, cv.h - 10);
        ctx.fillStyle = P.ink;
        ctx.fillText(Math.round(p * 100) + "%", 10 + i * bw + bw / 2, cv.h - 32 - h);
        ctx.textAlign = "left";
      });
    };
    function renderBars() {
      barWrap.innerHTML = "";
      barWrap.appendChild(cv.el);
      chips();
      draw();
    }
    function clickHandler(e) {
      if (!e.target.classList.contains("chip")) return;
      const w = e.target.textContent;
      if (w !== ctxWords[ctxWords.length - 1]) return;
      ctxWords.push(w);
      renderBars();
    }
    el.addEventListener("click", clickHandler);
    const reset = document.createElement("span");
    reset.className = "chip";
    reset.textContent = "↺ reset";
    reset.style.cursor = "pointer";
    reset.addEventListener("click", () => { ctxWords = ["The"]; renderBars(); });
    chipRow.appendChild(reset);
    renderBars();
  });
})();
