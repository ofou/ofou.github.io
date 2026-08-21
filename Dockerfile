# syntax=docker/dockerfile:1
FROM python:3.13-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY build.py src ./
RUN python build.py
FROM python:3.12-slim
RUN pip install --no-cache-dir "granian==2.8.1"
WORKDIR /app
COPY --from=build /app/_site /srv/site
COPY server.py .
ENV STATIC_ROOT=/srv/site
EXPOSE 8080
CMD ["sh", "-c", "exec granian --interface wsgi server:app --host 0.0.0.0 --port ${PORT:-8080}"]
