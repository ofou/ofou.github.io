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

NAV = [("Blog", "/blog/"), ("Projects", "/projects/"), ("CV", "/static/cv.pdf")]

SOCIAL = [
    ("GitHub", "https://github.com/ofou"),
    ("X", "https://x.com/omarnomad"),
    ("LinkedIn", "https://www.linkedin.com/in/ofou/"),
    ("YouTube", "https://www.youtube.com/@omarnomad"),
    ("Email", "mailto:omar@olivares.cl"),
    ("RSS", "/feed.xml"),
]

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
    social = " · ".join(f'<a href="{href}">{label}</a>' for label, href in SOCIAL)
    analytics = f"""<script async src="https://www.googletagmanager.com/gtag/js?id={SITE['analytics']}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments)}}gtag('js',new Date());gtag('config','{SITE['analytics']}')</script>"""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(full_title)}</title>
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
{KATEX if math else ""}
</head>
<body>
<header class="site">
<a class="brand" href="/">{SITE['brand']}</a>
<nav>{nav}</nav>
</header>
<main>
{body}
</main>
<footer class="site">
<p>{social}</p>
<p class="colophon">Copy, share and modify freely ♡ · <a href="{SITE['repo']}">source</a></p>
</footer>
{analytics}
</body>
</html>
"""


def article(page: Page, *, comments: bool = False) -> str:
    meta_bits = []
    if page.date and page.kind != "home":
        meta_bits.append(f'<time datetime="{page.date.isoformat()}">{human_date(page.date)}</time>')
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
        line = human_date(page.date) if dated else ""
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
    write("sitemap.xml", sitemap(["/", "/blog/", "/projects/", *[p.url for p in posts], *[p.url for p in projects]]))

    print(f"built {len(posts)} posts, {len(projects)} projects → {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
    if "--serve" in sys.argv:
        from functools import partial
        from http.server import HTTPServer, SimpleHTTPRequestHandler

        print("serving http://localhost:8000")
        HTTPServer(("", 8000), partial(SimpleHTTPRequestHandler, directory=str(OUT))).serve_forever()
