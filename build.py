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

NAV = [("Blog", "/blog/"), ("Projects", "/projects/"), ("CV", "/cv/")]

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
  const f = t => {
    const a = new Date(t), b = new Date();
    let y = b.getFullYear() - a.getFullYear(), o = b.getMonth() - a.getMonth(),
        d = b.getDate() - a.getDate(), h = b.getHours() - a.getHours(),
        m = b.getMinutes() - a.getMinutes(), s = b.getSeconds() - a.getSeconds();
    if (s < 0) { s += 60; m--; }
    if (m < 0) { m += 60; h--; }
    if (h < 0) { h += 24; d--; }
    if (d < 0) { const L = new Date(b.getFullYear(), b.getMonth(), 0).getDate(); d += L; o--; }
    if (o < 0) { o += 12; y--; }
    const z = n => String(n).padStart(2, "0");
    return `${y}Y ${o}M ${d}D ${z(h)}:${z(m)}:${z(s)}`;
  };
  const t = () => document.querySelectorAll("[data-rel-from]").forEach(e => {
    const r = e.querySelector(".rel");
    if (r) r.textContent = " · " + f(e.dataset.relFrom);
  });
  t();
  setInterval(t, 1000);
})();
</script>"""

BG = """<canvas id="bg" aria-hidden="true"></canvas>
<script>
(() => {
  const c = document.getElementById("bg");
  const gl = c.getContext("webgl", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  const V = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const F = `precision mediump float;
uniform vec2 u_res;uniform float u_time,u_scroll,u_energy,u_dpr;
uniform vec3 u_paper,u_ink,u_accent;uniform vec2 u_mouse;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  vec3 col=u_paper;
  vec2 g=vec2(9.0*u_dpr);
  vec2 f=fract(gl_FragCoord.xy/g)-0.5;
  vec2 id=floor(gl_FragCoord.xy/g);
  float d=length(f);
  float n=hash(id);
  float ph=u_time*0.35+n*6.2831+(id.y-u_scroll/(9.0*u_dpr))*0.045;
  float breathe=0.5+0.5*sin(ph);
  float r=(1.05+0.55*breathe)*u_dpr;
  float dotm=smoothstep(r,r-0.9*u_dpr,d);
  float w2=0.5+0.5*sin((id.x-id.y)*0.05+u_time*0.22);
  float strength=(0.05+0.10*w2)*(1.0+u_energy);
  col=mix(col,u_ink,dotm*strength);
  vec2 m=vec2(u_mouse.x,u_res.y-u_mouse.y);
  float md=length(gl_FragCoord.xy-m);
  float lens=smoothstep(150.*u_dpr,0.,md);
  col=mix(col,u_ink,dotm*lens*0.22*(1.0+u_energy));
  col=mix(col,u_accent,dotm*u_energy*0.18);
  gl_FragColor=vec4(col,1.0);
}`;
  window.__bglog = "";
  const sh = (t, s) => {
    const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) window.__bglog += "shader:" + gl.getShaderInfoLog(o);
    return o;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, V));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, F));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { window.__bglog += "link:" + gl.getProgramInfoLog(pr); return; }
  gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = n => gl.getUniformLocation(pr, n);
  const uRes = U("u_res"), uTime = U("u_time"), uScroll = U("u_scroll"),
        uEnergy = U("u_energy"), uDpr = U("u_dpr"), uMouse = U("u_mouse"),
        uPaper = U("u_paper"), uInk = U("u_ink"), uAccent = U("u_accent");
  const hex = x => { x = x.trim(); const n = parseInt(x.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
  const pal = () => {
    const s = getComputedStyle(document.documentElement);
    gl.uniform3fv(uPaper, hex(s.getPropertyValue("--paper")));
    gl.uniform3fv(uInk, hex(s.getPropertyValue("--ink")));
    gl.uniform3fv(uAccent, hex(s.getPropertyValue("--accent")));
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dpr = 1, mx = -9e3, my = -9e3, energy = 0, lastY = scrollY, raf = 0;
  const size = () => {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    gl.viewport(0, 0, c.width, c.height);
  };
  const draw = t => {
    gl.uniform2f(uRes, c.width, c.height);
    gl.uniform1f(uTime, reduced ? 0 : t / 1000);
    gl.uniform1f(uScroll, scrollY * dpr);
    gl.uniform1f(uEnergy, energy);
    gl.uniform1f(uDpr, dpr);
    gl.uniform2f(uMouse, mx * dpr, my * dpr);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const loop = t => { draw(t); if (!document.hidden) raf = requestAnimationFrame(loop); };
  const start = () => { cancelAnimationFrame(raf); if (!reduced) raf = requestAnimationFrame(loop); else draw(0); };
  addEventListener("resize", () => { size(); pal(); draw(reduced ? 0 : performance.now()); });
  addEventListener("pointermove", e => { mx = e.clientX; my = e.clientY; });
  addEventListener("scroll", () => { energy = Math.min(1, energy + Math.abs(scrollY - lastY) / 600); lastY = scrollY; }, { passive: true });
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", pal);
  document.addEventListener("visibilitychange", start);
  size(); pal(); start();
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
    for page in pages:
        body, _, _ = page.text.partition("<!-- more -->")
        md.reset()
        page.html = drop_dead_backrefs(md.convert(page.text.replace("<!-- more -->", "")))
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
<link rel="stylesheet" href="/static/style.css">
<script defer src="/static/fig.js"></script>
{KATEX if math else ""}
</head>
<body>
{BG}
<header class="site">
<a class="brand" href="/">{SITE['brand']}</a>
<nav>{nav}</nav>
</header>
<main>
{body}
</main>
<footer class="site">
<p>{social}<a class="handle" href="https://github.com/ofou">@ofou</a></p>
</footer>
{RELTIME}
</body>
</html>
"""


def article(page: Page, *, comments: bool = False) -> str:
    meta_bits = []
    if page.date and page.kind != "home":
        meta_bits.append(f'<time datetime="{page.date.isoformat()}" data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}<span class="rel"></span></time>')
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
        line = f'<time data-rel-from="{page.date.isoformat()}T00:00:00">{human_date(page.date)}<span class="rel"></span></time>' if dated else ""
        sub = page.meta.get("subtitle") or ""
        meta = " · ".join(x for x in [line, escape(str(sub))] if x)
        blurb = page.excerpt if dated else ""
        items.append(
            f'<li><a class="entry" href="{page.url}">{escape(page.title)}</a>'
            f'{f"<p class=meta>{meta}</p>" if meta else ""}'
            f'{f"<div class=excerpt>{blurb}</div>" if blurb else ""}</li>'
        )
    return f"<h1>{escape(title)}</h1>\n{intro}\n<ul class=\"index\">\n" + "\n".join(items) + "\n</ul>\n"


def has_math(html: str) -> bool:
    return bool(re.search(r"\$\$?|\\\(|\\\[", html))


# ------------------------------------------------------------------------ output


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
            f"<guid isPermaLink=\"true\">{link}</guid><pubDate>{stamp}</pubDate>"
            f"<description>{escape(' '.join(str(summary).split())[:500])}</description>"
            + "".join(f"<category>{escape(c)}</category>" for c in post.categories)
            + "</item>"
        )
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<rss version="2.0">\n<channel>\n'
        f"<title>{escape(SITE['title'])}</title><link>{SITE['url']}/</link>"
        f"<description>{escape(SITE['description'])}</description>"
        f"<language>en</language><lastBuildDate>{now}</lastBuildDate>\n"
        + "\n".join(items)
        + "\n</channel>\n</rss>\n"
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

    work = []
    for w in cv.get("work", []):
        org = f'<a href="{escape(w["url"])}">{escape(w["name"])}</a>' if w.get("url") else escape(w.get("name", ""))
        where = f' · {escape(w["location"])}' if w.get("location") else ""
        hi = "".join(f"<li>{escape(h)}</li>" for h in w.get("highlights", []))
        live = not w.get("endDate") and w.get("startDate")
        rel_attr = f' data-rel-from="{w["startDate"]}T00:00:00"' if live else ""
        rel_slot = '<span class="rel"></span>' if live else ""
        work.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">{escape(w.get("position", ""))}</span><span class="cv-when"{rel_attr}>{span(w.get("startDate"), w.get("endDate"))}{rel_slot}</span></div>
<p class="cv-org">{org}{where}</p>
{f'<p class="cv-sum">{escape(w["summary"])}</p>' if w.get("summary") else ""}
{f'<ul class="cv-hl">{hi}</ul>' if hi else ""}
</div>''')

    edu = []
    for e in cv.get("education", []):
        inst = f'<a href="{escape(e["url"])}">{escape(e["institution"])}</a>' if e.get("url") else escape(e.get("institution", ""))
        courses = "".join(f"<li>{escape(c)}</li>" for c in e.get("courses", []))
        score = f" · {escape(e['score'])}" if e.get("score") else ""
        edu.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">{escape(e.get("area", ""))}</span><span class="cv-when">{span(e.get("startDate"), e.get("endDate"))}</span></div>
<p class="cv-org">{escape(e.get("studyType", ""))} · {inst}{score}</p>
{f'<ul class="cv-hl">{courses}</ul>' if courses else ""}
</div>''')

    pubs = []
    for i, p in enumerate(cv.get("publications", []), 1):
        link = f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>' if p.get("url") else escape(p.get("name", ""))
        pubs.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">[{i}] {link}</span><span class="cv-when">{month_yr(p.get("releaseDate"))}</span></div>
<p class="cv-org">{escape(p.get("publisher", ""))}</p>
{f'<p class="cv-sum">{escape(p["summary"])}</p>' if p.get("summary") else ""}
</div>''')

    projs = []
    for p in cv.get("projects", []):
        link = f'<a href="{escape(p["url"])}">{escape(p["name"])}</a>' if p.get("url") else escape(p.get("name", ""))
        chips = "".join(f'<span class="chip">{escape(k)}</span>' for k in p.get("keywords", []))
        projs.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">{link}</span><span class="cv-when">{month_yr(p.get("startDate"))}</span></div>
{f'<p class="cv-sum">{escape(p["description"])}</p>' if p.get("description") else ""}
{f'<p class="cv-chips">{chips}</p>' if chips else ""}
</div>''')

    recog = []
    for a in cv.get("awards", []):
        recog.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">{escape(a["title"])}</span><span class="cv-when">{month_yr(a.get("date"))}</span></div>
{f'<p class="cv-org">{escape(a["awarder"])}</p>' if a.get("awarder") else ""}
{f'<p class="cv-sum">{escape(a["summary"])}</p>' if a.get("summary") else ""}
</div>''')
    for c in cv.get("certificates", []):
        recog.append(f'''<div class="cv-item">
<div class="cv-head"><span class="cv-role">{escape(c["name"])}</span><span class="cv-when">{month_yr(c.get("date"))}</span></div>
{f'<p class="cv-org">{escape(c["issuer"])}</p>' if c.get("issuer") else ""}
</div>''')

    skills = []
    for g in cv.get("skills", []):
        chips = "".join(f'<span class="chip">{escape(k)}</span>' for k in g.get("keywords", []))
        skills.append(f'<div class="cv-skill"><span class="cv-skill-name">{escape(g.get("name", ""))}</span><span class="cv-chips">{chips}</span></div>')

    langs = " · ".join(f'{escape(l["language"])} ({escape(l["fluency"])})' for l in cv.get("languages", []))
    ints = " · ".join(escape(i["name"]) for i in cv.get("interests", []))

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
<a class="cv-btn" href="/static/cv.pdf">PDF</a>
<a class="cv-btn" href="/cv.json">JSON</a>
</div>
<h1>{escape(b.get("name", ""))}</h1>
<p class="cv-label">{escape(b.get("label", ""))}</p>
{f'<p>{escape(b["summary"])}</p>' if b.get("summary") else ""}
<p class="cv-contact">{contact}</p>
<h2>Experience</h2>
{''.join(work)}
<h2>Education</h2>
{''.join(edu)}
<h2>Publications</h2>
{''.join(pubs)}
<h2>Projects</h2>
{''.join(projs)}
{'<h2>Recognition</h2>' + ''.join(recog) if recog else ''}
<h2>Skills</h2>
<div class="cv-skills">{''.join(skills)}</div>
<h2>Languages &amp; Interests</h2>
<p class="cv-sum">{langs}<br>{ints}</p>
<script>{copy_js}"""


def main() -> None:
    bib = parse_bib((SRC / "references.bib").read_text(encoding="utf-8"))
    home, posts, projects = load_pages(bib)
    render_markdown([home, *posts, *projects])

    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "static", OUT / "static")
    for name in ("favicon.ico", "robots.txt", "references.bib"):
        shutil.copy2(SRC / name, OUT / name)

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
    write("sitemap.xml", sitemap(["/", "/blog/", "/projects/", "/cv/", *[p.url for p in posts], *[p.url for p in projects]]))

    print(f"built {len(posts)} posts, {len(projects)} projects → {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        from functools import partial
        from http.server import HTTPServer, SimpleHTTPRequestHandler

        print("serving http://localhost:8000")
        HTTPServer(("", 8000), partial(SimpleHTTPRequestHandler, directory=str(OUT))).serve_forever()
