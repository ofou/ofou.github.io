"""
MkDocs plugin that re-sorts bibliography footnote blocks chronologically (by year).
Must run after the bibtex plugin. The bibtex plugin outputs references in citation
order or .bib file order; this plugin reorders each block by year, then author, then title.
"""

import re
from pathlib import Path

from mkdocs.plugins import BasePlugin
from mkdocs.config.config_options import Type


# Try pybtex (used by mkdocs-bibtex); fallback to simple regex for year if missing
try:
    from pybtex.database import parse_file
    HAS_PYBTEX = True
except ImportError:
    HAS_PYBTEX = False


# Pattern: line that is a footnote definition [^key]: rest of line (single line only; bibtex plugin flattens refs to one line)
FOOTNOTE_LINE = re.compile(r"^\[\^([^\]]+)\]:\s*(.*)$", re.MULTILINE)


def _sort_key_from_bib(entry) -> tuple:
    """Return (year, author_sort, title) for sorting. Uses empty strings for missing fields."""
    year = (entry.fields.get("year") or "").strip()
    title = (entry.fields.get("title") or "").strip()
    authors = entry.persons.get("author", [])
    if authors:
        # Use last name of first author for tie-break
        p = authors[0]
        parts = [p.last_names[0] if p.last_names else ""]
        author_sort = " ".join(parts).strip()
    else:
        author_sort = ""
    return (year, author_sort, title)


def _year_from_bib_regex(bib_path: Path) -> dict:
    """Fallback: extract year per key from .bib with regex (no pybtex)."""
    text = bib_path.read_text(encoding="utf-8", errors="ignore")
    key_to_year = {}
    # Match @type{key, ... year = {YYYY} ... }
    block = re.compile(r"@\w+\{\s*([^,\s]+)\s*,.*?year\s*=\s*[\{\"]?(\d{4})[\}\"]?", re.DOTALL)
    for m in block.finditer(text):
        key_to_year[m.group(1).strip()] = m.group(2)
    return key_to_year


def load_bib_sort_keys(bib_path: Path):
    """Load .bib and return a dict key -> (year, author_sort, title) for sorting."""
    if not bib_path.exists():
        return {}
    if HAS_PYBTEX:
        try:
            data = parse_file(str(bib_path))
            return {
                key: _sort_key_from_bib(entry)
                for key, entry in data.entries.items()
            }
        except Exception:
            pass
    # Fallback: year only
    key_to_year = _year_from_bib_regex(bib_path)
    return {k: (y, "", "") for k, y in key_to_year.items()}


def sort_footnote_block(lines: list[tuple[str, str]], sort_keys: dict) -> list[str]:
    """Sort (key, rest_of_line) by sort_keys; return list of full lines."""
    def order(item):
        key, _ = item
        return sort_keys.get(key, ("", "", ""))

    sorted_pairs = sorted(lines, key=order)
    return [f"[^{key}]: {rest}" for key, rest in sorted_pairs]


def reorder_bibliography_in_markdown(markdown: str, sort_keys: dict) -> str:
    """Find blocks of [^key]: ... lines and reorder each block chronologically."""
    if not sort_keys:
        return markdown

    lines = markdown.split("\n")
    result = []
    i = 0
    while i < len(lines):
        line = lines[i]
        m = FOOTNOTE_LINE.match(line)
        if not m:
            result.append(line)
            i += 1
            continue
        # Collect consecutive footnote definition lines
        block = [(m.group(1), m.group(2))]
        i += 1
        while i < len(lines):
            m2 = FOOTNOTE_LINE.match(lines[i])
            if not m2:
                break
            block.append((m2.group(1), m2.group(2)))
            i += 1
        # Sort and emit
        for sorted_line in sort_footnote_block(block, sort_keys):
            result.append(sorted_line)
    return "\n".join(result)


class BibtexChronologicalPlugin(BasePlugin):
    """Re-sort bibliography footnotes by year (then author, title)."""

    config_scheme = (
        ("bib_file", Type(str, default="src/references.bib")),
    )

    def __init__(self):
        self._sort_keys = None
        self._bib_path = None

    def on_config(self, config, **kwargs):
        bib_file = self.config.get("bib_file") or "src/references.bib"
        config_dir = Path(config.config_file_path).parent
        self._bib_path = (config_dir / bib_file).resolve()
        self._sort_keys = load_bib_sort_keys(self._bib_path)
        return config

    def on_page_markdown(self, markdown, page, config, files, **kwargs):
        if not self._sort_keys:
            return markdown
        return reorder_bibliography_in_markdown(markdown, self._sort_keys)
