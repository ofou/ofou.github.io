# olivares.cl

Markdown in `src/`, one script, no framework.

```sh
uv run build.py            # → _site/  (also fetches front-end vendors)
uv run build.py --serve    # → http://localhost:8000
```

| Path                 | What                                                  |
| -------------------- | ----------------------------------------------------- |
| `build.py`           | Generator (deps via PEP 723)                          |
| `src/index.md`       | Home                                                  |
| `src/blog/posts/`    | Posts → `/blog/YYYY/MM/DD/<slug>/`                    |
| `src/projects/`      | Projects → `/projects/<name>/`                        |
| `src/static/`        | Assets → `/static/` (`_*` skipped; cv/thesis at root) |
| `src/references.bib` | BibTeX for `[@key]`                                   |

Front matter is YAML. `title` + `date` set the permalink; `draft: true` skips the build. `<!-- more -->` splits the lede. Cite with `[@key]`; math with `$…$` (KaTeX).

### Front-end vendors

KaTeX and Mermaid are **not** in the repo. `build.py` resolves each package’s npm `latest` (unless pinned), downloads tarballs into gitignored `.vendor-cache/`, and installs selected files into `_site/static/vendor/`. Thin wrappers stay in-repo: `src/static/mermaid.js` and the KaTeX snippet in `build.py`. Build stamps Mermaid’s `VER` so `?cdn=1` A/B hits the same version on jsDelivr. Syntax colouring is Pygments at build time (Python-Markdown CodeHilite).

| Env | Effect |
| --- | --- |
| *(default)* | Resolve npm `dist-tags.latest`, write `.vendor-cache/versions.lock` |
| `VENDOR_OFFLINE=1` | Reuse lock + cached tarballs (no registry) |
| `VENDOR_KATEX` / `VENDOR_MERMAID` | Pin exact versions |

Perf A/B: append `?cdn=1` to prefer remote CDN for KaTeX / Mermaid / book-cover images.

```sh
docker build -t olivares.cl .
docker run --rm -p 8080:8080 olivares.cl
```
