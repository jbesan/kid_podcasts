# Architecture - Kids Podcast Generator

## Overview
This application follows a modern Streamlit architecture optimized for long-running AI tasks. It leverages **Streamlit Fragments** for UI responsiveness and **Asynchronous I/O** for non-blocking API communication.

## Core Components

### 1. PodcastGenerator (`podcast_generator.py`)
- **Async Implementation**: Uses `google.genai.Client.aio` for non-blocking script generation and TTS synthesis.
- **Smart Retries**: Implements exponential backoff with `asyncio.sleep` to handle API rate limits (429) without blocking the Streamlit main thread.
- **Multi-Speaker TTS**: Uses Gemini's `MultiSpeakerVoiceConfig` to generate full conversations in a single pass.

### 2. Streamlit UI (`app.py`)
- **Fragment-First Design**: Each podcast card is encapsulated in an `@st.fragment`.
    - **Isolation**: Synthesizing one card does not block the rest of the application.
    - **Instant Feedback**: The "Estimated" cost and "Generating..." status update locally within the card's fragment.
    - **Seamless Reruns**: Upon completion, only the specific card reruns to show the audio player and final cost breakdown.
- **Async Batching**: Batch generation of scripts and audio uses `asyncio.gather` for high parallelism.
- **Session State Management**: Model settings and token costs are synchronized via `st.session_state` to ensure accessibility across fragment boundaries.

## Data Flow
1. **User Action**: User enters themes in the sidebar.
2. **Script Generation**: `asyncio.run(gen.generate_script_async)` triggers batch generation of scripts.
3. **Card Rendering**: The app loops through `st.session_state.scripts` and calls the `render_podcast_card` fragment for each.
4. **Individual Synthesis**:
   - User clicks "Synthèse Audio" on a card.
   - The fragment enters a `st.spinner` block.
   - `asyncion.run(gen.generate_podcast_audio_async)` is called locally.
   - Once finished, the fragment reruns *itself* to display the download button.
5. **Cost Tracking**: Precise costs are calculated using actual API `usage_metadata` and displayed per-episode.

## Tech Stack
- **Framework**: Streamlit
- **AI Models**: Google Gemini (via `google-genai` SDK)
- **Audio Processing**: Pydub
- **Runtime**: Python 3.13 (optimized with `uv`)
