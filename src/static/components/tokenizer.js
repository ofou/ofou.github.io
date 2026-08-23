(function () {
  Fig.register("tokenizer", function (el, opts) {
    let maxLen = 4;
    const input = document.createElement("input");
    input.type = "text";
    input.value = "subword tokenization keeps rare words whole";
    input.style.cssText = "width:100%;font-family:var(--mono);font-size:0.8rem;padding:0.5em 0.7em;background:var(--wash);color:var(--ink);border:1px solid var(--rule-fine)";
    el.appendChild(input);
    const chipWrap = document.createElement("div");
    chipWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.8rem";
    el.appendChild(chipWrap);
    Fig.caption(el, "greedy split at vowel boundaries");

    function split() {
      const words = input.value.split(/\s+/).filter(Boolean);
      const out = [];
      for (const w of words) {
        let i = 0;
        while (i < w.length) {
          let n = Math.min(maxLen, w.length - i);
          if (n < maxLen && maxLen >= 3 && /[aeiou]/.test(w[i + n - 1] || "") && n > 2) n--;
          out.push(w.slice(i, i + n));
          i += n;
        }
      }
      return out;
    }
    function render() {
      chipWrap.innerHTML = "";
      split().forEach((t, i) => {
        const s = document.createElement("span");
        s.className = "chip";
        s.textContent = t;
        const id = document.createElement("sub");
        id.textContent = i;
        id.style.opacity = "0.5";
        s.appendChild(id);
        chipWrap.appendChild(s);
      });
    }
    input.addEventListener("input", render);
    el.querySelector("input[type=range]")?.addEventListener?.("input", () => {});
    Fig.controls(el, [{ key: "max", label: "Max piece", min: 2, max: 7, step: 1, value: maxLen }],
      (k, v) => { maxLen = Math.round(v); render(); });
    render();
  });
})();
