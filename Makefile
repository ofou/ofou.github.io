# Variables
PANDOC = pandoc
PYTHON = python3
SRC_DIR = src
OUTPUT_DIR = docs
README = README.md
TEMPLATE = templates/base.html
DEFAULT_BIBFILE = $(SRC_DIR)/references.bib
DEFAULT_CSL = https://gist.githubusercontent.com/rmzelle/bc869c900549226483123c11b0a90cb9/raw/d1712c5385b4a1ba52b2f85442ad146ade7197c3/nature.csl
DOMAIN = olivares.cl

# Source files
INDEX_SRC = $(README)
BLOG_SRC_FILES = $(wildcard $(SRC_DIR)/blog/*.md)
PROJECTS_SRC_FILES = $(wildcard $(SRC_DIR)/projects/*.md)

# Output files
INDEX_HTML = $(OUTPUT_DIR)/index.html
PROJECTS_INDEX_HTML = $(OUTPUT_DIR)/projects/index.html
PROJECTS_HTML_FILES = $(patsubst $(SRC_DIR)/projects/%.md, $(OUTPUT_DIR)/projects/%.html, $(PROJECTS_SRC_FILES))
BLOG_INDEX_HTML = $(OUTPUT_DIR)/blog/index.html
BLOG_HTML_FILES = $(patsubst $(SRC_DIR)/blog/%.md, $(OUTPUT_DIR)/blog/%.html, $(BLOG_SRC_FILES))

# List of all HTML targets for dependency
ALL_HTML_TARGETS = $(INDEX_HTML) $(PROJECTS_INDEX_HTML) $(PROJECTS_HTML_FILES) $(BLOG_HTML_FILES) $(BLOG_INDEX_HTML)

# Base Pandoc Flags
BASE_PANDOC_FLAGS = --standalone --mathml --template=$(TEMPLATE) --highlight-style=pygments -M include-highlighting-css=true -M link-citations=true -M backref=true

# Default target
.PHONY: all
all: clean html sitemap

# Build all HTML files
.PHONY: html
html: $(ALL_HTML_TARGETS) copy_static

# Rule to build the homepage
$(INDEX_HTML): $(INDEX_SRC) $(TEMPLATE)
	@mkdir -p $(OUTPUT_DIR)
	@echo "Building homepage from $(INDEX_SRC)..."
	$(PANDOC) $(BASE_PANDOC_FLAGS) $< -o $@ -M title="Home" -M home=true

# Rule to build the projects index directly
$(PROJECTS_INDEX_HTML): $(PROJECTS_HTML_FILES) $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "Building projects index page..."
	@{ \
	    echo "# Projects"; \
	    echo ""; \
	    for file in $(PROJECTS_HTML_FILES); do \
	        if [ "$${file}" != "$(PROJECTS_INDEX_HTML)" ]; then \
	            filename=$$(basename "$$file"); \
	            src_file=$(SRC_DIR)/projects/$${filename%.html}.md; \
	            title=$$(head -50 "$$src_file" | grep -m 1 "^# " | sed 's/^# //'); \
	            if [ -z "$$title" ]; then \
	                title=$$(basename "$${file%.html}" | sed 's/-/ /g'); \
	            fi; \
	            dateinfo=$$(grep -m 1 "^date: " "$$src_file" | sed 's/^date: //'); \
	            if [ -n "$$dateinfo" ]; then \
	                echo "$${dateinfo}|* [$$title](/projects/$$filename) <span class=\"post-date\">$$dateinfo</span>"; \
	            else \
	                echo "1900-01-01|* [$$title](/projects/$$filename)"; \
	            fi; \
	        fi; \
	    done | sort -t'|' -k1,1r | cut -d'|' -f2-; \
	} > $(OUTPUT_DIR)/projects/temp_index.md
	@$(PANDOC) $(BASE_PANDOC_FLAGS) $(OUTPUT_DIR)/projects/temp_index.md -o $@ -M title="Projects" -M projects=true
	@rm -f $(OUTPUT_DIR)/projects/temp_index.md

# Pattern rule to build projects
$(OUTPUT_DIR)/projects/%.html: $(SRC_DIR)/projects/%.md $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "  Converting project $(notdir $<) to $(notdir $@)..."
	@title=$$(head -50 "$<" | grep -m 1 "^# " | sed 's/^# //'); \
	if [ -z "$$title" ]; then \
	    title=$$(basename "$@" .html | sed 's/-/ /g'); \
	fi; \
	date_param=""; \
	if date=$$(grep -m 1 "^date: " "$<" | sed 's/^date: //'); then \
	    if [ -n "$$date" ]; then \
	        date_param="-M date=\"$$date\""; \
	    fi; \
	fi; \
	if grep -q "^bibliography:" "$<"; then \
	    $(PANDOC) $(BASE_PANDOC_FLAGS) --citeproc $$date_param $< -o $@ -M projects=true -M title="$$title"; \
	else \
	    $(PANDOC) $(BASE_PANDOC_FLAGS) $$date_param $< -o $@ -M projects=true -M title="$$title"; \
	fi

# Rule to build the blog index directly
$(BLOG_INDEX_HTML): $(BLOG_HTML_FILES) $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "Building blog index page..."
	@{ \
	    echo "# Blog Posts"; \
	    echo ""; \
	    for file in $(BLOG_HTML_FILES); do \
	        if [ "$${file}" != "$(BLOG_INDEX_HTML)" ]; then \
	            filename=$$(basename "$$file"); \
	            src_file=$(SRC_DIR)/blog/$${filename%.html}.md; \
	            title=$$(head -50 "$$src_file" | grep -m 1 "^# " | sed 's/^# //'); \
	            if [ -z "$$title" ]; then \
	                title=$$(basename "$${file%.html}" | sed 's/-/ /g'); \
	            fi; \
	            dateinfo=$$(grep -m 1 "^date: " "$$src_file" | sed 's/^date: //'); \
	            if [ -n "$$dateinfo" ]; then \
	                echo "$${dateinfo}|* [$$title](/blog/$$filename) <span class=\"post-date\">$$dateinfo</span>"; \
	            else \
	                echo "1900-01-01|* [$$title](/blog/$$filename)"; \
	            fi; \
	        fi; \
	    done | sort -t'|' -k1,1r | cut -d'|' -f2-; \
	} > $(OUTPUT_DIR)/blog/temp_index.md
	@$(PANDOC) $(BASE_PANDOC_FLAGS) $(OUTPUT_DIR)/blog/temp_index.md -o $@ -M title="Blog" -M blog=true
	@rm -f $(OUTPUT_DIR)/blog/temp_index.md

# Pattern rule to build blog posts
$(OUTPUT_DIR)/blog/%.html: $(SRC_DIR)/blog/%.md $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "  Converting $(notdir $<) to $(notdir $@)..."
	@title=$$(head -50 "$<" | grep -m 1 "^# " | sed 's/^# //'); \
	if [ -z "$$title" ]; then \
	    title=$$(basename "$@" .html | sed 's/-/ /g'); \
	fi; \
	date_param=""; \
	if date=$$(grep -m 1 "^date: " "$<" | sed 's/^date: //'); then \
	    if [ -n "$$date" ]; then \
	        date_param="-M date=\"$$date\""; \
	    fi; \
	fi; \
	if grep -q "^bibliography:" "$<"; then \
	    bib=$$(grep -m 1 "^bibliography:" "$<" | sed 's/^bibliography: *//'); \
	    if [[ "$$bib" != /* ]]; then \
	        bib_path=$(dir $<)$$bib; \
	    else \
	        bib_path=$$bib; \
	    fi; \
	    csl_param=""; \
	    if grep -q "^csl:" "$<"; then \
	        csl_url=$$(grep -m 1 "^csl:" "$<" | sed 's/^csl: *//'); \
	        csl_param="-M csl=$$csl_url"; \
	    else \
	        csl_param="-M csl=$(DEFAULT_CSL)"; \
	    fi; \
	    $(PANDOC) $(BASE_PANDOC_FLAGS) --citeproc --bibliography="$$bib_path" $$csl_param --resource-path=$(dir $<) $$date_param $< -o $@ -M blog=true -M title="$$title"; \
	else \
	    $(PANDOC) $(BASE_PANDOC_FLAGS) --resource-path=$(dir $<) $$date_param $< -o $@ -M blog=true -M title="$$title"; \
	fi

# Rule to copy static files
.PHONY: copy_static
copy_static:
	@if [ -d "static" ]; then \
	    echo "Copying static files..."; \
	    mkdir -p $(OUTPUT_DIR)/static; \
	    cp -r static/* $(OUTPUT_DIR)/static/; \
	else \
	    echo "No static directory found, skipping copy."; \
	fi

# Clean the output directory
.PHONY: clean
clean:
	@echo "Cleaning output directory..."
	@rm -rf $(OUTPUT_DIR)

# Serve the site locally (depends on html target)
.PHONY: serve
serve: html
	@echo "Serving site at http://localhost:8000..."
	@cd $(OUTPUT_DIR) && $(PYTHON) -m http.server 8000

# Generate sitemap.xml
.PHONY: sitemap
sitemap: html
	@echo "Generating sitemap.xml..."
	@echo '<?xml version="1.0" encoding="UTF-8"?>' > $(OUTPUT_DIR)/sitemap.xml
	@echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' >> $(OUTPUT_DIR)/sitemap.xml
	@# Add homepage
	@echo '  <url>' >> $(OUTPUT_DIR)/sitemap.xml
	@echo '    <loc>https://$(DOMAIN)/</loc>' >> $(OUTPUT_DIR)/sitemap.xml
	@echo '    <lastmod>'$$(date +%Y-%m-%d)'</lastmod>' >> $(OUTPUT_DIR)/sitemap.xml
	@echo '    <priority>1.0</priority>' >> $(OUTPUT_DIR)/sitemap.xml
	@echo '  </url>' >> $(OUTPUT_DIR)/sitemap.xml
	@# Find all HTML files in output directory and add them to sitemap
	@find $(OUTPUT_DIR) -name "*.html" | grep -v "$(OUTPUT_DIR)/index.html" | sort | while read file; do \
		relpath=$$(echo $$file | sed 's|$(OUTPUT_DIR)/||'); \
		echo '  <url>' >> $(OUTPUT_DIR)/sitemap.xml; \
		echo '    <loc>https://$(DOMAIN)/'"$$relpath"'</loc>' >> $(OUTPUT_DIR)/sitemap.xml; \
		echo '    <lastmod>'$$(date +%Y-%m-%d)'</lastmod>' >> $(OUTPUT_DIR)/sitemap.xml; \
		echo '    <priority>0.8</priority>' >> $(OUTPUT_DIR)/sitemap.xml; \
		echo '  </url>' >> $(OUTPUT_DIR)/sitemap.xml; \
	done
	@echo '</urlset>' >> $(OUTPUT_DIR)/sitemap.xml
	@echo "Sitemap generated at $(OUTPUT_DIR)/sitemap.xml"
	@# Update robots.txt to include sitemap
	@if ! grep -q "Sitemap:" robots.txt; then \
		echo "Updating robots.txt with sitemap reference..."; \
		echo "Sitemap: https://$(DOMAIN)/sitemap.xml" >> robots.txt; \
	fi

# Help message
.PHONY: help
help:
	@echo "Makefile for Simple Pandoc Site"
	@echo "---------------------------------"
	@echo "make html       Build the site (default)"
	@echo "make sitemap    Generate sitemap.xml for the site"
	@echo "make clean      Remove the generated output directory"
	@echo "make serve      Build and serve the site locally on port 8000"
	@echo "make help       Show this help message" 