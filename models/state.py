import os
from typing import Any

from pydantic import BaseModel, Field


class AppState(BaseModel):
    """Global application state for NiceGUI."""

    scripts: list[dict[str, Any]] = Field(default_factory=list)
    audio_ready: dict[str, str] = Field(
        default_factory=dict
    )  # Map of index -> audio_path
    api_key: str = ""
    transcript_model: str = "gemini-3-flash-preview"
    tts_model: str = "gemini-2.5-flash-preview-tts"
    current_category: str = "Éducation"
    shared_context: str = ""
    total_session_cost: float = 0.0

    def add_script(self, script: list[dict[str, Any]], cost: float):
        """Adds a new generated script to the list and updates cost."""
        self.scripts.append({"items": script, "cost": cost})
        self.total_session_cost += cost

    def set_audio(self, index: int, audio_path: str, cost: float):
        """Sets the audio path for a specific script and updates cost."""
        self.audio_ready[str(index)] = audio_path
        self.total_session_cost += cost

    @classmethod
    def load_from_env(cls):
        """Loads initial state from environment variables."""
        return cls(api_key=os.getenv("GOOGLE_API_KEY", ""))
