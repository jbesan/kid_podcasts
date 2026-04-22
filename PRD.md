# Product Requirements Document (PRD) - Kids Podcast Generator V1

## 1. Goal
Improve the consistency and quality of generated podcasts and ensure a seamless, non-blocking UI experience. Specifically:
- Enhance performance steering using Director's Notes.
- Resolve UI sync issues where download buttons don't appear after generation.
- Implement a responsive UI using Streamlit Fragments and Asynchronous I/O.

## 2. Success Criteria
- [ ] Steering tags in transcripts are exclusively in English (e.g., `[curious]` instead of `[curieuse]`).
- [ ] No more "gender-switching" artifacts where a male voice sounds feminine due to tag inflections.
- [ ] The TTS prompt utilizes the standard blocks: `AUDIO PROFILE`, `THE SCENE`, and `DIRECTOR'S NOTES`.
- [ ] Podcasts sound more expressive with appropriate pauses and emotional transitions.
- [ ] UI provides immediate feedback during synthesis (isolated fragment updates).
- [ ] Download buttons appear reliably without full-page reruns.
- [ ] Backend generation is optimized using `asyncio` where appropriate.

## 3. User Journeys
1. **Transcript Generation**: The script generator model (Gemini 3 Flash) uses a refined set of English steering tags.
2. **TTS Synthesis**: The synthesis call receives a prompt with detailed Director's Notes and a transcript containing integrated tags.
3. **UI Interaction**: User clicks "Synthèse", the specific podcast card shows a "Generating..." state without freezing the whole app. Once complete, the audio player and download button appear in-place.

## 4. Technical Constraints
- Must remain compatible with `google-genai` SDK.
- Must use `gemini-3.1-flash-tts-preview` or `gemini-2.5-flash-preview-tts`.
- Prompting must follow the structure: Profile > Scene > Notes > Transcript.
- Streamlit components must use `st.fragment` for independent card updates.
- Use `client.aio` for asynchronous API calls to prevent blocking the main thread.
