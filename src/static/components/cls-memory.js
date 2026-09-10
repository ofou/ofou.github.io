/* cls-memory — complementary learning systems as a lab.
   Port of prototypes/cls_memory.py. Demo world: two rainy mornings, a week
   of dinners, a bedtime list that never writes sleep. Hippocampus is an
   index; cortex is content; recall is reconstruction, not a file get.
   Raise k-active to match Python --dense (weaker separation, more collisions).
   Declare as <div data-fig="cls-memory">. */
(function () {
  function mulberry32(a) {
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function uniq(seq) {
    const out = [],
      seen = new Set();
    for (const x of seq) {
      if (!seen.has(x)) {
        seen.add(x);
        out.push(x);
      }
    }
    return out;
  }
  function l2Normalize(x) {
    let n = 0;
    for (let i = 0; i < x.length; i++) n += x[i] * x[i];
    n = Math.sqrt(n);
    if (n < 1e-12) return x.slice ? x.slice() : Array.from(x);
    const o = [];
    for (let i = 0; i < x.length; i++) o.push(x[i] / n);
    return o;
  }
  function cosine(a, b) {
    let d = 0,
      na = 0,
      nb = 0;
    for (let i = 0; i < a.length; i++) {
      d += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    na = Math.sqrt(na);
    nb = Math.sqrt(nb);
    if (na < 1e-12 || nb < 1e-12) return 0;
    return d / (na * nb);
  }
  function jaccard(a, b) {
    const sa = new Set(a),
      sb = new Set(b);
    if (!sa.size && !sb.size) return 1;
    if (!sa.size || !sb.size) return 0;
    let inter = 0;
    for (const x of sa) if (sb.has(x)) inter++;
    return inter / (sa.size + sb.size - inter);
  }
  function hexRgba(hex, a) {
    hex = (hex || "#000").trim();
    if (hex[0] === "#") hex = hex.slice(1);
    if (hex.length === 3)
      hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    const n = parseInt(hex, 16);
    if (Number.isNaN(n)) return "rgba(0,0,0," + a + ")";
    return (
      "rgba(" +
      ((n >> 16) & 255) +
      "," +
      ((n >> 8) & 255) +
      "," +
      (n & 255) +
      "," +
      a +
      ")"
    );
  }

  const SEMANTIC_GROUPS = {
    slumber: [
      "bed",
      "rest",
      "tired",
      "dream",
      "blanket",
      "doze",
      "pillow",
      "snore",
      "sleep",
    ],
    kitchen: [
      "kitchen",
      "stove",
      "plate",
      "cooking",
      "dinner",
      "table",
      "fork",
      "recipe",
    ],
    morning: [
      "rain",
      "keys",
      "coffee",
      "door",
      "coat",
      "umbrella",
      "monday",
      "tuesday",
    ],
    affect: ["warmth", "aroma"],
    oddities: ["burnt", "guest", "wine", "candle", "leftovers"],
  };

  class SensoryMap {
    constructor(dim) {
      this.dim = dim;
      this._ix = new Map();
    }
    bind(token) {
      if (!this._ix.has(token)) this._ix.set(token, this._ix.size % this.dim);
      return this._ix.get(token);
    }
    encode(features) {
      const x = new Float64Array(this.dim);
      for (const tok of features) x[this.bind(tok)] = 1;
      return x;
    }
  }

  class SparseCode {
    constructor(n, active) {
      this.n = n;
      this.active = active;
    }
    get sparsity() {
      return 1 - (this.n ? this.active.length / this.n : 0);
    }
    overlap(other) {
      if (!this.active.length) return 0;
      const b = new Set(other.active);
      let n = 0;
      for (const i of this.active) if (b.has(i)) n++;
      return n / this.active.length;
    }
    address() {
      if (!this.active.length) return "hpc:empty";
      return (
        "hpc:" +
        this.active
          .slice(0, 4)
          .map((i) => i.toString(16))
          .join("+")
      );
    }
  }

  class DentateGyrus {
    constructor(nIn, nOut, kActive, fanIn, seed) {
      this.nIn = nIn;
      this.nOut = nOut;
      this.kActive = kActive;
      const rng = mulberry32(seed);
      this.conn = [];
      for (let i = 0; i < nOut; i++) {
        const idx = [],
          used = new Set();
        const n = Math.min(fanIn, nIn);
        while (idx.length < n) {
          const j = (rng() * nIn) | 0;
          if (!used.has(j)) {
            used.add(j);
            idx.push(j);
          }
        }
        this.conn.push(idx);
      }
    }
    project(sensory) {
      const pre = new Float64Array(this.nOut);
      for (let i = 0; i < this.nOut; i++) {
        let s = 0;
        const c = this.conn[i];
        for (let j = 0; j < c.length; j++) s += sensory[c[j]];
        pre[i] = s;
      }
      return pre;
    }
    sparsify(pre) {
      const k = Math.min(this.kActive, this.nOut);
      const idx = [];
      for (let i = 0; i < pre.length; i++) idx.push(i);
      idx.sort((a, b) => pre[b] - pre[a] || a - b);
      let fired = idx.slice(0, k).filter((i) => pre[i] > 0);
      if (!fired.length) {
        let best = 0;
        for (let i = 1; i < pre.length; i++) if (pre[i] > pre[best]) best = i;
        fired = [best];
      }
      fired.sort((a, b) => a - b);
      return new SparseCode(this.nOut, fired);
    }
    encode(sensory) {
      const pre = this.project(sensory);
      return [this.sparsify(pre), pre];
    }
  }

  class CA3 {
    constructor(threshold) {
      this.threshold = threshold;
      this.entries = [];
    }
    store(entry) {
      this.entries.push(entry);
    }
    complete(cuePre) {
      if (!this.entries.length) return { entry: null, conf: 0, margin: 0 };
      const scores = this.entries.map((e) => cosine(cuePre, e.pre));
      const ranked = scores
        .map((_, i) => i)
        .sort((a, b) => scores[b] - scores[a]);
      const best = scores[ranked[0]];
      const second = ranked.length > 1 ? scores[ranked[1]] : 0;
      if (best < this.threshold)
        return { entry: null, conf: best, margin: best - second };
      return {
        entry: this.entries[ranked[0]],
        conf: best,
        margin: best - second,
      };
    }
    get(id) {
      return this.entries.find((e) => e.engramId === id) || null;
    }
    rewrite(engramId, residual, pre, code) {
      const e = this.get(engramId);
      if (!e) return;
      e.residual = residual;
      e.pre = pre;
      if (code) e.code = code;
    }
  }

  class CorticalAtlas {
    constructor(groups, groupScale, uniqueScale) {
      if (groupScale == null) groupScale = 1;
      if (uniqueScale == null) uniqueScale = 0.5;
      const atoms = [];
      const groupOf = new Map();
      for (const [g, members] of Object.entries(groups)) {
        for (const a of members) {
          if (!groupOf.has(a)) {
            atoms.push(a);
            groupOf.set(a, g);
          }
        }
      }
      const groupNames = Object.keys(groups);
      const dim = groupNames.length + atoms.length;
      this.dim = dim;
      this.atoms = atoms;
      this.vectors = new Map();
      atoms.forEach((atom, i) => {
        const v = new Float64Array(dim);
        v[groupNames.indexOf(groupOf.get(atom))] = groupScale;
        v[groupNames.length + i] = uniqueScale;
        this.vectors.set(atom, l2Normalize(Array.from(v)));
      });
    }
    embed(features) {
      const acc = new Float64Array(this.dim);
      for (const f of features) {
        const vec = this.vectors.get(f);
        if (!vec) continue;
        for (let i = 0; i < this.dim; i++) acc[i] += vec[i];
      }
      return l2Normalize(Array.from(acc));
    }
    decode(embedding, threshold) {
      const hits = [];
      for (const [atom, vec] of this.vectors)
        if (cosine(embedding, vec) >= threshold) hits.push(atom);
      hits.sort();
      return hits;
    }
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  class HashingAtlas {
    /* Open-vocab overlapping codes via character n-gram hashing.
       Similar tokens share n-grams. Decode is nearest observed atoms.
       Python uses blake2s; this FNV-1a stand-in is the same geometry. */
    constructor({ dim = 128, ngram = [2, 4], seed = 0 } = {}) {
      this.dim = dim;
      this.ngram = ngram;
      this.seed = seed;
      this.vectors = new Map();
    }
    _ngrams(token) {
      const lo = this.ngram[0],
        hi = this.ngram[1];
      const chars = "#" + token + "#";
      const grams = [token];
      for (let n = lo; n <= hi; n++)
        for (let i = 0; i <= chars.length - n; i++)
          grams.push(chars.slice(i, i + n));
      return grams;
    }
    tokenVector(token) {
      if (this.vectors.has(token)) return this.vectors.get(token);
      const acc = new Float64Array(this.dim);
      for (const gram of this._ngrams(token)) {
        const h = hash32(this.seed + ":" + gram);
        const idx = h % this.dim;
        const sign = (h >>> 8) % 2 === 0 ? 1 : -1;
        acc[idx] += sign;
      }
      const vec = l2Normalize(Array.from(acc));
      this.vectors.set(token, vec);
      return vec;
    }
    embed(features) {
      const acc = new Float64Array(this.dim);
      for (const f of features) {
        const vec = this.tokenVector(f);
        for (let i = 0; i < this.dim; i++) acc[i] += vec[i];
      }
      return l2Normalize(Array.from(acc));
    }
    decode(embedding, threshold) {
      if (threshold == null) threshold = 0.35;
      const hits = [];
      for (const [atom, vec] of this.vectors)
        if (cosine(embedding, vec) >= threshold) hits.push(atom);
      hits.sort();
      return hits;
    }
  }

  class ComplementaryMemory {
    constructor({
      seed = 0,
      kActive = 16,
      nDg = 256,
      fanIn = 16,
      sensoryDim = 96,
      completeThreshold = 0.42,
      schemaDecodeThreshold = 0.55,
      atlas = null,
    } = {}) {
      this.sensory = new SensoryMap(sensoryDim);
      this.dg = new DentateGyrus(sensoryDim, nDg, kActive, fanIn, seed);
      this.ca3 = new CA3(completeThreshold);
      this.atlas = atlas || new CorticalAtlas(SEMANTIC_GROUPS);
      this.thr = schemaDecodeThreshold;
      this.payloads = new Map();
      this.engrams = new Map();
      this.schemas = [];
      this._nEp = 0;
      this._nSchema = 0;
      this._nFact = 0;
      this._nBlob = 0;
    }
    encode(title, features, regions, text) {
      const feats = uniq(features);
      const sensory = this.sensory.encode(feats);
      const [code, pre] = this.dg.encode(sensory);
      this._nBlob++;
      const contentId = "ctx:" + String(this._nBlob).padStart(3, "0");
      this.payloads.set(contentId, {
        contentId,
        title,
        features: feats,
        text: text || title,
        embedding: this.atlas.embed(feats),
      });
      this._nEp++;
      const eid = "E" + String(this._nEp).padStart(2, "0");
      const links = {};
      if (regions)
        for (const [k, v] of Object.entries(regions))
          links[k] = [k + ":" + v.join(",")];
      const engram = {
        id: eid,
        kind: "episode",
        title,
        address: code.address(),
        contentId,
        features: feats,
        parents: [],
        links,
      };
      this.engrams.set(eid, engram);
      this.ca3.store({
        engramId: eid,
        code,
        pre: Float64Array.from(pre),
        contentId,
        residual: feats.slice(),
      });
      return engram;
    }
    recall(cue, { reconsolidate = false, semantic = false } = {}) {
      const cueT = uniq(cue);
      const path = ["cue"];
      if (semantic) return this._semanticRecall(cueT, path);
      const sensory = this.sensory.encode(cueT);
      const [cueCode, cuePre] = this.dg.encode(sensory);
      path.push("DG");
      const { entry, conf, margin } = this.ca3.complete(cuePre);
      if (!entry) {
        path.push("CA3 miss → cortical fallback");
        return this._semanticRecall(cueT, path, cueCode, cuePre);
      }
      path.push("CA3 complete");
      const engram = this.engrams.get(entry.engramId);
      path.push("index " + engram.address);
      const payload = this.payloads.get(entry.contentId);
      path.push("payload " + payload.contentId);
      for (const region of Object.keys(engram.links))
        path.push("engram:" + region);
      const schema = this._schemaFor(engram.id);
      const reconstruction = this._reconstruct(schema, entry.residual);
      if (schema) path.push("schema " + schema.id);
      path.push("reconstruct");
      const rec = this._pack(
        cueT,
        true,
        engram,
        schema,
        reconstruction,
        payload.features,
        path,
        conf,
        margin,
        cueCode,
        cuePre,
      );
      if (reconsolidate) {
        this._reconsolidate(entry, engram, reconstruction);
        rec.reconsolidated = true;
        path.push("reconsolidate (rewrite)");
      }
      return rec;
    }
    _pack(
      cue,
      completed,
      engram,
      schema,
      reconstruction,
      original,
      path,
      conf,
      margin,
      cueCode,
      cuePre,
    ) {
      return {
        cue,
        completed,
        engram,
        schema,
        reconstruction,
        original,
        path,
        confidence: conf,
        margin,
        reconsolidated: false,
        cueCode,
        cuePre,
        intrusions: original
          ? reconstruction.filter((f) => !original.includes(f))
          : [],
        omissions: original
          ? original.filter((f) => !reconstruction.includes(f))
          : [],
      };
    }
    _semanticRecall(cue, path, cueCode, cuePre) {
      if (!this.schemas.length)
        return this._pack(
          cue,
          false,
          null,
          null,
          cue,
          null,
          path.concat(["no schema"]),
          0,
          0,
          cueCode || null,
          cuePre || null,
        );
      const q = this.atlas.embed(cue);
      const ranked = this.schemas
        .slice()
        .sort((a, b) => cosine(q, b.prototype) - cosine(q, a.prototype));
      const schema = ranked[0];
      path.push("cortex nearest " + schema.id);
      const reconstruction = this.atlas.decode(schema.prototype, this.thr);
      path.push("schema decode");
      return this._pack(
        cue,
        false,
        null,
        schema,
        reconstruction,
        null,
        path,
        cosine(q, schema.prototype),
        0,
        cueCode || null,
        cuePre || null,
      );
    }
    _reconstruct(schema, residual) {
      let predicted = [];
      if (schema) {
        predicted = this.atlas.decode(schema.prototype, this.thr);
        if (!predicted.length) predicted = schema.sharedFeatures.slice();
      }
      return uniq(predicted.concat(residual));
    }
    _schemaFor(id) {
      return this.schemas.find((s) => s.episodeIds.includes(id)) || null;
    }
    _reconsolidate(entry, engram, reconstruction) {
      const mixed = uniq(entry.residual.concat(reconstruction));
      const sensory = this.sensory.encode(mixed);
      const [code, pre] = this.dg.encode(sensory);
      this.ca3.rewrite(engram.id, mixed, pre, code);
      engram.features = mixed;
      engram.address = code.address();
      const payload = this.payloads.get(entry.contentId);
      payload.features = mixed;
      payload.embedding = this.atlas.embed(mixed);
    }
    sleep() {
      const episodes = [...this.engrams.values()].filter(
        (e) => e.kind === "episode",
      );
      const clusters = this._cluster(episodes);
      const neu = [];
      for (const cluster of clusters) {
        if (cluster.length < 3) continue;
        const mean = new Float64Array(this.atlas.dim);
        for (const e of cluster) {
          const emb = this.payloads.get(e.contentId).embedding;
          for (let i = 0; i < mean.length; i++) mean[i] += emb[i];
        }
        for (let i = 0; i < mean.length; i++) mean[i] /= cluster.length;
        const prototype = l2Normalize(Array.from(mean));
        const predicted = this.atlas.decode(prototype, this.thr);
        const shared = [
          ...new Set(this._shared(cluster, 0.5).concat(predicted)),
        ].sort();
        if (shared.length < 3) continue;
        if (
          this.schemas.some((s) => {
            const a = new Set(s.sharedFeatures);
            return a.size === shared.length && shared.every((x) => a.has(x));
          })
        )
          continue;
        this._nSchema++;
        const sid = "S" + String(this._nSchema).padStart(2, "0");
        const schema = {
          id: sid,
          sharedFeatures: shared,
          prototype,
          episodeIds: cluster.map((e) => e.id),
          name: shared.slice(0, 4).join("/") || "empty",
        };
        this.engrams.set(sid, {
          id: sid,
          kind: "schema",
          title: schema.name,
          address: "ctx-schema:" + sid.toLowerCase(),
          contentId: null,
          features: shared,
          parents: cluster.map((e) => e.id),
          links: {},
        });
        for (const e of cluster) {
          e.parents.push(sid);
          e.links.consolidates = (e.links.consolidates || []).concat([sid]);
        }
        this._nFact++;
        const fid = "F" + String(this._nFact).padStart(2, "0");
        this.engrams.set(fid, {
          id: fid,
          kind: "fact",
          title: "shared: " + shared.join(", "),
          address: "fact:" + fid.toLowerCase(),
          contentId: null,
          features: shared,
          parents: [sid],
          links: {},
        });
        this.engrams.get(sid).links.gist = [fid];
        this.schemas.push(schema);
        neu.push(schema);
        const drop = new Set(predicted.concat(shared));
        for (const e of cluster) {
          const entry = this.ca3.get(e.id);
          if (!entry) continue;
          let residual = entry.residual.filter((f) => !drop.has(f));
          if (!residual.length) residual = entry.residual.slice(-1);
          entry.residual = residual;
        }
      }
      return neu;
    }
    _cluster(episodes, sim = 0.45) {
      const unused = episodes.slice(),
        clusters = [];
      while (unused.length) {
        const seed = unused.shift();
        const seedVec = this.payloads.get(seed.contentId).embedding;
        const group = [seed],
          kept = [];
        for (const other of unused) {
          if (cosine(seedVec, this.payloads.get(other.contentId).embedding) >= sim)
            group.push(other);
          else kept.push(other);
        }
        unused.length = 0;
        unused.push(...kept);
        clusters.push(group);
      }
      return clusters;
    }
    _shared(cluster, presence) {
      const counts = new Map();
      for (const e of cluster)
        for (const f of e.features) counts.set(f, (counts.get(f) || 0) + 1);
      const need = Math.max(1, Math.ceil(presence * cluster.length));
      return [...counts.entries()]
        .filter(([, n]) => n >= need)
        .map(([f]) => f)
        .sort();
    }
    codesFor(a, b) {
      const ea = this.ca3.get(a.id),
        eb = this.ca3.get(b.id);
      return {
        jaccard: jaccard(a.features, b.features),
        overlap: ea.code.overlap(eb.code),
        dgCosine: cosine(ea.pre, eb.pre),
        cortical: cosine(
          this.payloads.get(a.contentId).embedding,
          this.payloads.get(b.contentId).embedding,
        ),
      };
    }
  }

  function schemaLabel(schema) {
    const feats = schema.sharedFeatures || [];
    if (feats.includes("kitchen")) return "kitchen";
    if (feats.includes("sleep") || feats.includes("bed")) return "bedtime";
    return schema.name;
  }

  function encodeWorld(m) {
    const morning = ["rain", "keys", "coffee", "door"];
    const mon = m.encode("Monday rain", [...morning, "monday", "coat"], {
      sensory: ["rain"],
    });
    const tue = m.encode("Tuesday rain", [...morning, "tuesday", "umbrella"], {
      sensory: ["rain"],
    });
    const kitchen = [
      "kitchen",
      "stove",
      "plate",
      "cooking",
      "dinner",
      "table",
      "fork",
    ];
    const dinners = [
      ["Monday dinner", "burnt"],
      ["Tuesday dinner", "guest"],
      ["Wednesday dinner", "wine"],
      ["Thursday dinner", "candle"],
      ["Friday dinner", "leftovers"],
    ].map(([title, odd]) =>
      m.encode(title, kitchen.concat([odd]), {
        sensory: ["aroma"],
        affect: ["warmth"],
      }),
    );
    m.encode("bed", ["bed", "pillow"]);
    m.encode("rest", ["rest", "tired"]);
    m.encode("dream", ["dream", "blanket"]);
    return { mon, tue, candle: dinners[3] };
  }

  const CUES = [
    ["monday", "monday", "complete"],
    ["tuesday", "tuesday", "complete"],
    ["rain", "rain", "complete"],
    ["keys", "keys", "complete"],
    ["bed", "bed", "drm"],
    ["dream", "dream", "drm"],
    ["rest", "rest", "drm"],
  ];
  const SPOTLIGHT = {
    complete: ["coat", "umbrella", "keys", "coffee", "door"],
    sleep: ["candle", "recipe", "kitchen"],
    drm: ["sleep", "bed", "dream", "rest", "pillow"],
    rewrite: ["candle", "recipe", "kitchen"],
  };
  const STEPS = [
    {
      id: "intro",
      rail: "0  index",
      title: "An index, not a file",
      lede: "The index holds a pointer, not the morning. Cortex holds the scene. Already encoded: two rainy mornings, a week of dinners, a word list that never writes sleep.",
      notice:
        "What to look at: cue → sparse keys → pointer → scene. A Merkle DAG would stop at a hash lookup. The pointer is not the event.",
    },
    {
      id: "sep",
      rail: "1  separate",
      title: "Similar mornings, driven apart",
      lede: "Monday and Tuesday share rain, keys, coffee, door. They differ by a coat vs an umbrella. The sparse encoder (dentate gyrus) puts them on different cells so similar mornings don't overwrite each other.",
      notice:
        "What to look at: fewer shared cells than shared words. Raise k-active and the codes start to collide.",
    },
    {
      id: "complete",
      rail: "2  complete",
      title: "A partial cue fills the rest",
      lede: "Cue monday + rain. The missing bits come back: coat, keys, coffee. Cue rain alone and both mornings compete — source confusion, not a SHA mismatch.",
      notice:
        "What to look at: coat was never in the query. Try rain alone: a small margin is two memories fighting.",
    },
    {
      id: "sleep",
      rail: "3  sleep",
      title: "Sleep extracts a skeleton",
      lede: "Five dinners share a kitchen. Sleep merges them into a skeleton. The unusual bit (candle) stays in the index. Cortex fills kitchen — and invents recipe, which no dinner wrote.",
      notice:
        "What to look at: click Sleep. The index keeps the oddity; cortex holds the gist. Reconstructive, not a file get.",
    },
    {
      id: "drm",
      rail: "4  invent",
      title: "A word that was never written",
      lede: "The list was bed, rest, dream. Nobody wrote sleep. After sleep, a cue of bed + dream decodes it anyway — cortex only, no pointer hit.",
      notice:
        "What to look at: this is where a Merkle DAG would refuse. A schema samples; there is no integrity proof.",
    },
    {
      id: "rewrite",
      rail: "5  rewrite",
      title: "Retrieval is a write",
      lede: "Recalling Thursday mixes the kitchen gist back into the pointer. It used to hold candle; after recall it carries recipe too. Merkle DAGs are append-only; brains are not.",
      notice: "What to look at: retrieval is a write. Not append-only.",
    },
  ];

  Fig.register("cls-memory", function (el, opts) {
    const preview = Fig.isPreview(el);
    const cv = Fig.canvas(el, Number(opts.height) || 400);
    Fig.frame(cv);
    const ctx = cv.ctx;
    const MONO = "10px ui-monospace, Menlo, monospace";

    let k = 16,
      m,
      world,
      slept = false,
      stepIx = 0,
      selected = [],
      lastRecall = null,
      hoverRow = -1,
      residualBefore = null,
      residualAfter = null,
      ixGeom = null,
      kHandles = null;

    function boot() {
      m = new ComplementaryMemory({
        seed: 0,
        kActive: k,
        nDg: 256,
        fanIn: 16,
        sensoryDim: 96,
      });
      world = encodeWorld(m);
      slept = false;
      lastRecall = null;
      residualBefore = null;
      residualAfter = null;
    }
    boot();

    function step() {
      return STEPS[stepIx];
    }
    function stepId() {
      return STEPS[stepIx].id;
    }

    function pair() {
      return {
        a: m.ca3.get(world.mon.id).code,
        b: m.ca3.get(world.tue.id).code,
        stats: m.codesFor(world.mon, world.tue),
      };
    }

    function proveWorld() {
      const p = new ComplementaryMemory({
        seed: 0,
        kActive: 16,
        nDg: 256,
        fanIn: 16,
        sensoryDim: 96,
      });
      const w = encodeWorld(p);
      const st = p.codesFor(w.mon, w.tue);
      console.assert(
        st.overlap < st.jaccard,
        "similar mornings should orthogonalize",
        st,
      );
      const r = p.recall(["monday", "rain"]);
      console.assert(r.completed && r.engram && r.engram.id === w.mon.id, "monday+rain hits Monday");
      console.assert(r.reconstruction.includes("coat"), "partial cue fills coat");
      p.sleep();
      const res = p.ca3.get(w.candle.id).residual;
      console.assert(res.includes("candle"), "index keeps candle");
      console.assert(!res.includes("kitchen"), "kitchen stripped from index");
      const rd = p.recall(["candle"]);
      console.assert(rd.reconstruction.includes("kitchen"), "schema fills kitchen");
      console.assert(rd.reconstruction.includes("recipe"), "gist invents recipe");
      const drm = p.recall(["bed", "dream"], { semantic: true });
      console.assert(drm.reconstruction.includes("sleep"), "sleep decoded, never written");
      const before = p.ca3.get(w.candle.id).residual.slice();
      p.recall(["candle"], { reconsolidate: true });
      const after = p.ca3.get(w.candle.id).residual.slice();
      console.assert(
        JSON.stringify(before) !== JSON.stringify(after),
        "retrieval rewrites",
      );
      console.log("cls-memory self-check ok");
    }

    function go(ix) {
      stepIx = Math.max(0, Math.min(STEPS.length - 1, ix));
      hoverRow = -1;
      residualBefore = null;
      residualAfter = null;
      const id = STEPS[stepIx].id;
      if (id === "intro") {
        boot();
        selected = [];
        lastRecall = null;
      } else if (id === "sep") {
        boot();
        selected = [];
        lastRecall = null;
      } else if (id === "complete") {
        boot();
        selected = ["monday", "rain"];
        lastRecall = m.recall(selected);
      } else if (id === "sleep") {
        boot();
        selected = ["candle"];
        lastRecall = m.recall(selected);
      } else if (id === "drm") {
        boot();
        m.sleep();
        slept = true;
        selected = ["bed", "dream"];
        lastRecall = m.recall(selected, { semantic: true });
      } else if (id === "rewrite") {
        boot();
        m.sleep();
        slept = true;
        selected = ["candle"];
        residualBefore = m.ca3.get(world.candle.id).residual.slice();
        lastRecall = m.recall(selected, { reconsolidate: true });
        residualAfter = m.ca3.get(world.candle.id).residual.slice();
      }
      sync();
      draw();
    }

    function doSleep() {
      if (stepId() !== "sleep" || slept) return;
      m.sleep();
      slept = true;
      lastRecall = m.recall(selected);
      sync();
      draw();
    }

    function recallForStep() {
      if (!selected.length) {
        lastRecall = null;
        return;
      }
      if (stepId() === "drm")
        lastRecall = m.recall(selected, { semantic: true });
      else lastRecall = m.recall(selected);
    }

    /* ---------- chrome (skipped on project thumbs) ---------- */
    let titleEl,
      ledeEl,
      happenedEl,
      reconWrap,
      residualWrap,
      cap,
      cueRow,
      cueBtns,
      railBtns,
      backBtn,
      nextBtn,
      sleepBtn,
      denseBtn,
      kWrap;
    if (!preview) {
      const head = document.createElement("div");
      head.style.cssText = "margin:0.7rem 0 0.55rem";
      titleEl = document.createElement("p");
      titleEl.style.cssText = "margin:0;font-weight:600";
      ledeEl = document.createElement("p");
      ledeEl.style.cssText = "margin:0.35rem 0 0;max-width:42em";
      head.append(titleEl, ledeEl);
      el.insertBefore(head, cv.el);

      happenedEl = document.createElement("p");
      happenedEl.className = "meta";
      happenedEl.style.cssText = "margin:0.45rem 0 0;overflow-wrap:anywhere";
      el.appendChild(happenedEl);

      reconWrap = document.createElement("div");
      reconWrap.style.cssText =
        "display:none;flex-wrap:wrap;gap:0.35rem;margin-top:0.45rem;align-items:center";
      el.appendChild(reconWrap);

      residualWrap = document.createElement("div");
      residualWrap.style.cssText = "display:none;margin-top:0.4rem";
      el.appendChild(residualWrap);

      cap = Fig.caption(el, STEPS[0].notice);

      const rail = document.createElement("div");
      rail.style.cssText =
        "display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.7rem";
      rail.setAttribute("role", "tablist");
      rail.setAttribute("aria-label", "Walkthrough steps");
      railBtns = STEPS.map((s, i) => {
        const b = Fig.chip(s.rail, () => go(i));
        b.setAttribute("role", "tab");
        rail.appendChild(b);
        return b;
      });
      el.appendChild(rail);

      const nav = document.createElement("div");
      nav.style.cssText =
        "display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.45rem";
      backBtn = Fig.chip("Back", () => go(stepIx - 1));
      sleepBtn = Fig.chip("Sleep", doSleep);
      denseBtn = Fig.chip("Dense DG", () => {
        k = k >= 48 ? 16 : 64;
        if (kHandles) kHandles.k.set(k);
        go(stepIx);
      });
      nextBtn = Fig.chip("Next", () => {
        if (stepId() === "sleep" && !slept) return;
        go(stepIx + 1);
      });
      nav.append(backBtn, sleepBtn, denseBtn, nextBtn);
      el.appendChild(nav);

      cueRow = document.createElement("div");
      cueRow.style.cssText =
        "display:none;flex-wrap:wrap;gap:0.4rem;margin-top:0.45rem";
      cueBtns = CUES.map(([tok, label, forStep]) => {
        const b = Fig.chip(label, () => {
          if (stepId() !== forStep) return;
          const i = selected.indexOf(tok);
          if (i >= 0) selected.splice(i, 1);
          else selected.push(tok);
          recallForStep();
          sync();
          draw();
        });
        cueRow.appendChild(b);
        return b;
      });
      el.appendChild(cueRow);

      kHandles = Fig.controls(
        el,
        [
          {
            key: "k",
            label: "k-active",
            min: 4,
            max: 64,
            step: 1,
            value: k,
          },
        ],
        (_, v) => {
          k = Math.round(v);
          go(stepIx);
        },
      );
      kWrap = kHandles.k.input && kHandles.k.input.closest(".fig-controls");
    }

    function press(btn, on) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.style.opacity = on ? "1" : ".45";
      btn.style.borderColor = on ? "var(--accent)" : "var(--rule)";
      btn.style.color = on ? "var(--accent)" : "";
    }

    function enableChip(btn, on) {
      btn.disabled = !on;
      btn.style.opacity = on ? "1" : ".4";
      btn.style.cursor = on ? "pointer" : "default";
    }

    function show(node, on) {
      if (!node) return;
      node.style.display = on ? "flex" : "none";
    }

    function addChip(parent, text, kind) {
      const s = document.createElement("span");
      s.className = "chip";
      s.textContent = text;
      if (kind === "accent") {
        s.style.borderColor = "var(--accent)";
        s.style.color = "var(--accent)";
      } else if (kind === "mute") {
        s.style.opacity = "0.55";
      }
      parent.appendChild(s);
    }

    function residualLine(label, feats) {
      const row = document.createElement("div");
      row.style.cssText =
        "display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center;margin-top:0.3rem";
      const lab = document.createElement("span");
      lab.className = "meta";
      lab.style.marginRight = "0.2rem";
      lab.textContent = label;
      row.appendChild(lab);
      (feats || []).forEach((f) => addChip(row, f, "accent"));
      residualWrap.appendChild(row);
    }

    function handful(feats, id) {
      const prefer = SPOTLIGHT[id] || [];
      const picked = prefer.filter((f) => feats && feats.includes(f));
      const rest = (feats || []).filter((f) => !picked.includes(f));
      return picked.concat(rest).slice(0, 5);
    }

    function rowVisible(row) {
      const id = stepId();
      const title = row.title || "";
      const feats = row.residual || [];
      if (id === "complete") return /rain/.test(title);
      if (id === "sleep") {
        if (row.schema || row.fact) return feats.includes("kitchen");
        return /dinner/.test(title);
      }
      if (id === "drm") {
        if (row.schema || row.fact)
          return feats.includes("sleep") || feats.includes("bed");
        return title === "bed" || title === "rest" || title === "dream";
      }
      if (id === "rewrite") {
        if (row.fact) return false;
        if (row.schema) return feats.includes("kitchen");
        return title === "Thursday dinner";
      }
      return true;
    }

    function happened() {
      const id = stepId();
      if (id === "intro") {
        return "Monday rain → a pointer, not a file  ·  two mornings · five dinners · a word list";
      }
      if (id === "sep") {
        const st = pair().stats;
        return (
          "shared words " +
          st.jaccard.toFixed(2) +
          "  ·  shared cells " +
          st.overlap.toFixed(2) +
          "  ·  cortex " +
          st.cortical.toFixed(2) +
          (st.overlap < st.jaccard
            ? "  ·  orthogonalized"
            : "  ·  colliding")
        );
      }
      if (!lastRecall) return "";
      if (id === "sleep" && !slept) {
        return (
          "before sleep · hit " +
          (lastRecall.engram ? lastRecall.engram.title : "—") +
          "  ·  residual still carries the whole kitchen"
        );
      }
      if (id === "sleep") {
        const res = handful(m.ca3.get(world.candle.id).residual, "sleep");
        const gist = lastRecall.reconstruction.includes("recipe")
          ? "recipe invented"
          : "kitchen filled from cortex";
        return (
          schemaLabel(lastRecall.schema || { sharedFeatures: [], name: "schema" }) +
          " skeleton  ·  index kept " +
          res.join(", ") +
          "  ·  " +
          gist
        );
      }
      if (id === "drm") {
        const hasSleep = lastRecall.reconstruction.includes("sleep");
        return hasSleep
          ? "cortex-only  ·  sleep decoded, never written"
          : "cortex-only  ·  no sleep intrusion";
      }
      if (id === "rewrite") {
        const before = handful(residualBefore, "rewrite");
        const after = handful(residualAfter, "rewrite");
        return (
          "before  " +
          before.join(", ") +
          "  ·  after  " +
          after.join(", ") +
          (JSON.stringify(residualBefore) !== JSON.stringify(residualAfter)
            ? "  ·  rewritten"
            : "")
        );
      }
      const hit = lastRecall.engram
        ? lastRecall.engram.title
        : lastRecall.schema
          ? schemaLabel(lastRecall.schema)
          : "—";
      const filled = lastRecall.reconstruction.filter(
        (f) => !lastRecall.cue.includes(f),
      );
      const shown = handful(filled, "complete");
      const rainOnly =
        lastRecall.cue.length === 1 && lastRecall.cue[0] === "rain";
      return (
        (lastRecall.completed ? "hit " : "cortex ") +
        hit +
        (rainOnly
          ? "  ·  margin " + lastRecall.margin.toFixed(2) + "  ·  both mornings compete"
          : shown.length
            ? "  ·  filled " + shown.join(", ")
            : "")
      );
    }

    function sync() {
      if (preview) return;
      const s = step();
      const id = s.id;
      titleEl.textContent = s.title;
      ledeEl.textContent =
        id === "sleep" && slept
          ? "Sleep merged the dinners into a kitchen skeleton and the bedtime list into a gist. The index kept candle. Cortex filled kitchen — and invented recipe, which no dinner wrote."
          : s.lede;
      if (cap)
        cap.textContent =
          id === "sleep" && slept
            ? "What to look at: the index kept candle; cortex invented recipe."
            : s.notice;
      happenedEl.textContent = happened();

      railBtns.forEach((b, i) => press(b, i === stepIx));
      enableChip(backBtn, stepIx > 0);
      enableChip(nextBtn, stepIx < STEPS.length - 1 && (id !== "sleep" || slept));
      show(sleepBtn, id === "sleep" && !slept);
      show(denseBtn, id === "sep");
      if (denseBtn) press(denseBtn, k >= 48);
      if (id === "sleep" && !slept) {
        sleepBtn.style.borderColor = "var(--accent)";
        sleepBtn.style.color = "var(--accent)";
        sleepBtn.style.opacity = "1";
      }

      const play = id === "complete" || id === "drm";
      show(cueRow, play);
      if (play) {
        cueBtns.forEach((b, i) => {
          const onStep = CUES[i][2] === id;
          b.style.display = onStep ? "" : "none";
          if (onStep) press(b, selected.includes(CUES[i][0]));
        });
      }
      if (kWrap) {
        const on = id === "sep";
        kWrap.style.display = on ? "" : "none";
        kWrap.hidden = !on;
        kWrap.setAttribute("aria-hidden", on ? "false" : "true");
      }

      const showRecon =
        (id === "complete" ||
          id === "sleep" ||
          id === "drm" ||
          id === "rewrite") &&
        lastRecall;
      show(reconWrap, !!showRecon);
      reconWrap.innerHTML = "";
      if (showRecon) {
        const lab = document.createElement("span");
        lab.className = "meta";
        lab.style.marginRight = "0.2rem";
        lab.textContent = "reconstruct";
        reconWrap.appendChild(lab);
        const cueSet = new Set(lastRecall.cue);
        handful(lastRecall.reconstruction, id).forEach((f) => {
          addChip(reconWrap, f, cueSet.has(f) ? "mute" : "accent");
        });
      }

      residualWrap.innerHTML = "";
      if (id === "sleep" && slept) {
        residualWrap.style.display = "block";
        residualLine(
          "index kept",
          handful(m.ca3.get(world.candle.id).residual, "sleep"),
        );
      } else if (id === "rewrite") {
        residualWrap.style.display = "block";
        residualLine("before", handful(residualBefore, "rewrite"));
        residualLine("after", handful(residualAfter, "rewrite"));
      } else {
        residualWrap.style.display = "none";
      }
    }

    function rows() {
      const cuePre = lastRecall && lastRecall.cuePre;
      const semantic = stepId() === "drm";
      const list = [];
      if (!semantic) {
        m.ca3.entries.forEach((e) => {
          const engram = m.engrams.get(e.engramId);
          list.push({
            id: e.engramId,
            title: engram.title,
            score: cuePre ? cosine(cuePre, e.pre) : null,
            residual: e.residual,
            winner:
              lastRecall &&
              lastRecall.engram &&
              lastRecall.engram.id === e.engramId,
          });
        });
        if (cuePre) list.sort((a, b) => b.score - a.score);
      }
      if (m.schemas.length && (lastRecall || stepId() === "sleep")) {
        const q = lastRecall
          ? m.atlas.embed(lastRecall.cue)
          : m.atlas.embed(["kitchen"]);
        m.schemas.forEach((s) => {
          list.push({
            id: s.id,
            title: schemaLabel(s),
            score: cosine(q, s.prototype),
            residual: s.sharedFeatures,
            schema: true,
            winner:
              lastRecall && lastRecall.schema && lastRecall.schema.id === s.id,
          });
        });
        [...m.engrams.values()]
          .filter((e) => e.kind === "fact")
          .forEach((e) => {
            list.push({
              id: e.id,
              title: "gist",
              score: null,
              residual: e.features,
              fact: true,
              winner: false,
            });
          });
      }
      return list.filter(rowVisible);
    }

    function drawRaster(x, y, size, codeA, codeB, P) {
      const n = 16;
      const gap = size > 140 ? 1.1 : 0.6;
      const cell = (size - gap * (n - 1)) / n;
      const setA = new Set(codeA ? codeA.active : []);
      const setB = new Set(codeB ? codeB.active : []);
      for (let i = 0; i < n * n; i++) {
        const c = i % n,
          r = (i / n) | 0;
        const px = x + c * (cell + gap),
          py = y + r * (cell + gap);
        const inA = setA.has(i),
          inB = setB.has(i);
        if (inA && inB) {
          ctx.fillStyle = P.accent;
          ctx.fillRect(px, py, cell, cell);
        } else if (inA) {
          ctx.fillStyle = P.ink;
          ctx.fillRect(px, py, cell, cell);
        } else if (inB) {
          ctx.strokeStyle = P.accent;
          ctx.lineWidth = Math.max(0.8, cell * 0.12);
          ctx.strokeRect(
            px + 0.5,
            py + 0.5,
            Math.max(0.5, cell - 1),
            Math.max(0.5, cell - 1),
          );
        } else {
          ctx.fillStyle = hexRgba(P.ink, P.dark ? 0.08 : 0.06);
          ctx.fillRect(px, py, cell, cell);
        }
      }
    }

    function legend(x, y, items, P) {
      ctx.font = MONO;
      ctx.textAlign = "left";
      let xx = x;
      items.forEach((it) => {
        if (it.stroke) {
          ctx.strokeStyle = it.fill;
          ctx.lineWidth = 1;
          ctx.strokeRect(xx, y - 6, 8, 8);
        } else {
          ctx.fillStyle = it.fill;
          ctx.fillRect(xx, y - 6, 8, 8);
        }
        ctx.fillStyle = P.mute;
        ctx.fillText(it.label, xx + 12, y);
        xx += 12 + ctx.measureText(it.label).width + 14;
      });
    }

    function arrow(x1, y, x2, P) {
      ctx.strokeStyle = P.mute;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2 - 5, y - 3.5);
      ctx.lineTo(x2, y);
      ctx.lineTo(x2 - 5, y + 3.5);
      ctx.stroke();
    }

    function box(x, y, w, h, title, sub, P, hi) {
      ctx.fillStyle = hi ? hexRgba(P.accent, 0.12) : P.wash;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = hi ? P.accent : P.rule;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      ctx.fillStyle = P.ink;
      ctx.font = MONO;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(title, x + w / 2, y + h / 2 - (sub ? 6 : 0));
      if (sub) {
        ctx.fillStyle = P.mute;
        ctx.fillText(sub, x + w / 2, y + h / 2 + 8);
      }
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
    }

    function drawIntro(P) {
      const pad = 16;
      const stages = [
        { k: "cue", s: "query" },
        { k: "sparse keys", s: "index" },
        { k: "pointer", s: "not the scene" },
        { k: "cortex", s: "the scene" },
        { k: "reconstruct", s: "not a get" },
      ];
      const n = stages.length;
      const gap = 14;
      const bw = Math.min(118, Math.max(68, (cv.w - pad * 2 - gap * (n - 1)) / n));
      const bh = 48;
      const rowW = n * bw + gap * (n - 1);
      const wrap = cv.w < 520;
      ctx.font = MONO;
      ctx.fillStyle = P.mute;
      ctx.textAlign = "left";
      ctx.fillText("index = keys · cortex = values", pad, pad + 10);

      if (!wrap) {
        const x0 = pad + Math.max(0, (cv.w - pad * 2 - rowW) / 2);
        const y = 36;
        stages.forEach((st, i) => {
          const x = x0 + i * (bw + gap);
          box(x, y, bw, bh, st.k, st.s, P, i === 1 || i === 2);
          if (i < n - 1) arrow(x + bw + 2, y + bh / 2, x + bw + gap - 2, P);
        });
      } else {
        const n1 = 3,
          n2 = 2;
        const g = 16;
        const w1 = Math.min(110, (cv.w - pad * 2 - g * (n1 - 1)) / n1);
        const w2 = Math.min(110, (cv.w - pad * 2 - g * (n2 - 1)) / n2);
        stages.slice(0, 3).forEach((st, i) => {
          const x = pad + i * (w1 + g);
          box(x, 34, w1, bh, st.k, st.s, P, i > 0);
          if (i < 2) arrow(x + w1 + 2, 34 + bh / 2, x + w1 + g - 2, P);
        });
        stages.slice(3).forEach((st, i) => {
          const x = pad + i * (w2 + g);
          box(x, 34 + bh + 22, w2, bh, st.k, st.s, P, false);
          if (i < 1) arrow(x + w2 + 2, 34 + bh + 22 + bh / 2, x + w2 + g - 2, P);
        });
      }

      const mon = world.mon;
      const cardY = wrap ? 34 + bh * 2 + 36 : 36 + bh + 24;
      ctx.fillStyle = P.ink;
      ctx.fillText("Monday rain", pad, cardY);
      ctx.fillStyle = P.mute;
      ctx.fillText(
        "pointer  " + mon.address + "  →  scene lives in cortex",
        pad,
        cardY + 16,
      );

      const stories = [
        ["two rainy mornings", "Monday coat · Tuesday umbrella"],
        ["a week of dinners", "kitchen every night · Thursday candle"],
        ["a word list", "bed rest dream — never wrote sleep"],
      ];
      const listY = cardY + 40;
      stories.forEach((pair, i) => {
        const y = listY + i * 32;
        ctx.fillStyle = P.ink;
        ctx.fillText(pair[0], pad, y);
        ctx.fillStyle = P.mute;
        ctx.fillText(pair[1], pad, y + 14);
      });
    }

    function drawIndex(ixX, ixY, ixW, ixH, header, P) {
      ctx.fillStyle = P.mute;
      ctx.font = MONO;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(header, ixX, ixY - 8);
      const list = rows();
      const rowH = Math.min(
        18,
        Math.max(12, (ixH - 4) / Math.max(list.length, 1)),
      );
      ctx.font = MONO;
      ctx.textBaseline = "middle";
      const labelW = Math.min(120, Math.max(88, ixW * 0.32));
      list.forEach((row, i) => {
        const yy = ixY + i * rowH;
        const barX = ixX + labelW;
        const barW = Math.max(40, ixW - labelW - 36);
        if (i === hoverRow) {
          ctx.fillStyle = hexRgba(P.accent, 0.1);
          ctx.fillRect(ixX - 4, yy, ixW + 4, rowH);
        }
        if (row.score != null) {
          ctx.fillStyle = P.wash;
          ctx.fillRect(barX, yy + 3, barW, rowH - 6);
          const bw = Math.max(0, Math.min(1, row.score)) * barW;
          ctx.fillStyle = row.winner ? P.accent : row.schema || row.fact ? P.mute : P.ink;
          ctx.globalAlpha = row.winner ? 1 : 0.55;
          ctx.fillRect(barX, yy + 3, bw, rowH - 6);
          ctx.globalAlpha = 1;
          if (!row.schema) {
            ctx.strokeStyle = hexRgba(P.accent, 0.35);
            ctx.beginPath();
            ctx.moveTo(barX + 0.42 * barW, yy + 2);
            ctx.lineTo(barX + 0.42 * barW, yy + rowH - 2);
            ctx.stroke();
          }
        }
        ctx.fillStyle = row.winner ? P.ink : P.mute;
        ctx.textAlign = "right";
        const label =
          row.title.length > 16 ? row.title.slice(0, 15) + "…" : row.title;
        ctx.fillText(label, barX - 6, yy + rowH / 2);
        ctx.textAlign = "left";
        ctx.fillStyle = P.mute;
        if (row.score != null)
          ctx.fillText(row.score.toFixed(2), barX + barW + 6, yy + rowH / 2);
      });
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ixGeom = { ixX, ixY, ixW, ixH, rowH, n: list.length };
    }

    function drawSep(P) {
      const pad = 12;
      const header = 18;
      const split = cv.w >= 500;
      const footer = 36;
      const leftW = split
        ? Math.min(cv.w * 0.5, cv.h - header - footer - pad * 2)
        : Math.min(cv.w - pad * 2, 240);
      const codes = pair();
      const kFrac = (m.dg.kActive / m.dg.nOut) * 100;
      ctx.font = MONO;
      ctx.fillStyle = P.mute;
      ctx.textAlign = "left";
      ctx.fillText(
        "DG  " +
          m.dg.kActive +
          "/" +
          m.dg.nOut +
          "  (" +
          kFrac.toFixed(1) +
          "% fire)",
        pad,
        pad + 10,
      );
      drawRaster(pad, pad + header, leftW, codes.a, codes.b, P);
      legend(
        pad,
        pad + header + leftW + 14,
        [
          { fill: P.ink, label: "Mon" },
          { fill: P.accent, label: "Tue", stroke: true },
          { fill: P.accent, label: "both" },
        ],
        P,
      );

      const st = codes.stats;
      const sx = split ? pad + leftW + 22 : pad;
      const sy = split ? pad + header + 8 : pad + header + leftW + 36;
      const sw = split ? cv.w - sx - pad : cv.w - pad * 2;
      const rowsS = [
        ["shared words", st.jaccard],
        ["shared cells", st.overlap],
        ["cortex  shared tissue", st.cortical],
      ];
      const rowH = split ? 48 : 36;
      ctx.font = MONO;
      rowsS.forEach((row, i) => {
        const y = sy + i * rowH;
        ctx.fillStyle = P.mute;
        ctx.textAlign = "left";
        ctx.fillText(row[0], sx, y);
        ctx.fillStyle = P.wash;
        ctx.fillRect(sx, y + 8, sw, 8);
        ctx.fillStyle = i === 1 ? P.accent : P.ink;
        ctx.fillRect(sx, y + 8, Math.max(2, row[1] * sw), 8);
        ctx.fillStyle = P.mute;
        ctx.fillText(row[1].toFixed(2), sx, y + 28);
      });
      ctx.fillStyle = st.overlap < st.jaccard ? P.accent : P.mute;
      ctx.fillText(
        st.overlap < st.jaccard
          ? "orthogonalized"
          : "colliding",
        sx,
        sy + rowH * rowsS.length + 2,
      );
    }

    function drawComplete(P) {
      const pad = 12;
      const split = cv.w >= 500;
      const header = 18;
      const footer = 28;
      const leftW = split
        ? Math.min(cv.w * 0.48, cv.h - header - footer - pad * 2)
        : Math.min(cv.w - pad * 2, 200);
      const codeA = lastRecall ? lastRecall.cueCode : pair().a;
      const codeB =
        lastRecall && lastRecall.engram && m.ca3.get(lastRecall.engram.id)
          ? m.ca3.get(lastRecall.engram.id).code
          : pair().b;
      const kFrac = (m.dg.kActive / m.dg.nOut) * 100;
      ctx.font = MONO;
      ctx.fillStyle = P.mute;
      ctx.textAlign = "left";
      ctx.fillText(
        "DG  " +
          m.dg.kActive +
          "/" +
          m.dg.nOut +
          "  (" +
          kFrac.toFixed(1) +
          "% fire)",
        pad,
        pad + 10,
      );
      drawRaster(pad, pad + header, leftW, codeA, codeB, P);
      legend(
        pad,
        pad + header + leftW + 14,
        [
          { fill: P.ink, label: "cue" },
          { fill: P.accent, label: "stored", stroke: true },
          { fill: P.accent, label: "both" },
        ],
        P,
      );
      const ixX = split ? pad + leftW + 18 : pad;
      const legendY = pad + header + leftW + 14;
      const ixY = split ? pad + header : legendY + 20;
      const ixW = split ? cv.w - ixX - pad : cv.w - pad * 2;
      const ixH = split ? cv.h - ixY - pad : cv.h - ixY - pad;
      drawIndex(
        ixX,
        ixY,
        ixW,
        ixH,
        split ? "who wins" : "pointers",
        P,
      );
    }

    function draw() {
      const P = Fig.palette();
      ctx.clearRect(0, 0, cv.w, cv.h);
      ctx.textBaseline = "alphabetic";
      ixGeom = null;

      if (preview) {
        const codes = pair();
        const s = Math.min(cv.w, cv.h) - 8;
        drawRaster((cv.w - s) / 2, (cv.h - s) / 2, s, codes.a, codes.b, P);
        return;
      }

      const id = stepId();
      if (id === "intro") {
        drawIntro(P);
        return;
      }
      if (id === "sep") {
        drawSep(P);
        return;
      }
      if (id === "complete") {
        drawComplete(P);
        return;
      }

      const pad = 12;
      const header =
        id === "drm"
          ? "cortex only  ·  no pointer hit"
          : id === "rewrite"
            ? "rewritten  ·  gist mixed back in"
            : slept
              ? "after sleep  ·  skeleton + oddity"
              : "before sleep  ·  the whole kitchen is still in the index";
      drawIndex(pad, pad + 18, cv.w - pad * 2, cv.h - pad - 22, header, P);
    }

    function hitRow(e) {
      if (!ixGeom) return -1;
      const r = cv.el.getBoundingClientRect();
      const x = e.clientX - r.left,
        y = e.clientY - r.top;
      if (x < ixGeom.ixX - 4) return -1;
      const i = Math.floor((y - ixGeom.ixY) / ixGeom.rowH);
      return i >= 0 && i < ixGeom.n ? i : -1;
    }

    if (!preview) {
      cv.el.style.cursor = "default";
      cv.el.addEventListener("pointermove", (e) => {
        if (stepId() === "intro" || stepId() === "sep") return;
        const i = hitRow(e);
        if (i !== hoverRow) {
          hoverRow = i;
          if (i >= 0) {
            const row = rows()[i];
            const extra =
              row.residual && row.residual.length
                ? "  ·  " + handful(row.residual, stepId()).join(", ")
                : "";
            happenedEl.textContent =
              row.title +
              (row.score != null ? "  ·  " + row.score.toFixed(2) : "") +
              extra;
          } else happenedEl.textContent = happened();
          draw();
        }
      });
      cv.el.addEventListener("pointerleave", () => {
        hoverRow = -1;
        if (happenedEl) happenedEl.textContent = happened();
        draw();
      });
      cv.el.addEventListener("pointerdown", (e) => {
        const id = stepId();
        if (id !== "complete" && id !== "sleep") return;
        const i = hitRow(e);
        if (i < 0) return;
        const row = rows()[i];
        if (row.schema) {
          lastRecall = m.recall(selected.length ? selected : ["kitchen"], {
            semantic: true,
          });
        } else {
          const entry = m.ca3.get(row.id);
          selected = entry.residual.slice(0, 2);
          lastRecall = m.recall(selected);
        }
        sync();
        draw();
      });
    }

    if (!preview) {
      proveWorld();
      go(0);
    } else {
      draw();
    }
    cv.redraw = draw;
    Fig.onScheme(draw);
  });
})();

