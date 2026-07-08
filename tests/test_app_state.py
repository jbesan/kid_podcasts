from models.state import AppState


def test_app_state_initialization():
    """Test AppState initializes with defaults."""
    state = AppState()
    assert state.scripts == []
    assert state.audio_ready == {}
    assert state.total_session_cost == 0.0
    assert state.transcript_model == "gemini-2.5-pro"


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
    state.set_audio(index=0, audio_path="podcasts/test.wav", cost=0.01)

    assert state.audio_ready["0"] == "podcasts/test.wav"
    assert state.total_session_cost == 0.01


def test_app_state_model_migration():
    """Test that deprecated preview models are migrated to GA equivalents during hydration."""
    state = AppState()

    # 1. Test gemini-2.5-pro-preview migration
    state.hydrate_from_settings(
        {"version": 2, "transcript_model": "gemini-2.5-pro-preview"}
    )
    assert state.transcript_model == "gemini-2.5-pro"

    # 2. Test gemini-2.5-flash-preview migration
    state.hydrate_from_settings(
        {"version": 2, "transcript_model": "gemini-2.5-flash-preview"}
    )
    assert state.transcript_model == "gemini-2.5-flash"


def test_app_state_legacy_settings_reset():
    """Test that legacy settings (version < 2) reset models to pro defaults."""
    state = AppState()
    state.hydrate_from_settings(
        {
            "transcript_model": "gemini-2.5-flash",
            "tts_model": "gemini-2.5-flash-preview-tts",
        }
    )
    assert state.transcript_model == "gemini-2.5-pro"
    assert state.tts_model == "gemini-2.5-pro-preview-tts"


def test_app_state_hydrate_history():
    """Test that scripts history is hydrated correctly, auto-correcting active states to error."""
    state = AppState()
    history = [
        {
            "items": [{"speaker": "Marc", "text": "Bienvenue"}],
            "cost": 0.005,
            "status": "Prêt",
            "progress": 1.0,
            "duration_seconds": 120.0,
            "audio_path": "podcasts/test_1.mp3",
            "theme": "L'espace",
        },
        {
            "items": [],
            "cost": 0.001,
            "status": "Génération du script",
            "progress": 0.25,
            "duration_seconds": 0.0,
            "audio_path": None,
            "theme": "Les dinosaures",
        },
    ]

    state.hydrate_history(history)

    assert len(state.scripts) == 2
    assert state.total_session_cost == 0.006

    # Test completed episode hydration
    assert state.scripts[0]["status"] == "Prêt"
    assert state.scripts[0]["progress"] == 1.0
    assert state.scripts[0]["duration_seconds"] == 120.0
    assert state.scripts[0]["theme"] == "L'espace"
    assert state.audio_ready["L'espace"] == "podcasts/test_1.mp3"

    # Test active task auto-correction to error
    assert state.scripts[1]["status"] == "Erreur"
    assert state.scripts[1]["progress"] == 0.0
    assert state.scripts[1]["theme"] == "Les dinosaures"
