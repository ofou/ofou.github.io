---
title: Home
subtitle: A brief bio about myself
author: ofou
date: 2025-12-21
---

# Hello, I'm Omar

<img src="static/images/E1031983-712A-4347-AFF4-D3F293CA39D9_1_201_a.jpeg" alt="Portrait of Omar Olivares, AI engineer, smiling in London" class="avatar">

 I’m a software engineer specializing in artificial intelligence and machine learning, with strong interests in interpretability, alignment, and agentic systems. I build AI-powered products, explore how digital and biological brains work, and help startups find product–market fit. Open to long-term moonshots and selective consulting engagements.
<figure class="netfig">
<canvas id="netfig" aria-label="Interactive figure: a network of neurons; moving the cursor over it stimulates cells, which fire and propagate signals"></canvas>
<figcaption>Fig. 01 — Cortical column, n = 56 · stimulate with cursor</figcaption>
</figure>

<script>
(() => {
  const cv = document.getElementById("netfig");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const css = () => getComputedStyle(document.documentElement);
  const N = 56, REACH = 110, FIRE = 1;
  let W = 0, H = 0, nodes = [], edges = [], px = -1e4, py = -1e4, raf = 0;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");

  function palette() {
    const s = css();
    return {
      ink: s.getPropertyValue("--ink").trim() || "#1a1917",
      accent: s.getPropertyValue("--accent").trim() || "#2d4fa1",
      rule: s.getPropertyValue("--rule").trim() || "rgba(26,25,23,.22)"
    };
  }

  function resize() {
    const dpr = devicePixelRatio || 1;
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function seed() {
    nodes = Array.from({ length: N }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18,
      c: 0
    }));
    edges = [];
    for (let i = 0; i < N; i++) {
      const d = nodes.map((n, j) => [j, (n.x - nodes[i].x) ** 2 + (n.y - nodes[i].y) ** 2])
        .sort((a, b) => a[1] - b[1]).slice(1, 4);
      for (const [j] of d) if (!edges.some(([a, b]) => (a === j && b === i))) edges.push([i, j]);
    }
  }

  function draw(t) {
    const { ink, accent, rule } = palette();
    ctx.clearRect(0, 0, W, H);
    for (const [a, b] of edges) {
      const A = nodes[a], B = nodes[b];
      const glow = Math.min(1, (A.c + B.c) / 1.6);
      ctx.strokeStyle = glow > 0.04 ? accent : rule;
      ctx.globalAlpha = glow > 0.04 ? 0.15 + glow * 0.75 : 1;
      ctx.lineWidth = glow > 0.3 ? 1.25 : 1;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const n of nodes) {
      ctx.fillStyle = ink;
      ctx.beginPath(); ctx.arc(n.x, n.y, 1.6 + n.c * 1.6, 0, 7); ctx.fill();
      if (n.c > 0.55) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(n.x, n.y, 3 + (n.c - 0.55) * 26, 0, 7); ctx.stroke();
      }
    }
    void t;
  }

  function step() {
    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 4 || n.x > W - 4) n.vx *= -1;
      if (n.y < 4 || n.y > H - 4) n.vy *= -1;
      const dx = n.x - px, dy = n.y - py, d2 = dx * dx + dy * dy;
      if (d2 < REACH * REACH) n.c += (1 - Math.sqrt(d2) / REACH) * 0.09;
      n.c *= 0.955;
      if (n.c >= FIRE) {
        n.c = 0.72;
        for (const [a, b] of edges) {
          const j = a === nodes.indexOf(n) ? b : (b === nodes.indexOf(n) ? a : -1);
          if (j >= 0 && nodes[j].c < 0.5) nodes[j].c += 0.34;
        }
      }
    }
    draw();
    raf = requestAnimationFrame(step);
  }

  function wake() {
    cancelAnimationFrame(raf);
    if (reduced.matches) { draw(); return; }
    raf = requestAnimationFrame(step);
  }

  cv.addEventListener("pointermove", e => {
    const r = cv.getBoundingClientRect();
    px = e.clientX - r.left; py = e.clientY - r.top;
  });
  cv.addEventListener("pointerleave", () => { px = py = -1e4; });
  addEventListener("resize", () => { resize(); wake(); });
  reduced.addEventListener?.("change", wake);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => draw());
  resize(); wake();
})();
</script>

## What I work on

1. _Building production-ready AI/ML systems (Agents, RAG, Evals, etc.)_
2. _Consulting and training in AI/ML for startups_
3. _Creating technical content and developer docs_
4. _Conducting domain-specific research_

Fun fact: I once worked as a [music](https://open.spotify.com/artist/5e6x7QJXOGbkDEPpEOWm1w) [producer](https://music.apple.com/us/artist/1600939432) and YouTube [content](https://www.youtube.com/watch?v=kFlLzFuslfQ) [creator](https://www.youtube.com/watch?v=ISa10TrJK7w). In my free time you can find me making beats, learning Mandarin (你好), or exploring new places around the world.

## Let's Connect

Reach out via [X], [LinkedIn], or [omar@olivares.cl] to discuss your next project or just to chat about tech.

[X]: https://twitter.com/omarnomad
[LinkedIn]: https://www.linkedin.com/in/ofou
[omar@olivares.cl]: mailto:omar@olivares.cl
