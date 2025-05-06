FROM pandoc/core:3.5 AS builder

# Install make and Python for building the site
RUN apk add --no-cache make python3

WORKDIR /app
COPY . .

# Build the site using the Makefile
RUN make html

# Use Nginx to serve the static content
FROM nginx:alpine

# Copy the built site from the builder stage
COPY --from=builder /app/docs /usr/share/nginx/html

# Expose port 8080 as required by Cloud Run
EXPOSE 8080

# Modify Nginx to use port 8080 instead of the default 80
RUN sed -i 's/listen\s*80;/listen 8080;/g' /etc/nginx/conf.d/default.conf

# Start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]