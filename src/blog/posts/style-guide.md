---
title: "Style guide: every element this site can set"
subtitle: A kitchen sink for the template
date: 2026-08-21
categories:
  - Meta
  - Typography
description: >
  Every block and inline element build.py can render, in one page, so a
  regression in style.css or the markdown pipeline is visible at a glance.
---

# Style guide

One page that exercises every element the template can set.

<!-- more -->

## Block elements

### Level three

#### Level four

##### Level five

###### Level six

**Bold**, *italic*, and ***bold italic*** in one run. <del>Struck through</del> stays quiet. The morph target is <mark>resampled on every page load</mark>, which is the bug.

An [inline link](https://olivares.cl), a <https://example.com/autolink>, and a reference — [Bishop][bishop].

[bishop]: https://www.amazon.com/dp/0387310738

> Everything should be built top-down, except the first time.
>
> Second paragraph inside the same quote.

- Unordered item
- Item with nesting
    - Nested one level
        - Nested two levels
- Last item

1. Ordered item
2. Item with nesting
    1. Nested ordered
    2. Sibling
3. Last item

Point sprite
:   A single `gl.POINTS` vertex, discarded outside a unit disc.

Arcball
:   Quaternion drag mapping screen delta to an axis-angle rotation.

Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to abort; the program prints <samp>built 3 posts, 5 projects → _site/</samp>. H<sub>2</sub>O, and E = mc<sup>2</sup>. The <abbr title="Graphics Processing Unit">GPU</abbr> is saturated.

<details markdown="1">
<summary>Show the derivation</summary>

A paragraph with `code`, then a list:

- one
- two

```js
const q = qnorm(qmul(qaxis(0, 1, 0, 0.0022), q));
```

</details>

## Code

Read the palette with `getComputedStyle(document.documentElement)`.

```python
def morph(a, b, t):
    return a * (1 - t) + b * t  # a $ in here is not math
```

```sh
docker run --rm -p 8000:8000 -e PORT=8000 --entrypoint granian olivares.cl --interface wsgi --host 0.0.0.0 --port 8000 server:app
```

## Table

| Shape  | Points | Morph target |
| ------ | -----: | :----------: |
| Sphere |   4200 | Torus        |
| Torus  |   4200 | none         |
| Helix  |   4200 | none         |

---

## Media

Three sizes sit above the prose column, all centred on the column axis.
A `figure` keeps the measure, a `figure.plate` opens half a module on
both sides onto the same field the listings and section rules use, and
a `figure.fullwidth` also spends the note channel. All three share one
centre line.

<figure class="plate" markdown="1">
![The TexTube ChatGPT plugin card, listing four sample video prompts](/static/images/chatgpt-plugin.png){: .screenshot }
<figcaption markdown="span">Fig. S1 — the *plate*, with a **bold** run.</figcaption>
</figure>

<figure class="fullwidth" markdown="1">
![The TexTube ChatGPT plugin card, listing four sample video prompts](/static/images/chatgpt-plugin.png){: .screenshot }
<figcaption markdown="span">Fig. S4 — *fullwidth*: Fig. S1 again, one tier wider. Plate plus the note channel, so the caption drops underneath.</figcaption>
</figure>

<figure class="margin" markdown="1">
![Rembrandt engraving, cross-hatched shading](/static/images/engraving-rembrandt.jpg)
<figcaption markdown="span">Fig. S3 — a *margin figure*: a picture in the note voice, out in the channel.</figcaption>
</figure>

A margin figure sits beside this paragraph rather than interrupting it,
which is where a picture belongs when it is evidence for a sentence and
not the subject of the section. It shares the channel with the sidenotes,
so notes and small pictures queue down one column instead of two.

<figure class="fig3d">
<canvas data-shape="sphere" data-morph-to="torus"></canvas>
<input type="range" min="0" max="1000" value="0" aria-label="Morph sphere into torus">
<figcaption>Fig. S2 — Fibonacci sphere ⇄ torus · drag to rotate · slider to morph</figcaption>
</figure>
<noscript><p class="meta">Fig. S2 needs WebGL.</p></noscript>

## Math

Inline: $\mathcal{L} = -\sum_k y_k \log \hat{y}_k$ with $w_i \in \mathbb{R}^{d}$.

$$
\hat{y} = \sigma\!\left(\sum_{i=1}^{n} w_i x_i + b\right)
$$

A Push 3 costs \$2,000 — escaped, so KaTeX leaves it alone.

## Footnotes and citations

Point sprites are cheaper than instanced quads.[^sprites]

Smarty typography: straight quotes "become curly", an em dash --- like so, a numeric range 30--40, an ellipsis... and it's got apostrophes.

Bishop remains the reference for the classical view [@bishop2006pattern], and the deep-learning successor updates it [@goodfellow2016deep].

[^sprites]: One vertex, one fragment, no index buffer. See [fig.js](/static/fig.js).

## Dates

Shipped <time datetime="2026-08-21" data-rel-from="2026-08-21T00:00:00">21 August 2026<span class="rel"></span></time> — hover for age.
