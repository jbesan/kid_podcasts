# Implementation Plan

## Goal Description

Upgrade the Streamlit kids podcast generator to V1. Key features include duration control (3-10 min), a two-step generation process (preview/edit script before audio), interactive bilingual pedagogy (French/English for specific words), bulk parallel generation for up to 10 themes, prominent download options, and a local history of generated podcasts.

## User Review Required

> [!IMPORTANT]
> Please review this updated plan for V1 features.
> **Options considered for Bulk Generation:**
>
> 1. _Sequential Pipeline_: Generate script 1 -> audio 1 -> script 2 -> audio 2. Slow.
> 2. _Parallel Pipeline_: Generate scripts simultaneously, ask for approval, then generate audio simultaneously using `concurrent.futures`. (Recommended). **We will add a graceful retry mechanism with exponential backoff to handle `429 Too Many Requests` when doing this in parallel.**
>
> **Options for History:**
>
> 1. _Local Markdown File_: Simple, easy to read and rewrite in python. (Recommended based on feedback)
> 2. _Local JSON_: Also simple, but less readable.
>
> **Options for Preview UI:**
>
> 1. _Dynamic Columns_: Use `if st.session_state.scripts:` to switch between `st.columns([1, 2])` and a single column view.
> 2. _Dialogs_: Use `st.dialog` for both History and Context management to keep the workspace clean.
>
> **Gemini 3.0 Flash Strategy (Updated)**: We will use **Gemini 3.0 Flash Preview** for text generation and **Gemini 2.5 Flash TTS** for audio.
>
> - **Cost (Text)**: $0.50 in / $3.00 out per 1M tokens.
> - **Cost (Audio)**: $0.50 in / $10.00 out per 1M tokens.
> - **Quality**: Pro-level intelligence for script writing; steerable audio.

## Proposed Changes

### Configuration & Dependencies

#### [MODIFY] app.py

- **Dynamic Layout Implementation**:
  - Check `if st.session_state.scripts`.
  - If empty: show configuration in a centered container (`st.columns([1, 2, 1])[1]`).
  - If not empty: use `st.columns([1, 2])` for configuration and previews.
- Session state management to handle two-step flow (`st.session_state.scripts_generated`, `st.session_state.approved`).
- Integrate bulk processing loop with retry backoff for Gemini 429s.
- Extract download and playback logic to handle multiple outputs.

#### [MODIFY] podcast_generator.py

- Load the prompt from `prompt_template.txt`.
- Update `generate_script` prompt to incorporate:
  - Precise duration targets (prompting Gemini to adjust script length based on the 3-10 min input).
  - Bilingual pedagogy: Instruct Gemini to teach 5 key English terms, using the exact wording specified in the old prompt ("En Anglais, on dit...").
  - Handle tricky bilingual words (like "Mars"): instructing Gemini to use natural language steering or SSML `<voice>` tags for correct pronunciation.
- Add logic for parallel processing (e.g. `generate_multiple_scripts`, `generate_multiple_audios`) using `ThreadPoolExecutor`.

#### [NEW] history.py (or functions in app.py)

- Functions to read/write to a `history.md` file.
- Saving metadata: Date, Theme, Duration, File Path, Description, **Estimated Cost**.

#### [NEW] Cost Tracker (Logic in app.py)

- Integrate pricing constants:
  - Gemini 3.0 Flash (Text): $0.50 in / $3.00 out per 1M tokens.
  - Gemini 2.5 Flash TTS (Audio): $0.50 in / $10.00 out per 1M tokens.
  - **Audio Token Logic**: For the TTS model, audio input/output is billed based on tokens. We use the estimation of **25 tokens per second of generated audio**.
- Display cumulative cost per episode in the UI.

#### [NEW] README.md

- Create a comprehensive README following SOTA practices (Features, Requirements, Setup, Usage, Architecture).

#### [NEW] requirements.txt

- Ensure dependencies are up to date. Add `pytest` for testing.

> **TTS Strategy**: We are switching to a **Pure Gemini Architecture**.
>
> - **Model**: `gemini-2.5-flash-preview-tts` (Native Multi-modal).
> - **Steering**: Instead of SSML, we use natural language indicators in brackets (e.g., `[Sophie]`, `[enthousiaste]`, `[lentement]`).
> - **Benefit**: Higher quality, lower latency, and zero dependency on legacy Cloud TTS SDKs.

### Automated Tests

- `pytest` on prompt generation logic to ensure duration and language constraints are correctly formatted.
- `pytest` on json parsing to ensure the resulting script is correctly structured even for multiple themes.

## Prompt Engineering & Content Quality

The `prompt_template.txt` will be rewritten to address the following feedback from the NotebookLM baseline:

- **Characters**: Formalize Marc (Calm/Pedagogue) and Sophie (Enthusiastic/Curious).
- **Steering Rules**: Restrict steering options to valid states: `[enthousiaste]`, `[curieux]`, `[pédagogue]`, `[blagueur]`. Forbid tempo markers like `[lentement]` which cause erratic cadence.
- **Pacing**: Remove generic `[pause 1s]` tags except for the interactive English learning moments. Reduce onomatopoeias drastically.
- **Depth**: Force a structured approach: Hook -> Story -> 3 deep educational facts -> 5 English words -> Outro.
- **Duration**: Target ~130 words per minute. For 8 minutes, we need over 1000 words. Instruct the model to increase the word count explicitly.

## Parallel Audio Generation (Technical)

### [MODIFY] podcast_generator.py

The loop generating TTS is currently sequential. We will use `concurrent.futures.ThreadPoolExecutor` to parallelize requests to the `gemini-2.5-flash-preview-tts` API.

- Create a list of futures mapping to each script snippet.
- Retrieve the results but ensure they are stitched together _in order_.
- Add a safety `time.sleep` (if necessary) to respect rate limits, though Gemini's limit might allow concurrent bursts.

## Rate Limit Handling & Atomic Reliability

### [MODIFY] podcast_generator.py

- **Line Grouping**: Before synthesis, group consecutive blocks of the same speaker into a single "chunk". This significantly reduces the number of API calls for dialogue-heavy scripts.
- **Smart Retries**:
  - Parse the `retryDelay` (e.g., "34s") directly from the Google API error response if available.
  - Implement a `time.sleep` that respects this duration.
- **Atomic Generation**: Keep the architecture where any terminal failure cancels the whole audio assembly.
- **Strict Throttling**: Reduce `max_workers` to 1 or 2 to stay well within the 10 RPM "burst" limit.

## Pacing & Consistency Optimization (V1.5)

### [MODIFY] podcast_generator.py
- **Auto-Pause Injection**: In `synthesize_multi_speaker`, prepend `[pause 200ms]` to every line's text to artificially reduce the speaking rate.
- **Single-Pass Synthesis**: Remove the batching loop in `generate_podcast_audio`. Pass the entire script to `synthesize_multi_speaker` in one call to ensure voice continuity.
- **Enhanced Preamble**: Update system instructions for TTS: `"TTS this conversation slowly and articulately for small children."`
- **Verbose Logging**: Log exact char count, speaker count, and total API latency.

## Verification Plan

1. Run `streamlit run app.py`.
2. Enter multiple themes (e.g. "Les dinosaures\nL'espace") and set duration to 4 minutes.
3. Click "Generate Scripts". Verify scripts appear in the right column, are editable, and contain English vocabulary learning sections.
4. Edit a script, click "Approve and Generate Audio".
5. Wait for parallel audio generation.
6. Play and download the resulting audios.
7. Open History dialog and verify the new generations are listed.
