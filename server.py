"""Static site server for olivares.cl: preloaded bytes, boot-time gzip, WSGI."""
import gzip
import mimetypes
import os

ROOT = os.environ.get("STATIC_ROOT", "/srv/site")


def ctype_for(path):
    ct = mimetypes.guess_type(path)[0] or "application/octet-stream"
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

COMPRESSIBLE = {"application/xml", "application/javascript",
                "application/json", "image/svg+xml"}
GZ = {p: gzip.compress(b, 6) for p, (b, ct) in ROUTES.items()
      if len(b) > 200 and (ct.split(";")[0].startswith("text/")
                           or ct.split(";")[0] in COMPRESSIBLE)}

NOT_FOUND = ROUTES.get("/404.html", (b"Not Found",))[0]


def app(environ, start_response):
    path = environ.get("PATH_INFO", "/")
    hit = ROUTES.get(path)
    if hit is None:
        start_response("404 Not Found", [
            ("Content-Type", "text/html; charset=utf-8"),
            ("Content-Length", str(len(NOT_FOUND)))])
        return [b""] if environ.get("REQUEST_METHOD") == "HEAD" else [NOT_FOUND]
    body, ctype = hit
    headers = [("Content-Type", ctype), ("Content-Length", str(len(body)))]
    if path in GZ and "gzip" in environ.get("HTTP_ACCEPT_ENCODING", ""):
        body = GZ[path]
        headers[1] = ("Content-Length", str(len(body)))
        headers += [("Content-Encoding", "gzip"), ("Vary", "Accept-Encoding")]
    start_response("200 OK", headers)
    return [b""] if environ.get("REQUEST_METHOD") == "HEAD" else [body]
