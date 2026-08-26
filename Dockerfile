# syntax=docker/dockerfile:1
FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY build.py .
COPY src ./src
# Always latest: PEP 723 deps via uv --refresh; KaTeX/Mermaid npm latest into _site.
# Cache mounts keep wheels + npm tarballs across rebuilds.
ENV UV_LINK_MODE=copy
ENV UV_PYTHON_DOWNLOADS=never
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=cache,target=/app/.vendor-cache \
    uv run --refresh build.py

FROM python:3.14-slim
WORKDIR /app
ENV UV_LINK_MODE=copy
ENV UV_PYTHON_DOWNLOADS=never
RUN --mount=from=ghcr.io/astral-sh/uv:latest,source=/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system --upgrade granian
COPY --from=build /app/_site /srv/site
COPY server.py .
ENV STATIC_ROOT=/srv/site
EXPOSE 8080
CMD ["sh", "-c", "exec granian --interface wsgi server:app --host 0.0.0.0 --port ${PORT:-8080}"]
