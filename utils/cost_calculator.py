"""Cost calculation utility for Gemini API usage."""

PRICING = {
    "text": {
        "gemini-3.5-flash": {"in": 0.50, "out": 3.00},
        "gemini-3-flash-preview": {"in": 0.50, "out": 3.00},
        "gemini-3.1-flash-lite-preview": {"in": 0.25, "out": 1.50},
        "gemini-3.1-pro-preview": {"in": 2.00, "out": 12.00},
        "gemini-2.5-flash": {"in": 0.30, "out": 2.50},
        "gemini-2.5-pro": {"in": 1.25, "out": 10.00},
        "gemini-2.5-flash-preview": {"in": 0.30, "out": 2.50},
        "gemini-2.5-pro-preview": {"in": 1.25, "out": 10.00},
        "gemini-2.0-flash": {"in": 0.15, "out": 0.60},
    },
    "tts": {
        "gemini-2.5-flash-preview-tts": {"in": 0.30, "out": 10.00},
        "gemini-2.5-pro-preview-tts": {"in": 1.25, "out": 20.00},
        "gemini-3.1-flash-tts-preview": {"in": 1.00, "out": 20.00},
    },
}


def calculate_cost(
    tokens_in_text: int,
    tokens_out_text: int,
    audio_duration_seconds: float,
    text_model: str,
    tts_model: str,
    audio_in_tokens: int | None = None,
    audio_out_tokens: int | None = None,
) -> dict[str, float | int]:
    """Calculates detailed cost breakdown based on model versions.

    Args:
        tokens_in_text: Number of input tokens for the transcript.
        tokens_out_text: Number of output tokens for the transcript.
        audio_duration_seconds: Duration of generated audio in seconds.
        text_model: The model ID used for transcript generation.
        tts_model: The model ID used for TTS synthesis.
        audio_in_tokens: Optional explicit count of audio input tokens.
        audio_out_tokens: Optional explicit count of audio output tokens.

    Returns:
        A dictionary containing cost breakdown and token counts.
    """
    text_rates = PRICING["text"].get(text_model, PRICING["text"]["gemini-2.5-pro"])
    tts_rates = PRICING["tts"].get(
        tts_model, PRICING["tts"]["gemini-2.5-pro-preview-tts"]
    )

    # 1. Transcript Cost
    cost_text = (
        tokens_in_text * text_rates["in"] + tokens_out_text * text_rates["out"]
    ) / 1_000_000

    # 2. TTS Cost
    if audio_in_tokens is None:
        # Input tokens for TTS is roughly the script tokens
        audio_in_tokens = tokens_out_text

    if audio_out_tokens is None:
        # Audio output tokens estimation: 25 per second
        audio_out_tokens = int(audio_duration_seconds * 25)

    cost_audio = (
        audio_in_tokens * tts_rates["in"] + audio_out_tokens * tts_rates["out"]
    ) / 1_000_000

    return {
        "text_cost": cost_text,
        "audio_cost": cost_audio,
        "total_cost": cost_text + cost_audio,
        "audio_in_tokens": audio_in_tokens,
        "audio_out_tokens": audio_out_tokens,
    }
