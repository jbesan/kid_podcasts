# Architecture - Kids Podcast Generator

## Overview
This application follows a modern **event-driven architecture** built with **NiceGUI**. It leverages a backend-first philosophy where Python logic handles state and events, mapping to reactive Vue/Quasar components in the browser.

## Core Components

### 1. PodcastGenerator (`podcast_generator.py`)
- **Native Async**: Uses `google.genai.Client.aio` for non-blocking script generation and TTS synthesis.
- **Smart Retries**: Implements exponential backoff with `asyncio.sleep` to handle API rate limits (429).
- **Multi-Speaker TTS**: Uses Gemini's `MultiSpeakerVoiceConfig` to generate full conversations in a single pass.

### 2. NiceGUI App (`main.py`)
- **Reactive State (`models/state.py`)**: A centralized `AppState` manages all reactive data (scripts, audio paths, costs).
- **Per-Connection Scoping**: State and Generator are scoped within the `@ui.page("/")` function, ensuring independent sessions for every browser tab.
- **Class-Based Components**: Each podcast episode is managed by a `PodcastCard` class instance, encapsulating its own loading state and audio player.
- **Async Concurrency**: 
    - **Non-Blocking UI**: Event handlers are `async`, allowing the FastAPI event loop to remain responsive.
    - **I/O Offloading**: Blocking operations (like Pydub exports) are offloaded to background threads.
- **Persistent Storage**: Uses `app.storage.user` to persist user preferences across sessions.

### 3. Cost Utility (`utils/cost_calculator.py`)
- **Decoupled Logic**: A standalone utility for precise cost tracking based on actual API `usage_metadata`.

## Data Flow
1. **User Action**: User enters themes and clicks "Générer les Scripts".
2. **Script Generation**: An `async` handler awaits batch generation. As each script is received, a new `PodcastCard` is dynamically added to the UI.
3. **Native Reactive Binding**: UI components use `bind_value` to maintain bi-directional synchronization with the `AppState`. This eliminates manual `on_change` synchronization and ensures state consistency.
4. **Individual Synthesis**:
   - User clicks "Synthèse Audio" on a card.
   - The card's internal spinner activates without affecting other cards or the sidebar.
   - `await generator.generate_podcast_audio_async` is called.
   - Upon completion, the `audio_player` component's source is updated, and it becomes visible instantly.
5. **Media Serving**: Audio files in `podcasts/` are served via `app.add_media_files`, allowing high-performance streaming.

## Tech Stack
- **Framework**: NiceGUI (FastAPI + Vue/Quasar)
- **AI Models**: Google Gemini (via `google-genai` SDK)
- **Audio Processing**: Pydub (blocking operations offloaded to threads)
- **Runtime**: Python 3.13 (managed with `uv`)
