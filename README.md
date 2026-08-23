# olivares.cl

Personal site. Markdown in `src/`, one build script, no framework.

```sh
pip install -r requirements.txt
python build.py            # → _site/
python build.py --serve    # → http://localhost:8000, rebuilds on change
```

## Layout

| Path                 | What                                                          |
| -------------------- | ------------------------------------------------------------- |
| `build.py`           | The whole generator: pages, blog, citations, RSS, sitemap      |
| `src/index.md`       | Home                                                           |
| `src/blog/posts/`    | Posts → `/blog/YYYY/MM/DD/<slug-of-title>/`                    |
| `src/projects/`      | Projects → `/projects/<filename>/`                             |
| `src/static/`        | CSS, images, PDFs — copied to `/static/` (`_*` skipped; cv/thesis at site root) |
| `src/references.bib` | BibTeX for `[@key]` citations                                  |

## Authoring

Front matter is YAML. `title` and `date` drive post URLs, so changing either
changes the permalink. `draft: true` keeps a post out of the build.

```markdown
---
title: "Post title"
date: 2025-01-01
categories: [Books]
description: Used for the RSS summary and meta tags.
---

# Post title

Lede paragraph.

<!-- more -->

Rest of the post. Cite with [@key]; TeX math with $x^2$ renders via KaTeX.
```

`[@key]` becomes a numbered footnote and appends a bibliography sorted by year,
with `#fn:<key>` anchors.

## Deploy

`Dockerfile` is a two-stage image: `python build.py`, then Granian serving
`_site/` through `server.py` on Cloud Run.

```sh
docker build -t olivares.cl .
docker run --rm -p 8080:8080 olivares.cl
```
