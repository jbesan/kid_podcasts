from utils.cost_calculator import calculate_cost


def test_calculate_cost_basic():
    """Test cost calculation with default model values."""
    # Using 1M in and 1M out to make the math easy
    # gemini-3-flash-preview: in=0.5, out=3.0 per 1M
    res = calculate_cost(
        tokens_in_text=1_000_000,
        tokens_out_text=1_000_000,
        audio_duration_seconds=10,
        text_model="gemini-3-flash-preview",
        tts_model="gemini-2.5-flash-preview-tts",
        audio_in_tokens=1_000_000,
        audio_out_tokens=1_000_000,
    )

    # text_cost = (1M * 0.5 + 1M * 3.0) / 1M = 3.5
    assert res["text_cost"] == 3.5
    # audio_cost = (1M * 0.3 + 1M * 10.0) / 1M = 10.3
    assert res["audio_cost"] == 10.3
    assert res["total_cost"] == 13.8


def test_calculate_cost_defaults():
    """Test cost calculation with inferred audio tokens."""
    res = calculate_cost(
        tokens_in_text=100,
        tokens_out_text=200,
        audio_duration_seconds=60,
        text_model="gemini-3-flash-preview",
        tts_model="gemini-2.5-flash-preview-tts",
    )

    # audio_in_tokens should default to tokens_out_text (200)
    assert res["audio_in_tokens"] == 200
    # audio_out_tokens should default to 60 * 25 = 1500
    assert res["audio_out_tokens"] == 1500


def test_calculate_cost_unknown_model():
    """Test fallback to default model if unknown model provided."""
    # Should fallback to gemini-3-flash-preview rates
    res = calculate_cost(
        tokens_in_text=1_000_000,
        tokens_out_text=1_000_000,
        audio_duration_seconds=0,
        text_model="unknown-model",
        tts_model="gemini-2.5-flash-preview-tts",
        audio_in_tokens=0,
        audio_out_tokens=0,
    )
    assert res["text_cost"] == 3.5
