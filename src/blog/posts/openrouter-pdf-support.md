---
title: "The PDF input problem in OpenRouter"
subtitle: What it means for a document to arrive at a model — and what quietly changes along the way
date: 2026-08-25
categories:
  - LLMs
  - Engineering
description: >
  An explorable tour of PDF ingestion on OpenRouter: what it means for a document to arrive at a model, how file and page-image routes diverge, and what the meters reveal once you start measuring.
draft: true
---

<!-- Live published version: src/blog/posts/openrouter.md -->

# The PDF input problem in OpenRouter

Most people meet a PDF on an LLM API as a convenience: attach the file, ask a question, receive an answer. Before any of that machinery starts, there is a quieter question: what does it mean for a document to _arrive_ at a model at all?

Imagine a sealed envelope handed to a courier who claims every address in the city. The courier’s name is a model slug. Behind that name sit independent doors, each with its own lock, its own meter, and its own idea of what counts as mail. The docs lead with a promise:

> This feature works on **any** model on OpenRouter.[^docs]

[^docs]: OpenRouter, [PDF Inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs). It promises _models_; this piece measures providers.

True, as written. Compatible with almost everything going wrong.

There’s something interesting here. Before any alternative representation enters the story, follow the sealed envelope all the way: what it means for a _file_ to arrive, who touches the bytes, which doors accept it, and what the meters say when they do. Only then carefully add a second degree of freedom.

That is the shape of the case. This piece walks the pipeline end to end the way it actually behaves.

<!-- more -->

Here is a complete call: one model, one PDF, one explicit engine.[^api] The exhibit is a one-page _[scanned](/static/images/udhr-1948.webp)_ poster with no text layer, and a four-page born-digital résumé is the contrast document for the tables further down.

[^api]: OpenRouter Responses API via the [OpenAI Python SDK](https://developers.openai.com/api/docs/guides/file-inputs) with `base_url="https://openrouter.ai/api/v1"`. OpenRouter-only fields (`plugins`, `provider`) go in `extra_body`, the metadata header in `extra_headers`. Chat Completions is the same router under different field names.

```python
import base64, os
from openai import OpenAI

client = OpenAI(base_url="https://openrouter.ai/api/v1",
                api_key=os.getenv("OPENROUTER_API_KEY"))

with open("poster.pdf", "rb") as f:
    pdf_b64 = base64.b64encode(f.read()).decode("utf-8")

response = client.responses.create(
    model="qwen/qwen3.8-27b",
    input=[{
        "type": "message",
        "role": "user",
        "content": [
            {"type": "input_text", "text": "Describe this document."},
            {
                "type": "input_file",
                "file_data": f"data:application/pdf;base64,{pdf_b64}",
            },
        ],
    }],
    extra_body={
        "plugins": [{"id": "file-parser",
                     "pdf": {"engine": "native"}}],
        "provider": {"only": ["venice"], "allow_fallbacks": False},
    },
    extra_headers={"X-OpenRouter-Metadata": "enabled"},
)

text = response.output_text
meta = response.model_dump()["openrouter_metadata"]
```

That payload is four decisions stacked, and the last splits into two fields. Peel only the file path for now — one degree of freedom at a time.

1. `model`. A slug, not a deployment. Behind `qwen/qwen3.8-27b` sit independent providers: different hardware, different serving stacks, and (as we’ll measure) different file support. The slug is what you ask for. The endpoint is what you get.
2. `input` → message → `content`. The Responses dialect wraps turns as `input[]` messages. Inside `content` you put parts. Text would be `input_text`; a PDF is `input_file`.
3. `input_file` / `file_data`. The attachment itself: a base64 data URL (`data:application/pdf;base64,…`) or a plain public HTTPS URL. OpenRouter’s examples always include a `filename`, but the API accepts the part without it, and when present the host may inject it into the model context (`[File: document.pdf]`). Omit it.
4. `plugins`. An array of server-side steps OpenRouter may run _before_ the request reaches a provider. Omitting it looks optional. It isn’t: for file input, this is where parsing (or the refusal to parse) is configured. The shape that matters is one object — `"plugins": [{"id": "file-parser", "pdf": {"engine": "…"}}]` — and inside it, `pdf.engine` names who reads the PDF. Hold the engines; first the doors.

Three peels name the sealed envelope: a slug, a file part, and a field that decides who touches the bytes. Which doors accept that envelope is an empirical question — and answering it needs the doors on the map first.

## The catalog does not know its doors

Return to the envelope. Native file input needs a rare lock: a host that accepts raw file parts. That asymmetry is the shape; the catalog is only evidence of it.

A model on OpenRouter is not a deployment. It is a name painted on doors. Different companies, different hardware, different serving stacks. You can list them:

```python
import json
import urllib.request

url = "https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b/endpoints"
data = json.load(urllib.request.urlopen(url))["data"]

data["architecture"]["input_modalities"]   # ['text', 'image', 'video'] MODEL-level
for ep in data["endpoints"]:
    ep["tag"]                  # 'venice/fp8', 'alibaba', ...
    ep["quantization"]         # 'fp8' | 'bf16' | 'unknown'
    ep["uptime_last_30m"]      # 96.3 .. 100.0
    ep["supported_parameters"] # sampling params only, NO modality info
```

The catalog exposes the same modality filter on the web and in the API: `openrouter.ai/models?input_modalities=file` is `GET /api/v1/models?input_modalities=file`. The parameter is comma-separated with **AND** semantics, so a model must declare every listed modality in `architecture.input_modalities`. Allowed values: `text`, `image`, `file`, `audio`, `video`. Stack all five, [`?input_modalities=image,file,audio,video,text`](https://openrouter.ai/models?input_modalities=image,file,audio,video,text), and the list shrinks to frontier multimodal slugs; Qwen drops out (no `file`), Grok 4.6 drops out (no `audio` or `video`).

Notice what is absent. `architecture.input_modalities` is model-level — one shared list for the slug, the same field the catalog filter reads — not a per-endpoint field. `/endpoints` will tell you pricing, uptime, `supported_parameters`, and cache or voice flags; `/providers` is only org metadata (name, slug, policy links). Neither payload says which hosts accept a raw PDF. For this slug the live list is `['text', 'image', 'video']`, no `file`, and the endpoint rows add nothing about native file parts. Venice’s path was measured by pinning and asking, outside that schema. A slug that _does_ declare `file` still won’t tell you which host bills you how: Grok 4.6’s two xAI endpoints share `['text', 'image', 'file']` but the schema advertises capability, not routing.

So which doors accept the sealed envelope? The API won’t tell you. The only way to find out is to pin and ask: forbid failover, and read the verdict.

```python
payload["provider"] = {"only": ["alibaba"], "allow_fallbacks": False}
```

| Provider | Native PDF | Images | Failure mode |
| --- | --- | --- | --- |
| venice | **✓** | ✓ | n/a |
| the other seven | ✗ | ✓ | `400: The current model does not support PDF file input` |

**One of eight, on this slug, on this roster.** Off the file filter doesn’t mean nobody accepts PDFs, and on it wouldn’t say which endpoint does. Seven of eight hosts here reject the file part — a count owned by this roster. A slug whose providers all implement file parts would sweep this table instead, and Grok 4.6’s declared `['text', 'image', 'file']` shows the catalog already contemplates such slugs. This isn’t an OpenRouter bug. Inline file parts are simply rare in OpenAI-compatible serving stacks, while `image_url` is nearly universal. The capability a slug hints at and the capability a given host implements are different facts, and only a live request distinguishes them.

Catalogs lie by omission. Requests don’t.

One practical courtesy: the provider’s real error is buried two levels down. `error.message` says only “Provider returned error”.

```python
err = resp.get("error") or {}
raw = (err.get("metadata") or {}).get("raw")   # the provider's actual words
```

The bars below are shopping — price and uptime you can already sort for. Secondary to the routing fact. The ◆ pdf mark is what those catalog responses won’t list. Toggle a metric; rows re-rank best → worst:

<div data-fig="pdf-endpoints"></div>

The hard numbers behind the bars (prices per million tokens):

| Provider  | Quant    |       Context | Max out | In (USD/M) | Out (USD/M) |
| --------- | -------- | ------------: | ------: | ---------: | ----------: |
| chutes    | fp8      |       262,144 |  65,536 |       0.35 |        2.75 |
| coreweave | fp8      |       262,144 | 262,144 |       0.40 |        3.00 |
| akashml   | **bf16** |       262,144 | 131,072 |       0.40 |        3.00 |
| alibaba   | unknown  | **1,000,000** | 131,072 |      0.425 |        2.55 |
| reka      | fp8      |       262,144 | 131,072 |       0.45 |        3.20 |
| venice ◆  | fp8      |       262,144 |  65,536 |       0.45 |        3.20 |
| parasail  | fp8      |       262,144 | 262,144 |       0.45 |        3.20 |
| io-net    | fp8      |    **65,500** |  65,536 |       0.48 |        3.40 |

Cache pricing and uptime, the same eight:

| Provider  | Cache-read | Cache-write | Up 30m / 1d |
| --------- | ---------: | ----------: | ----------- |
| chutes    |      0.035 |         n/a | 97.0 / 99.0 |
| coreweave |       0.15 |         n/a | 96.3 / 97.8 |
| akashml   |       0.05 |         n/a | 99.8 / 99.4 |
| alibaba   |      0.085 |   **0.531** | 100 / 99.95 |
| reka      |       0.05 |         n/a | 100 / 99.8  |
| venice ◆  |        n/a |         n/a | 98.9 / 99.1 |
| parasail  |        n/a |         n/a | 99.7 / 99.7 |
| io-net    |       0.25 |         n/a | 99.8 / 99.0 |

Only one endpoint serves full precision, and it costs the same as its fp8 neighbors. Only one prices cache _writes_ (explicit, DashScope-style prompt caching). The quantization column is self-reported, and the 1M-context endpoint declines to say at all.

Eight doors, one rare lock for the envelope. Price is a sideboard; the native file path is the map. Local Qwen stacks (Ollama, llama.cpp, a vendor’s own server) already disagree on whether a PDF ever reaches the model as a file. An aggregator multiplies that disagreement across every host of one slug.

## Omitting the engine is a cost trap

Watch what an engine actually _is_ before the meters speak.

<div data-fig="pdf-engine"></div>

An engine is whoever touches the bytes before any provider does. Four values, three of them explicit:

- `native` forwards the envelope untouched, so it only works if the destination door accepts file parts.
- `cloudflare-ai` is a **text-layer extractor**: it turns a born-digital PDF’s embedded text into markdown, free. It does not OCR. A scan, a photographed page, a PDF whose glyphs are only pixels — all come back empty.
- `mistral-ocr` is the paid engine that actually reads those pixels ($2 / 1,000 pages).

Leave `engine` unset and you inherit the silent fallback: native when the router thinks it can, otherwise paid OCR. That default is a cost trap. Set the field on purpose.

Unset means “native if possible, else mistral-ocr.” For a model where seven of eight providers aren’t native, that “else” is your default. Measured on a **13-page born-digital contract** (selectable text layer, plus an e-signature page), three runs each:

| Request                       | Engine actually used |    Avg cost |
| ----------------------------- | -------------------- | ----------: |
| `plugins` omitted             | `mistral-ocr`        | **$0.0311** |
| `{"engine": "cloudflare-ai"}` | cloudflare-ai        |     $0.0053 |

_Both averages are single-day measurements from 2026-08-24, taken before the mid-day routing flip; the engine mix behind this cost gap can change within hours._

One absent JSON field. 5.9× the cost. On every request. With no warning anywhere but the invoice.

Parser engines only matter when the router cannot reach a native-file door. Naming `cloudflare-ai` explicitly did not help unpinned, because a native-file host can intercept again. The next tables settle what each named path costs when the document itself changes.

## The meter is not the document

Return to the simple picture: one document, a handful of engines that decide who touches the bytes before any provider does. On a scan — a page that is only pixels — the free extractor has nothing to lift; on a résumé that already carries a text layer, the same extractor is almost a free transcript. Same request shape, same SDK. The meters disagree.

One contrast settles the geometry before the tables do. On the born-digital résumé, omitting `plugins` is worse than useless: the silent default OCR’d four pages of selectable text and cost **7×** the pinned-native bill.

### Scanned poster (no text layer)

| Engine / route | Result | `input_tokens` | Cost | Router saw |
| --- | --- | --: | --: | --- |
| `native` @ venice (pinned) | ✓ correct, Venice reads the scan | **5,272** | $0.0028 | Venice, no `file-parser` pipeline |
| `plugins` omitted → `mistral-ocr` | ✓ correct, OCR, text forwarded | **2,545** | $0.0034 | CoreWeave, `mistral-ocr` parsed 1 page |
| `cloudflare-ai` (unpinned) | ✓ correct, but **not** via the free parser[^router-bypass] | 5,272 | $0.0027 | Venice native after 9× `400` elsewhere |
| `mistral-ocr` (unpinned) | ✓ correct, same bypass | 5,272 | $0.0027 | Venice native |

[^router-bypass]: With `engine: "cloudflare-ai"` or `"mistral-ocr"` set but **no** provider pin, the router still landed on Venice and billed like **native file input** (~5.3K tokens on this scan), with no `file-parser` entry in `openrouter_metadata.pipeline`. The declared engine never ran. On 2026-08-24 the request still carried a `filename` (`udhr_1948.pdf`; the 2026-08-25 rematch dropped it), and with a route that actually hit the text-layer extractor, `cloudflare-ai` returned an **empty** parse on this scan and the model confabulated from the name[^cf-blank].

[^cf-blank]: Text-layer extractor returns **nothing** on a scan; the model answered from the _filename_: "The PDF content appears to be blank, but here is the JSON populated from known facts."

### Born-digital résumé (embedded text, 4 pages)

| Engine / route | Result | `input_tokens` | Cost | Router saw |
| --- | --- | --: | --: | --- |
| `native` @ venice (pinned) | ✓ correct | **1,966** | $0.0013 | Venice native |
| `plugins` omitted → `mistral-ocr` | ✓ correct, but OCR’d a file that already had text | **1,942** | **$0.0093** | AkashML, `mistral-ocr` parsed 4 pages |
| `cloudflare-ai` (unpinned) | ✓ correct, Venice native, not the free extractor | 1,964 | $0.0014 | Venice native |
| `mistral-ocr` (unpinned) | ✓ correct, Venice native | 1,966 | $0.0013 | Venice native |

The scan rows deserve a moment. The free extractor is not a cheap OCR: it only returns text when the PDF already has a text layer, and nothing in the response flags an empty parse. That failure mode was seen exactly once, when a route that truly hit `cloudflare-ai` came back empty on this scan and the model improvised from the filename[^cf-blank] — which itself leaked the answer — so read it as mechanism evidence, not a measured rate. A later rematch never reached the extractor; routing bypassed to Venice native first. The scoped claim: on scans, the text-layer path returns an empty parse and lets the model improvise silently; on born-digital files it is the cheap path.

Notice the native token counts: **~5.3K** on the scan (Venice is running a vision-style ingest) and **~2.0K** on the four-page résumé. The same poster on the same pinned-native path billed **90** tokens on an earlier day — a **~59×** swing on identical bytes within 36 hours, with no schema field to explain it. Native file billing is set by the provider’s own ingestion pipeline. It is not a fixed formula you can read off a config file. The meter belongs to whoever opens the envelope.

Native when a door accepts it; free lift when a text layer exists; paid read when the page is only pixels; one rare native door. The costs above are what that picture looks like under real routing — and routing, as we are about to see, is itself a moving part.

_Measurement note._ Same request shape, same SDK; native file calls pinned Venice (`provider.only = ["venice"]`, `allow_fallbacks: false`); metadata header on for every run. Engine tables above are from a 2026-08-25 rematch of the 2026-08-24 matrix: every call omitted `filename`, so the model could not read a title off the label. Re-run locally with `uv run python scripts/test_openrouter_pdf_params.py`. Scan = `The_universal_declaration_of_human_rights_10_December_1948.pdf` (the name on disk only; the request part sent no `filename`); text layer = `src/static/cv.pdf` (4 pages, `pdftotext` extracts cleanly). Contract = 13-page born-digital PDF with a selectable text layer and an e-signature page (visual layout the parsers garble); used for the race and default-engine tables on 2026-08-24 only.

## Pin and parse is undefined

Now the interaction that makes the file path’s two controls meet. Parsing happens _before_ routing. As we turn the pin — request a parsing engine **and** lock a provider — the two controls collide:

```python
payload["plugins"]  = [{"id": "file-parser", "pdf": {"engine": "cloudflare-ai"}}]
payload["provider"] = {"only": ["alibaba"], "allow_fallbacks": False}
# morning: → 400. The raw file was forwarded; the parser never ran.
```

The morning I tested this, the answer was: the parser silently doesn’t run. The raw file goes to the pinned provider and 400s — with _both_ engines, both APIs. Deterministic routing and server-side parsing were mutually exclusive.

By evening, the identical payloads returned 200, with router metadata showing the parser now running before pinned dispatch. Same requests, opposite result, twelve hours apart, verified with a freshly generated PDF to rule out caching. Nothing in the response schema versions this behavior.

Treat pin+parse as **undefined**.

Why it flipped stays unconfirmed — hypothesis only, from an n=1 day: a staged rollout, a per-account flag, or caching keyed on payload hash. Nothing was confirmed. The morning/evening delta just bounds how much you can rely on pin+parse.

There is also a data-flow reading of the same collision. Name a server-side parser — `cloudflare-ai` or `mistral-ocr` — and your document’s bytes reach Cloudflare or Mistral before any provider sees them; these engines parse ahead of routing. Unpinned, you may not control, or even know, which path runs: on one measured day both engines landed on Venice native instead, so the answer to “which third party processed my document?” was neither of the two named. Pin `native` and the bytes touch exactly one host.

For confidential documents on the file path, pin everything you can see — and treat the engine as a disclosure decision, not merely a cost one.

As we slowly increase our trust in the router’s determinism, that trust reaches a bifurcation and then collapses. The sealed-envelope case has landed: a rare native door, engines that lift or OCR or forward, meters that disagree by document type, and a pin+parse interaction that will not sit still. Hold that geometry. Now carefully add one degree of freedom.

## Pictures open every door

Return to the quiet question from the opening — what it means for a document to _arrive_ — and open the door the peels left closed. The same pages can travel as pictures instead of as a file. It reads like a formatting preference. It isn’t.

The image branch skips the plugin entirely. Render the pages yourself:

```python
import subprocess, tempfile, pathlib

tmp = pathlib.Path(tempfile.mkdtemp())
subprocess.run(["pdftoppm", "-png", "-r", "100",
               "The_universal_declaration_of_human_rights_10_December_1948.pdf", str(tmp / "p")],
               check=True)
```

```python
content = [{"type": "input_text", "text": PROMPT}]
for page in sorted(tmp.glob("p*.png")):
    b64 = base64.b64encode(page.read_bytes()).decode()
    content.append({"type": "input_image",
                    "image_url": f"data:image/png;base64,{b64}"})
```

Ordinary `input_image` parts. No parser, no engine, no trust in anyone else’s extraction. Look back at the eight-provider table: the Images column was already full of checkmarks. Seven of eight doors refuse the sealed envelope; all eight already know how to open a picture. That asymmetry is why the second representation matters — not as a rival formatting tip, but as a different lock on the same city of doors.

On the same scanned poster, that route billed what the file path’s engines never did:

| Engine / route | Result | `input_tokens` | Cost | Router saw |
| --- | --- | --: | --: | --- |
| page images @ 100 dpi | ✓ correct on any provider | 10,248[^img] | $0.0057 | _(2026-08-24)_ |

[^img]: The poster renders to **2778×3748 px** at 100 dpi (`pdftoppm -r 100`), which the HF-config budget prices at 10,181 visual tokens (10,179 + 2 vision markers). The 2026-08-24 cloud run billed **10,248**, a 67-token gap against a render whose exact pixel dimensions weren't preserved from that session; treat the cloud figure as measured-then and the 10,181 as what today's render predicts. Either way it is poster geometry, not Letter (Letter @ 100 dpi is ~918 tokens). The local re-measurement under the cheapest-lie audit below used this exact 2778×3748 render.

The bill is higher than pinned-native on this scan. The reach is every door. And because there is no `file-parser` step, the pin+parse collapse does not apply: the one pinned path that never wavered all day, on all eight providers, is the images route. The image path does not participate in that collapse.

File, or pictures of its pages. Two representations; one simple fork, now that the envelope case has landed. Watch a packet travel them.

You now know both representations and what the file-path engines cost. The demonstration below is how a request actually travels them. Watch a packet leave the PDF box, meet the engine fork, and either reach a provider or die with an error. It starts on auto; click a chip to pin one path (including the native·400 fail), or leave auto to tour them all.

<div data-fig="pdf-router"></div>

Native only reaches venice (chip native·400 for the fail); parsers fan out to anyone; images reach all eight, pinned or not.

For confidential documents, pin everything or send images — and treat the engine as a disclosure decision, not merely a cost one.

## Pixels into tokens

Before the image route can win on merit, you should be able to price it from first principles. Forget the invoice for a moment. Ask a quieter question: what does it mean for a page to become a sequence of tokens?

Imagine a Letter page lying on a table. You photograph it. The photograph is a rectangle of pixels. The vision tower does not see the rectangle as a whole; it cuts the rectangle into tiles, and each tile becomes one visual token. The cost model lives in the model’s actual `preprocessor_config.json` on HuggingFace:

```json
{
  "size": { "longest_edge": 16777216, "shortest_edge": 65536 },
  "patch_size": 16,
  "temporal_patch_size": 2,
  "merge_size": 2,
  "image_mean": [0.5, 0.5, 0.5],
  "image_std": [0.5, 0.5, 0.5],
  "processor_class": "Qwen3VLProcessor",
  "image_processor_type": "Qwen2VLImageProcessorFast"
}
```

Read `size` carefully. Despite the names, `shortest_edge` and `longest_edge` are **areas, not edge lengths** — a _minimum_ of 65,536 px² (256²) and a _maximum_ of 16,777,216 px² (4096²). The naming is a fossil from older processors that really did clamp edges; the Qwen2VL-family processor reinterprets the same keys as a pixel budget.

The geometry: the vision tower cuts the image into **16 px patches** (`patch_size`), runs them through a 27-layer ViT (hidden size 1,152, 16 heads, from `config.json`’s `vision_config`), then a 2×2 spatial merge (`merge_size`) fuses each quartet of patches into one token projected to the LLM’s 5,120-wide embedding space. One visual token is therefore a **32 × 32 px** tile. (`temporal_patch_size: 2` is for video; still images are duplicated into a frame pair.)

Before any of that, `smart_resize` — quoted from `transformers` and condensed — snaps each side to a multiple of 32 and rescales only if the snapped area leaves the budget. Worth carrying client-side, because it prices a request before you send a byte:

```python
import math

FACTOR, MIN_PX, MAX_PX = 32, 65_536, 16_777_216

def smart_resize(h: int, w: int) -> tuple[int, int]:
    if max(h, w) / min(h, w) > 200:           # hard cap on aspect ratio
        raise ValueError("aspect ratio > 200")
    hb, wb = round(h / FACTOR) * FACTOR, round(w / FACTOR) * FACTOR
    if hb * wb > MAX_PX:                      # too big -> shrink to budget
        beta = math.sqrt(h * w / MAX_PX)
        hb = max(FACTOR, math.floor(h / beta / FACTOR) * FACTOR)
        wb = max(FACTOR, math.floor(w / beta / FACTOR) * FACTOR)
    elif hb * wb < MIN_PX:                    # too small -> grow to floor
        beta = math.sqrt(MIN_PX / (h * w))
        hb = math.ceil(h * beta / FACTOR) * FACTOR
        wb = math.ceil(w * beta / FACTOR) * FACTOR
    return hb, wb

def visual_tokens(h: int, w: int) -> int:
    hb, wb = smart_resize(h, w)
    return (hb // FACTOR) * (wb // FACTOR)
```

Two details people miss: the shrink path uses `floor` (never exceed the budget) while the grow path uses `ceil` (always reach the floor), so the two branches round in opposite directions; and an aspect ratio beyond 200:1 is rejected outright, so a degenerate strip of pixels never reaches the model.

```python
visual_tokens(1100, 850)    # 918   Letter page @ 100 dpi
visual_tokens(4653, 3596)   # 16240 Letter page @ 423 dpi
visual_tokens(6600, 5100)   # 16240 600 dpi: same. Downscaled to budget.
```

Play with it below. The grid is the token grid; the readout is the bill. As you slowly drag past **165 dpi**, watch the dashed Alibaba box appear — what that endpoint keeps. Past **423 dpi**, the 16.7M px² cliff: the page blurs under smart_resize.

<div data-fig="pdf-token-grid"></div>

| Render | Letter (850×1100 base) | Tokens/page | A4 equivalent | 100 pages | Fits 262K? |
| --- | --- | --: | --: | --: | --- |
| 100 dpi | 850×1100 | 918 | 962 | 91,800 | ✓ by tokens (~285 max) |
| 150 dpi | 1275×1650 | 2,080 | 2,145 | 208,000 | ✓ barely (~126 max) |
| 300 dpi | 2550×3300 | 8,240 | 8,580 | 824,000 | ✗ 3.1× over (~31 max) |
| **ceiling** | 3596×4653 @ **423 dpi** | **16,240** | 16,264 @ **416 dpi** | 1,624,000 | ✗ 6.2× over (~16 max) |

The last column is the token-budget view. At 100 dpi a 100-page filing is only 91.8K tokens — a third of a 262K window — so the math says ~285 pages fit. On OpenRouter that math is not the binding constraint: a real Letter PNG @100 dpi is ~259 KB, and the gateway refuses the request once aggregate image bytes cross **~30 MB** (`Downloaded image content cannot exceed 30MB`). Measured: **95 pages ✓** / **100 ✗**, long before context fills. At 300 dpi the same filing needs four requests on tokens alone; at the ceiling, sixteen pages fill the window. Resolution is a budget you spend against page count, then against the payload wall.

The ceiling — the largest render that reaches the model unresized — is 423 dpi for Letter and 416 dpi for A4:

```python
dpi_max = math.sqrt(MAX_PX / (8.5 * 11))          # 423.6   US Letter
dpi_max = math.sqrt(MAX_PX / (8.2677 * 11.6929))  # 416.6   A4
# careful near the edge: Letter @ 424 dpi snaps to 3616x4672 = 16,893,952 px^2
# > budget -> silently downscaled. 423 / 416 are the last safe integers.
```

Notice the quadratic: tokens grow with dpi². Body text is comfortably legible to a 16-px-patch encoder at 100 dpi (~6 to 7 px of x-height on 10 pt body copy); everything above that buys attention compute over blank paper. At 100 dpi, a Letter page costs about the same as its extracted text (~918 visual vs ~850 text tokens). On this model, _seeing_ the page instead of reading a transcript of it is nearly free.

That is the simplified machine working. Now carefully add the next constraint: what each host actually bills.

## The cheapest lie arrives with a discount

A derivation is a hypothesis until the invoice agrees. The audit is one subtraction per provider: send a tiny prompt with and without an image, and diff `usage.input_tokens`.

```python
def billed_visual_tokens(slug: str, png_path: str) -> int:
    base = input_tokens(slug, content=[{"type": "input_text", "text": "ok"}])
    with_img = input_tokens(slug, content=[
        {"type": "input_text", "text": "ok"},
        {"type": "input_image", "image_url": data_url(png_path)},
    ])
    return with_img - base
```

Seven of eight providers billed **prediction + 2**, the +2 being the `<|vision_start|>`/`<|vision_end|>` markers, at every size — including a deliberately over-budget 600-dpi render that came back at exactly the 423-dpi count. Quantization made no difference: the bf16 endpoint billed the same as every fp8 one, because preprocessing runs in the serving layer before any weight is touched.

Toggle the sizes. Seven of eight match the prediction at every size; Alibaba doesn’t past ~165 dpi effective. Tick = prediction; bar = billed:

<div data-fig="pdf-bill-audit"></div>

The eighth provider is why you run audits. Alibaba billed 2,510 tokens for the image everyone else billed at 16,242. Reverse-engineering the number:

```python
# Hypothesis: a DashScope-style max_pixels cap. Solve for it:
beta = math.sqrt(3596 * 4653 / 2_621_440)        # cap = 2560 tokens x 32^2
w, h = math.floor(3596/beta/32)*32, math.floor(4653/beta/32)*32
(w // 32) * (h // 32) + 2                        # = 2510 ✓ exact
```

A pixel cap 6.4× tighter than the model’s own config, applied silently in the serving stack. On that endpoint anything above **~165 dpi is discarded**: you pay the upload, 84% of the pixels evaporate, the bill looks pleasingly small, and if the task needed the resolution it degrades with no error and no signal. That is the dashed box in the token-grid figure above.

The cheapest lie is the one that arrives with a discount.

The irony is that this is the one provider whose 1M context could hold all 13 pages of the born-digital contract at maximum resolution (211K visual tokens), and the one that refuses to accept them.

Envelope or pictures; the meters on the picture branch are not interchangeable either. Seven doors honor the config; one quietly tightens it.

### The same audit, on your own machine

The serving-layer thesis is checkable without any cloud at all. I ran the identical baseline-subtraction against **Ollama** on this Mac — same model family, Q4_K_M quant, its own inference stack — reading `prompt_eval_count` instead of `usage.input_tokens`. Every row below is a live local measurement, baseline `prompt_eval_count` = 11:[^ollama-repro]

| Image | Ollama billed | HF-config prediction | Cloud (7/8) |
| --- | --: | --: | --: |
| 425×550 | 223 | 223 | 223 |
| 850×1100 | 920 | 920 | 920 |
| 1275×1650 | 2,082 | 2,082 | 2,082 |
| 2550×3300 (300 dpi) | **4,034** | 8,242 | 8,242 |
| 2778×3748 (UDHR @ 100dpi) | **4,072** | 10,181 | 10,248\* |

[^ollama-repro]: Reproduce with `python3 scripts/measure_ollama_vision_tokens_v2.py` against a running `ollama serve`; it writes every row, both predictions, and the match verdict to `scripts/measure_ollama_vision_tokens_v2_<date>.json`. The synthetic rows use a stdlib PNG writer (banded grey, not a degenerate uniform field); the poster row renders the real UDHR PDF with `pdftoppm -r 100`. Note that the copy of that PDF committed at the repo root is actually a JPEG with a `.pdf` extension; render from the original. \* The cloud figure is the 2026-08-24 measurement, whose exact render dimensions weren't preserved; 10,181 is what today's 2778×3748 render predicts under the HF-config budget, as the poster-table note above explains.

Small images match the config math token-for-token — same 32 px grid, same +2 markers — on a laptop. But the 300-dpi page comes back at less than half the cloud count, and the number reverse-engineers exactly the same way alibaba’s did: a **4,194,304 px² (2048²) budget**, floor-snapped after rescale. A third pixel policy for the same weights:

| Serving stack | Pixel budget | Effective Letter ceiling |
| --- | --: | --: |
| HF config / 7 of 8 cloud providers | 16,777,216 (4096²) | 423 dpi |
| Ollama (local llama.cpp lineage) | 4,194,304 (2048²) | **~211 dpi** |
| alibaba (DashScope-style) | 2,621,440 | ~165 dpi |

The poster row prices that clamp in the open: the same 2778×3748 render that the HF-config budget puts at 10,181 tokens costs **4,072** locally, because Ollama’s 2048² cap downscales it before encoding — a 2.5× difference on identical bytes. A 47 s prefill and 9 tok/s decode on this machine returned the same correct JSON. Same weights, three different effective resolutions. The preprocessing really is a property of whoever runs the server — including you.

And because you run this server, you can lift the cap.[^ollama-cap] The 2048² clamp isn’t in the weights; the GGUF mmproj carries no `max_pixels` key (I parsed its metadata to check). It lives in llama.cpp’s mtmd defaults. Re-ran the 300-dpi page with `--image-max-tokens 16384` via `llama-mtmd-cli`: default capped batches about half; with the flag the encoder processed **16×512+48 = 8,240 tokens — the full HF-config resolution, matching the cloud bit-for-bit** — at the price of a 45-second vision encode on this Mac. Same weights on disk, full 4096² for that CLI run, nothing persisted.

[^ollama-cap]:
    On your machine: the clamp lives in llama.cpp’s mtmd defaults — Qwen-VL projectors get `set_limit_image_tokens(8, 4096)` in `clip.cpp`, i.e. 4,096 image tokens = 4,194,304 px²; Ollama inherits that default. As of 2026-08-25 there is still no Modelfile `PARAMETER`, documented `OLLAMA_*` env, API `options` field, or `settings.json` key for the vision budget. But Ollama’s llama-server runner is a child process and inherits the server environment, and llama.cpp maps `LLAMA_ARG_IMAGE_MAX_TOKENS` to `--image-max-tokens`. Set that on the Ollama server process (same way you’d set `OLLAMA_HOST`: `launchctl setenv` on macOS, `Environment=` under systemd, or export before `ollama serve`) and the next model load uses the higher cap. Ollama’s own `serve --help` only documents `LLAMA_ARG_FIT` / `LLAMA_ARG_FIT_TARGET`; the image-token vars are a llama.cpp passthrough, confirmed by maintainers for `LLAMA_ARG_IMAGE_MIN_TOKENS`. For a one-shot run without restarting Ollama, point `llama-mtmd-cli` at the GGUFs — Ollama’s for `qwen3.8` or any Q4_K_M download — and pass the flag directly:

    ```bash
    llama-mtmd-cli \
      -m model.gguf \
      --mmproj mmproj.gguf \
      --image-max-tokens 16384
    ```

    The flag exists because Qwen-VL grounding degrades below 1,024 image tokens; llama.cpp warns about that at load time. Ollama hardcodes `--image-min-tokens 1024` for some Qwen-VL arches — `qwen2vl` / `qwen25vl` / `qwen3vl` / `qwen3vlmoe` — but not for `qwen35` like `qwen3.8`, and it never passes `--image-max-tokens` on the CLI.

Zoom out. We began with a pixel budget in a config file. We watched seven cloud hosts honor it, one silently tighten it, and a laptop tighten it again. The weights were never the variable. The server was.

## Grow until it breaks

The paths are clear; the unpublished ceilings that kill them are not. OpenRouter’s docs confirm oversized bodies die with `413` / `payload_too_large` (“exceeds the maximum allowed size”) and stop there. They do not publish the 5 MB `cloudflare-ai` parser cap, any ceiling on `mistral-ocr` (none found short of the transport limit), the ~30 MB aggregate image wall, or the transport wall itself.[^files] Nothing in the docs answers how many you can attach either. So grow the payload along two axes until something breaks.

[^files]: The separate Files upload API caps at 100 MB. That is not the inline `file_data` / chat-completions path measured here.

First story: grow bytes until refusal. Valid one-page PDFs, padded with random bytes to exact sizes. Watch which engine refuses first, which ones ride to the transport wall, and how slow the large ones get.

| Path | Measured limit | Failure |
| --- | --- | --- |
| `cloudflare-ai` parser | **5 MB** (4.8 ✓, 5.0 ✗) | `400: The file exceeds the maximum size supported by the file parser` |
| `mistral-ocr` parser | **32 MB ✓** (137 s)[^mistral-cap] | runs into the transport limit below |
| `native` @ venice | **32 MB ✓** (317 s), 40 MB ✗ | `413` from the gateway |
| page images (aggregate) | **~30 MB** decoded (95 Letter @100 dpi ✓ / 100 ✗) | `Downloaded image content cannot exceed 30MB` |
| the transport itself | JSON body ≈ **50 MiB** | same 413, the real constraint for large files |

[^mistral-cap]: No parser-level cap found: succeeded at 32 MB / 137 s and hit the transport limit instead.

The “file parser” is not one parser: `cloudflare-ai` refuses anything past 5 MB while `mistral-ocr`, despite sharing the same plugin config, accepted every size up to the transport wall; it bills per page parsed, so big inputs pay their way, while the free extractor has no such budget. A scanned contract at 300 dpi blows past 5 MB in a dozen pages, so the free-parse path is for _small_ files only. Big files are slow however they travel: 32 MB took 137 s through OCR and 317 s natively (expect transient 502s at this scale; one retry fixed mine). And the binding constraint is the HTTP body: base64 inflates files 1.33×, so the ~50 MiB transport cap means **~36 MB of PDF is the absolute end of the road** on this API, any engine. Past any of these, you’re splitting the document, or rendering pages and batching images — which dodge the file-parser caps but still hit a separate **~30 MB aggregate image** wall.

Second story: grow count until silence. Tiny unique PDFs and PNGs, climbing until something breaks. The billing math makes delivery verifiable: each probe PNG costs exactly 66 tokens (64 + 2 markers), so `input_tokens` counts the images that actually arrived. Attachment-count limits below were re-measured 2026-08-25 across every engine path.

| Input type | Measured limit | What happens at the limit |
| --- | --: | --- |
| `input_file` → native @ venice | **5 files** | 6th → hard `400` |
| `input_file` → `cloudflare-ai` | **25 files** | files 26+ **silently dropped**, 200, `tok_in` plateaus |
| `input_file` → `mistral-ocr` (or omit) | **≥100** | tokens climb with `k`; no silent drop through 100 |
| `input_image` (64×64 probe) | **host window** | CoreWeave 262K: 170 ✓ / 171 ✗; Alibaba: 250 ✓ / 280 ✗ |
| PDF pages as images @100 dpi | **≤95 pages** | 95 ✓ / 100 ✗, `Downloaded image content cannot exceed 30MB` |

The parser row is the treacherous one — _when the `cloudflare-ai` parser actually runs_. Reproduced on CoreWeave and Chutes (non-Venice order): `tok_in` climbs to k=25 (2,135 / 2,010), then freezes through k=48 (2,140 / 2,015), and files 26+ vanish with HTTP 200 and no warning. Same day, unpinned `cloudflare-ai` can still short-circuit to Venice _native_ and hit the **5-file** wall instead, so verify the path via billed tokens, not just the engine name. Explicit `mistral-ocr` and `plugins` omitted both climb linearly through **k=100** (1,965 / 2,365 tokens; pipeline reports every page parsed), no 25 plateau; the silent drop is engine-specific. (k=128 OCR hung >20 min with no response, so the practical OCR count ceiling is still unknown above 100.)

The images limit is two different mechanisms depending on what you send. **Probe PNGs** hit OpenRouter’s preflight reservation of **~1,536 tokens/image** vs the host context window: CoreWeave 262K refuses at k=171 (`maximum context length`; the error reports `262656` of image input = 171 × 1,536); k=170 bills **11,280**. Unpinned Alibaba accepts through **250** (16,556 billed) and fails by 280. **Real Letter pages @100 dpi** (`cv.pdf` → ~259 KB PNG, ~920 tokens/page) never reach that estimator wall; they die earlier on an aggregate payload cap: **95 pages ✓** (87,460 billed) / **100 ✗** with `Downloaded image content cannot exceed 30MB` (also seen as body-length / 413 on pinned hosts).

Grow bytes: walls. Grow count: sometimes a hard refuse, sometimes a quiet drop. Same envelope, two failure geometries.

In practice: native for ≤5 files, `cloudflare-ai` for ≤25 when the parser path is live (enforce that yourself), `mistral-ocr` when you need more files and will pay per page, images for everything else, and batch real page renders under ~95 @100 dpi or compress harder.

### Sharp edges

Smaller things that will quietly ruin an eval — no new theory, just edges:

- **File paths need a funded balance.** Any request carrying a file part is preflighted against your OpenRouter credit balance and rejected below roughly $0.50 with `402: This request requires at least $0.50 in balance for files`. Large image prompts hit a related `Prompt tokens limit exceeded` 402 keyed to remaining credit. Neither is a capability failure, but both look exactly like one if you’re bisecting provider support on a near-empty account; check your balance before concluding a host dropped file input.
- **HTTP 200 with empty content.** Reasoning deployments can spend the whole output budget thinking and return an empty string with a success status:

  ```python
  # status=200, usage.output_tokens=900, text=""
  payload["reasoning"] = {"effort": "low"}   # plus max_output_tokens >= 3000
  assert text.strip(), "empty-200 trap"
  ```

- **Rate limits are per-provider and bursty.** Two of eight endpoints threw 429s under mild concurrency, including the only native-PDF one. Retry with backoff before concluding anything.
- **Degenerate probes lie.** A 1×1-px capability probe got one provider falsely marked “no image support.” Probes must look like real traffic; mine use a 64×64 image and a minimal valid one-page PDF.
- **JPEG at quality 100 is worse than PNG for documents.** 2.2× the bytes in my test for differences no encoder can see. Sharp black-on-white is DCT’s pathological case. Want smaller than PNG? JPEG q≈85, never q=100.

## Measure what the router actually did

With the paths ranked and the walls mapped, the remaining question is how to _see_ what the router actually did. One header turns the black box translucent:

```python
response = client.responses.create(
    ...,
    extra_headers={"X-OpenRouter-Metadata": "enabled"},
)
meta = response.model_dump()["openrouter_metadata"]
# meta["summary"]        → "available=1, selected=Venice"
# meta["pipeline"]       → [{"name": "file-parser", "summary": "Parsed 1 page via mistral-ocr", ...}]
# meta["endpoints"]["available"][0]["model"]  → dated deployment slug
```

Per request, it names the selected provider (fixing the Responses API’s missing field), the _dated deployment_ that served you (visible nowhere else), and which parsing engine actually ran on how many pages. The metadata header is how I caught the omit-plugins trap — plus the mid-day routing flip and the alibaba deployment date.

One gap: `cloudflare-ai` parses emit _no_ pipeline entry. An absent `file-parser` step does not mean no parsing happened; cross-check `usage.cost`.

The third measured document is a **13-page born-digital contract**: selectable text layer, plus an e-signature page whose layout is visual evidence the parsers garble. Same structured extraction task across four ingestion paths. The lanes run at true relative latency; costs appear as each lane finishes. The slowest lane costs about **five times** the image lane and **seven times** the parser lane. Watch until the bottom lane finishes; cost bars draw after each finish.

<div data-fig="pdf-cost-race"></div>

| Path | Latency | Cost | Page fidelity |
| --- | --- | --- | --- |
| Native @ venice | **7.4 s** | $0.0061 | said 12 of 13 |
| Page images @ 100 dpi, any provider | 10 to 24 s | $0.0070 to 0.0085 | **13 of 13**, described the e-signature page |
| `cloudflare-ai`, unpinned | 38.5 s | **$0.0051** | 13 of 13 |
| `mistral-ocr`, unpinned | 45.1 s | $0.0342 | said 9 of 13 |

_Race numbers are single-day data, measured 2026-08-24 only. The two unpinned lanes sit downstream of routing that flipped within 12 hours; read these latencies and costs as one day’s snapshot, not current behavior._

The $0.0051 `cloudflare-ai` lane matched the free-parser price band (~$0.0053 on three averaged runs above) and `openrouter_metadata.pipeline` showed **no** `file-parser` entry, because `cloudflare-ai` parses never emit one. That is either a true parser bill with no pipeline signal, or Venice-native routing at parser prices; cross-check `usage.cost` and the selected provider in the metadata header.

All four got the core fields right. The margins tell the story: OCR reports its own segments rather than PDF pages (9 of 13) at **~7×** the parser lane — the right tool for scans and the wrong tool when a text layer already exists. Flip that for `cloudflare-ai`: it won on this born-digital contract precisely because there _was_ a text layer to extract; the same engine blanked on the poster above. The parsed-text path is still blind to visual structure: it succeeded on the fields but everything the signature page encodes visually arrived garbled or not at all, while the image path _described_ that page. Native Venice undercounted pages (“12 of 13”) — a fidelity margin, not a routing failure.

Parsed responses do carry one gift worth keeping: annotations on the `output_text` part, containing a content hash and the parsed blocks.

```python
out_msg = next(o for o in resp["output"] if o["type"] == "message")
part = next(c for c in out_msg["content"] if c["type"] == "output_text")
annotations = part.get("annotations")
```

Replay them in the next turn’s history (this API is stateless, so you resend everything) and OpenRouter skips re-parsing entirely:

```python
followup_input = [
    {"type": "message", "role": "user", "content": [text_part, file_part]},
    {"type": "message", "role": "assistant",
     "content": [{**part, "annotations": annotations}]},
    {"type": "message", "role": "user",
     "content": [{"type": "input_text", "text": "Now list the termination clauses."}]},
]
```

They even survive total provider failure, tucked into `error.metadata.file_annotations`. Parse once, retry free.

Return to the fork. File or pictures. On this contract, pictures preserved what the parsers destroyed; the free extractor won on cost because a text layer existed; OCR paid for work that had already been done. The same simple choice, under load, reveals its geometry — and the metadata header is how you know which geometry you got.

Everything above measured one slug on one afternoon. But the leaderboard’s best models all ride the same router, and the file-input branch’s traps — the 5 MB parser cap, the 25-attachment silence, the omitted-plugin default, the ~30 MB image aggregate wall, the ~36 MB file transport wall — are _machinery_, not model properties. What changes per brain is the economics (context window, token price) and, still unpublished, each provider’s file support and pixel budget.

The lab below walks the full decision graph for whichever model you hand it, re-ranking the strip best-verdict-first for the scenario at hand. `qwen3.8-27b` carries the numbers measured for this piece; every other row is seeded with placeholder economics from its model card’s neighborhood, flagged `≈`. Flip the strip to _the 8 endpoints_ and the same scenario resolves per host — the level where file support, pixel budgets, and context windows actually diverge. The router facts are measured either way.

<div data-fig="pdf-model-lab"></div>

Three sweeps worth running. Drag dpi to 300 on the images route: every row stays correct, pages shrink into each model’s budget, but the measured row now carries alibaba’s silent 2.6M px² clamp, and on the endpoints strip io-net’s 65,500-window falls over first. Switch to a scan with `cloudflare-ai`: every row lands on leaf 5, confidently wrong, no signal anywhere. Pin a provider with a parser engine: undefined, for everyone. And the opening view — page images at 100 dpi — is the only configuration that comes back clean across the whole strip, every verdict chip reading one of the three correct leaves, `[1] best fidelity` through `[3] correct, no layout`, uniformly green, which is this piece’s argument rendered as a picture. Rows marked `≈` use approximate economics from model-card neighborhoods, not live measurements; treat them as directional, not invoice-grade.

## What to do

Three durable rules, tied to the envelope:

1. **Pictures open every door.** Default to page images at ~100 dpi when you need a path that works pinned or unpinned, preserves visual structure parsers destroy, and costs only a modest multiple of the free-parser lane on this model. The gateway’s aggregate image wall trips before the context window does — batch accordingly.
2. **Match the engine to what the page already is.** Born-digital text layer → name `cloudflare-ai` and verify the route actually ran. Scan → never trust the free extractor. Ambiguous → images sidestep the question. Never leave `plugins` unset on the file branch; the silent default is the cost trap.
3. **Pin only what you can see.** Native file input is a rare lock — pin it explicitly when you need it, and treat pin+parse as undefined. Audit with the metadata header and a baseline token subtraction; the meters are how you know which door actually opened.

### Practical checklist

1. **Default to page images at ~100 dpi.** The only path that works on every provider, pinned or not; preserves the visual structure parsers destroy; costs **1.4 to 1.7×** the free parser lane on this model ($0.0070 to 0.0085 vs 0.0051 on the contract). Batch under **~95 Letter pages** per request (or compress harder): the gateway’s **~30 MB** aggregate image wall trips before the 262K token window does.
2. **Born-digital (has a text layer)?** Name `cloudflare-ai` explicitly. It extracts that layer; it does not OCR. Leave unpinned and **verify** via the metadata header: unpinned `cloudflare-ai` can route to Venice native with no `file-parser` pipeline entry, and `cloudflare-ai` parses emit no pipeline entry even when they run, so cross-check `usage.cost` (~$0.005) and the selected provider. Cap yourself at **25 attachments** when the parser path is live (`tok_in` plateaus; the API will not warn). Do **not** pin a provider while requesting a parser (`pin+parse` is undefined; routing flipped within 12 hours). Never leave `plugins` unset (the 5.9× trap), and never on scans (empty parse → confabulation when the parser actually runs, worse if a `filename` leaks the answer). Keep the annotations for free re-asks.
3. **Need native file input?** You likely have one provider. Pin it with `engine: native` and `allow_fallbacks: false`, keep **≤5 files** per request (6th → hard `400`), add 429 backoff, and monitor: native token counts on the same document swung **~59×** (90 → 5,272) across two days with no schema field explaining why. You’re one deprecation from zero.
4. **Need many files through a parser?** Prefer explicit `mistral-ocr` over hoping `cloudflare-ai` scales: OCR climbed through **100** tiny PDFs with tokens and pipeline page-counts in lockstep; the free extractor silently drops past 25. Pay per page, or split.
5. **Audit everything.** The metadata header on every request; an `input_tokens` baseline subtraction per provider. Cheapest observability you’ll ever add.
6. **Match the engine to the document.** OCR wastes money on born-digital files; the free parser silently blanks on scans. Can’t know which you’ll get? Images sidestep the question.

The pattern underneath it all: the aggregator abstraction — one slug fronting N interchangeable providers — holds beautifully for plain text and frays at the multimodal edges. The capability matrix you actually run on is the intersection of the model, the router, the parsing plugin, and each provider’s private serving configuration. None of the four publishes it.

Measure it.

_Measurements from live requests against `qwen/qwen3.8-27b` (262K context). Engine tables and attachment-count limits re-verified 2026-08-25 (`uv run python scripts/measure_openrouter_attachment_limits.py --from-eval-key`), including reproduction of the cloudflare-ai 25-file silent drop on CoreWeave/Chutes and the ≤95-page @100 dpi image payload wall; local vision-token rows re-measured 2026-08-25; contract and race numbers are from 2026-08-24. Prices and rosters shift weekly; the methodology is the durable part._
