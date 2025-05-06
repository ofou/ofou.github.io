# Variables
PANDOC = pandoc
PYTHON = python3
SRC_DIR = src
OUTPUT_DIR = output
README = README.md
TEMPLATE = templates/base.html
BIBFILE = $(SRC_DIR)/references.bib

# Git date function - gets the last modified date from git for a file
# Usage: $(call get_git_date,file_path)
get_git_date = $(shell git log -1 --format=%ad --date=short -- $(1) 2>/dev/null || echo "N/A")

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

# Pandoc Flags - Now includes the template
PANDOC_FLAGS = --standalone --mathml --template=$(TEMPLATE) --citeproc --bibliography=$(BIBFILE) --highlight-style=pygments -M include-highlighting-css=true -M link-citations=true -M csl=https://gist.githubusercontent.com/rmzelle/bc869c900549226483123c11b0a90cb9/raw/d1712c5385b4a1ba52b2f85442ad146ade7197c3/nature.csl -M backref=true

# Default target
.PHONY: all
all: clean html

# Build all HTML files
.PHONY: html
html: $(ALL_HTML_TARGETS) copy_static

# Rule to build the homepage
$(INDEX_HTML): $(INDEX_SRC) $(TEMPLATE)
	@mkdir -p $(OUTPUT_DIR)
	@echo "Building homepage from $(INDEX_SRC)..."
	$(PANDOC) $(PANDOC_FLAGS) $< -o $@ -M title="Home" -M home=true -M date="$(call get_git_date,$(INDEX_SRC))"

# Rule to build the projects index directly
$(PROJECTS_INDEX_HTML): $(PROJECTS_HTML_FILES) $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "Building projects index page..."
	@# Generate a temp file with just the content we need
	@echo "# Projects" > $(OUTPUT_DIR)/projects/temp_index.md
	@echo "" >> $(OUTPUT_DIR)/projects/temp_index.md
	@# Generate the list of projects directly in the markdown file
	@for file in $(PROJECTS_HTML_FILES); do \
	    if [ "$${file}" != "$(PROJECTS_INDEX_HTML)" ]; then \
	        filename=$$(basename "$$file"); \
	        src_file=$(SRC_DIR)/projects/$${filename%.html}.md; \
	        title=$$(head -50 "$$src_file" | grep -m 1 "^# " | sed 's/^# //'); \
	        if [ -z "$$title" ]; then \
	            title=$$(basename "$${file%.html}" | sed 's/-/ /g'); \
	        fi; \
	        dateinfo=$$(grep -m 1 "date: " "$$src_file" | sed 's/^date: //'); \
	        if [ -z "$$dateinfo" ]; then \
	            dateinfo=$$(git log -1 --format=%ad --date=short -- "$$src_file" 2>/dev/null || echo "N/A"); \
	        fi; \
	        if [ -n "$$dateinfo" ]; then \
	            echo "* [$${title}](/projects/$$filename) <span class=\"post-date\">$$dateinfo</span>" >> $(OUTPUT_DIR)/projects/temp_index.md; \
	        else \
	            echo "* [$${title}](/projects/$$filename)" >> $(OUTPUT_DIR)/projects/temp_index.md; \
	        fi; \
	    fi; \
	done
	@# Create the final HTML
	$(PANDOC) $(PANDOC_FLAGS) $(OUTPUT_DIR)/projects/temp_index.md -o $@ -M title="Projects" -M projects=true -M date="$(call get_git_date,$(OUTPUT_DIR)/projects/temp_index.md)"
	@# Clean up temporary files
	@rm -f $(OUTPUT_DIR)/projects/temp_index.md

# Pattern rule to build projects
$(OUTPUT_DIR)/projects/%.html: $(SRC_DIR)/projects/%.md $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "  Converting project $(notdir $<) to $(notdir $@)..."
	@gitdate=$$(git log -1 --format=%ad --date=short -- $< 2>/dev/null || echo "N/A"); \
	title=$$(head -50 "$<" | grep -m 1 "^# " | sed 's/^# //'); \
	if [ -z "$$title" ]; then \
	    title=$$(basename "$@" .html | sed 's/-/ /g'); \
	fi; \
	$(PANDOC) $(PANDOC_FLAGS) $< -o $@ -M projects=true -M git_date="$$gitdate" -M title="$$title"

# Rule to build the blog index directly
$(BLOG_INDEX_HTML): $(BLOG_HTML_FILES) $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "Building blog index page..."
	@# Generate a temp file with just the content we need
	@echo "# Blog Posts" > $(OUTPUT_DIR)/blog/temp_index.md
	@echo "" >> $(OUTPUT_DIR)/blog/temp_index.md
	@# Generate the list of blog posts directly in the markdown file
	@for file in $(BLOG_HTML_FILES); do \
	    if [ "$${file}" != "$(BLOG_INDEX_HTML)" ]; then \
	        filename=$$(basename "$$file"); \
	        src_file=$(SRC_DIR)/blog/$${filename%.html}.md; \
	        title=$$(head -50 "$$src_file" | grep -m 1 "^# " | sed 's/^# //'); \
	        if [ -z "$$title" ]; then \
	            title=$$(basename "$${file%.html}" | sed 's/-/ /g'); \
	        fi; \
	        dateinfo=$$(grep -m 1 "date: " "$$src_file" | sed 's/^date: //'); \
	        if [ -z "$$dateinfo" ]; then \
	            dateinfo=$$(git log -1 --format=%ad --date=short -- "$$src_file" 2>/dev/null || echo "N/A"); \
	        fi; \
	        if [ -n "$$dateinfo" ]; then \
	            echo "* [$${title}](/blog/$$filename) <span class=\"post-date\">$$dateinfo</span>" >> $(OUTPUT_DIR)/blog/temp_index.md; \
	        else \
	            echo "* [$${title}](/blog/$$filename)" >> $(OUTPUT_DIR)/blog/temp_index.md; \
	        fi; \
	    fi; \
	done
	@# Create the final HTML
	$(PANDOC) $(PANDOC_FLAGS) $(OUTPUT_DIR)/blog/temp_index.md -o $@ -M title="Blog" -M blog=true -M date="$(call get_git_date,$(OUTPUT_DIR)/blog/temp_index.md)"
	@# Clean up temporary files
	@rm -f $(OUTPUT_DIR)/blog/temp_index.md

# Pattern rule to build blog posts
$(OUTPUT_DIR)/blog/%.html: $(SRC_DIR)/blog/%.md $(TEMPLATE)
	@mkdir -p $(dir $@)
	@echo "  Converting $(notdir $<) to $(notdir $@)..."
	@gitdate=$$(git log -1 --format=%ad --date=short -- $< 2>/dev/null || echo "N/A"); \
	title=$$(head -50 "$<" | grep -m 1 "^# " | sed 's/^# //'); \
	if [ -z "$$title" ]; then \
	    title=$$(basename "$@" .html | sed 's/-/ /g'); \
	fi; \
	$(PANDOC) $(PANDOC_FLAGS) --resource-path=$(dir $<) $< -o $@ -M blog=true -M git_date="$$gitdate" -M title="$$title"

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

# Help message
.PHONY: help
help:
	@echo "Makefile for Simple Pandoc Site"
	@echo "---------------------------------"
	@echo "make html       Build the site (default)"
	@echo "make clean      Remove the generated output directory"
	@echo "make serve      Build and serve the site locally on port 8000"
	@echo "make help       Show this help message" 