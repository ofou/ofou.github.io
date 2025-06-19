FROM python:3.12-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Install Pandoc using the same method as GitHub Actions
RUN wget https://github.com/jgm/pandoc/releases/download/3.7.0.2/pandoc-3.7.0.2-1-amd64.deb && \
    dpkg -i pandoc-3.7.0.2-1-amd64.deb || apt-get install -f -y && \
    rm pandoc-3.7.0.2-1-amd64.deb && \
    pandoc --version

COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
RUN mkdocs build

FROM nginx:alpine
COPY --from=builder /app/docs /usr/share/nginx/html
EXPOSE 8080
RUN sed -i 's/listen\s*80;/listen 8080;/g' /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]