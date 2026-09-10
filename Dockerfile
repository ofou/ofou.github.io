FROM python:3.14-slim AS build
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
COPY build.py .
COPY src ./src
ENV UV_LINK_MODE=copy
ENV UV_PYTHON_DOWNLOADS=never
# Classic docker build (Cloud Build GitHub CD has no BuildKit).
# uv stays in this stage; only the site and granian are copied out.
RUN uv run --refresh build.py \
 && uv pip install --system --upgrade granian

FROM python:3.14-slim
COPY --from=build /usr/local /usr/local
COPY --from=build /app/_site /srv/site
COPY server.py .
ENV STATIC_ROOT=/srv/site
EXPOSE 8080
CMD ["sh", "-c", "exec granian --interface wsgi server:app --host 0.0.0.0 --port ${PORT:-8080}"]
