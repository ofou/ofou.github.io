"""Static site server for olivares.cl: preloaded bytes, boot-time gzip, WSGI."""

import gzip
import hashlib
import mimetypes
import os
import re

ROOT = os.environ.get("STATIC_ROOT", "/srv/site")

# .mjs is an ES module; some Python builds still guess it as octet-stream.
mimetypes.add_type("application/javascript", ".mjs")


def ctype_for(path):
    ct = mimetypes.guess_type(path)[0] or "application/octet-stream"
    # Compressible JS MIME must stay application/javascript (see COMPRESSIBLE).
    if ct in ("text/javascript", "application/javascript"):
        ct = "application/javascript"
    return ct + "; charset=utf-8" if ct.startswith("text/") else ct


FILES = {}
for dirpath, _, names in os.walk(ROOT):
    for name in names:
        full = os.path.join(dirpath, name)
        key = "/" + os.path.relpath(full, ROOT).replace(os.sep, "/")
        with open(full, "rb") as f:
            FILES[key] = f.read()

ROUTES = {p: (b, ctype_for(p)) for p, b in FILES.items()}
for p, b in FILES.items():
    if p.endswith("/index.html"):
        html = ctype_for(p)
        ROUTES[p[: -len("index.html")]] = (b, html)
        stem = p[: -len("/index.html")]
        if stem:
            ROUTES[stem] = (b, html)

COMPRESSIBLE = {
    "application/xml",
    "application/javascript",
    "application/json",
    "image/svg+xml",
}
GZ = {
    p: gzip.compress(b, 6)
    for p, (b, ct) in ROUTES.items()
    if len(b) > 200
    and (ct.split(";")[0].startswith("text/") or ct.split(";")[0] in COMPRESSIBLE)
}

NOT_FOUND = ROUTES.get("/404.html", (b"Not Found",))[0]

# Fonts are content-addressed by the build (name.<sha8>.woff2), so their URL
# changes whenever their bytes do. That makes them safe to cache hard and
# forever: no revalidation, no conditional round trip on repeat visits.
# Everything else stays unversioned, so it keeps the no-cache + ETag dance.
IMMUTABLE_MAX_AGE = 31536000  # one year, the practical ceiling
FONT_RE = re.compile(r"^/static/fonts/.+\.[0-9a-f]{8}\.woff2$")


def cache_control_for(path):
    if FONT_RE.match(path):
        return f"public, max-age={IMMUTABLE_MAX_AGE}, immutable"
    # Assets are unversioned, so freshness must be revalidated, not guessed:
    # no-cache forces the conditional round trip, the ETag makes it a 304.
    return "no-cache"


def app(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    hit = ROUTES.get(path)
    if hit is None:
        start_response(
            "404 Not Found",
            [
                ("Content-Type", "text/html; charset=utf-8"),
                ("Content-Length", str(len(NOT_FOUND))),
            ],
        )
        return [b""] if environ.get("REQUEST_METHOD") == "HEAD" else [NOT_FOUND]
    body, ctype = hit
    if path in GZ and "gzip" in environ.get("HTTP_ACCEPT_ENCODING", ""):
        body = GZ[path]
        encoding = "gzip"
    else:
        encoding = "identity"
    etag = f'W/"{hashlib.md5(body).hexdigest()}"'
    headers = [
        ("Content-Type", ctype),
        ("Content-Length", str(len(body))),
        ("ETag", etag),
        ("Cache-Control", cache_control_for(path)),
        ("Vary", "Accept-Encoding"),
    ]
    if environ.get("HTTP_IF_NONE_MATCH") == etag:
        headers[1] = ("Content-Length", "0")
        start_response("304 Not Modified", headers)
        return [b""]
    if encoding == "gzip":
        headers += [("Content-Encoding", "gzip")]
    start_response("200 OK", headers)
    return [b""] if environ.get("REQUEST_METHOD") == "HEAD" else [body]
