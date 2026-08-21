---
title: WebGrid Eval
subtitle: LLM vision and tool-use on Neuralink's cursor task
date: 2026-05-22
categories:
  - Evaluation
  - WebGrid
  - Neuralink
  - Machine Learning
---

[![CI](https://github.com/ofou/webgrid_eval/actions/workflows/ci.yml/badge.svg)](https://github.com/ofou/webgrid_eval/actions/workflows/ci.yml)
[![wakatime](https://wakatime.com/badge/github/ofou/webgrid_eval.svg)](https://wakatime.com/badge/github/ofou/webgrid_eval)

A small harness that puts multimodal LLMs through [Neuralink Webgrid](https://neuralink.com/webgrid): see a grid, find the blue target, click.

**Repo:** [github.com/ofou/webgrid_eval](https://github.com/ofou/webgrid_eval) · **Path:** [OpenRouter](https://openrouter.ai) + OpenAI-compatible **Responses API** with a single function tool: `click(x, y)`.

## Results

OpenRouter smoke runs (Responses API + plain `click(x,y)` — not Computer Use protocol). Harness `reasoning_effort: mid` maps to API `medium`. Routing can vary; “Actual” is best-known from fingerprints/probes. Full write-up: [eval repo README](https://github.com/ofou/webgrid_eval#results).

### 8×8 matrix (~25s)

BPS with NTPM in parentheses:

| Model | low | mid | high | Actual |
| --- | --- | --- | --- | --- |
| `openrouter/auto-beta` | 0.60 (6) | 0.50 (5) | 0.20 (2) | `gemini-3.6-flash` |
| `openrouter/free` | 0 | 0 | 0 | unknown |
| `openrouter/auto` | 0 (−5) | 0 (−4) | 0 (−2) | Gemini 2.5 Flash family |
| `~x-ai/grok-latest` | 0 | 0 (−2) | 0 (−1) | `grok-4.5` |
| `x-ai/grok-build-0.1` | 0 (−1) | 0 | 0 (−1) | itself |
| `x-ai/grok-code-fast-1` | 404 deprecated | | | |

Earlier single-effort smokes (8×8, low): `pareto-code` 0.30/3; `gemini-3.6-flash` 0.60/6; `qwen3.7-flash` 0.00/−1.

### 30×30 retry

`openrouter/auto-beta` low, 60s, 30×30: BPS 0.00, NTPM −2 (4 correct / 6 incorrect). Post-run probe routed to `deepseek/deepseek-v4-flash` (routing drifts vs the 8×8 matrix).

## Overview

Webgrid measures cursor control as bits per second. The same loop is useful as a vision + agency stress test for LLMs: one blue cell on an \(N \times N\) grid, a HUD with live BPS/NTPM, and a short time budget.

### Example replay

<!-- markdownlint-disable MD033 -->
<figure align="center">
  <img src="https://raw.githubusercontent.com/ofou/webgrid_eval/main/docs/img/gemini-3-flash-preview.gif" alt="gemini-3-flash-preview replay at 1x speed" width="400">
  <figcaption><em>gemini-3-flash-preview on a 30×30 grid — 0.16 BPS (1 NTPM) in 70s</em></figcaption>
</figure>
<!-- markdownlint-enable MD033 -->

Human baselines from Neuralink: eighth clinical trial participant **10.39 BPS** (brain control); highest mouse score mentioned **17.1 BPS** on a 35×35 grid (employee). Models are nowhere near that yet.

### Metrics

- **NTPM**: net correct clicks = correct − incorrect
- **BPS**: `(NTPM / 60) * log2(N)` where \(N\) is the number of cells (e.g. 64 for 8×8); BPS is 0 when NTPM ≤ 0

## Quick start

```bash
git clone git@github.com:ofou/webgrid_eval.git
cd webgrid_eval
make install-dev
make dev   # FastAPI server
```

```bash
# OpenRouter + Responses API / click(x, y)
export OPENROUTER_API_KEY=sk-or-...
make eval ARGS="configs/openrouter.yaml"
```

Config: `configs/openrouter.yaml` (see also `configs/openrouter.yaml.example`).

Replay GIFs from a run folder:

```bash
make gif
# or: make gif ARGS="eval/model-name"
```

## Tool

| Tool | Arguments | Harness behavior |
| --- | --- | --- |
| `click` | `x`, `y` ints | Click pixel on the screenshot; return score + new PNG |

Loop: screenshot + instruction → model `function_call` → harness applies click → `function_call_output` + updated screenshot → repeat until time budget.

## Citation

```bibtex
@software{olivares2026webgrid,
  author  = {Olivares Urrutia, Omar},
  title   = {{Webgrid Eval: Benchmark for LLM Vision and Tool-Use Capabilities}},
  year    = {2026},
  month   = feb,
  url     = {https://github.com/ofou/webgrid_eval},
}
```

## Acknowledgments

Inspired by [Neuralink's Webgrid](https://neuralink.com/webgrid).
