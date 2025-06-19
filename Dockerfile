FROM pandoc/core:latest AS pandoc
FROM python:3.12-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
COPY --from=pandoc /usr/local/bin/pandoc /usr/local/bin/pandoc
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN mkdocs build
FROM nginx:alpine
COPY --from=builder /app/docs /usr/share/nginx/html
EXPOSE 8080
RUN sed -i 's/listen\s*80;/listen 8080;/g' /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]