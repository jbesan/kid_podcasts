# Kids Podcast Generator V2 (NiceGUI Edition)

A professional-grade, specialized podcast generator for kids, powered by the latest Gemini 3.5 and 2.5 models, using a modern NiceGUI-based reactive user interface.

## 🚀 Features

- **Gemini 3.5 Pro**: High-quality script generation with deep educational content, storytelling, and bilingual pedagogy.
- **Gemini 2.5 Flash / Pro TTS**: Real-time, expressive audio synthesis with natural language steering.
- **Batch Synthesis**: Automated sequential generation of multiple podcasts with smart rate limiting.
- **Non-Blocking UI**: Asynchronous event handlers using NiceGUI and background execution, ensuring the UI remains perfectly fluid.
- **Parameters Isolation**: Every podcast episode is encapsulated in its own Pydantic `PodcastEpisode` model, ensuring configuration parameters (category, topic, age, models) are fully isolated from UI state changes.
- **Granular Costing**: Episode-centric cost breakdown (Transcript vs. Audio) displayed directly on each card.
- **Dynamic Interface**: A premium card-based layout featuring expanders, loading spinners, and audio players.

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
   uv run python main.py
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

- **Centralized Reactive State**: Central state (`AppState` and `PodcastEpisode` models) automatically syncs with NiceGUI components.
- **Async Engine**: Uses `google.genai.Client.aio` for non-blocking I/O operations.
- **Double-Pass Batching**: Generates script and audio in separate sequential steps per episode.
- **Text Generation**: Uses `gemini-3.5-pro` for deep reasoning, structuring, and script writing.
- **Audio Generation**: Supports specialized TTS voice configurations.


## 📝 Usage

1. **Context**: Describe the children's preferences (e.g., "They like wolves", "South West France").
2. **Themes**: Enter subjects (one per line).
3. **Duration**: Select target duration (3-10 minutes).
4. **Generate & Edit**: Refine the script if needed.
5. **Synthesis**: One-click audio generation with real-time cost feedback.

---

Fait avec ❤️ par Antigravity
