# V1 Implementation Tasks

- [x] Create `history.md` and basic management functions
- [x] Refactor `app.py` for 3-column layout
- [x] Update `podcast_generator.py` for Gemini 3.0 Flash + Gemini 2.5 TTS
- [x] Replace Cloud TTS with Native Gemini TTS (No SSML)
- [x] Implement bulk generation logic with retries
- [x] Implement Cost Tracker (token-based estimates)
- [x] Implement Dynamic Column Visibility (Hide right col if empty)
- [x] Move 📝 Contexte to Dialog + Button in Column 1
- [x] Configure environment variables via `.env`
- [x] Fix script display & layout logic in `app.py`
- [x] Final Verification & cleanup

# V1.3 Robustness Overhaul

- [/] Group consecutive script lines by speaker to minimize RPM usage.
- [ ] Implement `retryDelay` parsing for smart 429 handling.
- [x] Implement exponential backoff retry for TTS (Rate Limit Handling).
- [x] Rewrite `prompt_template.txt` for pacing, depth, and specific steering.
- [x] Refactor `podcast_generator.py` to use ThreadPoolExecutor for parallel TTS.

# V1.5 Pacing & Consistency Optimization
- [/] Inject [pause 200ms] automatically at start of lines to slow down pace.
- [/] Remove batching to process entire script in one call (voice consistency).
- [ ] Improve preamble with "slow and articulate" instructions.
- [ ] Add enhanced logging to Gemini TTS calls.

# V1.2 Stability & Quality

- [x] Ensure atomic completion of audio generation (fail if any segment fails).

# V1.1 Enhancements

- [ ] Refactor `podcast_generator.py` to use ThreadPoolExecutor for parallel TTS.
