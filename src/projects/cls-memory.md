---
title: Complementary memory
subtitle: Hippocampus is an index. Cortex is content.
author: ofou
date: 2026-08-31
featured: cls-memory
stack: Canvas 2D · dentate gyrus · CA3
categories:
  - Interactive
  - Memory
---

The brain is not a Merkle DAG. Two rainy mornings, a week of dinners, a word list that never writes *sleep* — stored as pointers, not files.

```
cue → sparse index (hippocampus / keys)
    → reactivate linked payload (engram complex / values)
    → slow merge into overlapping structure (cortex / schemas)
```

The lab walks six claims. Cortex uses a grouped atlas so related words share a latent (a gist of bed/rest/dream can reconstruct sleep). `HashingAtlas` is the open-vocab sibling in Python; this walkthrough keeps the grouped atlas so the false-memory claim holds.

1. **Index** — the pointer is not the morning.
2. **Separate** — similar mornings land on different cells (raise k-active, or **Dense DG**, to collide).
3. **Complete** — `monday` + `rain` fills `coat`; `rain` alone has a thin margin.
4. **Sleep** — dinners yield a kitchen skeleton; the index keeps `candle`; cortex invents `recipe`.
5. **Invent** — `bed` + `dream` decodes `sleep` anyway.
6. **Rewrite** — recall mixes the gist back in. Brains are not append-only.

<div data-fig="cls-memory" data-height="400"></div>

Python source of truth — same episodes, same claims:

```sh
uv run prototypes/cls_memory.py
uv run prototypes/cls_memory.py --self-test
uv run prototypes/cls_memory.py --dense
```
