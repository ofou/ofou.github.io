FROM python:3.12-slim-bullseye AS builder

# Install make and Python for building the site
RUN apt-get update && apt-get install -y make

WORKDIR /app
COPY . .

# Build the site using the Makefile
RUN pip install -r requirements.txt && mkdocs build

# Use Nginx to serve the static content
FROM nginx:alpine

# Copy the built site from the builder stage
COPY --from=builder /app/docs /usr/share/nginx/html

# Expose port 8080 as required by Cloud Run
EXPOSE 8080

# Modify Nginx to use the port specified by the PORT environment variable
CMD sh -c "sed -i 's/listen\\s*80;/listen '\"\\${PORT:-8080}\"';/g' /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"