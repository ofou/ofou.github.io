(function () {
  Fig.register("conv-kernel", function (el, opts) {
    const P = () => Fig.palette();
    const input = [];
    for (let r = 0; r < 6; r++) input.push(Array.from({ length: 6 }, (_, c) => (c === r || c === r + 1) ? 1 : 0.06));
    let kernel = [[1, 0, -1], [1, 0, -1], [1, 0, -1]];

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;gap:1.4rem;align-items:flex-start;flex-wrap:wrap";
    el.appendChild(wrap);

    const labels = ["INPUT", "KERNEL", "OUTPUT"];
    const cols = [];
    const grids = [];
    for (const t of labels) {
      const col = document.createElement("div");
      const l = document.createElement("span");
      l.className = "meta";
      l.style.margin = "0 0 0.4rem";
      l.textContent = t;
      const grid = document.createElement("div");
      col.append(l, grid);
      wrap.appendChild(col);
      cols.push(col);
      grids.push(grid);
    }
    const [inGrid, kGrid, outGrid] = grids;
    const kControls = document.createElement("div");
    kControls.style.cssText = "display:grid;gap:0.3rem;margin-bottom:0.5rem";
    cols[1].appendChild(kControls);

    kernel.forEach((row, ri) => row.forEach((v, ci) => {
      const sl = document.createElement("input");
      sl.type = "range"; sl.min = -1; sl.max = 1; sl.step = 0.1; sl.value = v;
      sl.style.cssText = "width:56px;display:block";
      sl.setAttribute("aria-label", `kernel ${ri},${ci}`);
      sl.addEventListener("input", () => { kernel[ri][ci] = parseFloat(sl.value); render(); });
      kControls.appendChild(sl);
    }));

    function rgba(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
    }
    function drawGrid(holder, rows, cell, opts = {}) {
      holder.innerHTML = "";
      rows.forEach((row, ri) => {
        row.forEach((v, ci) => {
          const d = document.createElement("div");
          const isHi = opts.highlight && opts.highlight.r === ri && opts.highlight.c === ci;
          const a = Math.min(0.85, Math.abs(v));
          d.style.cssText = `width:${cell}px;height:${cell}px;display:inline-block;border:1px solid var(--rule-fine);`
            + (isHi ? "background:var(--accent)" : `background:${rgba(P().ink, a || 0.05)}`);
          if (opts.numbers) {
            d.style.cssText += `color:var(--ink);font:10px ui-monospace,Menlo,monospace;text-align:center;line-height:${cell}px`;
            d.textContent = Number.isFinite(v) ? v.toFixed(1) : "";
          }
          holder.appendChild(d);
        });
        holder.appendChild(document.createElement("br"));
      });
    }
    function render() {
      drawGrid(inGrid, input.map(r => [...r]), 18);
      drawGrid(kGrid, kernel, 16);
      const out = [];
      for (let i = 0; i < 4; i++) {
        out.push([]);
        for (let j = 0; j < 4; j++) {
          let s = 0;
          for (let ki = 0; ki < 3; ki++) for (let kj = 0; kj < 3; kj++) s += input[i + ki][j + kj] * kernel[ki][kj];
          out[i].push(s / 3);
        }
      }
      drawGrid(outGrid, out.map(r => r.map(v => v)), 22, { numbers: true });
    }
    render();
    Fig.onScheme(render);
  });
})();
