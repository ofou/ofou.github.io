---
title: "Graham Essays"
date: 2022-09
authors:
  - ofou
---

# Graham Essays

**A comprehensive digital archive of Paul Graham's influential writings,
optimized for offline reading in EPUB and Markdown**

_Featured on [Hacker News] front page at launch, check on [GitHub] for more details._

![](https://camo.githubusercontent.com/1236301ee0359b33ae094772ab6482124bd9678ff51e327aba275d0b1fd805a3/68747470733a2f2f36342e6d656469612e74756d626c722e636f6d2f74756d626c725f6c69347032326a45544231717a367071696f315f3530302e706e67)

[GitHub]: https://github.com/ofou/graham-essays

## Overview

This project automatically downloads, processes, and formats the complete
collection of essays from Paul Graham's website into convenient digital formats.
What started as a simple web scraping exercise turned into a substantial digital
library containing over 200 essays and more than 500,000 words of influential
writing on startups, technology, and entrepreneurship.

<!-- more -->


## Key Features

- **Complete & Current**: The entire collection is automatically rebuilt and
  updated daily via GitHub Actions. This project was featured on the [Hacker
  News] front page and has received over 800 GitHub stars.
- **Multiple Formats**: Available in both EPUB (for e-readers) and Markdown (for
  developers/note-takers).
- **Optimized for Reading**: Clean, well-formatted text for a high-quality
  reading experience on any device.
- **Offline Access**: Download once, read anywhere without an internet
  connection.
- **Open Source**: Full source code is available for transparency and
  community-driven development.

[Hacker News]: https://news.ycombinator.com/item?id=32465435

## Technical Implementation

The project leverages the RSS feed originally created by Aaron Swartz and
officially shared by Paul Graham himself, ensuring legitimate access. The
automation pipeline uses several Python libraries for clean, readable output:

- **`feedparser`** - Parses the RSS feed to retrieve essay metadata
- **`html2text`** - Converts HTML content to a clean Markdown format
- **`htmldate`** - Accurately extracts publication dates from web pages
- **`Unidecode`** - Handles character encoding for consistent text formatting

## Getting Started

#### Quick Start

```bash
# Clone the repository
git clone https://github.com/ofou/graham-essays.git
cd graham-essays
make
```

This generates fresh EPUB and Markdown files with the latest essays.

## Downloads

**Ready-to-use files** (updated daily via GitHub Actions):

- 🏷️ [All Releases](https://github.com/ofou/graham-essays/releases)
- 📚
  [Direct EPUB Download](https://github.com/ofou/graham-essays/releases/download/latest/graham.epub)
- 📄
  [Essay Index (CSV)](https://github.com/ofou/graham-essays/releases/download/latest/essays.csv)

## Contributing

Contributions are welcome! Whether it's code improvements, format suggestions,
or feature requests:

- Open an issue for bug reports or feature requests
- Submit a pull request for code improvements
- Share feedback on the reading experience

The goal is to make Paul Graham's essays as accessible as possible while
maintaining the highest quality reading experience.

---

_This is an independent project created for educational and personal use. All
essay content remains the intellectual property of Paul Graham._
