# Kids Podcast Generator V1

A professional-grade, specialized podcast generator for kids, powered by the latest Gemini 3.0 and 2.5 models.

## 🚀 Features

- **Gemini 3.0 Flash Preview**: High-quality script generation with deep educational content, storytelling, and bilingual pedagogy.
- **Gemini 2.5 Flash TTS**: Real-time, expressive audio synthesis with natural language steering (Sophie & Marc/Algieba).
- **Batch Synthesis**: Automated sequential generation of multiple podcasts with smart rate limiting (10 RPM).
- **Fragments & Async**: High-responsiveness architecture using `@st.fragment` and `asyncio.gather`. Synthesis for one card is non-blocking and isolated.
- **Robustness**: Smart async retry mechanism with exponential backoff and `retryDelay` parsing to handle API rate limits without freezing the UI.
- **Granular Costing**: Episode-centric cost breakdown (Transcript vs. Audio) displayed directly on each card.
- **Dynamic Interface**: A clean Streamlit layout with a configuration sidebar for API Key and model selection synced via session state.

## 🛠️ Setup

1. **Clone the repository**:

   ```bash
   git clone <repo-url>
   cd kid_podcasts
   ```

2. **Environment & Dependencies**:
   This project is optimized for **Python 3.13+** and uses **`uv`** for all management.
   ```bash
   brew install uv  # If needed
   uv sync          # Create venv and install dependencies
   ```

3. **Run the App**:
   ```bash
   uv run streamlit run app.py
   ```

## 📐 Astral Development Workflow

We follow a strict "Quality Pillars" workflow using modern Rust-powered tools:

| Pillar | Task | Command |
| :--- | :--- | :--- |
| **Manage** | Dependency sync | `uv sync` |
| **Format** | Code style | `uv run ruff format` |
| **Lint** | Quality checks | `uv run ruff check --fix` |
| **Type** | Static analysis | `uv run ty check` |

## ⚖️ Python 3.13 Support

This project is fully compatible with **Python 3.13**. To resolve the removal of the `audioop` module (PEP 594), we use the `audioop-lts` community replacement. No manual patching is required; `uv sync` handles everything automatically.

## 📐 Architecture

- **Fragment-First UI**: Individual podcast cards update independently without full-page reruns.
- **Async Engine**: Uses `google.genai.Client.aio` and `asyncio.sleep` for non-blocking I/O.
- **Double-Pass Batching**: Both script generation and audio synthesis use `asyncio.gather` for parallel processing.
- **Text Generation**: Supports multiple models (e.g., `gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`) to handle logic, tone, and duration constraints.
- **Audio Generation**: Supports specialized TTS models (e.g., `gemini-2.5-flash-preview-tts`) for high-fidelity voices with natural language instructions.
- **Model Steering**: Optimized using standardized English steering tags (`[excited]`, `[curious]`, `[short pause]`) for professional delivery.

## 📝 Usage

1. **Context**: Describe the children's preferences (e.g., "They like wolves", "South West France").
2. **Themes**: Enter subjects (one per line).
3. **Duration**: Select target duration (3-10 minutes).
4. **Generate & Edit**: Refine the script if needed.
5. **Synthesis**: One-click audio generation with real-time cost feedback.

---

Fait avec ❤️ par Antigravity
