---
title: TexTube
subtitle: YouTube subtitles in ChatGPT fast
date: 2024-09
author: ofou
---

# Textube: YouTube-to-ChatGPT API

**Built before Google integrated YouTube into Gemini natively** :)

_Featured on [Hacker News](https://news.ycombinator.com/item?id=41571706), currently live at [textube](https://textube.olivares.cl), [ChatGPT Plugin](https://chatgpt.com/g/g-2KencLm4f-textube) or [GitHub](https://github.com/ofou/texttube)_

## The Problem I Solved

Before Google built YouTube integration directly into Gemini, there was no clean way to analyze YouTube videos with LLMs. You could copy-paste transcripts manually, but that was tedious and broke for long-form content. I built Textube to bridge this gap - a clean API that lets ChatGPT analyze any YouTube video or entire playlists.

## Technical Architecture

**FastAPI backend** with two main endpoints:

- `/watch?v={video_id}&format={json|txt}` - Individual video transcripts mirroring the YouTube API
- `/playlist?list={playlist_id}` - Process entire playlists with metadata mirroring the YouTube API

**Core Components:**

```python
class Captions:
    def __init__(self, video_id: str):
        # Uses youtube-transcript-api to fetch transcripts
        # Calculates token counts with tiktoken for ChatGPT context limits
        # Processes timestamps and metadata
```

```python
class Playlist:
    def process_playlist(self) -> None:
        # Batch processes hundreds of videos
        # Maintains video order and calculates aggregate statistics
        # Handles playlist-level caching and integrity checks
```

**Data Flow:**

1. Extract video/playlist IDs from YouTube URLs using regex
2. Fetch transcripts via YouTube's transcript API
3. Process and structure the data (timestamps, token counts, metadata)
4. Cache in Google Cloud Firestore for performance
5. Serve as JSON/TXT or integrate with ChatGPT plugin

## Key Technical Decisions

**Caching Strategy**: Started with local JSON files, migrated to Firestore as usage scaled

```python
# Original approach - local caching
video_file = os.path.join(self.base_path, self.playlist_id, f"{video_id}.json")

# Scaled approach - Firestore with document references
video_ref = db.collection("videos").document(video_id)
```

**Token Counting**: Used `tiktoken` to calculate exact token counts for ChatGPT context windows

```python
def _count_tokens(self, model_name: str = "gpt-4") -> int:
    encoding = tiktoken.encoding_for_model(model_name)
    return len(encoding.encode(str(self)))
```

**Playlist Processing**: Built to handle massive playlists (Lex Fridman's 250+ videos, Dwarkesh's 72 videos = 1M+ words)

- Maintains video order through document references
- Calculates aggregate statistics (total tokens, characters, duration)
- Handles partial failures gracefully

**ChatGPT Integration**: Implemented as OpenAI plugin with proper API specification

- Exposes transcript data directly to ChatGPT's context
- Handles large transcripts through chunking strategies
- Maintains conversation context across video segments

## Tech Stack

```
Backend: FastAPI + Python
Database: Google Cloud Firestore
APIs: youtube-transcript-api, pytubefix
Token Counting: tiktoken
Frontend: Vanilla JS + Tailwind CSS
Deployment: Docker container
Integration: OpenAI Plugin API
```

## Performance Characteristics

**Handles edge cases:**

- 8-hour podcasts (Lex Fridman)
- Multi-language transcripts (English, Spanish fallbacks)
- Missing/corrupted transcript data
- Rate limiting and API failures

**Caching effectiveness:**

- Instant responses for previously processed videos
- Playlist-level caching with integrity verification
- Graceful fallback to YouTube API when cache misses

## Open Source Proof of Concept

**Released as open source** on GitHub to demonstrate the concept and let others build upon it. The goal was to validate demand for YouTube-LLM integration and show it was technically feasible.

**Overwhelming demand**: The service got so much usage that Google eventually banned it for exceeding API limits. This was actually validation - the demand was real enough that Google had to take action.

**Strategic caching**: Before the ban, I managed to cache thousands of popular videos and entire playlists (Karpathy's courses, 3Blue1Brown, Lex Fridman, etc.). These cached examples still work and demonstrate the concept.

**Multiple interfaces**:

- **Direct API access** for developers: `GET /watch?v={video_id}&format=json`
- **ChatGPT plugin** for conversational analysis: Integrated via OpenAI's plugin system
- **Simple web interface** for quick access: Clean HTML form with real-time results

Check the [API docs](https://textube.olivares.cl/docs) for more details. Here are some examples:

```curl
curl https://textube.olivares.cl/watch?v=bZQun8Y4L2A&format=json | jq # State of GPT by Andrej Karpathy
```

Response:

```json
{
  "character_count": 43265,
  "title": "State of GPT | BRK216HFS",
  "url": "https://www.youtube.com/watch?v=bZQun8Y4L2A",
  "video_id": "bZQun8Y4L2A",
  "token_count": 9975,
  "transcript": [
    {
      "end": 7.159,
      "start": 0.235,
      "text": "[MUSIC]"
    },
    {
      "end": 8.896,
      "start": 7.159,
      "text": "ANNOUNCER:\nPlease welcome"
    },
    {
      "end": 10.231,
      "start": 8.896,
      "text": "AI researcher and"
    },
    {
      "end": 21.169,
      "start": 10.231,
      "text": "founding member of\nOpenAI, Andrej Karpathy."
    },
    ...
  ]
}
```

```curl
curl https://textube.olivares.cl/playlist?list=PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ | jq # Neural Networks: Zero to Hero playlist
```

Response:

```json
{
  "playlist_id": "PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ",
  "title": "Neural Networks: Zero to Hero",
  "url": "https://www.youtube.com/playlist?list=PLAqhIrjkxbuWI23v9cThsA9GvCAUhRvKZ",
  "total_token_count": 222771,
  "total_character_count": 1066072,
  "video_count": 10,
  "videos": [
    {
      "video_id": "VMj-3S1tku0",
      "title": "The spelled-out intro to neural networks and backpropagation: building micrograd",
      "token_count": 26238,
      "character_count": 123212,
      "local_link": "https://textube.olivares.cl/watch?v=VMj-3S1tku0"
    },
    {
      "video_id": "PaCmpygFfXo",
      "title": "The spelled-out intro to language modeling: building makemore",
      "token_count": 20811,
      "character_count": 100179,
      "local_link": "https://textube.olivares.cl/watch?v=PaCmpygFfXo"
    },
    ...
  ]
}
```

## Why It Hit Hacker News Frontpage

**Timing**: Built this before major LLM providers integrated YouTube natively. Solved a real pain point that thousands of developers/researchers had.

**Immediate utility**: People could paste any YouTube URL and start analyzing the content with ChatGPT within seconds. No complex setup, no API keys.

**Scale**: Handled viral traffic from HN without breaking. The Firestore caching strategy paid off when hundreds of users started processing large playlists.

**Community validation**: HN commenters immediately understood the value and started sharing their own use cases - research, content analysis, learning from technical talks.

## Technical Impact

This project validated several architectural patterns I've used in subsequent projects:

**API-first design**: Clean separation between data processing (captions.py) and API layer (app.py)

**Progressive enhancement**: Started simple (single videos) then expanded to complex use cases (playlists, bulk processing)

**Caching as a first-class concern**: Moved from local files to cloud database as usage patterns became clear

**LLM integration patterns**: Token counting, context window management, and plugin architectures that became standard later

## From Banned to Built-in

The trajectory tells the story: Google banned the service due to demand, then months later built similar functionality directly into Gemini. Classic pattern of successful proof-of-concepts getting killed then rebuilt natively.

**Open source legacy**: The code remains available as a reference implementation. Shows how to:

- Build LLM integrations before official APIs exist
- Handle scale with smart caching strategies
- Design APIs that work with both humans and AI systems
- Process large-scale content for AI consumption

**Validation through prohibition**: Sometimes getting banned is the strongest product-market fit signal. The demand was real enough that Google had to intervene.

The lesson: build proof-of-concepts that push boundaries. Even if they get shut down, they demonstrate market demand and technical feasibility that larger companies eventually adopt.

---

_Open source on GitHub. Cached examples still work. Can be used via direct API calls or ChatGPT integration._
