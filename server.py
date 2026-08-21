"""Minimal static file server: Tornado + uvloop, sized for Cloud Run."""
import os

import uvloop
import tornado.ioloop
import tornado.web
from tornado.web import StaticFileHandler

ROOT = os.environ.get("STATIC_ROOT", "/srv/site")


class SiteHandler(StaticFileHandler):
    """Serves /dir/ as /dir/index.html and swaps 404s for the site's 404 page."""

    def parse_url_path(self, url_path: str) -> str:
        if not url_path or url_path.endswith("/"):
            url_path += "index.html"
        return super().parse_url_path(url_path)

    def write_error(self, status_code: int, **kwargs) -> None:
        if status_code == 404:
            fallback = os.path.join(ROOT, "404.html")
            if os.path.isfile(fallback):
                self.set_header("Content-Type", "text/html; charset=utf-8")
                with open(fallback, "rb") as f:
                    self.write(f.read())
                return
        super().write_error(status_code, **kwargs)


def main() -> None:
    app = tornado.web.Application(
        [(r"/(.*)", SiteHandler, {"path": ROOT})],
        compress_response=True,
    )
    app.listen(int(os.environ.get("PORT", "8080")))
    tornado.ioloop.IOLoop.current().start()


if __name__ == "__main__":
    uvloop.install()
    main()
