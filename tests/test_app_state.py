from models.state import AppState


def test_app_state_initialization():
    """Test AppState initializes with defaults."""
    state = AppState()
    assert state.scripts == []
    assert state.audio_ready == {}
    assert state.total_session_cost == 0.0
    assert state.transcript_model == "gemini-3-flash-preview"


def test_app_state_add_script():
    """Test adding a script updates state and cost."""
    state = AppState()
    script = [{"speaker": "Sophie", "text": "Hello"}]
    state.add_script(script, cost=0.005)

    assert len(state.scripts) == 1
    assert state.scripts[0]["items"] == script
    assert state.total_session_cost == 0.005


def test_app_state_set_audio():
    """Test setting audio updates audio_ready map and cost."""
    state = AppState()
    state.set_audio(index=0, audio_path="podcasts/test.mp3", cost=0.01)

    assert state.audio_ready["0"] == "podcasts/test.mp3"
    assert state.total_session_cost == 0.01
