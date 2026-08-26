# olivares.cl

Markdown in `src/`, one script, no framework.

```sh
uv run build.py            # → _site/
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

```sh
docker build -t olivares.cl .
docker run --rm -p 8080:8080 olivares.cl
```
