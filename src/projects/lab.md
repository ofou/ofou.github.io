---
title: Lab
subtitle: Interactive components, on brand
author: ofou
date: 2026-08-21
categories: [Interactive]
---

Bare-WebGL components built for this site — point-cloud figures you can grab and spin, tuned to the same paper-and-ink palette as everything else. No frameworks, no model files: geometry is generated parametrically and rendered as dots, in the spirit of Ciechanowski's explainers but reduced to the site's own visual language.

<figure class="fig3d">
<canvas data-shape="sphere" data-morph-to="torus"></canvas>
<input type="range" min="0" max="1000" value="0" aria-label="Morph sphere into torus">
<figcaption>Fig. L1 — Icosphere ⇄ torus · drag to rotate · slider to morph</figcaption>
</figure>

<figure class="fig3d">
<canvas data-shape="helix"></canvas>
<figcaption>Fig. L2 — Helical column · drag to rotate</figcaption>
</figure>

One program per figure, point sprites, colors read live from the same CSS custom properties that drive the light and night editions. Source: `/static/fig.js`.
