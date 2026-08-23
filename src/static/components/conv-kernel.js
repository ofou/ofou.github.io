(function () {
  Fig.register("conv-kernel", function (el, opts) {
    const cv = Fig.canvas(el, 240);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const input = [];
    for (let r = 0; r < 6; r++) { input.push(Array.from({ length: 6 }, (_, c) => (c === r || c === r + 1) ? 1 : 0.06)); }
    let kernel = [[1, 0, -1], [1, 0, -1], [1, 0, -1]];
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:1.4rem;align-items:center;margin-top:0.8rem";
    el.appendChild(wrap);
    function label(t) { const s = document.createElement("span"); s.className = "meta"; s.style.margin = "0"; s.textContent = t; return s; }
    const inWrap = document.createElement("div"), kWrap = document.createElement("div"), outWrap = document.createElement("div");
    [label("INPUT"), label("KERNEL"), label("OUTPUT")].forEach((l, i) => {
      const col = [inWrap, kWrap, outWrap][i];
      col.appendChild(l);
      const holder = document.createElement("div");
      col.appendChild(holder);
      col.dataset.holder = "";
      wrap.appendChild(col);
    });
    const holders = wrap.querySelectorAll("div > div:last-child");
    function drawGrid(holder, rows, cell, highlight) {
      holder.innerHTML = "";
      rows.forEach((row, ri) => {
        row.forEach((v, ci) => {
          const d = document.createElement("div");
          d.style.cssText = `width:${cell}px;height:${cell}px;display:inline-block;border:1px solid var(--rule-fine);background:rgba(${highlight && highlight.r === ri && highlight.c === ci ? "45,79,161" : "26,25,23"},${Math.min(0.85, Math.abs(v))})`;
          if (highlight && highlight.r === ri && highlight.c === ci) d.style.background = "var(--accent)";
          holder.appendChild(d);
        });
        holder.appendChild(document.createElement("br"));
      });
    }
    function render() {
      drawGrid(holders[0], input.map(r => [...r]), 18);
      drawGrid(holders[1], kernel, 16, null);
      const out = [];
      for (let i = 0; i < 4; i++) { out.push([]); for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let ki = 0; ki < 3; ki++) for (let kj = 0; kj < 3; kj++) s += input[i + ki][j + kj] * kernel[ki][kj];
        out[i].push(s / 3);
      } }
      drawGrid(holders[2], out.map(r => r.map(v => v)), 22);
    }
    const kHolder = holders[1];
    kernel.forEach((row, ri) => row.forEach((v, ci) => {
      const sl = document.createElement("input");
      sl.type = "range"; sl.min = -1; sl.max = 1; sl.step = 0.1; sl.value = v;
      sl.style.cssText = "width:52px;display:block";
      sl.addEventListener("input", () => { kernel[ri][ci] = parseFloat(sl.value); render(); });
      kHolder.appendChild(sl);
    }));
    render();
    Fig.onScheme(render);
  });
})();
