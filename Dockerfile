# syntax=docker/dockerfile:1
FROM python:3.13-slim AS build
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY build.py src ./
RUN python build.py

FROM python:3.13-slim
WORKDIR /app
RUN pip install --no-cache-dir "tornado>=6.4" "uvloop>=0.19"
COPY --from=build /app/_site /srv/site
COPY server.py .
ENV STATIC_ROOT=/srv/site
EXPOSE 8080
CMD ["python", "server.py"]
