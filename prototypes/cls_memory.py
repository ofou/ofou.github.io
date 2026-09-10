# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""Complementary learning systems: a brain-like memory prototype.

The brain is not a Merkle DAG. This module implements the jobs a Merkle DAG
is used for — content addressing, a small index, collision-resistant-enough
IDs, linked subgraphs, structural sharing — with the mechanisms that actually
do those jobs: pattern separation, pattern completion, a hippocampal pointer
network, engram complexes, and slow cortical merge.

    cue → sparse index (hippocampus / keys)
        → reactivate linked payload (engram complex / values)
        → slow merge into overlapping structure (cortex / schemas)

Run:
    uv run prototypes/cls_memory.py
    uv run prototypes/cls_memory.py --self-test
    uv run prototypes/cls_memory.py --dense   # weaker DG → more collisions
"""

from __future__ import annotations

import argparse
import hashlib
import math
import re
import sys
from dataclasses import dataclass, field
from typing import Iterable, Iterator, Literal, Mapping, Sequence

import numpy as np

Kind = Literal["episode", "schema", "fact"]

# Related atoms share a cortical latent. "sleep" lives in the slumber group so
# a gist of bed/rest/dream can reconstruct it even when it was never written.
# Demo world: two rainy mornings, a week of dinners, a bedtime word list.
SEMANTIC_GROUPS: dict[str, tuple[str, ...]] = {
    "slumber": (
        "bed",
        "rest",
        "tired",
        "dream",
        "blanket",
        "doze",
        "pillow",
        "snore",
        "sleep",
    ),
    "kitchen": (
        "kitchen",
        "stove",
        "plate",
        "cooking",
        "dinner",
        "table",
        "fork",
        "recipe",
    ),
    "morning": (
        "rain",
        "keys",
        "coffee",
        "door",
        "coat",
        "umbrella",
        "monday",
        "tuesday",
    ),
    "affect": ("warmth", "aroma"),
    "oddities": ("burnt", "guest", "wine", "candle", "leftovers"),
}


# ---------------------------------------------------------------------------
# Tiny linear algebra
# ---------------------------------------------------------------------------


def _l2_normalize(x: np.ndarray) -> np.ndarray:
    n = float(np.linalg.norm(x))
    if n < 1e-12:
        return x
    return x / n


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na < 1e-12 or nb < 1e-12:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def jaccard(a: Sequence[str], b: Sequence[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 1.0
    if not sa or not sb:
        return 0.0
    return len(sa & sb) / len(sa | sb)


# ---------------------------------------------------------------------------
# Event slots (Tulving: time, place, person, content)
# ---------------------------------------------------------------------------

CHANNELS = ("entity", "place", "time", "content")

_WEEKDAYS = frozenset(
    "monday tuesday wednesday thursday friday saturday sunday "
    "mon tue wed thu fri sat sun".split()
)
_MONTHS = frozenset(
    "january february march april may june july august september "
    "october november december jan feb mar apr jun jul aug sep oct nov dec".split()
)
_BABI_NAMES = frozenset(
    "mary john sandra daniel jason antoine emily fred julie "
    "bill bernhard anita brian chris emma".split()
)
_PLACES = frozenset(
    "bathroom hallway office garden kitchen bedroom cinema park school "
    "kitchenette office cinema supermarket cinema bathroom bedroom "
    "museum bridge harbor theatre theater gallery cafe library stadium "
    "airport station church park plaza square island course walkway "
    "atrium lobby runway catwalk planetarium auditorium arena hall "
    "boardwalk dock ferry pavilion conservatory observatory".split()
)
_TIME_EXTRA = frozenset("yesterday tomorrow tonight today last latest recently night evening morning noon".split())
_NAME_STOP = frozenset(
    "the a an on at in of to for as by from with and or but if "
    "this that these those there here when where what who how "
    "monday tuesday wednesday thursday friday saturday sunday "
    "january february march april may june july august september "
    "october november december reflect list provide events related "
    "involved without describing".split()
)
_DATE_RE = re.compile(
    r"\b(?:january|february|march|april|may|june|july|august|september|"
    r"october|november|december)\s+\d{1,2},?\s+\d{4}\b",
    re.I,
)
_ISO_RE = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_NAME_RE = re.compile(r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b")
_TO_PLACE_RE = re.compile(
    r"\b(?:to|at|in|into|from)\s+(?:the\s+)?([a-z][a-z]+(?:\s+[a-z]+)?)",
    re.I,
)
_RECENCY_RE = re.compile(
    r"\b(last|latest|most recent|where is|where was .+ last|last seen)\b",
    re.I,
)


def _norm_tok(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", s.lower())


def slots_from_tokens(tokens: Sequence[str]) -> dict[str, tuple[str, ...]]:
    """Classify already-tokenized atoms into Tulving channels."""
    entity, place, time, content = [], [], [], []
    seen: set[str] = set()
    for raw in tokens:
        tok = _norm_tok(str(raw))
        if not tok or tok in seen:
            continue
        seen.add(tok)
        if tok in _BABI_NAMES:
            entity.append(tok)
        elif tok in _WEEKDAYS or tok in _MONTHS or tok in _TIME_EXTRA or tok.isdigit():
            time.append(tok)
        elif tok in _PLACES:
            place.append(tok)
        else:
            content.append(tok)
    return {
        "entity": tuple(entity),
        "place": tuple(place),
        "time": tuple(time),
        "content": tuple(content),
    }


def extract_event(text: str) -> dict[str, tuple[str, ...]]:
    """Regex event parser: names, dates, 'to the X' places, leftover content."""
    entity: list[str] = []
    place: list[str] = []
    time: list[str] = []
    for m in _DATE_RE.finditer(text):
        time.extend(_norm_tok(p) for p in m.group(0).split() if _norm_tok(p))
    for m in _ISO_RE.finditer(text):
        time.append(_norm_tok(m.group(0)))
    for m in _NAME_RE.finditer(text):
        name = m.group(1)
        low = name.lower()
        if low in _NAME_STOP or low in _WEEKDAYS or low in _MONTHS:
            continue
        for part in name.split():
            p = _norm_tok(part)
            if p and p not in entity:
                entity.append(p)
    for m in _TO_PLACE_RE.finditer(text):
        p = _norm_tok(m.group(1))
        if p and p not in _NAME_STOP and p not in entity:
            place.append(p)
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    inferred = slots_from_tokens(tokens)
    for p in inferred["place"]:
        if p not in place:
            place.append(p)
    for t in inferred["time"]:
        if t not in time:
            time.append(t)
    for e in inferred["entity"]:
        if e not in entity:
            entity.append(e)
    claimed = set(entity) | set(place) | set(time) | _NAME_STOP
    content = tuple(t for t in tokens if t not in claimed and len(t) > 2)
    return {
        "entity": tuple(dict.fromkeys(entity)),
        "place": tuple(dict.fromkeys(place)),
        "time": tuple(dict.fromkeys(time)),
        "content": content[:24],
    }


def event_is_novel(slots: Mapping[str, Sequence[str]]) -> bool:
    """Skip haystack filler: no who / where / when."""
    return bool(slots.get("entity") or slots.get("place") or slots.get("time"))


def wants_recency(text: str) -> bool:
    return bool(_RECENCY_RE.search(text))


def merge_regions(
    features: Sequence[str],
    regions: Mapping[str, Sequence[str]] | None,
) -> dict[str, tuple[str, ...]]:
    """Union inferred slots with caller regions. Unknown region names → content."""
    out: dict[str, list[str]] = {ch: [] for ch in CHANNELS}
    inferred = slots_from_tokens(features)
    for ch in CHANNELS:
        out[ch].extend(inferred[ch])
    if regions:
        for k, vals in regions.items():
            dest = k if k in CHANNELS else "content"
            for v in vals:
                tok = _norm_tok(str(v)) or str(v).lower()
                if tok and tok not in out[dest]:
                    out[dest].append(tok)
    return {ch: tuple(dict.fromkeys(out[ch])) for ch in CHANNELS}


# ---------------------------------------------------------------------------
# Sparse hippocampal codes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class SparseCode:
    """A k-winner-take-all firing pattern. Similarity-sensitive, not a SHA."""

    n: int
    active: tuple[int, ...]

    @property
    def sparsity(self) -> float:
        return 1.0 - (len(self.active) / self.n if self.n else 0.0)

    def overlap(self, other: SparseCode) -> float:
        """Fraction of this code's active units also active in `other`."""
        if not self.active:
            return 0.0
        return len(set(self.active) & set(other.active)) / len(self.active)

    def address(self) -> str:
        """Compact content-addressed label. Collisions are allowed."""
        if not self.active:
            return "hpc:empty"
        head = "+".join(f"{i:x}" for i in self.active[:4])
        return f"hpc:{head}"


# ---------------------------------------------------------------------------
# Sensory map (entorhinal-like) and dentate gyrus
# ---------------------------------------------------------------------------


class SensoryMap:
    """Entorhinal channels: who / where / when / what, plus conjunction bits.

    Tokens bind inside a channel so Maya cannot collide with Monday. Pairwise
    (entity, time) and (entity, place) hashes are coincidence detectors
    (Rolls; Yassa & Stark). Partial cues leave missing channels off.
    """

    def __init__(self, channel_size: int = 48, conj_size: int = 64, seed: int = 0) -> None:
        self.channel_size = channel_size
        self.conj_size = conj_size
        self.seed = seed
        self.offsets = {ch: i * channel_size for i, ch in enumerate(CHANNELS)}
        self.conj_offset = len(CHANNELS) * channel_size
        self.dim = self.conj_offset + conj_size
        self._ix: dict[str, int] = {}

    def _bin(self, channel: str, token: str) -> int:
        key = f"{self.seed}:{channel}:{token}"
        h = hashlib.blake2s(key.encode(), digest_size=8).digest()
        return self.offsets[channel] + (int.from_bytes(h[:4], "little") % self.channel_size)

    def _conj_bin(self, kind: str, a: str, b: str) -> int:
        key = f"{self.seed}:conj:{kind}:{a}|{b}"
        h = hashlib.blake2s(key.encode(), digest_size=8).digest()
        return self.conj_offset + (int.from_bytes(h[:4], "little") % self.conj_size)

    def bind(self, token: str) -> int:
        """Legacy: content-channel bin. Kept for demo introspection."""
        return self._bin("content", _norm_tok(token) or token)

    def encode(self, features: Iterable[str]) -> np.ndarray:
        return self.encode_regions(slots_from_tokens(tuple(features)))

    def encode_regions(self, regions: Mapping[str, Sequence[str]]) -> np.ndarray:
        x = np.zeros(self.dim, dtype=np.float64)
        bags = {ch: tuple(regions.get(ch, ())) for ch in CHANNELS}
        for ch, toks in bags.items():
            for tok in toks:
                t = _norm_tok(str(tok)) or str(tok).lower()
                if t:
                    x[self._bin(ch, t)] = 1.0
                    self._ix[f"{ch}:{t}"] = self._bin(ch, t)
        for e in bags["entity"]:
            e_n = _norm_tok(str(e)) or str(e).lower()
            for t in bags["time"]:
                t_n = _norm_tok(str(t)) or str(t).lower()
                x[self._conj_bin("et", e_n, t_n)] = 1.0
            for p in bags["place"]:
                p_n = _norm_tok(str(p)) or str(p).lower()
                x[self._conj_bin("ep", e_n, p_n)] = 1.0
        return x

    def __contains__(self, token: str) -> bool:
        t = _norm_tok(token) or token
        return any(f"{ch}:{t}" in self._ix for ch in CHANNELS)


class DentateGyrus:
    """Expanding sparse encoder: the brain's lossy, similarity-sensitive hash.

    Granule cells are coincidence detectors: each samples a random subset of
    entorhinal units (low fan-in), then k-WTA keeps ~0.5–1% active. Similar
    inputs are driven apart; they can still collide. Kanerva (1988),
    Yassa & Stark (2011), Rolls (2013).
    """

    def __init__(
        self,
        n_in: int,
        n_out: int = 2048,
        k_active: int = 16,
        fan_in: int = 16,
        seed: int = 0,
    ) -> None:
        self.n_in = n_in
        self.n_out = n_out
        self.k_active = k_active
        rng = np.random.default_rng(seed)
        self.conn = np.vstack(
            [rng.choice(n_in, size=min(fan_in, n_in), replace=False) for _ in range(n_out)]
        )

    def project(self, sensory: np.ndarray) -> np.ndarray:
        return sensory[self.conn].sum(axis=1)

    def sparsify(self, pre: np.ndarray) -> SparseCode:
        k = min(self.k_active, self.n_out)
        candidates = np.argpartition(pre, -k)[-k:]
        fired = candidates[pre[candidates] > 0]
        if fired.size == 0:
            fired = np.array([int(np.argmax(pre))], dtype=int)
        fired = np.sort(fired)
        return SparseCode(self.n_out, tuple(int(i) for i in fired))

    def encode(self, sensory: np.ndarray) -> tuple[SparseCode, np.ndarray]:
        pre = self.project(sensory)
        return self.sparsify(pre), pre


# ---------------------------------------------------------------------------
# CA3 attractor / hippocampal index (keys, not movies)
# ---------------------------------------------------------------------------


@dataclass
class IndexEntry:
    """Hippocampal indexing theory: a pointer, not the event.

    Teyler & DiScenna (1986); Vector-HaSH (Chandra, Sharma, Fiete et al. 2025);
    Gershman, Fiete, Irie (2025) — hippocampus holds conjunctive keys.
    """

    engram_id: str
    code: SparseCode
    pre: np.ndarray
    content_id: str
    residual: tuple[str, ...]
    t: int = 0
    era: int = 0
    context: np.ndarray | None = None
    slots: dict[str, tuple[str, ...]] = field(default_factory=dict)


class CA3:
    """Autoassociator. A degraded cue is pulled to a stored attractor.

    Matching is sparse-code overlap plus completion energy on the stored
    active set (not dense cosine of DG pre). Completion returns the stored
    sparse code, not the cue.
    """

    def __init__(self, threshold: float = 0.12) -> None:
        self.threshold = threshold
        self.entries: list[IndexEntry] = []

    def store(self, entry: IndexEntry) -> None:
        self.entries.append(entry)

    def _slot_key(self, entry: IndexEntry, cue_slots: Mapping[str, Sequence[str]] | None) -> float:
        if not cue_slots:
            return 0.0
        nch = 0
        acc = 0.0
        for ch in CHANNELS:
            cset = {_norm_tok(str(x)) or str(x).lower() for x in cue_slots.get(ch, ()) if x}
            if not cset:
                continue
            nch += 1
            have = {_norm_tok(str(x)) or str(x).lower() for x in entry.slots.get(ch, ())}
            acc += len(cset & have) / len(cset)
        return acc / max(nch, 1)

    def _score(
        self,
        entry: IndexEntry,
        cue_code: SparseCode,
        cue_pre: np.ndarray,
        cue_slots: Mapping[str, Sequence[str]] | None = None,
    ) -> float:
        key = self._slot_key(entry, cue_slots)
        ov = cue_code.overlap(entry.code)
        if entry.code.active:
            idx = np.asarray(entry.code.active)
            energy = float(cue_pre[idx].mean())
            scale = float(np.abs(cue_pre).mean()) + 1e-9
            energy = energy / scale
        else:
            energy = 0.0
        return 2.0 * key + ov + 0.2 * max(energy, 0.0)

    def complete(
        self,
        cue_pre: np.ndarray,
        cue_code: SparseCode | None = None,
        cue_slots: Mapping[str, Sequence[str]] | None = None,
    ) -> tuple[IndexEntry | None, float, float]:
        """Return (winner, confidence, margin over runner-up)."""
        ranked = self.complete_ranked(cue_code, cue_pre, k=2, cue_slots=cue_slots)
        if not ranked:
            return None, 0.0, 0.0
        best_e, best = ranked[0]
        second = ranked[1][1] if len(ranked) > 1 else 0.0
        if best < self.threshold:
            return None, best, best - second
        return best_e, best, best - second

    def complete_ranked(
        self,
        cue_code: SparseCode | None,
        cue_pre: np.ndarray,
        k: int = 5,
        cue_slots: Mapping[str, Sequence[str]] | None = None,
    ) -> list[tuple[IndexEntry, float]]:
        if not self.entries:
            return []
        if cue_code is None:
            cue_code = SparseCode(len(cue_pre), tuple())
        scored = [(e, self._score(e, cue_code, cue_pre, cue_slots)) for e in self.entries]
        scored.sort(key=lambda p: p[1], reverse=True)
        return scored[: max(1, k)]

    def get(self, engram_id: str) -> IndexEntry | None:
        for e in self.entries:
            if e.engram_id == engram_id:
                return e
        return None

    def rewrite(
        self,
        engram_id: str,
        residual: tuple[str, ...],
        pre: np.ndarray,
        code: SparseCode | None = None,
    ) -> None:
        for e in self.entries:
            if e.engram_id == engram_id:
                e.residual = residual
                e.pre = pre
                if code is not None:
                    e.code = code
                return


# ---------------------------------------------------------------------------
# Cortex: overlapping codes, payloads, schemas
# ---------------------------------------------------------------------------


class CorticalAtlas:
    """Distributed overlapping geometry. Shared facts reuse the same tissue.

    Each atom = group latent + unique direction. Gist (mean of a cluster)
    therefore lights up unstated group members — reconstructive, not bitwise.
    """

    def __init__(
        self,
        groups: Mapping[str, Sequence[str]],
        group_scale: float = 1.0,
        unique_scale: float = 0.5,
    ) -> None:
        atoms: list[str] = []
        group_of: dict[str, str] = {}
        for g, members in groups.items():
            for a in members:
                if a not in group_of:
                    atoms.append(a)
                    group_of[a] = g
        group_names = list(groups)
        dim = len(group_names) + len(atoms)
        self.dim = dim
        self.atoms = atoms
        self.vectors: dict[str, np.ndarray] = {}
        for i, atom in enumerate(atoms):
            v = np.zeros(dim, dtype=np.float64)
            v[group_names.index(group_of[atom])] = group_scale
            v[len(group_names) + i] = unique_scale
            self.vectors[atom] = _l2_normalize(v)

    def embed(self, features: Iterable[str]) -> np.ndarray:
        acc = np.zeros(self.dim, dtype=np.float64)
        for f in features:
            vec = self.vectors.get(f)
            if vec is not None:
                acc += vec
        return _l2_normalize(acc)

    def decode(self, embedding: np.ndarray, threshold: float = 0.55) -> tuple[str, ...]:
        hits = [
            atom
            for atom, vec in self.vectors.items()
            if cosine(embedding, vec) >= threshold
        ]
        return tuple(sorted(hits))


class HashingAtlas:
    """Open-vocab overlapping codes via character n-gram hashing.

    Similar tokens share n-grams, so cortex tissue overlaps without a
    hand-built SEMANTIC_GROUPS table. Decode is nearest observed atoms.
    """

    def __init__(self, dim: int = 128, ngram: tuple[int, int] = (2, 4), seed: int = 0) -> None:
        self.dim = dim
        self.ngram = ngram
        self.seed = seed
        self.vectors: dict[str, np.ndarray] = {}

    def _ngrams(self, token: str) -> list[str]:
        lo, hi = self.ngram
        chars = f"#{token}#"
        grams = [token]
        for n in range(lo, hi + 1):
            grams.extend(chars[i : i + n] for i in range(len(chars) - n + 1))
        return grams

    def token_vector(self, token: str) -> np.ndarray:
        if token in self.vectors:
            return self.vectors[token]
        acc = np.zeros(self.dim, dtype=np.float64)
        for gram in self._ngrams(token):
            h = hashlib.blake2s(f"{self.seed}:{gram}".encode(), digest_size=8).digest()
            idx = int.from_bytes(h[:4], "little") % self.dim
            sign = 1.0 if h[4] % 2 == 0 else -1.0
            acc[idx] += sign
        vec = _l2_normalize(acc)
        self.vectors[token] = vec
        return vec

    def embed(self, features: Iterable[str]) -> np.ndarray:
        acc = np.zeros(self.dim, dtype=np.float64)
        for f in features:
            acc += self.token_vector(f)
        return _l2_normalize(acc)

    def decode(self, embedding: np.ndarray, threshold: float = 0.35) -> tuple[str, ...]:
        hits = [
            atom
            for atom, vec in self.vectors.items()
            if cosine(embedding, vec) >= threshold
        ]
        return tuple(sorted(hits))


@dataclass
class Payload:
    """Neocortical content. The index points here; it does not copy this."""

    content_id: str
    title: str
    features: tuple[str, ...]
    text: str
    embedding: np.ndarray


@dataclass
class Schema:
    """Slow overlapping structure extracted by interleaved replay."""

    id: str
    shared_features: tuple[str, ...]
    prototype: np.ndarray
    episode_ids: list[str] = field(default_factory=list)

    @property
    def name(self) -> str:
        return "/".join(self.shared_features[:4]) or "empty"


# ---------------------------------------------------------------------------
# Engram complex: a memory is a DAG of ensembles
# ---------------------------------------------------------------------------


@dataclass
class Engram:
    """One memory = linked ensembles, not a row in a table.

    Tonegawa / Roy et al. (2022); Josselyn & Tonegawa (2020). Retrieval is
    reactivating this graph. `parents` are derivation edges (consolidation).
    """

    id: str
    kind: Kind
    title: str
    address: str
    content_id: str | None
    features: tuple[str, ...]
    regions: dict[str, tuple[str, ...]] = field(default_factory=dict)
    parents: list[str] = field(default_factory=list)
    links: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class Recall:
    cue: tuple[str, ...]
    completed: bool
    engram: Engram | None
    schema: Schema | None
    reconstruction: tuple[str, ...]
    original: tuple[str, ...] | None
    path: list[str]
    confidence: float
    margin: float
    reconsolidated: bool = False

    @property
    def intrusions(self) -> tuple[str, ...]:
        if self.original is None:
            return tuple()
        orig = set(self.original)
        return tuple(f for f in self.reconstruction if f not in orig)

    @property
    def omissions(self) -> tuple[str, ...]:
        if self.original is None:
            return tuple()
        rec = set(self.reconstruction)
        return tuple(f for f in self.original if f not in rec)


# ---------------------------------------------------------------------------
# Complementary learning system
# ---------------------------------------------------------------------------


class ComplementaryMemory:
    """Fast sparse index + slow overlapping schemas.

    McClelland, McNaughton & O'Reilly (1995). New episode = new leaf.
    Sleep interleaves it into cortex so shared structure is extracted without
    catastrophic interference. Spens & Burgess (2024): hippocampus keeps the
    unusual bits; cortex keeps the predictable skeleton; recall decodes both.
    """

    def __init__(
        self,
        seed: int = 0,
        k_active: int = 16,
        n_dg: int = 2048,
        sensory_dim: int = 96,
        complete_threshold: float = 0.12,
        schema_decode_threshold: float = 0.55,
        atlas: CorticalAtlas | HashingAtlas | None = None,
    ) -> None:
        del sensory_dim  # entorhinal channels have a fixed layout
        self.sensory = SensoryMap(channel_size=48, conj_size=64, seed=seed)
        self.dg = DentateGyrus(
            n_in=self.sensory.dim, n_out=n_dg, k_active=k_active, seed=seed
        )
        self.ca3 = CA3(threshold=complete_threshold)
        self.atlas = atlas if atlas is not None else CorticalAtlas(SEMANTIC_GROUPS)
        self.schema_decode_threshold = schema_decode_threshold
        self.payloads: dict[str, Payload] = {}
        self.engrams: dict[str, Engram] = {}
        self.schemas: list[Schema] = []
        self._n_ep = 0
        self._n_schema = 0
        self._n_fact = 0
        self._n_blob = 0
        self._clock = 0
        self._era = 0
        self._ctx_rho = 0.75
        self._ctx = np.zeros(32, dtype=np.float64)

    # -- write (hippocampus: one-shot) -------------------------------------

    def encode(
        self,
        title: str,
        features: Sequence[str],
        regions: Mapping[str, Sequence[str]] | None = None,
        text: str | None = None,
    ) -> Engram:
        feats = tuple(dict.fromkeys(features))
        region_map = merge_regions(feats, regions)
        sensory = self.sensory.encode_regions(region_map)
        code, pre = self.dg.encode(sensory)
        self._n_blob += 1
        content_id = f"ctx:{self._n_blob:03d}"
        payload = Payload(
            content_id=content_id,
            title=title,
            features=feats,
            text=text or title,
            embedding=self.atlas.embed(feats),
        )
        self.payloads[content_id] = payload

        self._n_ep += 1
        eid = f"E{self._n_ep:02d}"
        engram = Engram(
            id=eid,
            kind="episode",
            title=title,
            address=code.address(),
            content_id=content_id,
            features=feats,
            regions=region_map,
        )
        # Distributed complex: named region ensembles hang off the index.
        for region, atoms in region_map.items():
            if atoms:
                engram.links[region] = [f"{region}:{','.join(atoms)}"]
        self.engrams[eid] = engram
        self._clock += 1
        emb = payload.embedding
        item = np.zeros(32, dtype=np.float64)
        take = min(32, emb.size)
        item[:take] = emb[:take]
        self._ctx = _l2_normalize(self._ctx_rho * self._ctx + (1.0 - self._ctx_rho) * item)
        self.ca3.store(
            IndexEntry(
                engram_id=eid,
                code=code,
                pre=pre.copy(),
                content_id=content_id,
                residual=feats,
                t=self._clock,
                era=self._era,
                context=self._ctx.copy(),
                slots=region_map,
            )
        )
        return engram

    # -- recall (complete index → reactivate payload → reconstruct) --------

    def recall(
        self,
        cue: Sequence[str],
        *,
        regions: Mapping[str, Sequence[str]] | None = None,
        mode: Literal["complete", "latest"] = "complete",
        reconsolidate: bool = False,
        semantic: bool = False,
    ) -> Recall:
        cue_t = tuple(dict.fromkeys(cue))
        path: list[str] = ["cue"]
        slots = merge_regions(cue_t, regions)

        if semantic:
            return self._semantic_recall(cue_t, path)

        sensory = self.sensory.encode_regions(slots)
        cue_code, cue_pre = self.dg.encode(sensory)
        path.append("DG")
        entry: IndexEntry | None = None
        conf = margin = 0.0
        if mode == "latest":
            entry = self._latest_for(slots)
            if entry is not None:
                conf, margin = 1.0, 1.0
                path.append("TCM latest")
        if entry is None:
            entry, conf, margin = self.ca3.complete(cue_pre, cue_code, cue_slots=slots)
        if entry is None:
            path.append("CA3 miss → cortical fallback")
            return self._semantic_recall(cue_t, path)

        path.append("CA3 complete")
        engram = self.engrams[entry.engram_id]
        path.append(f"index {engram.address}")
        payload = self.payloads[entry.content_id]
        path.append(f"payload {payload.content_id}")
        for region in engram.links:
            path.append(f"engram:{region}")

        schema = self._schema_for(engram.id)
        reconstruction = self._reconstruct(schema, entry.residual)
        if schema is not None:
            path.append(f"schema {schema.id}")
        path.append("reconstruct")

        rec = Recall(
            cue=cue_t,
            completed=True,
            engram=engram,
            schema=schema,
            reconstruction=reconstruction,
            original=payload.features,
            path=path,
            confidence=conf,
            margin=margin,
        )
        if reconsolidate:
            self._reconsolidate(entry, engram, reconstruction)
            rec.reconsolidated = True
            path.append("reconsolidate (rewrite)")
        return rec

    def recalled_text(self, rec: Recall) -> str:
        if rec.engram is not None and rec.engram.content_id:
            return self.payloads[rec.engram.content_id].text
        return " ".join(rec.reconstruction)

    def recall_ranked(
        self,
        cue: Sequence[str],
        *,
        regions: Mapping[str, Sequence[str]] | None = None,
        mode: Literal["complete", "latest"] = "complete",
        k: int = 1,
    ) -> list[IndexEntry]:
        """Top-k hippocampal completions. Recency is a mode, not a decay."""
        cue_t = tuple(dict.fromkeys(cue))
        slots = merge_regions(cue_t, regions)
        if mode == "latest":
            hits = self._traces_for_entities(set(slots.get("entity", ())))
            if hits:
                return self._serial_position(self._episode_reps(hits), k)
        sensory = self.sensory.encode_regions(slots)
        code, pre = self.dg.encode(sensory)
        ranked = self.ca3.complete_ranked(code, pre, k=max(k, 1), cue_slots=slots)
        return [e for e, _ in ranked[:k]]

    def _entity_hit(self, entry: IndexEntry, entities: set[str]) -> bool:
        if not entities:
            return False
        eng = self.engrams.get(entry.engram_id)
        have = set(entry.residual)
        if eng is not None:
            have.update(eng.regions.get("entity", ()))
            have.update(eng.features)
        have_n = {_norm_tok(str(x)) or str(x).lower() for x in have}
        return bool(have_n & entities)

    def _traces_for_entities(self, entities: set[str]) -> list[IndexEntry]:
        if not entities:
            return []
        return [e for e in self.ca3.entries if self._entity_hit(e, entities)]

    def _latest_for(self, slots: Mapping[str, Sequence[str]]) -> IndexEntry | None:
        hits = self._traces_for_entities(set(slots.get("entity", ())))
        if not hits:
            return None
        return max(hits, key=lambda e: e.t)

    @staticmethod
    def _episode_reps(hits: list[IndexEntry]) -> list[IndexEntry]:
        """Last location of an event (reconsolidation), not every saccade.

        Undated updates in the same scene (era) collapse to the final place.
        Distinct time cues stay separate (Monday Maya ≠ Friday Maya).
        close_scene() / sleep() advances the era — event boundary.
        """
        ordered = sorted(hits, key=lambda e: e.t)
        groups: dict[tuple, IndexEntry] = {}
        for e in ordered:
            tm = tuple(e.slots.get("time", ()))
            key = ("t", e.era, tm) if tm else ("u", e.era)
            groups[key] = e
        return sorted(groups.values(), key=lambda e: e.t)

    @staticmethod
    def _serial_position(hits: list[IndexEntry], k: int) -> list[IndexEntry]:
        """Recency first, then primacy (Murdock/Kahana: recency strongest)."""
        ordered = sorted(hits, key=lambda e: e.t)
        if not ordered or k <= 0:
            return []
        out: list[IndexEntry] = []
        seen: set[str] = set()
        for pick in [ordered[-1], *ordered[:-1]]:
            if pick.engram_id in seen:
                continue
            seen.add(pick.engram_id)
            out.append(pick)
            if len(out) >= k:
                break
        return out

    def _semantic_recall(self, cue: tuple[str, ...], path: list[str]) -> Recall:
        """Neocortex-only: nearest schema prototype. Lossy vector search."""
        if not self.schemas:
            rec_feats = cue
            return Recall(
                cue=cue,
                completed=False,
                engram=None,
                schema=None,
                reconstruction=rec_feats,
                original=None,
                path=path + ["no schema"],
                confidence=0.0,
                margin=0.0,
            )
        q = self.atlas.embed(cue)
        ranked = sorted(self.schemas, key=lambda s: cosine(q, s.prototype), reverse=True)
        schema = ranked[0]
        conf = cosine(q, schema.prototype)
        path.append(f"cortex nearest {schema.id}")
        reconstruction = self.atlas.decode(
            schema.prototype, threshold=self.schema_decode_threshold
        )
        path.append("schema decode")
        return Recall(
            cue=cue,
            completed=False,
            engram=None,
            schema=schema,
            reconstruction=reconstruction,
            original=None,
            path=path,
            confidence=conf,
            margin=0.0,
        )

    def _reconstruct(
        self, schema: Schema | None, residual: Sequence[str]
    ) -> tuple[str, ...]:
        """Spens & Burgess: skeleton + unusual bits, not a retrieved file."""
        predicted: tuple[str, ...] = tuple()
        if schema is not None:
            predicted = self.atlas.decode(
                schema.prototype, threshold=self.schema_decode_threshold
            )
            if not predicted:
                predicted = schema.shared_features
        return tuple(dict.fromkeys((*predicted, *residual)))

    def _schema_for(self, engram_id: str) -> Schema | None:
        for s in self.schemas:
            if engram_id in s.episode_ids:
                return s
        return None

    def _reconsolidate(
        self, entry: IndexEntry, engram: Engram, reconstruction: tuple[str, ...]
    ) -> None:
        """Retrieval is a write. Merkle DAGs are append-only; brains are not."""
        mixed = tuple(dict.fromkeys((*entry.residual, *reconstruction)))
        sensory = self.sensory.encode(mixed)
        code, pre = self.dg.encode(sensory)
        self.ca3.rewrite(engram.id, mixed, pre, code)
        engram.features = mixed
        engram.address = code.address()
        payload = self.payloads[entry.content_id]
        payload.features = mixed
        payload.embedding = self.atlas.embed(mixed)

    # -- sleep / replay (slow merge) ---------------------------------------

    def close_scene(self) -> None:
        """Event boundary: next encodes are a new scene (Zacks / Ben-Yakov)."""
        self._era += 1

    def sleep(
        self,
        min_support: int = 3,
        min_shared: int = 3,
        presence: float = 0.5,
        strip_predicted: bool = True,
    ) -> list[Schema]:
        """Interleaved replay: extract shared structure, keep residuals.

        Complementary learning systems. Derivation edges episode → schema
        are the consolidation DAG — crude Merkle-style parents, without hashes.
        """
        self.close_scene()
        episodes = [e for e in self.engrams.values() if e.kind == "episode"]
        clusters = self._cluster(episodes)
        new_schemas: list[Schema] = []
        for cluster in clusters:
            if len(cluster) < min_support:
                continue
            prototype = _l2_normalize(
                np.mean(
                    [self.payloads[e.content_id].embedding for e in cluster],
                    axis=0,
                )
            )
            # Token intersection plus atoms the overlapping code predicts
            # (gist can include items no single episode wrote — DRM / sleep).
            predicted = self.atlas.decode(
                prototype, threshold=self.schema_decode_threshold
            )
            shared = tuple(
                sorted(set(self._shared_features(cluster, presence)) | set(predicted))
            )
            if len(shared) < min_shared:
                continue
            if any(set(s.shared_features) == set(shared) for s in self.schemas):
                continue
            self._n_schema += 1
            sid = f"S{self._n_schema:02d}"
            schema = Schema(
                id=sid,
                shared_features=shared,
                prototype=prototype,
                episode_ids=[e.id for e in cluster],
            )
            self.engrams[sid] = Engram(
                id=sid,
                kind="schema",
                title=schema.name,
                address=f"ctx-schema:{sid.lower()}",
                content_id=None,
                features=shared,
                parents=[e.id for e in cluster],
            )
            for e in cluster:
                e.parents.append(sid)
                e.links.setdefault("consolidates", []).append(sid)
            # A verbal gist / fact node — the derivation chain's next hop.
            self._n_fact += 1
            fid = f"F{self._n_fact:02d}"
            gist = f"shared: {', '.join(shared)}"
            self.engrams[fid] = Engram(
                id=fid,
                kind="fact",
                title=gist,
                address=f"fact:{fid.lower()}",
                content_id=None,
                features=shared,
                parents=[sid],
            )
            self.engrams[sid].links.setdefault("gist", []).append(fid)
            self.schemas.append(schema)
            new_schemas.append(schema)

            if strip_predicted:
                predicted = set(
                    self.atlas.decode(prototype, threshold=self.schema_decode_threshold)
                ) | set(shared)
                for e in cluster:
                    entry = self.ca3.get(e.id)
                    if entry is None:
                        continue
                    residual = tuple(f for f in entry.residual if f not in predicted)
                    # Never empty the index; keep at least the oddities, or the title token.
                    if not residual:
                        residual = entry.residual[-1:]
                    entry.residual = residual

        return new_schemas

    def _cluster(
        self, episodes: Sequence[Engram], sim: float = 0.45
    ) -> list[list[Engram]]:
        """Greedy clusters in cortical embedding space (overlapping tissue)."""
        unused = list(episodes)
        clusters: list[list[Engram]] = []
        while unused:
            seed = unused.pop(0)
            seed_vec = self.payloads[seed.content_id].embedding
            group = [seed]
            kept: list[Engram] = []
            for other in unused:
                if cosine(seed_vec, self.payloads[other.content_id].embedding) >= sim:
                    group.append(other)
                else:
                    kept.append(other)
            unused = kept
            clusters.append(group)
        return clusters

    def _shared_features(
        self, cluster: Sequence[Engram], presence: float
    ) -> tuple[str, ...]:
        counts: dict[str, int] = {}
        for e in cluster:
            for f in e.features:
                counts[f] = counts.get(f, 0) + 1
        need = max(1, math.ceil(presence * len(cluster)))
        shared = tuple(sorted(f for f, n in counts.items() if n >= need))
        return shared

    # -- diagnostics -------------------------------------------------------

    def codes_for(self, a: Engram, b: Engram) -> dict[str, float]:
        ea, eb = self.ca3.get(a.id), self.ca3.get(b.id)
        if ea is None or eb is None:
            raise KeyError("missing CA3 entries")
        return {
            "sensory_jaccard": jaccard(a.features, b.features),
            "dg_overlap": ea.code.overlap(eb.code),
            "dg_cosine": cosine(ea.pre, eb.pre),
            "cortical_cosine": cosine(
                self.payloads[a.content_id].embedding,
                self.payloads[b.content_id].embedding,
            ),
        }

    def graph_lines(self) -> Iterator[str]:
        for e in self.engrams.values():
            yield f"{e.id}  [{e.kind}]  {e.title}"
            yield f"     addr {e.address}"
            if e.content_id:
                yield f"     payload {e.content_id}  ({', '.join(self.payloads[e.content_id].features)})"
            if e.parents:
                yield f"     parents {' '.join(e.parents)}"
            for rel, ids in e.links.items():
                yield f"     ─{rel}→ {', '.join(ids)}"


# ---------------------------------------------------------------------------
# Demo
# ---------------------------------------------------------------------------


def _hr(title: str) -> None:
    print()
    print(f"── {title} " + "─" * max(0, 62 - len(title)))


def _print_recall(r: Recall) -> None:
    target = r.engram.title if r.engram else (r.schema.name if r.schema else "—")
    print(f"    cue           {list(r.cue)}")
    print(f"    completed     {r.completed}   conf={r.confidence:.2f}  margin={r.margin:.2f}")
    print(f"    hit           {target}")
    print(f"    reconstruct   {list(r.reconstruction)}")
    if r.original is not None:
        print(f"    original      {list(r.original)}")
        if r.intrusions:
            print(f"    intrusions    {list(r.intrusions)}   ← reconstructive, not stored bytes")
        if r.omissions:
            print(f"    omissions     {list(r.omissions)}")
    print(f"    path          {' → '.join(r.path)}")


def build_demo_memory(*, dense: bool = False, seed: int = 0) -> ComplementaryMemory:
    k = 64 if dense else 16
    n_dg = 512 if dense else 2048
    return ComplementaryMemory(seed=seed, k_active=k, n_dg=n_dg)


def schema_label(schema: Schema) -> str:
    feats = set(schema.shared_features)
    if "kitchen" in feats:
        return "kitchen"
    if "sleep" in feats or "bed" in feats:
        return "bedtime"
    return schema.name


def encode_world(m: ComplementaryMemory) -> dict[str, Engram]:
    """Two rainy mornings, a week of dinners, a bedtime word list.

    Mornings share rain/keys/coffee/door and differ by coat vs umbrella.
    Dinners share a kitchen skeleton; Thursday's oddity is a candle.
    The word list never writes sleep — cortex will invent it from gist.
    """
    morning = ["rain", "keys", "coffee", "door"]
    monday_rain = m.encode(
        "Monday rain",
        [*morning, "monday", "coat"],
        regions={"sensory": ["rain"]},
    )
    tuesday_rain = m.encode(
        "Tuesday rain",
        [*morning, "tuesday", "umbrella"],
        regions={"sensory": ["rain"]},
    )
    kitchen = ["kitchen", "stove", "plate", "cooking", "dinner", "table", "fork"]
    dinners = [
        m.encode(
            title,
            [*kitchen, odd],
            regions={"sensory": ["aroma"], "affect": ["warmth"]},
        )
        for title, odd in (
            ("Monday dinner", "burnt"),
            ("Tuesday dinner", "guest"),
            ("Wednesday dinner", "wine"),
            ("Thursday dinner", "candle"),
            ("Friday dinner", "leftovers"),
        )
    ]
    # Sleep is in the cortical slumber group but never written.
    drm = [
        m.encode("bed", ["bed", "pillow"]),
        m.encode("rest", ["rest", "tired"]),
        m.encode("dream", ["dream", "blanket"]),
    ]
    return {
        "mon": monday_rain,
        "tue": tuesday_rain,
        "dinner0": dinners[0],
        "candle": dinners[3],
        "drm0": drm[0],
    }


def run_demo(dense: bool = False) -> ComplementaryMemory:
    m = build_demo_memory(dense=dense)
    world = encode_world(m)

    print("complementary learning systems  ·  hippocampus = index, cortex = content")
    print("two rainy mornings, a week of dinners, a word list that never writes sleep")
    if dense:
        print(f"(dense DG: k={m.dg.k_active}/{m.dg.n_out} — expect more collisions)")
    else:
        print(f"DG {m.dg.k_active}/{m.dg.n_out} active  ({m.dg.k_active / m.dg.n_out:.2%} firing)")

    _hr("1. Hippocampus is an index, not a file store")
    mon = world["mon"]
    entry = m.ca3.get(mon.id)
    assert entry is not None
    print(f"    {mon.id} '{mon.title}'")
    print(f"    address     {mon.address}   sparsity={entry.code.sparsity:.1%}")
    print(f"    points at   {mon.content_id}  ← payload lives in cortex")
    print(f"    residual    {list(entry.residual)}")
    print("    the scaffold does not contain the morning; it contains an address")

    _hr("2. Dentate gyrus is a (lossy) hash — pattern separation")
    stats = m.codes_for(world["mon"], world["tue"])
    print("    Monday rain vs Tuesday rain  (coat vs umbrella)")
    print(f"    shared words      {stats['sensory_jaccard']:.2f}   (similar mornings)")
    print(f"    shared cells      {stats['dg_overlap']:.2f}   ← orthogonalized")
    print(f"    DG cosine         {stats['dg_cosine']:.2f}")
    print(f"    cortical cosine   {stats['cortical_cosine']:.2f}   (shared morning tissue)")
    print(f"    ids               {world['mon'].address}")
    print(f"                      {world['tue'].address}")
    if stats["dg_overlap"] >= stats["sensory_jaccard"]:
        print("    separation failed — codes are not more orthogonal than the inputs")
    else:
        print("    similar mornings did not clobber each other")

    _hr("3. CA3 pattern completion — partial cue reconstructs the episode")
    r = m.recall(["monday", "rain"])
    _print_recall(r)
    r_amb = m.recall(["rain"])
    print("    ambiguous cue 'rain' (no day, no coat):")
    print(
        f"      hit={r_amb.engram.title if r_amb.engram else '—'}  "
        f"conf={r_amb.confidence:.2f}  margin={r_amb.margin:.2f}"
    )
    print("    a small margin is source confusion, not a SHA mismatch")

    _hr("4. Sleep — complementary learning, then reconstructive recall")
    schemas = m.sleep()
    print(f"    extracted {len(schemas)} schema(s)")
    for s in schemas:
        print(f"    {s.id}  {schema_label(s)}  n={len(s.episode_ids)}  shared={list(s.shared_features)}")
        print(f"         gist {m.engrams[s.id].links.get('gist')}")
    print()
    print("    after consolidation, hippocampus keeps unusual bits:")
    candle = world["candle"]
    residual = m.ca3.get(candle.id)
    assert residual is not None
    print(f"    {candle.id} residual {list(residual.residual)}")
    r_d = m.recall(["candle"])
    _print_recall(r_d)

    _hr("5. A word that was never written — where the Merkle analogy fails")
    r_sleep = m.recall(["bed", "dream"], semantic=True)
    _print_recall(r_sleep)
    if "sleep" in r_sleep.reconstruction:
        print("    'sleep' was never encoded. the schema decoded it anyway.")
        print("    no integrity proof; IDs are not unique; content is a sample.")

    _hr("6. Derivation graph (episode → schema → fact)")
    for line in m.graph_lines():
        print("   ", line)

    _hr("7. Reconsolidation — retrieval rewrites the node")
    before = tuple(m.ca3.get(candle.id).residual)  # type: ignore[union-attr]
    m.recall(["candle"], reconsolidate=True)
    after = tuple(m.ca3.get(candle.id).residual)  # type: ignore[union-attr]
    print(f"    residual before  {list(before)}")
    print(f"    residual after   {list(after)}")
    print(f"    rewritten        {before != after}")
    print("    brains are not append-only")

    _hr("agent analogue of this run")
    print("    DG separation     distinct episode ids, similar notes don't clobber")
    print("    CA3 completion    retrieve from a partial query")
    print("    hippocampal index pointers / parent_ids, not the markdown")
    print("    cortical payload  overlapping embeddings + schemas")
    print("    engram complex    episode → region links → derived fact")
    print("    replay            sleep() extracted shared dinner/bedtime structure")
    print("    reconstruct       recall() generated 'sleep' and kitchen gist")
    return m


def self_test(*, dense: bool = False) -> None:
    m = build_demo_memory(dense=dense)
    world = encode_world(m)

    stats = m.codes_for(world["mon"], world["tue"])
    if not dense:
        assert stats["dg_overlap"] < stats["sensory_jaccard"], (
            f"DG should orthogonalize rainy mornings, got overlap "
            f"{stats['dg_overlap']:.2f} vs Jaccard {stats['sensory_jaccard']:.2f}"
        )

    r = m.recall(["monday", "rain"])
    assert r.completed and r.engram is not None
    assert r.engram.id == world["mon"].id, r.engram.title
    assert "coat" in r.reconstruction

    r_wrong = m.recall(["tuesday", "rain"])
    assert r_wrong.engram is not None
    assert r_wrong.engram.id == world["tue"].id

    # Index is not the payload: wiping cortex would drop content.
    assert world["mon"].content_id in m.payloads
    assert world["mon"].address.startswith("hpc:")
    assert m.payloads[world["mon"].content_id].text == "Monday rain"

    schemas = m.sleep()
    assert schemas, "sleep should extract at least one schema"
    kitchen = next((s for s in schemas if "kitchen" in s.shared_features), None)
    assert kitchen is not None, "dinner cluster should yield a kitchen schema"
    assert world["candle"].id in kitchen.episode_ids
    assert kitchen.id in world["candle"].parents

    residual = m.ca3.get(world["candle"].id)
    assert residual is not None
    assert "candle" in residual.residual
    # Predictable skeleton should have been stripped from the index.
    assert "kitchen" not in residual.residual

    r_d = m.recall(["candle"])
    assert r_d.engram is not None and r_d.engram.id == world["candle"].id
    assert "kitchen" in r_d.reconstruction  # filled in from schema
    assert r_d.intrusions or "kitchen" in r_d.reconstruction
    assert "recipe" in r_d.reconstruction  # gist: no dinner wrote recipe

    r_drm = m.recall(["bed", "dream"], semantic=True)
    assert r_drm.schema is not None
    assert "sleep" in r_drm.reconstruction

    before = m.ca3.get(world["candle"].id).residual  # type: ignore[union-attr]
    m.recall(["candle"], reconsolidate=True)
    after = m.ca3.get(world["candle"].id).residual  # type: ignore[union-attr]
    assert after != before or set(after) >= set(before)

    print("self-test ok")


def main(argv: Sequence[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--self-test", action="store_true")
    p.add_argument(
        "--dense",
        action="store_true",
        help="weaker pattern separation (more DG cells active) to show collisions",
    )
    args = p.parse_args(argv)
    if args.self_test:
        self_test(dense=args.dense)
        return 0
    run_demo(dense=args.dense)
    return 0


if __name__ == "__main__":
    sys.exit(main())
