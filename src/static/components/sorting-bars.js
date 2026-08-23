(function () {
  Fig.register("sorting-bars", function (el, opts) {
    const cv = Fig.canvas(el, 220);
    Fig.frame(cv);
    const ctx = cv.ctx;
    let arr = [], i = 0, j = 0, comps = 0, swaps = 0, running = false, speed = 4;
    const shuffle = () => { arr = Array.from({ length: 24 }, () => 8 + Math.random() * 92); i = j = comps = swaps = 0; };
    Fig.controls(el, [{ key: "speed", label: "Steps/frame", min: 1, max: 20, step: 1, value: speed }],
      (k, v) => { speed = Math.round(v); });
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:0.5rem;margin-top:0.5rem";
    for (const [t, fn] of [["↺ Shuffle", () => { shuffle(); }], ["▶ Run/Pause", () => { running = !running; }]]) {
      const b = document.createElement("button");
      b.className = "chip"; b.textContent = t; b.style.cursor = "pointer";
      b.addEventListener("click", fn);
      btnRow.appendChild(b);
    }
    el.appendChild(btnRow);
    Fig.caption(el, "bubble sort · comparisons and swaps live");
    shuffle();
    const draw = () => {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      for (let s = 0; s < (running ? speed : 0); s++) {
        if (j >= arr.length - 1 - i) { i++; j = 0; if (i >= arr.length - 1) running = false; }
        comps++;
        if (arr[j] > arr[j + 1]) { [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; swaps++; }
        j++;
      }
      const bw = (cv.w - 20) / arr.length;
      arr.forEach((v, idx) => {
        ctx.fillStyle = (running && idx === j) || (running && idx === j + 1) ? P.accent : P.ink;
        ctx.fillRect(10 + idx * bw, cv.h - 10 - v * (cv.h - 24) / 100, bw - 1.5, v * (cv.h - 24) / 100);
      });
      ctx.font = "10px ui-monospace, Menlo, monospace"; ctx.fillStyle = P.mute;
      ctx.fillText(`comparisons ${comps} · swaps ${swaps}`, 12, 16);
    };
    shuffle();
    Fig.onScheme(draw);
    Fig.animate(cv, draw);
  });
})();
