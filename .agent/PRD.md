# Product Requirements Document (PRD): Kids Podcast Generator

## 1. Overview

The goal is to build a modern, single-page web application to generate highly specialized podcasts for kids. The podcasts will be context-aware (incorporating details about their home, garden, and preferences) and based on user-provided themes.

**V1 Enhancements**: Add precise control over duration, a script preview/edit step before audio generation, bilingual support, parallel bulk generation from a list of topics, prominent download options, and a history of generated podcasts.

## 2. Objectives

- Allow the user to manage a persistent "context" (stored simply in a text file).
- Allow the user to input a specific theme for the podcast, or a list of up to 10 themes.
- **New (V1)**: Allow the user to set a target duration (3 to 10 minutes) via a slider.
- **New (V1)**: Bilingual interactive pedagogy (teach 5 key English terms).
- **New (V1)**: Two-step generation: 1) Generate script & preview/edit in UI. 2) Approve & generate audio.
- Automate the synthesis of this script into a final audio file using TTS.
- **New (V1)**: Save generation history (link + description) locally and view it in a dialog.
- Provide a minimal, easy-to-use, and visually appealing interface.

## 3. Scope & Features

- **Context Management**: A text area to view and edit the kids' context (saved to `context.txt`).
- **Theme Input & Bulk**: A text area allowing one or multiple themes (up to 10, comma or newline separated).
- **Duration Control**: A slider to choose duration between 3 and 10 minutes.
- **Dynamic UI Layout**:
  - **Single Column**: If no scripts are generated, the app shows a single centered column for configuration (Step 1).
  - **Split View (1:2)**: If scripts are generated, the app switches to a two-column layout. Column 1 (1/3) remains for settings/history, and Column 2 (2/3) shows the previews and validation controls.
- **Audio Playback & Download**: An embedded audio player and a prominent download button for the generated podcast.
- **Cost Tracker**: A real-time display of the estimated cost for each generated episode (based on Gemini text/audio token counts).
- **History Dialog**: A button opening a Streamlit modal/dialog showing previously generated podcasts (saved in a local JSON or CSV file).

## 4. Tech Stack (Simplified)

- **Frontend & Backend**: Streamlit (Python). Perfect for single-page Data/AI apps.
- **Storage**: Local text files (`context.txt`, `prompt_template.txt`), local temporary audio files, and `history.md` for past generations.
- **AI Models**:
  - Script Generation: Gemini 3.0 Flash Preview (Google GenAI SDK)
  - Voice Synthesis: Gemini TTS API (Gemini 2.5 Flash TTS) for steerable, high-quality audio.
- **Concurrency**: `concurrent.futures` for parallel bulk generation.

## 5. Non-Goals

- A complex database or user authentication.
- Advanced audio effects (music, sound effects). We will stick to raw TTS dialogue for simplicity.
