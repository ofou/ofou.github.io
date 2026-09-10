# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "pandas", "pyarrow"]
# ///
"""Retrieval bake-off: CLS vs recency/vector stores on EpBench + BABILong.

Compares complementary learning systems against overwrite, FIFO, keyword,
flat cosine, and a forget-gate. The jobs are cued recall and whether early
episodes stay retrievable after later writes — not P(recall|Δt).

Datasets:
  - EpBench (Huet et al., ICLR 2025 / mteb/EPBench) — 200-chapter book,
    partial cues (entity / time / place / content) → chapter retrieval
  - BABILong qa1 (Kuratov et al.) — bAbI facts in a PG-19 haystack,
    length sweep 0k→8k: does the fact stay findable
  - bAbI qa1 continual (optional legacy) — many stories, one store

Run:
    uv run prototypes/cls_bench.py
    uv run prototypes/cls_bench.py --quick
    uv run prototypes/cls_bench.py --self-test
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from cls_memory import (  # noqa: E402
    ComplementaryMemory,
    HashingAtlas,
    _l2_normalize,
    cosine,
    event_is_novel,
    extract_event,
    wants_recency,
)

CACHE = ROOT / ".cache"
SLEEP_TOY = Path(
    "/Users/ofou/os/artificial/code/reproductions/2606.03979_sleep/toy_sleep_cms.py"
)
BABI_URL = "https://huggingface.co/datasets/Muennighoff/babi/resolve/main/babi_test.jsonl"
SQUAD_URL = "https://rajpurkar.github.io/SQuAD-explorer/dataset/dev-v1.1.json"
BABILONG_QA1 = "https://huggingface.co/datasets/RMT-team/babilong/resolve/main/data/qa1/{length}.json"
EPBENCH_HF = "https://huggingface.co/datasets/mteb/EPBench/resolve/main"
EPBENCH_CUES = ("Entities", "Times", "Spaces", "Event_contents")

LIGHT_STOP = {"the", "a", "an", "to", "of", "and", "in", "on", "at"}


def tokenize(text: str) -> list[str]:
    return [
        w
        for w in re.findall(r"[a-z0-9]+", text.lower())
        if w not in LIGHT_STOP and len(w) > 1
    ]


def hash_bow(tokens: list[str], dim: int, seed: int = 0) -> np.ndarray:
    acc = np.zeros(dim, dtype=np.float64)
    for t in tokens:
        h = hashlib.blake2s(f"{seed}:{t}".encode(), digest_size=8).digest()
        idx = int.from_bytes(h[:4], "little") % dim
        sign = 1.0 if h[4] % 2 == 0 else -1.0
        acc[idx] += sign
    return _l2_normalize(acc)


def answer_in(text: str, gold: str) -> bool:
    blob = f" {text.lower()} "
    g = gold.lower().strip()
    if not g:
        return False
    return f" {g} " in blob or g in text.lower()


# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------


def _download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 0:
        return
    print(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "cls-bench/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r, dest.open("wb") as f:
        f.write(r.read())


def load_babi(limit_per_task: int) -> dict[str, list[dict]]:
    path = CACHE / "babi_test.jsonl"
    _download(BABI_URL, path)
    wanted = {1: "qa1", 2: "qa2", 3: "qa3"}
    out: dict[str, list[dict]] = {name: [] for name in wanted.values()}
    with path.open(encoding="utf-8") as f:
        for line in f:
            row = json.loads(line)
            task = int(row["task"])
            name = wanted.get(task)
            if name is None or len(out[name]) >= limit_per_task:
                if all(len(out[n]) >= limit_per_task for n in wanted.values()):
                    break
                continue
            facts = [s.strip() for s in row["passage"].split("\n") if s.strip()]
            out[name].append(
                {
                    "facts": facts,
                    "question": row["question"].strip(),
                    "answer": str(row["answer"]).strip(),
                }
            )
    return out


def load_squad(n_articles: int, max_q_per_article: int) -> list[dict]:
    path = CACHE / "squad-dev-v1.1.json"
    _download(SQUAD_URL, path)
    data = json.loads(path.read_text(encoding="utf-8"))["data"]
    ranked = sorted(data, key=lambda a: sum(len(p["qas"]) for p in a["paragraphs"]), reverse=True)
    articles = []
    for art in ranked[:n_articles]:
        paras = []
        for p in art["paragraphs"]:
            qas = []
            for qa in p["qas"]:
                if qa.get("is_impossible"):
                    continue
                answers = qa.get("answers") or []
                if not answers:
                    continue
                qas.append({"question": qa["question"], "answer": answers[0]["text"]})
                if len(qas) >= max_q_per_article:
                    break
            if qas:
                paras.append({"context": p["context"], "qas": qas})
        if paras:
            articles.append({"title": art["title"], "paragraphs": paras})
    return articles


def split_units(text: str) -> list[str]:
    parts = re.split(r"\n+|(?<=[.!?])\s+", text)
    out = [p.strip() for p in parts if len(p.strip()) > 8]
    return out or ([text.strip()] if text.strip() else [])


def chapter_num(doc_id: str) -> int:
    m = re.search(r"(\d+)$", doc_id)
    return int(m.group(1)) if m else 0


def load_babilong_qa1(length: str, limit: int | None) -> list[dict]:
    path = CACHE / f"babilong_qa1_{length}.json"
    _download(BABILONG_QA1.format(length=length), path)
    rows = json.loads(path.read_text(encoding="utf-8"))
    if limit is not None:
        rows = rows[:limit]
    out = []
    for row in rows:
        out.append(
            {
                "units": split_units(row["input"]),
                "question": str(row["question"]).strip(),
                "answer": str(row["target"]).strip(),
            }
        )
    return out


def load_epbench(book: str, cue: str) -> tuple[list[dict], list[dict], dict[str, set[str]]]:
    """mteb/EPBench split: corpus chapters, cue queries, qrels."""
    import pandas as pd

    def parquet(kind: str) -> pd.DataFrame:
        rel = f"{book}/{cue}-{kind}/test-00000-of-00001.parquet"
        dest = CACHE / "epbench" / rel.replace("/", "_")
        _download(f"{EPBENCH_HF}/{rel}", dest)
        return pd.read_parquet(dest)

    corpus_df = parquet("corpus")
    queries_df = parquet("queries")
    qrels_df = parquet("qrels")
    corpus = [
        {"id": str(r["id"]), "text": str(r["text"])}
        for r in corpus_df.to_dict("records")
    ]
    corpus.sort(key=lambda d: chapter_num(d["id"]))
    queries = [{"id": str(r["id"]), "text": str(r["text"])} for r in queries_df.to_dict("records")]
    qrels: dict[str, set[str]] = {}
    for r in qrels_df.to_dict("records"):
        if int(r.get("score", 1) or 0) <= 0:
            continue
        qrels.setdefault(str(r["query-id"]), set()).add(str(r["corpus-id"]))
    return corpus, queries, qrels


# ---------------------------------------------------------------------------
# Memory systems
# ---------------------------------------------------------------------------


@dataclass
class Item:
    doc_id: str
    text: str
    tokens: list[str]
    vec: np.ndarray
    t: int


class Store:
    name = "base"

    def write(self, doc_id: str, text: str) -> None:
        raise NotImplementedError

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        raise NotImplementedError

    def query(self, text: str, k: int = 1) -> str:
        return " ".join(it.text for it in self.query_ranked(text, k))

    def sleep(self) -> None:
        return


class OverwriteStore(Store):
    """Naive overwrite — one slot. Catastrophic forgetting by construction."""

    name = "overwrite"

    def __init__(self) -> None:
        self.item: Item | None = None
        self._t = 0

    def write(self, doc_id: str, text: str) -> None:
        tok = tokenize(text)
        self._t += 1
        self.item = Item(doc_id, text, tok, hash_bow(tok, 64), self._t)

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        del text, k
        return [self.item] if self.item else []


class FIFOStore(Store):
    """Last-k buffer. Forgetting Transformer recency without similarity."""

    name = "fifo"

    def __init__(self, k: int = 32) -> None:
        self.k = k
        self.items: list[Item] = []
        self._t = 0

    def write(self, doc_id: str, text: str) -> None:
        tok = tokenize(text)
        self._t += 1
        self.items.append(Item(doc_id, text, tok, hash_bow(tok, 64), self._t))
        if len(self.items) > self.k:
            self.items = self.items[-self.k :]

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        q = tokenize(text)
        if not self.items:
            return []
        ranked = sorted(self.items, key=lambda it: _jaccard(q, it.tokens), reverse=True)
        return ranked[:k]


class VectorStore(Store):
    """Flat embedding cosine — Memoryfield analogue (cortex only, no index)."""

    name = "vector"

    def __init__(self, dim: int = 64) -> None:
        self.dim = dim
        self.items: list[Item] = []
        self._t = 0

    def write(self, doc_id: str, text: str) -> None:
        tok = tokenize(text)
        self._t += 1
        self.items.append(Item(doc_id, text, tok, hash_bow(tok, self.dim), self._t))

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        if not self.items:
            return []
        qv = hash_bow(tokenize(text), self.dim)
        ranked = sorted(self.items, key=lambda it: cosine(qv, it.vec), reverse=True)
        return ranked[:k]


class ForgetGateStore(Store):
    """Score = similarity × exp(−λ Δt). Forget-gate / Hope decay analogue.

    Not a trained Forgetting Transformer. Same job: old keys fade unless
    they match the cue strongly.
    """

    name = "forget_gate"

    def __init__(self, dim: int = 64, lam: float = 0.025) -> None:
        self.dim = dim
        self.lam = lam
        self.items: list[Item] = []
        self._t = 0

    def write(self, doc_id: str, text: str) -> None:
        tok = tokenize(text)
        self._t += 1
        self.items.append(Item(doc_id, text, tok, hash_bow(tok, self.dim), self._t))

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        if not self.items:
            return []
        qv = hash_bow(tokenize(text), self.dim)
        now = self._t

        def score(it: Item) -> float:
            return cosine(qv, it.vec) * math.exp(-self.lam * (now - it.t))

        ranked = sorted(self.items, key=score, reverse=True)
        return ranked[:k]


class KeywordStore(Store):
    """Jaccard token overlap. Strong on bAbI, weak when wording drifts."""

    name = "keyword"

    def __init__(self) -> None:
        self.items: list[Item] = []
        self._t = 0

    def write(self, doc_id: str, text: str) -> None:
        tok = tokenize(text)
        self._t += 1
        self.items.append(Item(doc_id, text, tok, hash_bow(tok, 8), self._t))

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        q = tokenize(text)
        if not self.items:
            return []
        ranked = sorted(self.items, key=lambda it: _jaccard(q, it.tokens), reverse=True)
        return ranked[:k]


class CLSStore(Store):
    name = "cls"

    def __init__(self, do_sleep: bool = False, seed: int = 0) -> None:
        self.do_sleep = do_sleep
        self.name = "cls_sleep" if do_sleep else "cls_wake"
        self.mem = ComplementaryMemory(
            seed=seed,
            k_active=12,
            n_dg=2048,
            complete_threshold=0.08,
            schema_decode_threshold=0.40,
            atlas=HashingAtlas(dim=96, seed=seed),
        )
        self._since_sleep = 0

    def write(self, doc_id: str, text: str) -> None:
        slots = extract_event(text)
        if not event_is_novel(slots):
            return
        feats = [t for ch in ("entity", "place", "time", "content") for t in slots[ch]]
        if not feats:
            feats = tokenize(text) or ["empty"]
        self.mem.encode(title=doc_id, features=feats, regions=slots, text=text)
        self._since_sleep += 1

    def sleep(self) -> None:
        if self.do_sleep and self._since_sleep >= 8:
            self.mem.sleep(min_support=3, min_shared=2, strip_predicted=True)
            self._since_sleep = 0
        else:
            self.mem.close_scene()

    def query_ranked(self, text: str, k: int = 1) -> list[Item]:
        if not self.mem.ca3.entries:
            return []
        slots = extract_event(text)
        feats = tokenize(text)
        mode = "latest" if wants_recency(text) else "complete"
        entries = self.mem.recall_ranked(feats, regions=slots, mode=mode, k=k)
        out: list[Item] = []
        for entry in entries:
            payload = self.mem.payloads[entry.content_id]
            engram = self.mem.engrams[entry.engram_id]
            out.append(
                Item(
                    engram.title,
                    payload.text,
                    list(payload.features),
                    payload.embedding,
                    entry.t,
                )
            )
        return out


def _jaccard(a: list[str], b: list[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


def make_stores(seed: int = 0) -> list[Store]:
    return [
        OverwriteStore(),
        FIFOStore(k=32),
        KeywordStore(),
        VectorStore(dim=64),
        ForgetGateStore(dim=64, lam=0.025),
        CLSStore(do_sleep=False, seed=seed),
        CLSStore(do_sleep=True, seed=seed),
    ]


# ---------------------------------------------------------------------------
# Protocols
# ---------------------------------------------------------------------------


@dataclass
class Row:
    experiment: str
    system: str
    accuracy: float
    n: int
    seconds: float
    extra: dict = field(default_factory=dict)


def eval_babi_online(stories: list[dict], factory) -> tuple[float, float]:
    """Standard bAbI: write the story, ask, fresh store next story."""
    hits = 0
    t0 = time.perf_counter()
    for i, st in enumerate(stories):
        store: Store = factory()
        for j, fact in enumerate(st["facts"]):
            store.write(f"s{i}-f{j}", fact)
        store.sleep()
        got = store.query(st["question"], k=3)
        hits += int(answer_in(got, st["answer"]))
    return hits / max(1, len(stories)), time.perf_counter() - t0


def eval_babi_continual(stories: list[dict], factory) -> tuple[float, float, float]:
    """Write all stories, then quiz the *early* ones — interference / forgetting."""
    store: Store = factory()
    t0 = time.perf_counter()
    for i, st in enumerate(stories):
        for j, fact in enumerate(st["facts"]):
            store.write(f"s{i}-f{j}", fact)
        if i % 10 == 9:
            store.sleep()
    store.sleep()
    early = stories[: max(10, len(stories) // 5)]
    hits = 0
    for st in early:
        got = store.query(st["question"], k=3)
        hits += int(answer_in(got, st["answer"]))
    # also overall
    all_hits = 0
    for st in stories:
        got = store.query(st["question"], k=3)
        all_hits += int(answer_in(got, st["answer"]))
    return (
        hits / max(1, len(early)),
        all_hits / max(1, len(stories)),
        time.perf_counter() - t0,
    )


def eval_babilong_haystack(samples: list[dict], factory) -> tuple[float, float]:
    """Write haystack sentences, cue the question — fact must survive filler."""
    hits = 0
    t0 = time.perf_counter()
    for i, st in enumerate(samples):
        store: Store = factory()
        for j, unit in enumerate(st["units"]):
            store.write(f"s{i}-u{j}", unit)
        store.sleep()
        got = store.query(st["question"], k=5)
        hits += int(answer_in(got, st["answer"]))
    return hits / max(1, len(samples)), time.perf_counter() - t0


def eval_babilong_stay_strong(samples: list[dict], factory) -> tuple[float, float, float]:
    """One store, all samples, quiz the early questions after later writes."""
    store: Store = factory()
    t0 = time.perf_counter()
    for i, st in enumerate(samples):
        for j, unit in enumerate(st["units"]):
            store.write(f"s{i}-u{j}", unit)
        store.sleep()
    early = samples[: max(8, len(samples) // 5)]
    hits = 0
    for st in early:
        got = store.query(st["question"], k=5)
        hits += int(answer_in(got, st["answer"]))
    all_hits = 0
    for st in samples:
        got = store.query(st["question"], k=5)
        all_hits += int(answer_in(got, st["answer"]))
    return (
        hits / max(1, len(early)),
        all_hits / max(1, len(samples)),
        time.perf_counter() - t0,
    )


def eval_epbench(
    corpus: list[dict],
    queries: list[dict],
    qrels: dict[str, set[str]],
    factory,
    k: int = 3,
    early_frac: float = 0.2,
) -> tuple[float, float, float, int, int]:
    """Write chapters in order, retrieve by cue. Stay-strong = early golds after later writes."""
    store: Store = factory()
    t0 = time.perf_counter()
    for i, doc in enumerate(corpus):
        store.write(doc["id"], doc["text"])
        if i % 20 == 19:
            store.sleep()
    store.sleep()
    early_n = max(4, int(len(corpus) * early_frac))
    early_ids = {d["id"] for d in corpus[:early_n]}

    def recall(want_early: bool) -> tuple[float, int]:
        hits = n = 0
        for q in queries:
            gold = qrels.get(q["id"], set())
            if not gold:
                continue
            early_gold = gold & early_ids
            if want_early:
                if not early_gold:
                    continue
            ranked = store.query_ranked(q["text"], k=k)
            got = {it.doc_id for it in ranked}
            target = early_gold if want_early else gold
            hits += int(bool(got & target))
            n += 1
        return hits / max(1, n), n

    acc_all, n_all = recall(False)
    acc_early, n_early = recall(True)
    return acc_all, acc_early, time.perf_counter() - t0, n_all, n_early


def eval_squad_continual(articles: list[dict], factory) -> tuple[float, float, float]:
    """Store topic-A passages, then topic-B, query A's questions (SQuAD CPT-lite)."""
    mid = max(1, len(articles) // 2)
    a_arts, b_arts = articles[:mid], articles[mid:]
    store: Store = factory()
    t0 = time.perf_counter()
    n_write = 0
    for art in a_arts:
        for pi, p in enumerate(art["paragraphs"]):
            store.write(f"A-{art['title']}-{pi}", p["context"])
            n_write += 1
    store.sleep()
    for art in b_arts:
        for pi, p in enumerate(art["paragraphs"]):
            store.write(f"B-{art['title']}-{pi}", p["context"])
            n_write += 1
    store.sleep()

    def quiz(arts: list[dict]) -> float:
        hits = n = 0
        for art in arts:
            for p in art["paragraphs"]:
                for qa in p["qas"]:
                    got = store.query(qa["question"], k=1)
                    hits += int(answer_in(got, qa["answer"]))
                    n += 1
        return hits / max(1, n)

    acc_a = quiz(a_arts)
    acc_b = quiz(b_arts)
    return acc_a, acc_b, time.perf_counter() - t0


def eval_sleep_cms_squad(articles: list[dict], dim: int = 32) -> list[Row]:
    """Same 2-task protocol as toy_sleep_cms.py, on real SQuAD paragraphs."""
    if not SLEEP_TOY.exists():
        print("  skip sleep-cms: toy not found at", SLEEP_TOY)
        return []
    import importlib.util

    spec = importlib.util.spec_from_file_location("toy_sleep_cms", SLEEP_TOY)
    if spec is None or spec.loader is None:
        return []
    mod = importlib.util.module_from_spec(spec)
    sys.modules["toy_sleep_cms"] = mod
    spec.loader.exec_module(mod)

    if len(articles) < 4:
        print("  skip sleep-cms: need ≥4 SQuAD articles")
        return []

    def article_xy(art: dict, label: int) -> tuple[list[np.ndarray], list[int]]:
        xs, ys = [], []
        for p in art["paragraphs"]:
            xs.append(hash_bow(tokenize(p["context"]), dim))
            ys.append(label)
        return xs, ys

    def stack_task(a0: dict, a1: dict) -> tuple[np.ndarray, np.ndarray]:
        x0, y0 = article_xy(a0, 0)
        x1, y1 = article_xy(a1, 1)
        xs = np.stack(x0 + x1)
        ys = np.array(y0 + y1, dtype=np.int64)
        return xs, ys

    xa, ya = stack_task(articles[0], articles[1])
    xb, yb = stack_task(articles[2], articles[3])
    # subsample to keep the tiny MLP honest
    rng = np.random.default_rng(0)
    def sub(x, y, n=400):
        if len(x) <= n:
            return x, y
        idx = rng.choice(len(x), size=n, replace=False)
        return x[idx], y[idx]

    xa, ya = sub(xa, ya)
    xb, yb = sub(xb, yb)

    rows = []
    for runner, name in ((mod.run_naive, "naive_finetune"), (mod.run_sleep, "sleep_cms")):
        t0 = time.perf_counter()
        m = runner(xa, ya, xb, yb, dim)
        rows.append(
            Row(
                experiment="squad_2task_clf",
                system=name,
                accuracy=m.acc_a_after_b,
                n=len(xa),
                seconds=time.perf_counter() - t0,
                extra={
                    "acc_a_after_a": m.acc_a_after_a,
                    "acc_b_after_b": m.acc_b_after_b,
                    "forgetting_a": m.forgetting_a,
                    "articles": [articles[i]["title"] for i in range(4)],
                },
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------


def _print_table(rows: list[Row]) -> None:
    by_exp: dict[str, list[Row]] = {}
    for r in rows:
        by_exp.setdefault(r.experiment, []).append(r)
    for exp, group in by_exp.items():
        print()
        print(f"── {exp} " + "─" * max(0, 56 - len(exp)))
        print(f"    {'system':<16} {'acc':>7} {'n':>5} {'sec':>7}  notes")
        for r in group:
            note = ""
            if "acc_all" in r.extra:
                note = f"all={r.extra['acc_all']:.3f}"
            if "acc_early" in r.extra:
                note = f"stay-strong={r.extra['acc_early']:.3f} n_early={r.extra.get('n_early', '?')}"
            if "acc_b" in r.extra:
                note = f"A(after B)  B={r.extra['acc_b']:.3f}"
            if "forgetting_a" in r.extra:
                note = (
                    f"A0={r.extra['acc_a_after_a']:.3f}  "
                    f"B={r.extra['acc_b_after_b']:.3f}  "
                    f"forget={r.extra['forgetting_a']:.3f}"
                )
            print(f"    {r.system:<16} {r.accuracy:7.3f} {r.n:5d} {r.seconds:7.2f}  {note}")


def _stores() -> list[tuple[str, object]]:
    return [
        ("overwrite", OverwriteStore),
        ("fifo", lambda: FIFOStore(k=32)),
        ("keyword", KeywordStore),
        ("vector", lambda: VectorStore(dim=64)),
        ("forget_gate", lambda: ForgetGateStore(dim=64, lam=0.025)),
        ("cls_wake", lambda: CLSStore(do_sleep=False, seed=0)),
        ("cls_sleep", lambda: CLSStore(do_sleep=True, seed=0)),
    ]


def run(quick: bool = False, legacy: bool = False, n_hay: int | None = None) -> list[Row]:
    rows: list[Row] = []
    stores_spec = _stores()
    book = "default_claude_short" if quick else "default_claude_long"
    cues = ("Entities", "Times") if quick else EPBENCH_CUES
    lengths = ("0k", "4k") if quick else ("0k", "1k", "4k", "8k", "16k", "32k")
    if n_hay is None:
        n_hay = 12 if quick else None

    print(f"loading EpBench {book} …")
    for cue in cues:
        corpus, queries, qrels = load_epbench(book, cue)
        print(f"  {cue}: {len(corpus)} chapters, {len(queries)} queries")
        for name, factory in stores_spec:
            acc, early, sec, n_all, n_early = eval_epbench(corpus, queries, qrels, factory)
            rows.append(
                Row(
                    f"epbench_{cue}_retrieval",
                    name,
                    acc,
                    n_all,
                    sec,
                    extra={"acc_early": early, "n_early": n_early},
                )
            )
            print(
                f"  epbench {cue} {name}: all={acc:.3f} stay-strong={early:.3f} "
                f"(n={n_all}/{n_early})"
            )

    print("loading BABILong qa1 …")
    for length in lengths:
        samples = load_babilong_qa1(length, n_hay)
        n_units = int(sum(len(s["units"]) for s in samples) / max(1, len(samples)))
        print(f"  {length}: {len(samples)} samples, ~{n_units} units/sample")
        for name, factory in stores_spec:
            acc, sec = eval_babilong_haystack(samples, factory)
            rows.append(Row(f"babilong_qa1_{length}_haystack", name, acc, len(samples), sec))
            print(f"  babilong {length} haystack {name}: {acc:.3f}")

    zero = load_babilong_qa1("0k", n_hay)
    print("BABILong qa1 stay-strong (0k, one store) …")
    for name, factory in stores_spec:
        early, overall, sec = eval_babilong_stay_strong(zero, factory)
        rows.append(
            Row(
                "babilong_qa1_0k_stay_strong",
                name,
                early,
                max(8, len(zero) // 5),
                sec,
                extra={"acc_all": overall},
            )
        )
        print(f"  babilong stay-strong {name}: early={early:.3f} all={overall:.3f}")

    if not legacy:
        return rows

    limit = 40 if quick else 120
    print("legacy bAbI + SQuAD …")
    babi = load_babi(limit_per_task=limit)
    squad = load_squad(n_articles=4 if quick else 8, max_q_per_article=2 if quick else 4)
    for name, factory in stores_spec:
        acc, sec = eval_babi_online(babi["qa1"], factory)
        rows.append(Row("babi_qa1_online", name, acc, len(babi["qa1"]), sec))
        early, overall, sec = eval_babi_continual(babi["qa1"], factory)
        rows.append(
            Row(
                "babi_qa1_continual_early",
                name,
                early,
                max(10, len(babi["qa1"]) // 5),
                sec,
                extra={"acc_all": overall},
            )
        )
    n_q_a = sum(
        len(q)
        for art in squad[: max(1, len(squad) // 2)]
        for p in art["paragraphs"]
        for q in p["qas"]
    )
    for name, factory in stores_spec:
        acc_a, acc_b, sec = eval_squad_continual(squad, factory)
        rows.append(
            Row("squad_continual", name, acc_a, n_q_a, sec, extra={"acc_b": acc_b})
        )
    rows.extend(eval_sleep_cms_squad(squad, dim=32))
    return rows


def self_test() -> None:
    stories = [
        {
            "facts": ["Mary moved to the bathroom.", "John went to the hallway."],
            "question": "Where is Mary?",
            "answer": "bathroom",
        },
        {
            "facts": ["Daniel journeyed to the office.", "Sandra travelled to the garden."],
            "question": "Where is Sandra?",
            "answer": "garden",
        },
    ]
    acc, _ = eval_babi_online(stories, KeywordStore)
    assert acc == 1.0, acc
    acc, _ = eval_babi_online(stories, lambda: VectorStore(dim=32))
    assert acc == 1.0, acc
    acc, _ = eval_babi_online(stories, lambda: CLSStore(do_sleep=False, seed=1))
    assert acc >= 0.5, acc
    corpus = [
        {"id": "answer_chapter_1", "text": "On Monday Maya hosted astronomy night at the museum."},
        {"id": "answer_chapter_2", "text": "On Tuesday Omar ran a parkour workshop at the bridge."},
        {"id": "answer_chapter_3", "text": "On Friday Maya hosted a film festival at the harbor."},
        {"id": "answer_chapter_4", "text": "On Saturday Omar judged a debate at the garden."},
    ]
    queries = [
        {"id": "query_1", "text": "List protagonists at astronomy night."},
        {"id": "query_2", "text": "Where was Maya last seen at the start of the book?"},
    ]
    qrels = {"query_1": {"answer_chapter_1"}, "query_2": {"answer_chapter_1"}}
    acc, early, _, n_all, n_early = eval_epbench(corpus, queries, qrels, KeywordStore, k=1)
    assert acc == 1.0 and early == 1.0, (acc, early, n_all, n_early)
    hay = [
        {
            "units": ["Filler about the weather.", "Mary journeyed to the bathroom.", "More filler about trains."],
            "question": "Where is Mary?",
            "answer": "bathroom",
        }
    ]
    acc, _ = eval_babilong_haystack(hay, KeywordStore)
    assert acc == 1.0, acc
    acc, _ = eval_babilong_haystack(hay, lambda: CLSStore(do_sleep=False, seed=1))
    assert acc == 1.0, acc
    store = CLSStore(do_sleep=False, seed=2)
    store.write("c1", "On Monday Maya hosted astronomy night at the museum.")
    store.write("c2", "On Friday Maya hosted a film festival at the harbor.")
    dated = store.query_ranked("Maya Monday museum astronomy", k=1)
    assert dated and dated[0].doc_id == "c1", [it.doc_id for it in dated]
    last = store.query_ranked("Where was Maya last seen?", k=1)
    assert last and last[0].doc_id == "c2", [it.doc_id for it in last]
    print("self-test ok")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--quick", action="store_true", help="short EpBench book, fewer BABILong samples")
    p.add_argument(
        "--n-hay",
        type=int,
        default=None,
        help="BABILong samples per length (default: all in the file; --quick uses 12)",
    )
    p.add_argument("--legacy", action="store_true", help="also run old bAbI/SQuAD protocols")
    p.add_argument("--self-test", action="store_true")
    p.add_argument("--json", type=Path, default=None)
    args = p.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    t0 = time.perf_counter()
    rows = run(quick=args.quick, legacy=args.legacy, n_hay=args.n_hay)
    _print_table(rows)
    print(f"\nwall {time.perf_counter() - t0:.1f}s")
    payload = [
        {
            "experiment": r.experiment,
            "system": r.system,
            "accuracy": r.accuracy,
            "n": r.n,
            "seconds": r.seconds,
            **r.extra,
        }
        for r in rows
    ]
    out = args.json or (CACHE / "cls_bench_results.json")
    CACHE.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"wrote {out}")
    print(
        """
read:
  EpBench stay-strong     — write 200 chapters, cue early events. Overwrite/FIFO
                            drop them; vector/keyword/CLS should keep the pointer.
  BABILong haystack 0k→8k — same Mary-in-the-office fact, growing PG-19 filler.
                            Recency gates die; a real index should stay flat.
  babilong 0k stay-strong — many stories in one store, quiz the first fifth.
  overwrite / fifo / forget_gate — recency. Right for "where last", wrong for
                                    early episode retrieval.
  keyword / vector        — cortex-only. Strong lexical overlap, collides when
                            the same person recurs (source confusion).
  cls_wake / cls_sleep    — hippocampal index. Sleep should not wipe early keys;
                            it only mixes the cortical gist.
"""
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
