#!/usr/bin/env python3
"""Static site generator for olivares.cl.

One file, two dependencies (markdown, pyyaml). Reads src/, writes _site/.

    python build.py            # build
    python build.py --serve    # build + serve on :8000
"""

from __future__ import annotations

import re
import shutil
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from xml.sax.saxutils import escape

import markdown
import json
import yaml

ROOT = Path(__file__).parent
SRC = ROOT / "src"
OUT = ROOT / "_site"

SITE = {
    "title": "Omar Olivares Urrutia",
    "brand": "Omar Olivares",
    "url": "https://olivares.cl",
    "author": "Omar Olivares Urrutia",
    "email": "omar@olivares.cl",
    "repo": "https://github.com/ofou/ofou.github.io",
    "analytics": "G-6MR2H8YX5K",
    "description": (
        "Software engineer specializing in artificial intelligence and machine "
        "learning, with interests in interpretability, alignment, and agentic systems."
    ),
}

NAV = [("Blog", "/blog/"), ("Projects", "/projects/"), ("CV", "/cv/"), ("Contact", "/contact/")]

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
    return p.read_text(encoding="utf-8").replace('fill="#000000"', 'fill="currentColor"')


GISCUS = """<section class="comments">
<h2 id="comments">Comments</h2>
<script src="https://giscus.app/client.js" data-repo="ofou/ofou.github.io"
  data-repo-id="MDEwOlJlcG9zaXRvcnkzNzQxNDAxMDM=" data-category="General"
  data-category-id="DIC_kwDOFkzsx84CtY2c" data-mapping="pathname" data-strict="0"
  data-reactions-enabled="1" data-emit-metadata="0" data-input-position="bottom"
  data-theme="preferred_color_scheme" data-lang="en" crossorigin="anonymous" async>
</script>
</section>"""

KATEX = """<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css" crossorigin="anonymous">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js" crossorigin="anonymous"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js" crossorigin="anonymous"
  onload="renderMathInElement(document.body,{delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\(',right:'\\\\)',display:false},{left:'\\\\[',right:'\\\\]',display:true}]})"></script>"""

RELTIME = """<script>
(() => {
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const rel = ms => {
    const days = Math.round((Date.now() - ms) / 86400000);
    if (Math.abs(days) < 45) return fmt.format(-days, "day");
    const months = Math.round(days / 30.44);
    if (Math.abs(months) < 18) return fmt.format(-months, "month");
    return fmt.format(-Math.round(days / 365.25), "year");
  };
  document.querySelectorAll("[data-rel-from]").forEach(e => {
    const t = Date.parse(e.dataset.relFrom);
    if (!Number.isNaN(t)) e.title = rel(t);
  });
})();
</script>"""




# --------------------------------------------------------------------------- bib

COMBINING = {'"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", "c": "\u0327"}


def detex(value: str) -> str:
    """Unwrap the TeX accents and braces that appear in references.bib."""
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
        (entry[k] for k in ("journal", "publisher", "booktitle", "school", "organization") if entry.get(k)),
        None,
    )
    if venue:
        parts.append(venue.rstrip(".") + ".")
    if year := entry.get("year"):
        parts.append(f"({year})")
    return " ".join(parts)


CITATION = re.compile(r"\[@([\w:./+-]+)\]")


def apply_citations(text: str, bib: dict[str, dict[str, str]]) -> str:
    """Turn `[@key]` into footnote references and append a chronological bibliography.

    Keys inside HTML comments still register, which is how the book grids link to
    their `#fn:<key>` anchors.
    """
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
    cited.sort(key=lambda k: (int(bib[k].get("year") or 0), bib[k].get("author", ""), bib[k].get("title", "")))
    return text + "\n\n" + "\n".join(f"[^{k}]: {format_reference(bib[k])}" for k in cited) + "\n"


# ------------------------------------------------------------------------- pages


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
    if raw.startswith("---"):
        _, front, body = raw.split("---", 2)
        return yaml.safe_load(front) or {}, body.lstrip("\n")
    return {}, raw


def as_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%Y-%m", "%Y"):
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
    return None


def first_heading(text: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.M)
    return m.group(1).strip() if m else ""


def load_pages(bib: dict) -> tuple[Page, list[Page], list[Page]]:
    def build(path: Path, url_for, kind: str) -> Page:
        meta, text = read_page(path)
        title = str(meta.get("title") or first_heading(text) or path.stem.replace("-", " ").title())
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
    projects.sort(key=lambda p: (p.date or date.min), reverse=True)
    return home, posts, projects


def drop_dead_backrefs(html: str) -> str:
    """Citations written inside HTML comments have no inline anchor to jump back to."""
    live = set(re.findall(r'id="fnref:([^"]+)"', html))
    return re.sub(
        r'\s*<a class="footnote-backref" href="#fnref:([^"]+)".*?</a>',
        lambda m: m.group(0) if m.group(1) in live else "",
        html,
    )


def render_markdown(pages: list[Page]) -> None:
    md = markdown.Markdown(extensions=["extra", "toc", "sane_lists", "smarty"])
    stash: list[str] = []

    def protect(m: re.Match) -> str:
        stash.append(m.group(0))
        return f"QQMATHSTASH{len(stash) - 1}ZQXMATH"

    math_re = re.compile(r"\$\$.*?\$\$|\$[^$\n]+\$|\\\(|\\\[", re.S)

    for page in pages:
        body, _, _ = page.text.partition("<!-- more -->")
        md.reset()
        protected = math_re.sub(protect, page.text.replace("<!-- more -->", ""))
        html_out = md.convert(protected)
        html_out = re.sub(r"QQMATHSTASH(\d+)ZQXMATH", lambda m: stash[int(m.group(1))], html_out)
        stash.clear()
        page.html = drop_dead_backrefs(html_out)
        md.reset()
        page.excerpt = md.convert(re.sub(r"^#\s+.+$", "", body, count=1, flags=re.MULTILINE))


# ------------------------------------------------------------------------ layout


def human_date(value: date | None) -> str:
    return value.strftime("%d %B %Y").lstrip("0") if value else ""


def layout(page_title: str, body: str, *, url: str, description: str = "", math: bool = False) -> str:
    full_title = page_title if page_title == SITE["title"] else f"{page_title} · {SITE['brand']}"
    description = description or SITE["description"]
    nav = "".join(f'<a href="{href}">{label}</a>' for label, href in NAV)
    social = "".join(
        f'<a class="icon" href="{href}" aria-label="{label}">{load_icon(slug)}</a>'
        for label, href, slug in SOCIAL
    )
    social = "".join(
        f'<a class="icon" href="{href}" aria-label="{label}">'
        + (
            f'<img src="/static/icons/{slug}.png" alt="" width="14" height="14">'
            if (SRC / "static" / "icons" / f"{slug}.png").exists()
            else load_icon(slug)
        )
        + "</a>"
        for label, href, slug in SOCIAL
    )
    analytics = f"""<script async src="https://www.googletagmanager.com/gtag/js?id={SITE['analytics']}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{SITE['analytics']}')</script>"""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(full_title)}</title>
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f6f5f1">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#131311">
<meta name="description" content="{escape(description, {'"': "&quot;"})}">
<link rel="canonical" href="{SITE['url']}{url}">
<meta property="og:type" content="website">
<meta property="og:title" content="{escape(full_title, {'"': "&quot;"})}">
<meta property="og:description" content="{escape(description, {'"': "&quot;"})}">
<meta property="og:url" content="{SITE['url']}{url}">
<meta property="og:image" content="{SITE['url']}/static/images/profile.png">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.ico">
<link rel="alternate" type="application/rss+xml" title="{escape(SITE['title'])}" href="/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300..700&family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&display=swap">
<link rel="stylesheet" href="/static/style.css">
<script defer src="/static/fig-core.js"></script>
<script defer src="/static/menu.js"></script>
{KATEX if math else ""}
</head>
<body>
<nav id="site-menu" class="menu-panel" aria-label="Main">{nav}</nav>
<header class="site">
<a class="brand" href="/">{SITE['brand']}</a>
<button class="menu-btn" id="menu-btn" aria-expanded="false" aria-controls="site-menu">Menu</button>
</header>
<main>
{body}
</main>
<footer class="site">
<p>{social}<a class="handle" href="https://github.com/ofou">@ofou</a></p>
</footer>
{RELTIME}
{analytics}
</body>
</html>
"""


def article(page: Page, *, comments: bool = False) -> str:
    meta_bits = []
    if page.date and page.kind != "home":
        meta_bits.append(f'<time datetime="{page.date.isoformat()}" data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}</time>')
    if (subtitle := page.meta.get("subtitle")) and page.kind != "home":
        meta_bits.append(escape(str(subtitle)))
    meta_bits += [f'<span class="tag">{escape(c)}</span>' for c in page.categories]
    edit = f"{SITE['repo']}/blob/main/{page.path.relative_to(ROOT).as_posix()}"
    head = f'<p class="meta">{" · ".join(meta_bits)}</p>' if meta_bits else ""
    return (
        f"<article>\n{head}\n{page.html}\n"
        f'<p class="meta edit"><a href="{edit}">suggest an edit</a></p>\n</article>\n'
        + (GISCUS if comments else "")
    )


def listing(title: str, intro: str, pages: list[Page], *, dated: bool) -> str:
    items = []
    for page in pages:
        line = f'<time datetime="{page.date.isoformat()}" data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}</time>' if dated else ""
        sub = page.meta.get("subtitle") or ""
        meta = " · ".join(x for x in [line, escape(str(sub))] if x)
        blurb = page.excerpt if dated else ""
        items.append(
            f'<li><a class="entry" href="{page.url}">{escape(page.title)}</a>'
            f'<p class="meta">{meta}</p>'
            f'<div class="excerpt">{blurb}</div></li>'
        )
    return f"<h1>{escape(title)}</h1>\n{intro}\n<ul class=\"index\">\n" + "\n".join(items) + "\n</ul>\n"


def has_math(html: str) -> bool:
    return bool(re.search(r"\$\$.+?\$\$|\$[^$\n]+\$|\\\(|\\\[", html, re.S))


def write(path: str, content: str) -> None:
    target = OUT / path.lstrip("/")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def rss(posts: list[Page]) -> str:
    now = format_datetime(datetime.now(timezone.utc))
    items = []
    for post in posts:
        stamp = format_datetime(datetime.combine(post.date, datetime.min.time(), timezone.utc))
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
    today = date.today().isoformat()
    body = "".join(f"<url><loc>{SITE['url']}{u}</loc><lastmod>{today}</lastmod></url>\n" for u in urls)
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
        x for x in [
            f'<a href="mailto:{escape(b["email"])}">{escape(b["email"])}</a>' if b.get("email") else "",
            escape(b.get("phone", "")),
            escape(loc.get("city", "")) + (f", {escape(loc['region'])}" if loc.get("region") else "") if loc else "",
            profiles,
        ] if x
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
        org = f'<a href="{escape(w["url"])}">{escape(w["name"])}</a>' if w.get("url") else escape(w.get("name", ""))
        where = f' · {escape(w["location"])}' if w.get("location") else ""
        live = not w.get("endDate") and w.get("startDate")
        rel_attr = f' data-rel-from="{w["startDate"]}T00:00:00"' if live else ""
        when_html = span(w.get("startDate"), w.get("endDate"))
        work.append(item(
            escape(w.get("position", "")), f"{org}{where}",
            when_html,
            w.get("summary", ""), w.get("highlights", []),
            when_attrs=rel_attr,
        ))

    edu = []
    for e in cv.get("education", []):
        inst = f'<a href="{escape(e["url"])}">{escape(e["institution"])}</a>' if e.get("url") else escape(e.get("institution", ""))
        courses = "".join(f"<li>{escape(c)}</li>" for c in e.get("courses", []))
        score = f" · {escape(e['score'])}" if e.get("score") else ""
        edu.append(f'<div class="cv-item">'
                   f'<div class="cv-head"><span class="cv-role">{escape(e.get("area", ""))}</span><span class="cv-when">{span(e.get("startDate"), e.get("endDate"))}</span></div>'
                   f'<p class="cv-org">{escape(e.get("studyType", ""))} · {inst}{score}</p>'
                   + (f'<ul class="cv-hl">{courses}</ul>' if courses else "")
                   + "</div>")

    pubs = []
    for i, p in enumerate(cv.get("publications", []), 1):
        link = f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>' if p.get("url") else escape(p.get("name", ""))
        pubs.append(f'<div class="cv-item">'
                    f'<div class="cv-head"><span class="cv-role">[{i}] {link}</span><span class="cv-when">{month_yr(p.get("releaseDate"))}</span></div>'
                    f'<p class="cv-org">{escape(p.get("publisher", ""))}</p>'
                    + (f'<p class="cv-sum">{escape(p["summary"])}</p>' if p.get("summary") else "")
                    + "</div>")

    projs = []
    for p in cv.get("projects", []):
        link = f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>' if p.get("url") else escape(p.get("name", ""))
        chips = "".join(f'<span class="chip">{escape(k)}</span>' for k in p.get("keywords", []))
        projs.append(f'<div class="cv-item">'
                     f'<div class="cv-head"><span class="cv-role">{link}</span><span class="cv-when">{month_yr(p.get("startDate"))}</span></div>'
                     + (f'<p class="cv-sum">{escape(p["description"])}</p>' if p.get("description") else "")
                     + (f'<p class="cv-chips">{chips}</p>' if chips else "")
                     + "</div>")

    recog = []
    for a in cv.get("awards", []):
        recog.append(f'<div class="cv-item">'
                     f'<div class="cv-head"><span class="cv-role">{escape(a["title"])}</span><span class="cv-when">{month_yr(a.get("date"))}</span></div>'
                     + (f'<p class="cv-org">{escape(a["awarder"])}</p>' if a.get("awarder") else "")
                     + (f'<p class="cv-sum">{escape(a["summary"])}</p>' if a.get("summary") else "")
                     + "</div>")
    for c in cv.get("certificates", []):
        recog.append(f'<div class="cv-item">'
                     f'<div class="cv-head"><span class="cv-role">{escape(c["name"])}</span><span class="cv-when">{month_yr(c.get("date"))}</span></div>'
                     + (f'<p class="cv-org">{escape(c["issuer"])}</p>' if c.get("issuer") else "")
                     + "</div>")

    vol = []
    for v in cv.get("volunteer", []):
        org = f'<a href="{escape(v["url"])}">{escape(v["organization"])}</a>' if v.get("url") else escape(v.get("organization", ""))
        vol.append(item(
            escape(v.get("position", "")), org,
            span(v.get("startDate"), v.get("endDate")), v.get("summary", ""), [],
        ))

    skills = []
    for g in cv.get("skills", []):
        chips = "".join(f'<span class="chip">{escape(k)}</span>' for k in g.get("keywords", []))
        skills.append(f'<div class="cv-skill"><span class="cv-skill-name">{escape(g.get("name", ""))}</span><span class="cv-chips">{chips}</span></div>')

    langs = " · ".join(f'{escape(l["language"])} ({escape(l["fluency"])})' for l in cv.get("languages", []))
    ints = " · ".join(
        escape(i["name"]) + " — " + ", ".join(escape(k) for k in i.get("keywords", []))
        for i in cv.get("interests", [])
    )

    meta = cv.get("meta", {})
    updated = (f'<span class="cv-when" data-rel-from="{meta["lastModified"]}">'
               f'Updated {month_yr(meta["lastModified"][:10])}</span>') if meta.get("lastModified") else ""

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

    body_sections = "".join(f"<h2>{t}</h2>{c}" for t, c in sections if c)

    person = json.dumps({
        "@context": "https://schema.org",
        "@type": "Person",
        "name": b.get("name", ""),
        "jobTitle": b.get("label", ""),
        "email": f"mailto:{b.get('email', '')}",
        "url": b.get("url", SITE["url"]),
        "sameAs": [p.get("url") for p in b.get("profiles", []) if p.get("url")],
        "alumniOf": [e.get("institution") for e in cv.get("education", []) if e.get("institution")],
    }, ensure_ascii=False)

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

    return f"""<div class="cv-actions">
<button class="cv-btn" id="cv-copy" data-url="{SITE['url']}/cv/" type="button">Copy URL</button>
<a class="cv-btn" href="/cv.pdf">PDF</a>
<a class="cv-btn" href="/cv.json">JSON</a>
{updated}
</div>
<h1>{escape(b.get("name", ""))}</h1>
<p class="cv-label">{escape(b.get("label", ""))}</p>
{f'<p>{escape(b["summary"])}</p>' if b.get("summary") else ""}
<p class="cv-contact">{contact}</p>
<script type="application/ld+json">{person}</script>
{body_sections}
<h2>Skills</h2>
<div class="cv-skills">{''.join(skills)}</div>
<h2>Languages &amp; Interests</h2>
<p class="cv-sum">{langs}<br>{ints}</p>
<script>{copy_js}"""



def contact_page() -> str:
    return """
<div class="cv-actions">
<a class="cv-btn" href="mailto:omar@olivares.cl">Direct email</a>
<a class="cv-btn" href="https://x.com/omarnomad">X</a>
<a class="cv-btn" href="https://www.linkedin.com/in/ofou/">LinkedIn</a>
</div>
<h1>Contact</h1>
<p class="cv-label">Open to long-term moonshots · selective consulting · saying hi</p>
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


def main() -> None:
    bib = parse_bib((SRC / "references.bib").read_text(encoding="utf-8"))
    home, posts, projects = load_pages(bib)
    render_markdown([home, *posts, *projects])

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "static", OUT / "static")
    for name in ("favicon.ico", "robots.txt", "references.bib", "static/cv.json", "static/cv.pdf", "static/thesis.pdf"):
        shutil.copy2(SRC / name, OUT / Path(name).name)

    write("index.html", layout(SITE["title"], article(home), url="/", description=SITE["description"], math=has_math(home.html)))

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
    write("cv/index.html", layout("CV", cv_page(cv), url="/cv/", description=cv["basics"]["summary"]))
    write("contact/index.html", layout("Contact", contact_page(), url="/contact/", description="Get in touch — email, form, or social."))

    write(
        "blog/index.html",
        layout("Blog", listing("Blog", "", posts, dated=True), url="/blog/", description="Essays and notes."),
    )
    write(
        "projects/index.html",
        layout("Projects", listing("Projects", "", projects, dated=False), url="/projects/", description="Things I built."),
    )
    write(
        "404.html",
        layout("Not found", "<h1>404</h1>\n<p>That page moved or never existed. <a href=\"/\">Head home</a>.</p>", url="/404.html"),
    )

    feed = rss(posts)
    write("feed.xml", feed)
    write("feed_rss_created.xml", feed)  # legacy subscriber path
    write("sitemap.xml", sitemap(["/", "/blog/", "/projects/", "/cv/", "/contact/", *[p.url for p in posts], *[p.url for p in projects]]))

    print(f"built {len(posts)} posts, {len(projects)} projects → {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        from functools import partial
        from http.server import HTTPServer, SimpleHTTPRequestHandler

        class DevHandler(SimpleHTTPRequestHandler):
            def end_headers(self):
                self.send_header("Cache-Control", "no-store, must-revalidate")
                super().end_headers()

        print("serving http://localhost:8000")
        HTTPServer(("", 8000), DevHandler).serve_forever()
