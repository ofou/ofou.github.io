#!/usr/bin/env python3
# /// script
# requires-python = ">=3.14"
# dependencies = ["markdown", "pyyaml", "pygments"]
# ///

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import sys
import tarfile
import unicodedata
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape

import html as html_lib

import markdown
import yaml
from pygments import highlight as pygments_highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "_site"
VENDOR_CACHE = ROOT / ".vendor-cache"

# Front-end vendors are fetched at build time (never committed). Default:
# resolve npm dist-tags "latest", cache tarballs under .vendor-cache/, install
# into _site/static/vendor/. Set VENDOR_OFFLINE=1 to reuse .vendor-cache/versions.lock
# without hitting the registry. Optional pins: VENDOR_KATEX / VENDOR_MERMAID
# (exact versions). Syntax colouring is Pygments at build time: CodeHilite
# for fences, and `:::lang …` inside backticks for inline chips.
VENDOR_SPECS: dict[str, dict] = {
    "katex": {
        "npm": "katex",
        "env": "VENDOR_KATEX",
        "dest": "katex",
        "keep": lambda n: (
            n
            in {
                "package/dist/katex.min.js",
                "package/dist/katex.min.css",
                "package/dist/contrib/auto-render.min.js",
            }
            or n.startswith("package/dist/fonts/")
        ),
    },
    "mermaid": {
        "npm": "mermaid",
        "env": "VENDOR_MERMAID",
        "dest": "mermaid",
        "keep": lambda n: (
            n == "package/dist/mermaid.esm.min.mjs"
            or (
                n.startswith("package/dist/chunks/mermaid.esm.min/")
                and not n.endswith(".map")
            )
        ),
    },
}

# Resolved npm versions for this build (filled by ensure_vendors).
VENDOR_VERSIONS: dict[str, str] = {}

SITE = {
    "title": "Omar Olivares Urrutia",
    "brand": "Omar Olivares",
    "url": "https://olivares.cl",
    "author": "Omar Olivares Urrutia",
    "email": "omar@olivares.cl",
    "repo": "https://github.com/ofou/ofou.github.io",
    "description": (
        "Software engineer specializing in artificial intelligence and machine "
        "learning, with interests in interpretability, alignment, and agentic systems."
    ),
}

NAV = [
    ("Blog", "/blog/"),
    ("Projects", "/projects/"),
    ("CV", "/cv/"),
    ("Contact", "/contact/"),
]

SOCIAL = [
    ("GitHub", "https://github.com/ofou", "github"),
    ("X", "https://x.com/omarnomad", "x"),
    ("LinkedIn", "https://www.linkedin.com/in/ofou/", "linkedin"),
    ("YouTube", "https://www.youtube.com/@omarnomad", "youtube"),
    ("Email", "mailto:omar@olivares.cl", "email"),
    ("RSS", "/feed.xml", "rss"),
]


def load_icon(slug: str) -> str:
    p = SRC / "static" / "icons" / f"{slug}.svg"
    return p.read_text(encoding="utf-8").replace(
        'fill="#000000"', 'fill="currentColor"'
    )


GISCUS = f"""<section class="comments">
<h2 id="comments">Comments</h2>
<script>
(() => {{
  const host = document.currentScript.closest("section.comments");
  if (!host) return;
  const load = () => {{
    if (host.dataset.giscusLoaded) return;
    host.dataset.giscusLoaded = "1";
    const s = document.createElement("script");
    s.src = "https://giscus.app/client.js";
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.repo = "ofou/ofou.github.io";
    s.dataset.repoId = "MDEwOlJlcG9zaXRvcnkzNzQxNDAxMDM=";
    s.dataset.category = "General";
    s.dataset.categoryId = "DIC_kwDOFkzsx84CtY2c";
    s.dataset.mapping = "pathname";
    s.dataset.strict = "0";
    s.dataset.reactionsEnabled = "1";
    s.dataset.emitMetadata = "0";
    s.dataset.inputPosition = "bottom";
    s.dataset.theme = "{SITE["url"]}/static/giscus.css";
    s.dataset.lang = "en";
    host.appendChild(s);
  }};
  if (!("IntersectionObserver" in window)) {{ load(); return; }}
  const io = new IntersectionObserver((entries) => {{
    if (entries.some((e) => e.isIntersecting)) {{ io.disconnect(); load(); }}
  }}, {{ rootMargin: "240px 0px" }});
  io.observe(host);
}})();
</script>
</section>"""

# KaTeX — self-hosted under /static/vendor/katex/ by default (fetched at build).
# Pass ?cdn=1 to A/B against jsDelivr (same resolved version).
_KATEX_DELIMS = (
    "renderMathInElement(document.body,{delimiters:["
    "{left:'$$',right:'$$',display:true},"
    "{left:'$',right:'$',display:false},"
    "{left:'\\\\(',right:'\\\\)',display:false},"
    "{left:'\\\\[',right:'\\\\]',display:true}"
    "]})"
)


def katex_snippet() -> str:
    ver = VENDOR_VERSIONS.get("katex", "latest")
    return f"""<script>
(() => {{
  const cdn = new URLSearchParams(location.search).has("cdn");
  const base = cdn
    ? "https://cdn.jsdelivr.net/npm/katex@{ver}/dist"
    : "/static/vendor/katex";
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = base + "/katex.min.css";
  if (cdn) css.crossOrigin = "anonymous";
  document.head.append(css);
  const load = (src) => new Promise((resolve, reject) => {{
    const s = document.createElement("script");
    s.src = src;
    if (cdn) s.crossOrigin = "anonymous";
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  }});
  load(base + "/katex.min.js")
    .then(() => load(base + "/contrib/auto-render.min.js"))
    .then(() => {{ {_KATEX_DELIMS}; }})
    .catch(() => {{}});
}})();
</script>"""


# A/B for mirrored book covers: local src by default; ?cdn=1 swaps to data-cdn-src.
COVERS_AB = """<script>
(() => {
  if (!new URLSearchParams(location.search).has("cdn")) return;
  const apply = (img) => {
    if (img.dataset.cdnSrc) img.src = img.dataset.cdnSrc;
  };
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches?.("img[data-cdn-src]")) apply(root);
    root.querySelectorAll?.("img[data-cdn-src]").forEach(apply);
  };
  scan(document.documentElement);
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) scan(n);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
</script>"""

RELTIME = """<script>
(() => {
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "always" });
  const units = [
    ["year", 365.25 * 86400],
    ["month", 30.44 * 86400],
    ["week", 7 * 86400],
    ["day", 86400],
    ["hour", 3600],
  ];
  const unitPhrase = (n, unit) =>
    fmt.format(-n, unit).replace(/^in /, "").replace(/ ago$/, "");
  const rel = ms => {
    const delta = Date.now() - ms;
    const past = delta >= 0;
    let sec = Math.floor(Math.abs(delta) / 1000);
    const parts = [];
    for (const [unit, size] of units) {
      const n = Math.floor(sec / size);
      if (!n) continue; // hide zero years/months/weeks/days/hours
      parts.push(unitPhrase(n, unit));
      sec -= n * size;
      if (parts.length === 2) break;
    }
    if (!parts.length) return null; // under an hour: keep exact date
    const body = parts.join(", ");
    return past ? body + " ago" : "in " + body;
  };
  document.querySelectorAll("[data-rel-from]").forEach(e => {
    const t = Date.parse(e.dataset.relFrom);
    if (Number.isNaN(t)) return;
    const text = rel(t);
    if (!text) return;
    const exact = e.textContent.trim();
    if (exact) e.dataset.tip = exact;
    e.textContent = text;
  });
})();
</script>"""

COMBINING = {
    '"': "\u0308",
    "'": "\u0301",
    "`": "\u0300",
    "^": "\u0302",
    "~": "\u0303",
    "c": "\u0327",
}


def detex(value: str) -> str:
    value = re.sub(
        r"\{?\\([\"'`^~c])\s*\{?(\w)\}?\}?",
        lambda m: unicodedata.normalize("NFC", m.group(2) + COMBINING[m.group(1)]),
        value,
    )
    value = re.sub(r"\\[,;:!]|\\ ", " ", value)
    value = value.replace("\\&", "&").replace("\\%", "%").replace("\\_", "_")
    return " ".join(value.replace("{", "").replace("}", "").split())


def parse_bib(text: str) -> dict[str, dict[str, str]]:
    entries: dict[str, dict[str, str]] = {}
    for match in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,", text):
        body, i, depth = "", match.end(), 1
        while i < len(text) and depth:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if not depth:
                    break
            body += text[i]
            i += 1
        entries[match.group(2)] = _bib_fields(body) | {"type": match.group(1).lower()}
    return entries


def _bib_fields(body: str) -> dict[str, str]:
    fields, i = {}, 0
    key_re = re.compile(r"\s*(\w+)\s*=\s*")
    while i < len(body):
        m = key_re.match(body, i)
        if not m:
            break
        i = m.end()
        if i < len(body) and body[i] == "{":
            depth, j = 1, i + 1
            while j < len(body) and depth:
                depth += (body[j] == "{") - (body[j] == "}")
                j += 1
            value, i = body[i + 1 : j - 1], j
        elif i < len(body) and body[i] == '"':
            j = body.index('"', i + 1)
            value, i = body[i + 1 : j], j + 1
        else:
            j = body.find(",", i)
            j = len(body) if j < 0 else j
            value, i = body[i:j], j
        fields[m.group(1).lower()] = detex(value)
        while i < len(body) and body[i] in ", \n\t":
            i += 1
    return fields


def format_authors(raw: str) -> str:
    people = []
    for name in re.split(r"\s+and\s+", raw):
        name = name.strip()
        if not name:
            continue
        if "," in name:
            last, first = (p.strip() for p in name.split(",", 1))
        else:
            parts = name.split()
            last, first = parts[-1], " ".join(parts[:-1])
        initials = " ".join(f"{p[0]}." for p in first.split() if p[:1].isalpha())
        people.append(f"{last}, {initials}".strip().rstrip(","))
    # Margin notes and the end list share one voice: keep short author
    # strings so a 20-author paper does not bury its title link.
    if len(people) > 3:
        return people[0] + " et al."
    if len(people) > 2:
        return ", ".join(people[:-1]) + " & " + people[-1]
    return " & ".join(people)


def format_reference(entry: dict[str, str]) -> str:
    parts = []
    if who := entry.get("author") or entry.get("editor"):
        parts.append(format_authors(who).rstrip(".") + ".")
    title = entry.get("title", "").rstrip(".")
    url = entry.get("url")
    parts.append(f"[*{title}*]({url})." if url else f"*{title}*.")
    venue = next(
        (
            entry[k]
            for k in ("journal", "publisher", "booktitle", "school", "organization")
            if entry.get(k)
        ),
        None,
    )
    if venue:
        parts.append(venue.rstrip(".") + ".")
    if year := entry.get("year"):
        parts.append(f"({year})")
    return " ".join(parts)


CITATION = re.compile(r"\[@([\w:./+-]+)\]")


def apply_citations(text: str, bib: dict[str, dict[str, str]]) -> str:
    cited: list[str] = []

    def sub(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in bib:
            return match.group(0)
        if key not in cited:
            cited.append(key)
        return f"[^{key}]"

    text = CITATION.sub(sub, text)
    if not cited:
        return text
    cited.sort(
        key=lambda k: (
            int(bib[k].get("year") or 0),
            bib[k].get("author", ""),
            bib[k].get("title", ""),
        )
    )
    return (
        text
        + "\n\n"
        + "\n".join(f"[^{k}]: {format_reference(bib[k])}" for k in cited)
        + "\n"
    )


@dataclass
class Page:
    path: Path
    meta: dict
    text: str
    url: str
    title: str
    html: str = ""
    excerpt: str = ""
    date: date | None = None
    kind: str = "page"
    categories: list[str] = field(default_factory=list)


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"-{2,}", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


def read_page(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    if not raw.startswith("---"):
        return {}, raw
    parts = raw.split("---", 2)
    if len(parts) < 3:
        raise SystemExit(f"{path}: unclosed YAML front matter")
    _, front, body = parts
    return yaml.safe_load(front) or {}, body.lstrip("\n")


def as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc).date()
            except ValueError:
                continue
    return None


def first_heading(text: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    return m.group(1).strip() if m else ""


def load_pages(bib: dict) -> tuple[Page, list[Page], list[Page]]:
    def build(path: Path, url_for, kind: str) -> Page:
        meta, text = read_page(path)
        title = str(
            meta.get("title")
            or first_heading(text)
            or path.stem.replace("-", " ").title()
        )
        page = Page(
            path=path,
            meta=meta,
            text=apply_citations(text, bib),
            url="",
            title=title,
            date=as_date(meta.get("date")),
            kind=kind,
            categories=[str(c) for c in (meta.get("categories") or [])],
        )
        page.url = url_for(page)
        return page

    home = build(SRC / "index.md", lambda p: "/", "home")

    posts = [
        build(p, lambda pg: f"/blog/{pg.date:%Y/%m/%d}/{slugify(pg.title)}/", "post")
        for p in sorted((SRC / "blog" / "posts").glob("*.md"))
    ]
    posts = [p for p in posts if not p.meta.get("draft")]
    missing = [p.path.name for p in posts if p.date is None]
    if missing:
        raise SystemExit(f"posts missing a `date:` front matter field: {missing}")
    posts.sort(key=lambda p: p.date, reverse=True)

    projects = [
        build(p, lambda pg, path=p: f"/projects/{path.stem}/", "project")
        for p in sorted((SRC / "projects").glob("*.md"))
    ]

    projects = [p for p in projects if not p.meta.get("draft")]
    projects.sort(key=lambda p: p.date or date.min, reverse=True)
    return home, posts, projects


def drop_dead_backrefs(html: str) -> str:
    live = set(re.findall(r'id="fnref:([^"]+)"', html))
    return re.sub(
        r'\s*<a class="footnote-backref" href="#fnref:([^"]+)".*?</a>',
        lambda m: m.group(0) if m.group(1) in live else "",
        html,
    )


def strip_footnotes(html: str) -> str:
    html = re.sub(r'<sup id="fnref:.*?</sup>', "", html, flags=re.DOTALL)
    return re.sub(r'<div class="footnote">.*?</div>', "", html, flags=re.DOTALL)


TABLE_RE = re.compile(r"<table(\s[^>]*)?>(.*?)</table>", re.DOTALL)
# Classes that leave the table and ride the scroll wrapper instead.
_TABLE_WRAPPER_CLASSES = frozenset({"fullwidth", "plate"})
# At or above this column count, a bare table opens the listing bay
# (same hang as figure.plate / code). Narrower ones stay on the measure.
WIDE_TABLE_COLS = 5


def _table_class_attr(attrs: str) -> tuple[str, list[str]]:
    """Return (attrs without class=, class tokens)."""
    classes: list[str] = []

    def take(m: re.Match[str]) -> str:
        classes.extend(m.group(1).split())
        return ""

    attrs = re.sub(r'\sclass="([^"]*)"', take, attrs or "", count=1)
    if not classes:
        attrs = re.sub(r"\sclass='([^']*)'", take, attrs or "", count=1)
    return attrs, classes


def _table_col_count(body: str) -> int:
    """Count columns from the first header row, else the first body row."""
    m = re.search(r"<thead\b[^>]*>.*?<tr\b[^>]*>(.*?)</tr>", body, re.I | re.S)
    if not m:
        m = re.search(r"<tr\b[^>]*>(.*?)</tr>", body, re.I | re.S)
    if not m:
        return 0
    return len(re.findall(r"<t[hd]\b", m.group(1), re.I))


def _decorate_prose_table(attrs: str, body: str) -> tuple[str, list[str]]:
    """Add prose-table + stub row headers; return (table html, wrapper classes)."""
    attrs, classes = _table_class_attr(attrs)
    wrapper: list[str] = []
    kept: list[str] = []
    for c in classes:
        if c in _TABLE_WRAPPER_CLASSES:
            wrapper.append(c)
        elif c not in kept:
            kept.append(c)
    if "prose-table" not in kept:
        kept.insert(0, "prose-table")

    # First body cell is the stub (row label): promote to th[scope=row]
    # so screen readers and sticky-column CSS share one target. Skip rows
    # that already start with th, or whose first cell spans columns.
    if re.search(r"<thead\b", body, re.I):

        def tbody_repl(m: re.Match[str]) -> str:
            tag_attrs, inner = m.group(1) or "", m.group(2)

            def row_stub(rm: re.Match[str]) -> str:
                pre, cell_attrs, cell_body = rm.group(1), rm.group(2) or "", rm.group(3)
                if re.search(r"\bcolspan\s*=", cell_attrs, re.I):
                    return rm.group(0)
                return f'{pre}<th scope="row"{cell_attrs}>{cell_body}</th>'

            inner = re.sub(
                r"(<tr[^>]*>\s*)<td([^>]*)>(.*?)</td>",
                row_stub,
                inner,
                flags=re.DOTALL | re.I,
            )
            return f"<tbody{tag_attrs}>{inner}</tbody>"

        body = re.sub(
            r"<tbody([^>]*)>(.*?)</tbody>",
            tbody_repl,
            body,
            flags=re.DOTALL | re.I,
        )

    class_attr = f' class="{" ".join(kept)}"'
    return f"<table{attrs}{class_attr}>{body}</table>", wrapper


def wrap_tables(html: str) -> str:
    """Wrap prose tables in .scroll-x; leave Pygments highlighttable alone.

    Adds `.prose-table`, promotes the stub column to `th[scope=row]`, and
    lifts wrapper-tier classes (`plate`, `fullwidth`) onto the scroll bay.
    Tables with ≥ WIDE_TABLE_COLS columns auto-open the listing bay
    unless the author already chose fullwidth.
    """
    out: list[str] = []
    last = 0
    for m in TABLE_RE.finditer(html):
        out.append(html[last : m.start()])
        attrs, body = m.group(1) or "", m.group(2)
        full = m.group(0)
        # CodeHilite plates are tables too — never the listing bay.
        if re.search(r"\bhighlighttable\b", attrs):
            out.append(full)
            last = m.end()
            continue
        # Already wrapped (hand-authored or a prior pass).
        before = html[max(0, m.start() - 96) : m.start()]
        if re.search(r'class="[^"]*\bscroll-x\b[^"]*"\s*>\s*$', before):
            out.append(full)
            last = m.end()
            continue
        table, wrapper_extra = _decorate_prose_table(attrs, body)
        if (
            "plate" not in wrapper_extra
            and "fullwidth" not in wrapper_extra
            and _table_col_count(body) >= WIDE_TABLE_COLS
        ):
            wrapper_extra.append("plate")
        wrap_class = " ".join(["scroll-x", *wrapper_extra])
        out.append(f'<div class="{wrap_class}">{table}</div>')
        last = m.end()
    out.append(html[last:])
    return "".join(out)


SUP_REF = re.compile(
    r'<sup id="fnref:(?P<key>[^":]+)(?::\d+)?"[^>]*>.*?</sup>', re.DOTALL
)
FOOTNOTE_LI = re.compile(r'<li id="fn:(?P<key>[^"]+)">(?P<body>.*?)</li>', re.DOTALL)
BACKREF = re.compile(r'\s*<a class="footnote-backref".*?</a>', re.DOTALL)
BLOCK_IN_NOTE = re.compile(r"<(?:table|ul|ol|pre|blockquote|figure|h[1-6])\b")


def _note_body(fragment: str) -> str:
    fragment = BACKREF.sub("", fragment)
    return re.sub(r"<p>(.*?)</p>", r"\1", fragment, flags=re.DOTALL).strip()


def make_sidenotes(html: str) -> str:
    m = re.search(r'<div class="footnote">(.*?)</div>', html, re.DOTALL)
    if not m or "<div" in m.group(1):
        return html
    notes = {
        mm.group("key"): _note_body(mm.group("body"))
        for mm in FOOTNOTE_LI.finditer(m.group(1))
    }
    section = m.group(0)

    # Citation order (not set) so the endnote list numbers match the
    # sidenote counter when the margin collapses to a bottom list.
    used: list[str] = []

    def repl(mm: re.Match) -> str:
        key = mm.group("key")
        if key not in notes or key in used or BLOCK_IN_NOTE.search(notes[key]):
            return mm.group(0)
        used.append(key)
        n = len(used)
        # Marker links to the endnote id. Wide viewports show the same
        # text in the margin (.sidenote); narrow jumps to .bibliography.
        return (
            f'<a class="sidenote-number" href="#fn:{key}" aria-label="Note {n}"></a>'
            f'<span class="sidenote">{notes[key]}</span>'
        )

    html = SUP_REF.sub(repl, html)
    used_set = set(used)
    # All notes land in the end list (ids live here for #fn: links).
    # Cited ones also ride the margin; CSS hides those <li>s when wide.
    ordered = used + [k for k in notes if k not in used_set]
    rest = "".join(
        f'<li id="fn:{k}"{" data-margin" if k in used_set else ""}>{notes[k]}</li>'
        for k in ordered
    )
    # When every note is also a margin sidenote, mark the section so wide
    # CSS can display:none it without relying on :has() (Safari left an
    # empty bordered box — a second hairline above Comments).
    margin_only = bool(ordered) and all(k in used_set for k in ordered)
    cls = "bibliography bibliography--margin-only" if margin_only else "bibliography"
    html = html.replace(
        section,
        f'<section class="{cls}"><ol>{rest}</ol></section>' if rest else "",
    )
    return html


def figure_images(html: str) -> str:
    img_only = r"((?:<a\b[^>]*>)?\s*<img\b[^>]*>\s*(?:</a>)?)"

    html = re.sub(
        rf"(<figure\b[^>]*>)\s*<p>{img_only}</p>",
        lambda m: f"{m.group(1)}{m.group(2).strip()}",
        html,
    )

    def promote(m: re.Match) -> str:
        if "avatar" in m.group(1):
            return m.group(0)
        return f"<figure>{m.group(1).strip()}</figure>"

    html = re.sub(rf"<p>{img_only}</p>", promote, html)

    return re.sub(
        rf"(<figure\b[^>]*>)\s*<figure>{img_only}</figure>",
        lambda m: f"{m.group(1)}{m.group(2).strip()}",
        html,
    )


MERMAID_FENCE_RE = re.compile(
    r"^```mermaid\s*\n(.*?)^```\s*$", re.MULTILINE | re.DOTALL
)
MATH_RE = re.compile(r"\$\$.*?\$\$|\$[^$\n]+\$|\\\(.*?\\\)|\\\[.*?\\\]", re.DOTALL)
# After Markdown: <code>:::python print(1)</code> → Pygments spans, same
# token classes as CodeHilite blocks. Opt-in only — bare `path` chips stay
# plain. Language must be followed by whitespace and the snippet.
INLINE_HILITE_RE = re.compile(
    r"<code>:::([A-Za-z0-9_+-]+)\s+(.+?)</code>",
    re.DOTALL,
)
_INLINE_FORMATTER = HtmlFormatter(nowrap=True)

# Preferred site langs → Pygments names. curl has no lexer; bash covers
# curl/zsh/sh. Other fences (c, mermaid, bibtex, …) pass through unchanged.
LEXER_ALIASES: dict[str, str] = {
    "curl": "bash",
    "zsh": "bash",
    "sh": "bash",
    "shell": "bash",
    "py": "python",
}
# ```curl / ```{.curl .plate} → ```bash / ```{.bash .plate}
FENCE_LANG_RE = re.compile(
    r"^```(\{\.)?([A-Za-z0-9_+-]+)\b",
    re.MULTILINE,
)


def resolve_lexer_name(lang: str) -> str:
    key = lang.lower()
    return LEXER_ALIASES.get(key, key)


def remap_fence_langs(text: str) -> str:
    """Rewrite fence language tags through LEXER_ALIASES before CodeHilite."""

    def repl(m: re.Match) -> str:
        prefix, lang = m.group(1) or "", m.group(2)
        mapped = resolve_lexer_name(lang)
        if mapped == lang:
            return m.group(0)
        return f"```{prefix}{mapped}"

    return FENCE_LANG_RE.sub(repl, text)


def mermaid_to_html(m: re.Match) -> str:
    """Lift mermaid fences to raw HTML so CodeHilite never sees them."""
    body = m.group(1).rstrip("\n")
    return f'\n\n<pre><code class="language-mermaid">{escape(body)}\n</code></pre>\n\n'


def hilite_inline_code(html: str) -> str:
    """Colour `:::lang snippet` code spans with Pygments (nowrap)."""

    def repl(m: re.Match) -> str:
        lang, raw = m.group(1), m.group(2)
        src = html_lib.unescape(raw)
        try:
            lexer = get_lexer_by_name(resolve_lexer_name(lang))
        except ClassNotFound:
            return f"<code>{escape(src)}</code>"
        colored = pygments_highlight(src, lexer, _INLINE_FORMATTER).rstrip("\n")
        return f'<code class="highlight">{colored}</code>'

    return INLINE_HILITE_RE.sub(repl, html)


def render_markdown(pages: list[Page]) -> None:
    md = markdown.Markdown(
        extensions=["extra", "toc", "sane_lists", "smarty", "codehilite"],
        extension_configs={
            "codehilite": {
                "guess_lang": False,
                "linenums": True,
                "css_class": "highlight",
                "noclasses": False,
            }
        },
    )
    stash: list[str] = []

    def protect_math(m: re.Match) -> str:
        stash.append(m.group(0))
        return f"QQMATHSTASH{len(stash) - 1}ZQXMATH"

    for page in pages:
        body, _, _ = page.text.partition("<!-- more -->")
        md.reset()
        source = page.text.replace("<!-- more -->", "")
        protected = remap_fence_langs(source)
        protected = MERMAID_FENCE_RE.sub(mermaid_to_html, protected)
        protected = MATH_RE.sub(protect_math, protected)
        html_out = md.convert(protected)
        html_out = re.sub(
            r"QQMATHSTASH(\d+)ZQXMATH", lambda m: stash[int(m.group(1))], html_out
        )
        stash.clear()
        html_out = hilite_inline_code(html_out)
        page.html = wrap_tables(
            make_sidenotes(figure_images(drop_dead_backrefs(html_out)))
        )
        md.reset()
        excerpt_src = re.sub(r"^#\s+.+$", "", body, count=1, flags=re.MULTILINE)
        excerpt_protected = remap_fence_langs(excerpt_src)
        excerpt_protected = MERMAID_FENCE_RE.sub(mermaid_to_html, excerpt_protected)
        excerpt_protected = MATH_RE.sub(protect_math, excerpt_protected)
        excerpt_html = md.convert(excerpt_protected)
        excerpt_html = re.sub(
            r"QQMATHSTASH(\d+)ZQXMATH", lambda m: stash[int(m.group(1))], excerpt_html
        )
        stash.clear()
        page.excerpt = strip_footnotes(hilite_inline_code(excerpt_html))


def human_date(value: date | None) -> str:
    return value.strftime("%d %B %Y").lstrip("0") if value else ""


def layout(
    page_title: str,
    body: str,
    *,
    url: str,
    description: str = "",
    math: bool = False,
    extra_head: str = "",
) -> str:
    full_title = (
        page_title if page_title == SITE["title"] else f"{page_title} · {SITE['brand']}"
    )
    description = description or SITE["description"]

    def nav_link(label: str, href: str) -> str:
        current = url == href or url.startswith(href)
        aria = ' aria-current="page"' if current else ""
        return f'<a href="{href}"{aria}>{label}</a>'

    nav = "".join(nav_link(label, href) for label, href in NAV)
    social = "".join(
        f'<a class="icon" href="{href}" aria-label="{label}">{load_icon(slug)}</a>'
        for label, href, slug in SOCIAL
    )
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(full_title)}</title>
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f5f1">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131311">
<meta name="description" content="{escape(description, {'"': "&quot;"})}">
<link rel="canonical" href="{SITE["url"]}{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(full_title, {'"': "&quot;"})}">
<meta property="og:description" content="{escape(description, {'"': "&quot;"})}">
<meta property="og:url" content="{SITE["url"]}{url}">
<meta property="og:image" content="{SITE["url"]}/static/images/E1031983-712A-4347-AFF4-D3F293CA39D9_1_201_a.jpeg">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.ico">
<link rel="alternate" type="application/rss+xml" title="{escape(SITE["title"])}" href="/feed.xml">
{FONT_PRELOAD}
<link rel="stylesheet" href="/static/fonts.css">
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="/static/menu.css">
{'<script defer src="/static/fig-core.js"></script>' if "data-fig=" in body else ""}
{'<script defer src="/static/fig.js"></script>' if "fig3d" in body else ""}
{'<script defer src="/static/toc.js"></script>' if 'class="toc"' in body else ""}
{'<script type="module" src="/static/mermaid.js"></script>' if "language-mermaid" in body else ""}
{'<script defer src="/static/youtube-lite.js"></script>' if "data-youtube=" in body else ""}
{'<script defer src="/static/sidenotes.js"></script>' if 'class="sidenote"' in body else ""}
{'<script defer src="/static/fn-nav.js"></script>' if ("bibliography" in body or 'href="#fn:' in body or "fnref:" in body) else ""}
{'<script defer src="/static/gallery.js"></script>' if ('class="gallery"' in body or "plate-reveal" in body) else ""}
{katex_snippet() if math else ""}
{COVERS_AB if "data-cdn-src=" in body else ""}
{extra_head}
</head>
<body>
<header class="site">
<a class="brand" href="/">{SITE["brand"]}</a>
<nav class="menu-inline" aria-label="Main">{nav}</nav>
</header>
<main>
{body}
</main>
<footer class="site">
<p>{social}<a class="handle" href="https://github.com/ofou">@ofou</a></p>
</footer>
<script defer src="/static/footer-aurora.js"></script>
{RELTIME}
</body>
</html>
"""


H_ANCHOR = re.compile(
    r'<h(?P<lvl>[23]) id="(?P<id>[^"]+)"[^>]*>(?P<text>.*?)</h[23]>', re.DOTALL
)


def section_nav(html: str, *, floor: int = 7) -> str:
    heads = [
        (
            int(m.group("lvl")),
            m.group("id"),
            re.sub(r"<[^>]+>", "", m.group("text")).strip(),
        )
        for m in H_ANCHOR.finditer(html)
    ]
    heads = [(l, i, t) for l, i, t in heads if i != "comments"]
    if sum(1 for l, _, _ in heads if l == 2) < floor:
        return ""
    groups: list[tuple[tuple[str, str], list[tuple[str, str]]]] = []
    for lvl, i, t in heads:
        if lvl == 2:
            groups.append(((i, t), []))
        elif groups:
            groups[-1][1].append((i, t))
    rows = []
    for (i, t), subs in groups:
        if subs:
            children = "".join(f'<li><a href="#{s}">{st}</a></li>' for s, st in subs)
            rows.append(
                f'<li><details><summary><a href="#{i}">{t}</a></summary>'
                f"<ul>{children}</ul></details></li>"
            )
        else:
            rows.append(f'<li><a href="#{i}">{t}</a></li>')
    items = "".join(rows)
    return f'<nav class="toc" aria-label="Sections"><ul>{items}</ul></nav>\n'


def place_nav(body: str) -> str:
    if not (nav := section_nav(body)):
        return body
    if m := re.search(r"<h2[\s>]", body):
        return body[: m.start()] + nav + body[m.start() :]
    return body.replace("</h1>", "</h1>\n" + nav, 1) if "</h1>" in body else nav + body


SEP = "\u00a0· "

_FIG_NAME = re.compile(r"^[a-z0-9-]+$")
_THUMB_H = "72"  # matches 4.5rem project-thumb square


def project_thumb(page: Page) -> str:
    """Square thumb from `featured:` — lab component name, or image path."""
    raw = page.meta.get("featured")
    if raw is None or raw is False:
        return ""
    kind = str(raw).strip()
    if not kind or kind.lower() in {"false", "0", "no"}:
        return ""
    low = kind.lower()
    if _FIG_NAME.match(low) and "/" not in kind and "." not in kind:
        # Any `src/static/components/<name>.js` — e.g. featured: wave
        name = escape(low)
        inner = f'<div data-fig="{name}" data-height="{_THUMB_H}" data-preview></div>'
    else:
        src = escape(kind)
        inner = f'<img src="{src}" alt="" loading="lazy">'
    return (
        f'<a class="project-thumb" href="{page.url}" tabindex="-1" aria-hidden="true">'
        f"{inner}</a>"
    )


def article(page: Page, *, comments: bool = False) -> str:
    meta_bits = []
    if page.date and page.kind != "home":
        meta_bits.append(
            f'<time datetime="{page.date.isoformat()}" data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}</time>'
        )
    if (subtitle := page.meta.get("subtitle")) and page.kind != "home":
        meta_bits.append(escape(str(subtitle)))
    meta_bits += [f'<span class="tag">{escape(c)}</span>' for c in page.categories]
    edit = (
        SITE["repo"]
        + "/edit/main/"
        + "/".join(
            quote(s, safe="") for s in page.path.relative_to(ROOT).as_posix().split("/")
        )
    )
    edit_a = (
        f'<a class="edit" href="{escape(edit, {'"': "&quot;"})}" '
        f'target="_blank" rel="noopener">edit</a>'
    )
    # Post info row: date · subtitle · tags, with edit on the same
    # baseline (right). No per-paragraph or footer duplicate.
    if meta_bits:
        head = (
            f'<p class="meta"><span class="meta-bits">{SEP.join(meta_bits)}</span>'
            f"{edit_a}</p>"
        )
    elif page.kind != "home":
        head = f'<p class="meta">{edit_a}</p>'
    else:
        head = ""

    title = (
        "" if re.search(r"<h1[\s>]", page.html) else f"<h1>{escape(page.title)}</h1>\n"
    )
    body = place_nav(title + page.html)
    return f"<article>\n{head}\n{body}\n</article>\n" + (GISCUS if comments else "")


def listing(title: str, intro: str, pages: list[Page], *, dated: bool) -> str:
    def entry(page: Page) -> str:
        line = (
            f'<time datetime="{page.date.isoformat()}" data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}</time>'
            if page.date
            else ""
        )
        sub = page.meta.get("subtitle") or ""
        meta = SEP.join(x for x in [line, escape(str(sub))] if x)

        tags = "".join(f'<span class="tag">{escape(c)}</span>' for c in page.categories)
        stack_raw = page.meta.get("stack") if not dated else None
        stack = ""
        if stack_raw:
            parts = [
                p.strip() for p in re.split(r"\s*·\s*", str(stack_raw)) if p.strip()
            ]
            stack = "".join(f'<span class="stack">{escape(p)}</span>' for p in parts)
        chips = tags + stack

        thumb = "" if dated else project_thumb(page)
        copy = (
            f'<a class="entry" href="{page.url}">{escape(page.title)}</a>'
            f'<p class="meta">{meta}</p>'
            + (f'<p class="meta index-tags">{chips}</p>' if chips else "")
        )
        if thumb:
            return (
                f'<li class="project-row">{thumb}'
                f'<div class="project-copy">{copy}</div></li>'
            )
        return f"<li>{copy}</li>"

    head = f"<h1>{escape(title)}</h1>\n{intro}\n"
    if not dated:
        # Featured rows (those with a thumb) lead; then date order.
        ordered = sorted(
            pages,
            key=lambda p: (
                0
                if p.meta.get("featured") not in (None, False, "", "false", "0", "no")
                else 1,
                -(p.date.toordinal() if p.date else 0),
            ),
        )
        return (
            head
            + '<ul class="index index-projects">\n'
            + "\n".join(entry(p) for p in ordered)
            + "\n</ul>\n"
        )

    out = []
    for year in dict.fromkeys(p.date.year for p in pages):
        rows = "\n".join(entry(p) for p in pages if p.date.year == year)
        out.append(
            f'<h2 class="index-year">{year}</h2>\n<ul class="index">\n{rows}\n</ul>'
        )
    return head + "\n".join(out) + "\n"


def has_math(html: str) -> bool:
    return bool(re.search(r"\$\$.+?\$\$|\$[^$\n]+\$|\\\(|\\\[", html, re.DOTALL))


def write(path: str, content: str) -> None:
    target = OUT / path.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def rss(posts: list[Page]) -> str:
    now = format_datetime(datetime.now(timezone.utc))
    items = []
    for post in posts:
        stamp = format_datetime(
            datetime.combine(post.date, datetime.min.time(), timezone.utc)
        )
        link = SITE["url"] + post.url
        summary = post.meta.get("description") or re.sub(r"<[^>]+>", " ", post.excerpt)
        items.append(
            f"<item><title>{escape(post.title)}</title><link>{link}</link>"
            f"<guid>{link}</guid><pubDate>{stamp}</pubDate>"
            f"<description>{escape(summary)}</description></item>"
        )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<rss version="2.0"><channel>'
        f"<title>{escape(SITE['title'])}</title><link>{SITE['url']}</link>"
        f"<description>{escape(SITE['description'])}</description>"
        f"<language>en</language><lastBuildDate>{now}</lastBuildDate>"
        + "".join(items)
        + "</channel></rss>"
    )


def sitemap(urls: list[str]) -> str:
    today = datetime.now(tz=timezone.utc).date().isoformat()
    body = "".join(
        f"<url><loc>{SITE['url']}{u}</loc><lastmod>{today}</lastmod></url>\n"
        for u in urls
    )
    return f'<?xml version="1.0" encoding="utf-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{body}</urlset>\n'


def month_yr(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        return date.fromisoformat(iso[:10]).strftime("%b %Y")
    except ValueError:
        return iso


def span(start: str | None, end: str | None) -> str:
    s = month_yr(start)
    e = month_yr(end) or "Present"
    return s if s == e else (f"{s} — {e}" if s else e)


def cv_page(cv: dict) -> str:
    b = cv.get("basics", {})

    profiles = " · ".join(
        f'<a href="{escape(p["url"])}">{escape(p.get("network", p["url"]))}</a>'
        for p in b.get("profiles", [])
        if p.get("url")
    )
    loc = b.get("location") or {}
    contact = " · ".join(
        x
        for x in [
            f'<a href="mailto:{escape(b["email"])}">{escape(b["email"])}</a>'
            if b.get("email")
            else "",
            escape(b.get("phone", "")),
            escape(loc.get("city", ""))
            + (f", {escape(loc['region'])}" if loc.get("region") else "")
            if loc
            else "",
            profiles,
        ]
        if x
    )

    def item(role, org_html, when_html, summary, highlights, when_attrs=""):
        hi = "".join(f"<li>{escape(h)}</li>" for h in highlights or [])
        return (
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">{role}</span><span class="cv-when"{when_attrs}>{when_html}</span></div>'
            f'<p class="cv-org">{org_html}</p>'
            + (f'<p class="cv-sum">{escape(summary)}</p>' if summary else "")
            + (f'<ul class="cv-hl">{hi}</ul>' if hi else "")
            + "</div>"
        )

    work = []
    for w in cv.get("work", []):
        org = (
            f'<a href="{escape(w["url"])}">{escape(w["name"])}</a>'
            if w.get("url")
            else escape(w.get("name", ""))
        )
        where = f" · {escape(w['location'])}" if w.get("location") else ""
        live = not w.get("endDate") and w.get("startDate")
        rel_attr = f' data-rel-from="{w["startDate"]}T00:00:00"' if live else ""
        when_html = span(w.get("startDate"), w.get("endDate"))
        work.append(
            item(
                escape(w.get("position", "")),
                f"{org}{where}",
                when_html,
                w.get("summary", ""),
                w.get("highlights", []),
                when_attrs=rel_attr,
            )
        )

    edu = []
    for e in cv.get("education", []):
        inst = (
            f'<a href="{escape(e["url"])}">{escape(e["institution"])}</a>'
            if e.get("url")
            else escape(e.get("institution", ""))
        )
        courses = "".join(f"<li>{escape(c)}</li>" for c in e.get("courses", []))
        score = f" · {escape(e['score'])}" if e.get("score") else ""
        edu.append(
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">{escape(e.get("area", ""))}</span><span class="cv-when">{span(e.get("startDate"), e.get("endDate"))}</span></div>'
            f'<p class="cv-org">{escape(e.get("studyType", ""))} · {inst}{score}</p>'
            + (f'<ul class="cv-hl">{courses}</ul>' if courses else "")
            + "</div>"
        )

    pubs = []
    for i, p in enumerate(cv.get("publications", []), 1):
        link = (
            f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>'
            if p.get("url")
            else escape(p.get("name", ""))
        )
        pubs.append(
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">[{i}] {link}</span><span class="cv-when">{month_yr(p.get("releaseDate"))}</span></div>'
            f'<p class="cv-org">{escape(p.get("publisher", ""))}</p>'
            + (
                f'<p class="cv-sum">{escape(p["summary"])}</p>'
                if p.get("summary")
                else ""
            )
            + "</div>"
        )

    projs = []
    for p in cv.get("projects", []):
        link = (
            f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>'
            if p.get("url")
            else escape(p.get("name", ""))
        )
        chips = "".join(
            f'<span class="chip">{escape(k)}</span>' for k in p.get("keywords", [])
        )
        projs.append(
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">{link}</span><span class="cv-when">{month_yr(p.get("startDate"))}</span></div>'
            + (
                f'<p class="cv-sum">{escape(p["description"])}</p>'
                if p.get("description")
                else ""
            )
            + (f'<p class="cv-chips">{chips}</p>' if chips else "")
            + "</div>"
        )

    recog = []
    for a in cv.get("awards", []):
        recog.append(
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">{escape(a["title"])}</span><span class="cv-when">{month_yr(a.get("date"))}</span></div>'
            + (
                f'<p class="cv-org">{escape(a["awarder"])}</p>'
                if a.get("awarder")
                else ""
            )
            + (
                f'<p class="cv-sum">{escape(a["summary"])}</p>'
                if a.get("summary")
                else ""
            )
            + "</div>"
        )
    for c in cv.get("certificates", []):
        recog.append(
            f'<div class="cv-item">'
            f'<div class="cv-head"><span class="cv-role">{escape(c["name"])}</span><span class="cv-when">{month_yr(c.get("date"))}</span></div>'
            + (
                f'<p class="cv-org">{escape(c["issuer"])}</p>'
                if c.get("issuer")
                else ""
            )
            + "</div>"
        )

    vol = []
    for v in cv.get("volunteer", []):
        org = (
            f'<a href="{escape(v["url"])}">{escape(v["organization"])}</a>'
            if v.get("url")
            else escape(v.get("organization", ""))
        )
        vol.append(
            item(
                escape(v.get("position", "")),
                org,
                span(v.get("startDate"), v.get("endDate")),
                v.get("summary", ""),
                [],
            )
        )

    skills = []
    for g in cv.get("skills", []):
        chips = "".join(
            f'<span class="chip">{escape(k)}</span>' for k in g.get("keywords", [])
        )
        skills.append(
            f'<div class="cv-skill"><span class="cv-skill-name">{escape(g.get("name", ""))}</span><span class="cv-chips">{chips}</span></div>'
        )

    langs = " · ".join(
        f"{escape(l['language'])} ({escape(l['fluency'])})"
        for l in cv.get("languages", [])
    )
    ints = " · ".join(
        escape(i["name"]) + " — " + ", ".join(escape(k) for k in i.get("keywords", []))
        for i in cv.get("interests", [])
    )

    meta = cv.get("meta", {})
    updated = (
        (
            f'<span class="cv-when" data-rel-from="{meta["lastModified"]}">'
            f"Updated {month_yr(meta['lastModified'][:10])}</span>"
        )
        if meta.get("lastModified")
        else ""
    )

    sections = [
        ("Experience", "".join(work)),
        ("Education", "".join(edu)),
        ("Publications", "".join(pubs)),
        ("Projects", "".join(projs)),
    ]
    if recog:
        sections.append(("Recognition", "".join(recog)))
    if vol:
        sections.append(("Volunteer", "".join(vol)))

    body_sections = "".join(
        f'<h2 id="{slugify(t)}">{t}</h2>{c}' for t, c in sections if c
    )

    person = json.dumps(
        {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": b.get("name", ""),
            "jobTitle": b.get("label", ""),
            "email": f"mailto:{b.get('email', '')}",
            "url": b.get("url", SITE["url"]),
            "sameAs": [p.get("url") for p in b.get("profiles", []) if p.get("url")],
            "alumniOf": [
                e.get("institution")
                for e in cv.get("education", [])
                if e.get("institution")
            ],
        },
        ensure_ascii=False,
    )

    copy_js = """
(() => {
  const b = document.getElementById("cv-copy");
  if (!b) return;
  const done = () => {
    const t = b.textContent;
    b.textContent = "Copied \\u2713";
    b.disabled = true;
    setTimeout(() => { b.textContent = t; b.disabled = false; }, 1400);
  };
  b.addEventListener("click", async () => {
    const url = b.dataset.url;
    try { await navigator.clipboard.writeText(url); }
    catch (_) {
      const i = document.createElement("input");
      i.value = url; document.body.append(i); i.select();
      document.execCommand("copy"); i.remove();
    }
    done();
  });
})();
</script>"""

    return f"""<h1>{escape(b.get("name", ""))}</h1>
<p class="cv-label">{escape(b.get("label", ""))}</p>
{f"<p>{escape(b["summary"])}</p>" if b.get("summary") else ""}
<p class="cv-contact">{contact}</p>
<div class="cv-actions">
<button class="cv-btn" id="cv-copy" data-url="{SITE["url"]}/cv/" type="button">Copy URL</button>
<a class="cv-btn" href="/cv.pdf">PDF</a>
<a class="cv-btn" href="/cv.json">JSON</a>
</div>
{f'<p class="meta">{updated}</p>' if updated else ""}
<script type="application/ld+json">{person}</script>
{body_sections}
<h2 id="skills">Skills</h2>
<div class="cv-skills">{"".join(skills)}</div>
<h2 id="languages-interests">Languages &amp; Interests</h2>
<p class="cv-sum">{langs}<br>{ints}</p>
<script>{copy_js}"""


def contact_page() -> str:
    return """
<h1>Contact</h1>
<p class="cv-label">Open to long-term moonshots · selective consulting · saying hi</p>
<div class="cv-actions">
<a class="cv-btn" href="mailto:omar@olivares.cl">Direct email</a>
<a class="cv-btn" href="https://x.com/omarnomad">X</a>
<a class="cv-btn" href="https://www.linkedin.com/in/ofou/">LinkedIn</a>
</div>
<p>The form below composes an email in your own mail client — nothing is stored, tracked, or routed through a server. Prefer plain text? Write to <a href="mailto:omar@olivares.cl">omar@olivares.cl</a> directly.</p>
<form id="contact-form" class="contact-form">
<label class="fig-control"><span>Name</span><input type="text" name="name" required autocomplete="name" placeholder="Ada Lovelace"></label>
<label class="fig-control"><span>Email</span><input type="email" name="email" required autocomplete="email" placeholder="you@example.com"></label>
<label class="fig-control"><span>Subject</span><input type="text" name="subject" placeholder="Hello from the internet"></label>
<label class="fig-control fig-control-col"><span>Message</span><textarea name="body" rows="7" required placeholder="What are you working on?"></textarea></label>
<button class="cv-btn" type="submit">Compose email</button>
</form>
<p class="meta" id="contact-note" style="margin-top:0.8rem">Opens your mail client with everything pre-filled.</p>
<script>
(() => {
  const f = document.getElementById("contact-form");
  f.addEventListener("submit", e => {
    e.preventDefault();
    const d = new FormData(f);
    const subject = encodeURIComponent("[olivares.cl] " + (d.get("subject") || "Hello"));
    const body = encodeURIComponent(d.get("body") + "\n\n— " + d.get("name") + " (" + d.get("email") + ")");
    window.location.href = "mailto:omar@olivares.cl?subject=" + subject + "&body=" + body;
    const n = document.getElementById("contact-note");
    n.textContent = "Your mail client should be open with the message ready to send.";
  });
})();
</script>"""


_ROOT_STATIC = {"cv.json", "cv.pdf", "thesis.pdf"}


def _font_fingerprints() -> dict[str, str]:
    fonts = SRC / "static" / "fonts"
    if not fonts.is_dir():
        return {}
    return {
        p.name: f"{p.stem}.{hashlib.sha256(p.read_bytes()).hexdigest()[:8]}{p.suffix}"
        for p in sorted(fonts.glob("*.woff2"))
    }


FONT_HASHED = _font_fingerprints()

_PRELOAD_FONTS = ("STIXTwoText.woff2", "STIXTwoText-Italic.woff2")

FONT_PRELOAD = "\n".join(
    f'<link rel="preload" href="/static/fonts/{FONT_HASHED.get(name, name)}" '
    f'as="font" type="font/woff2" crossorigin>'
    for name in _PRELOAD_FONTS
)


def fingerprint_fonts() -> int:
    if not FONT_HASHED:
        return 0
    out_fonts = OUT / "static" / "fonts"
    for plain, hashed in FONT_HASHED.items():
        src_file = out_fonts / plain
        if src_file.exists():
            src_file.rename(out_fonts / hashed)
    css = OUT / "static" / "fonts.css"
    if css.exists():
        text = css.read_text(encoding="utf-8")
        for plain, hashed in FONT_HASHED.items():
            text = text.replace(f"/static/fonts/{plain}", f"/static/fonts/{hashed}")
        css.write_text(text, encoding="utf-8")
    return len(FONT_HASHED)


def _ignore_private(_directory: str, names: list[str]) -> list[str]:
    # vendor/ is fetched at build into _site/; never copy a local tree.
    return [
        n
        for n in names
        if n.startswith("_") or n == ".DS_Store" or n == "vendor" or n in _ROOT_STATIC
    ]


def _http_get(url: str, timeout: float = 120) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "olivares.cl-build/1 (vendor fetch)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _read_vendor_lock() -> dict[str, str]:
    lock = VENDOR_CACHE / "versions.lock"
    if not lock.exists():
        return {}
    out: dict[str, str] = {}
    for line in lock.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        out[key.strip()] = val.strip()
    return out


def _write_vendor_lock(versions: dict[str, str]) -> None:
    VENDOR_CACHE.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Resolved by build.py at fetch time. Gitignored; safe to delete.",
        "# Re-resolve with a normal build; reuse with VENDOR_OFFLINE=1.",
    ]
    for key in VENDOR_SPECS:
        lines.append(f"{key}={versions[key]}")
    (VENDOR_CACHE / "versions.lock").write_text(
        "\n".join(lines) + "\n", encoding="utf-8"
    )


def _npm_latest(package: str) -> str:
    url = f"https://registry.npmjs.org/{quote(package, safe='@/')}"
    meta = json.loads(_http_get(url, timeout=60))
    return meta["dist-tags"]["latest"]


def _npm_tarball_url(package: str, version: str) -> str:
    url = f"https://registry.npmjs.org/{quote(package, safe='@/')}/{quote(version)}"
    meta = json.loads(_http_get(url, timeout=60))
    return meta["dist"]["tarball"]


def _cache_key(package: str, version: str) -> str:
    safe = package.lstrip("@").replace("/", "-")
    return f"{safe}-{version}.tgz"


def _ensure_tarball(package: str, version: str) -> Path:
    VENDOR_CACHE.mkdir(parents=True, exist_ok=True)
    path = VENDOR_CACHE / _cache_key(package, version)
    if path.exists() and path.stat().st_size > 0:
        return path
    tarball = _npm_tarball_url(package, version)
    print(f"  download {package}@{version}")
    path.write_bytes(_http_get(tarball, timeout=180))
    return path


def _extract_vendor(tgz: Path, keep, dest: Path) -> int:
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    with tarfile.open(tgz, mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile() or not keep(member.name):
                continue
            # package/dist/foo → foo
            rel = member.name.removeprefix("package/dist/")
            if not rel or rel.endswith("/"):
                continue
            target = dest / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            extracted = tar.extractfile(member)
            if extracted is None:
                continue
            target.write_bytes(extracted.read())
            count += 1
    return count


def _stamp_js_versions() -> None:
    """Rewrite const VER in thin wrappers so ?cdn=1 A/B uses the same build."""
    stamps = {
        OUT / "static" / "mermaid.js": VENDOR_VERSIONS["mermaid"],
    }
    for path, ver in stamps.items():
        text = path.read_text(encoding="utf-8")
        updated, n = re.subn(
            r'const VER = "[^"]*";',
            f'const VER = "{ver}";',
            text,
            count=1,
        )
        if n != 1:
            raise SystemExit(f"could not stamp VER in {path.relative_to(ROOT)}")
        path.write_text(updated, encoding="utf-8")


def ensure_vendors() -> None:
    """Resolve versions, fetch npm tarballs into cache, install under _site/static/vendor/."""
    offline = os.environ.get("VENDOR_OFFLINE", "").strip() in {"1", "true", "yes"}
    locked = _read_vendor_lock()
    versions: dict[str, str] = {}

    for key, spec in VENDOR_SPECS.items():
        pinned = os.environ.get(spec["env"], "").strip()
        if pinned:
            versions[key] = pinned
        elif offline:
            if key not in locked:
                raise SystemExit(
                    f"VENDOR_OFFLINE=1 but {key} missing from {VENDOR_CACHE / 'versions.lock'}"
                )
            versions[key] = locked[key]
        else:
            try:
                versions[key] = _npm_latest(spec["npm"])
            except (
                urllib.error.URLError,
                TimeoutError,
                KeyError,
                json.JSONDecodeError,
            ) as e:
                if key in locked:
                    print(
                        f"  warn: registry miss for {spec['npm']} ({e}); using lock {locked[key]}"
                    )
                    versions[key] = locked[key]
                else:
                    raise SystemExit(f"failed to resolve {spec['npm']}: {e}") from e

    VENDOR_VERSIONS.clear()
    VENDOR_VERSIONS.update(versions)
    _write_vendor_lock(versions)

    vendor_root = OUT / "static" / "vendor"
    vendor_root.mkdir(parents=True, exist_ok=True)
    parts = []
    for key, spec in VENDOR_SPECS.items():
        ver = versions[key]
        tgz = _ensure_tarball(spec["npm"], ver)
        n = _extract_vendor(tgz, spec["keep"], vendor_root / spec["dest"])
        parts.append(f"{key}@{ver} ({n} files)")
    (vendor_root / "VERSIONS").write_text(
        "# Self-hosted vendors for this build. A/B with ?cdn=1 → jsDelivr/esm.sh.\n"
        + "\n".join(f"{k}={versions[k]}" for k in VENDOR_SPECS)
        + "\n",
        encoding="utf-8",
    )
    _stamp_js_versions()
    print("vendors " + ", ".join(parts))


def main() -> None:
    bib = parse_bib((SRC / "references.bib").read_text(encoding="utf-8"))
    home, posts, projects = load_pages(bib)
    render_markdown([home, *posts, *projects])

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "static", OUT / "static", ignore=_ignore_private)
    fingerprint_fonts()
    for name in ("favicon.ico", "robots.txt", "llms.txt"):
        shutil.copy2(SRC / name, OUT / name)
    for name in _ROOT_STATIC:
        shutil.copy2(SRC / "static" / name, OUT / name)

    ensure_vendors()

    write(
        "index.html",
        layout(
            SITE["title"],
            article(home),
            url="/",
            description=SITE["description"],
            math=has_math(home.html),
        ),
    )

    for post in posts:
        write(
            post.url + "index.html",
            layout(
                post.title,
                article(post, comments=True),
                url=post.url,
                description=str(post.meta.get("description") or ""),
                math=has_math(post.html),
            ),
        )
    for project in projects:
        write(
            project.url + "index.html",
            layout(
                project.title,
                article(project),
                url=project.url,
                description=str(project.meta.get("subtitle") or ""),
                math=has_math(project.html),
            ),
        )

    cv = json.loads((SRC / "static" / "cv.json").read_text(encoding="utf-8"))
    cv_body = cv_page(cv)
    cv_body = place_nav(cv_body)
    write(
        "cv/index.html",
        layout("CV", cv_body, url="/cv/", description=cv["basics"]["summary"]),
    )
    write(
        "contact/index.html",
        layout(
            "Contact",
            contact_page(),
            url="/contact/",
            description="Get in touch — email, form, or social.",
        ),
    )

    write(
        "blog/index.html",
        layout(
            "Blog",
            listing("Blog", "", posts, dated=True),
            url="/blog/",
            description="Essays and notes.",
        ),
    )
    write(
        "projects/index.html",
        layout(
            "Projects",
            listing("Projects", "", projects, dated=False),
            url="/projects/",
            description="Things I built.",
        ),
    )

    not_found_nav = "".join(
        f'<li><a class="entry" href="{href}">{label}</a></li>' for label, href in NAV
    )
    write(
        "404.html",
        layout(
            "Not found",
            "<h1>404</h1>\n"
            "<p>That page moved or never existed. Everything that does exist is below.</p>\n"
            f'<ul class="index">{not_found_nav}</ul>\n',
            url="/404.html",
        ),
    )

    feed = rss(posts)
    write("feed.xml", feed)
    write("feed_rss_created.xml", feed)
    write(
        "sitemap.xml",
        sitemap(
            [
                "/",
                "/blog/",
                "/projects/",
                "/cv/",
                "/contact/",
                *[p.url for p in posts],
                *[p.url for p in projects],
            ]
        ),
    )

    print(
        f"built {len(posts)} posts, {len(projects)} projects → {OUT.relative_to(ROOT)}/"
    )


def _src_mtime() -> dict[Path, float]:
    return {p: p.stat().st_mtime for p in SRC.rglob("*") if p.is_file()}


def serve() -> None:
    import threading
    import time
    from functools import partial
    from http.server import HTTPServer, SimpleHTTPRequestHandler

    class DevHandler(SimpleHTTPRequestHandler):
        def end_headers(self):
            # Match production intent: allow conditional caching via ETag
            # (SimpleHTTPRequestHandler already emits Last-Modified/ETag).
            # no-cache = revalidate; not no-store (which disabled 304s).
            self.send_header("Cache-Control", "no-cache")
            super().end_headers()

        def send_error(self, code, message=None, explain=None):

            if code == 404:
                page = OUT / "404.html"
                if page.exists():
                    body = page.read_bytes()
                    self.send_response(404)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    if self.command != "HEAD":
                        self.wfile.write(body)
                    return
            super().send_error(code, message, explain)

    port = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 8000
    httpd = HTTPServer(("", port), partial(DevHandler, directory=str(OUT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"serving http://localhost:{port}  (watching src/)", flush=True)
    stamp = _src_mtime()
    try:
        while True:
            time.sleep(0.4)
            now = _src_mtime()
            if now != stamp:
                stamp = now
                print("rebuilding…")
                try:
                    main()
                except SystemExit as e:
                    print(e)
                except Exception as e:  # noqa: BLE001 — rebuild loop must keep serving
                    print(f"build failed: {e}")
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        serve()
