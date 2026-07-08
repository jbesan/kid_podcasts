# Product Requirements Document (PRD) - Kids Podcast Generator V2 (NiceGUI Edition)

## 1. Goal
Provide a premium, modern, and structured user interface for the Kids Podcast Generator following the migration to NiceGUI.
- Improve visual aesthetics to look "professional" and "premium".
- Streamline the user workflow by hiding technical settings.
- Enhance script and audio management with a modern card-based layout.
- Fix functional bugs (TTS cost tracking, missing download button).

## 2. Success Criteria
- [ ] **Modern Aesthetic**: UI uses a curated color palette (Quasar primary/secondary), glassmorphism effects, and consistent spacing.
- [ ] **Clean Workspace**: API Keys and Model pickers are relegated to a "Settings" modal.
- [ ] **Prominent Context**: "Kids Context" is integrated into the main configuration area, not hidden in a sidebar button.
- [ ] **Interactive Cards**: Episode cards are compact by default, with expandable script editors and clear action buttons.
- [ ] **Downloadable Content**: Each synthesized episode has a clearly visible "Download MP3" button.
- [ ] **Accurate Cost Tracking**: The total session cost updates in real-time for both script generation and TTS synthesis.

## 3. User Journeys
1. **Configuration**: User enters the children's context (e.g., "Max and Julie, love space and dogs") directly in the main view.
2. **Generation**: User provides themes and clicks a prominent "Generate" button. Cards appear for each theme.
3. **Refinement**: User expands a card to tweak the script if needed.
4. **Synthesis**: User clicks "Synthesize". A progress indicator shows activity.
5. **Consumption**: Once ready, the card shows an audio player, the calculated cost, and a "Download" button.
6. **Persistence**: User can save settings or view history via secondary actions.

## 4. Technical Constraints
- **Framework**: NiceGUI (FastAPI + Quasar + Tailwind).
- **State Management**: Per-session `AppState` (Pydantic-based).
- **Persistence**: `app.storage.user` for settings.
- **Async I/O**: All API calls must be non-blocking.
- **Media**: Audio files served via `/podcasts` media mount.
