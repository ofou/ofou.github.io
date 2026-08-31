---
title: "So, you want to attach a PDF on OpenRouter?"
subtitle: What really happens when you send a document through a proxy model?
date: 2026-08-25
categories:
  - LLMs
  - Evals
  - PDF
draft: false
---

# So, you want to attach a PDF on OpenRouter?

OpenRouter is a platform that allows you to use large language models (LLMs) in a more flexible way, recently it has been [acquired by Stripe for more than $7b](https://stripe.com/en-se/newsroom/news/stripe-agrees-to-acquire-openrouter). One of the features it offers is the ability to attach a PDF to a request, and route to different model providers seamlessly.

But what really happens when you send a document through a proxy model?

We'll walk through the process step by step, and see what happens under the hood especially for the excellent [Qwen 3.8-27B](https://openrouter.ai/qwen/qwen3.8-27b) model that has been released just a few days ago.

<!-- more -->

## The catalog does not know its doors

Imagine a sealed envelope handed to a courier who claims to reach any address in the city. The courier's name is a model slug. Behind that name sit ten independent doors, each with its own lock, its own meter, and its own idea of what counts as mail. Some accept the envelope sealed. Some insist you photocopy every page and hand over the pictures. Some open the envelope in a back room, copy the words onto a slip of paper, and forward only the slip.

That's the promise of OpenRouter, you just send the envelope, and the courier will deliver it to the right place, without you having to worry about the details. One of the good sides of this, it's that the courier will always be available with awesome uptime and reliability, the bad side, you don't know which door the courier will choose.

## Omitting engine means paid OCR by default

So, let's say you want to send a scan of a PDF to the model, if you're a person like me, you'll find the docs, copy the example to an agent, and send the request.

[^docs]: OpenRouter, [PDF Inputs](https://openrouter.ai/docs/guides/overview/multimodal/pdfs).

You read in their docs [^docs]:

> OpenRouter provides several PDF processing engines:
>
> - `"mistral-ocr"`: _Best for scanned documents or PDFs with images ($2 per 1,000 pages)._
> - `"cloudflare-ai"`: _Converts PDFs to markdown using Cloudflare Workers AI (Free)._
> - `"native"`: _Only available for models that support file input natively (charged as input tokens)._

But what happens if you omit the engine parameter in the API[^api] call? Let's see.

[^api]: Responses API via the [OpenAI SDK](https://developers.openai.com/api/docs/guides/file-inputs) at `base_url="https://openrouter.ai/api/v1"`. OpenRouter-only fields (`plugins`, `provider`) go in `extra_body`; metadata in `extra_headers`.

```python
import base64, os
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
pdf = base64.b64encode(Path("filename.pdf").read_bytes()).decode()

r = client.responses.create(
    model="qwen/qwen3.8-27b",
    input=[{
        "type": "message", "role": "user",
        "content": [
            {"type": "input_text", "text": "Describe this document."},
            {"type": "input_file",
             "file_data": f"data:application/pdf;base64,{pdf}"},
        ],
    }],
    # extra_body={
    #     "plugins": [{"id": "file-parser", "pdf": {"engine": "native"}}],
    #     "provider": {"only": ["provider_name"], "allow_fallbacks": False},
    # },
    extra_headers={"X-OpenRouter-Metadata": "enabled"},
)
print(r.output_text)
print(r.model_dump()["openrouter_metadata"])
```

So for a document that _does not have_ a text layer[^text-layer], we get the following:

[^text-layer]: A regular PDF might have a text layer, but it's not the default. A scanned PDF is a good example of a document that does not have a text layer.

```text
This file is a text-based (markdown-style) rendering of the United Nations
Universal Declaration of Human Rights (UDHR), presented as a single document
that opens with an image reference, gives a title, reproduces the preamble and
the full body of the Declaration article-by-article, and closes with an
adoption note and the UN emblem. However, the copy is heavily corrupted /
mis-labelled, so it should be read as a flawed reproduction rather than a
clean official text.

…

Notable defects: every preamble paragraph is mislabeled "PROBLEM"; the
operative clause is garbled ("NON THEREFORE THE GENERAL ASSURBES"); article
numbers are wrong throughout (only I and II appear, repeated); scattered
typos ("Non-Self-Doctoring", "infition", "sufferings"); and a fabricated
adoption line dated 1958 instead of 10 December 1948.
```

The model is describing the result of a messy OCR, not a clean text layer. Some might think when you send a PDF to OpenRouter with no engine parameter, it will use the `native` engine, but only if the underlying model supports it. If we use `openrouter_metadata` we can see what actually ran:

```json
{
  "summary": "available=10, attempts=2, selected=AkashML",
  "attempts": [
    { "provider": "CoreWeave", "status": 429 },
    { "provider": "AkashML", "status": 200 }
  ],
  "pipeline": [
    {
      "type": "plugin",
      "name": "file-parser",
      "summary": "Parsed 1 page via mistral-ocr",
      "data": { "engine": "mistral-ocr", "page_count": 1 }
    }
  ]
}
```

As you can see, the engine used was `mistral-ocr`, but it first tried to use CoreWeave, which was rate limited, and then fell back to AkashML. This is the default behavior of the router, if a provider is not available, it will try to use a different provider.

But it's not just the providers that matters, the _type of document_ also matters. For example, if you have a document that you know it _has_ a text layer, you can use the `cloudflare-ai` engine, which is free[^cloudflare-ai], or the `native` engine, which is billed by tokens, not by pages.

[^cloudflare-ai]: Max 25 files per request.

In OpenRouter catalog, we can see all the models that support PDF input [here](https://openrouter.ai/models?input_modalities=file) as defined by the architecture. Let's see if `Qwen 3.8-27B` supports PDF input.

```python
import json, urllib.request

data = json.load(urllib.request.urlopen(
    "https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b/endpoints"
))["data"]

print(data["architecture"]["input_modalities"])
```

Response:

```json
["text", "image", "video"]
```

As you can see, the model itself does not support PDF input natively in OpenRouter catalog. But this seems wrong... Some _providers_ do implement PDF support, especially the ones from the US. If you send a request using the `native` engine parameter, it will force the model to use built-in PDF support, let's see which ones do.

```python
import base64, json, os, urllib.request
from pathlib import Path
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)
pdf = base64.b64encode(Path("filename.pdf").read_bytes()).decode()

providers = [
    ep["tag"].split("/")[0]
    for ep in json.load(urllib.request.urlopen(
        "https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b/endpoints"
    ))["data"]["endpoints"]
]

for provider in providers:
    try:
        client.responses.create(
            model="qwen/qwen3.8-27b",
            input=[{
                "type": "message", "role": "user",
                "content": [
                    {"type": "input_text", "text": "Say ok."},
                    {"type": "input_file",
                     "file_data": f"data:application/pdf;base64,{pdf}"},
                ],
            }],
            extra_body={
                "plugins": [{"id": "file-parser", "pdf": {"engine": "native"}}],
                "provider": {"only": [provider], "allow_fallbacks": False},
            },
        )
        print(provider, "✓")
    except Exception:
        print(provider, "✗")
```

|  Provider  |              Status              |
| :--------: | :------------------------------: |
|   chutes   | <span class="mark-fail">✗</span> |
|   phala    | <span class="mark-fail">✗</span> |
| coreweave  | <span class="mark-warn">✗</span> |
|  akashml   | <span class="mark-fail">✗</span> |
|  alibaba   | <span class="mark-fail">✗</span> |
| cloudflare | <span class="mark-fail">✗</span> |
|    reka    | <span class="mark-fail">✗</span> |
|   venice   |  <span class="mark-ok">✓</span>  |
|  parasail  | <span class="mark-fail">✗</span> |
|   io-net   | <span class="mark-fail">✗</span> |

Out of ten providers tested, only one worked. The catalog did not list any working providers, but pinning the native engine parameter revealed that Venice worked. Nine providers responded with a `400` error indicating _The current model does not support PDF file input_. Whether PDF file input is supported depends on the provider, not from the model architecture.

If you insist on using the `native` engine parameter, you still have to check the providers details such as quantization, context window, max tokens, etc. to make sure the request will fit.

| Provider   | Quant   |     Context |    Max out | In (USD/M) | Out (USD/M) |
| ---------- | ------- | ----------: | ---------: | ---------: | ----------: |
| chutes     | fp8     |     262,144 |     65,536 |       0.35 |        2.75 |
| coreweave  | fp8     |     262,144 |    262,144 |       0.40 |        3.00 |
| akashml    | bf16    |     262,144 |    131,072 |       0.40 |        3.00 |
| alibaba    | unknown |   1,000,000 |    131,072 |      0.425 |        2.55 |
| reka       | fp8     |     262,144 |    131,072 |       0.45 |        3.20 |
| **venice** | **fp8** | **262,144** | **65,536** |   **0.45** |    **3.20** |
| parasail   | fp8     |     262,144 |    262,144 |       0.45 |        3.20 |
| io-net     | fp8     |      65,500 |     65,536 |       0.48 |        3.40 |

Default routing does not prefer higher precision. On this slug it will happily land on `fp8` (or `unknown`) unless you say otherwise. You can sort by `price`, `throughput`, or `latency`, not by quant, but you _can_ filter:

```python
extra_body={
    "provider": {
        "quantizations": ["bf16"],
        "sort": "price",
    }
}
```

But let's get back to PDFs.

## Scan vs text-layer changes what "same request" costs

Before getting to the part in which we pass a PDF as a bunch of images, let's check the limits of the engines `cloudflare-ai` and `mistral-ocr` to see how much it costs to process a PDF. Regardless of the method we use, we have to aware of the limits of the engines, both in file numbers and file size.

The max payload size is 50 MB for the HTTP body, but the actual limit is lower due to the transport limit, and since this is in base64, the actual limit is even lower. The other path we're not measure here

| Path | Measured limit | Failure |
| --- | --- | --- |
| `cloudflare-ai` | **5 MB** | `400: The file exceeds the maximum size supported by the file parser` |
| `mistral-ocr` | **32 MB ✓** (137 s)[^mistral-cap] | runs into the transport limit below |
| `native` @ venice | **32 MB ✓** (317 s), 40 MB ✗ | `413` from the gateway |

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

---

Chinese providers seem to have a tendency to use images parts instead of files.
