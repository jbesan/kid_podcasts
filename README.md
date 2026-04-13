# Kids Podcast Generator V1

A professional-grade, specialized podcast generator for kids, powered by the latest Gemini 3.0 and 2.5 models.

## 🚀 Features

- **Gemini 3.0 Flash Preview**: High-quality script generation with deep educational content, storytelling, and bilingual pedagogy.
- **Gemini 2.5 Flash TTS**: Real-time, expressive audio synthesis with natural language steering (Sophie & Marc/Algieba).
- **Batch Synthesis**: Automated sequential generation of multiple podcasts with smart rate limiting (10 RPM).
- **Parallel Synthesis**: Accelerated script generation for multiple topics simultaneously.
- **Robustness**: Smart retry mechanism with exponential backoff and `retryDelay` parsing to handle API rate limits (10 RPM).
- **Cost Tracker**: Precise token-based cost estimation and actual cost tracking (25 tokens/sec for audio).
- **History Management**: Persistent logging of generated episodes in `history.md`.
- **Dynamic Interface**: A clean 3-column Streamlit layout (Config -> Edit/Preview -> History).

## 🛠️ Setup

1. **Clone the repository**:

   ```bash
   git clone <repo-url>
   cd kid_podcasts
   ```

2. **Environment**:
   Create a `.env` file and add your key:

   ```bash
   GOOGLE_API_KEY="your-api-key"
   ```

3. **Install Dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

4. **Run the App**:
   ```bash
   streamlit run app.py
   ```

## 📐 Architecture

- **Text Generation**: `gemini-3-flash-preview` handles the logic, tone, and duration constraints (130 words/min).
- **Audio Generation**: `gemini-2.5-flash-preview-tts` provides high-fidelity voices with natural language instructions (`[Sophie - enthousiaste]`).
- **Processing**: Python `concurrent.futures` for speed and atomic assembly for reliability.

## 📝 Usage

1. **Context**: Describe the children's preferences (e.g., "They like wolves", "South West France").
2. **Themes**: Enter subjects (one per line).
3. **Duration**: Select target duration (3-10 minutes).
4. **Generate & Edit**: Refine the script if needed.
5. **Synthesis**: One-click audio generation with real-time cost feedback.

---

Fait avec ❤️ par Antigravity
