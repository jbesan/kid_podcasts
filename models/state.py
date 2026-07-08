import os
from typing import Any

from pydantic import BaseModel, Field

from config import DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL


class AppState(BaseModel):
    """Global application state for NiceGUI."""

    scripts: list[dict[str, Any]] = Field(default_factory=list)
    audio_ready: dict[str, str] = Field(
        default_factory=dict
    )  # Map of index -> audio_path
    api_key: str = ""
    transcript_model: str = DEFAULT_TRANSCRIPT_MODEL
    tts_model: str = DEFAULT_TTS_MODEL
    current_category: str = "Éducation"
    shared_context: str = ""
    duration_val: int = 7
    age_val: int = 7
    total_session_cost: float = 0.0

    def add_script(
        self, script: list[dict[str, Any]], cost: float, status: str = "Script ready"
    ):
        """Adds a new generated script to the list and updates cost."""
        self.scripts.append(
            {
                "items": script,
                "cost": cost,
                "status": status,
                "progress": 1.0
                if "ready" in status.lower() or "prêt" in status.lower()
                else 0.25,
                "duration_seconds": 0.0,
                "audio_path": None,
                "theme": f"Episode {len(self.scripts) + 1}",
            }
        )
        self.total_session_cost += cost

    def set_audio(self, index: int, audio_path: str, cost: float):
        """Sets the audio path for a specific script and updates cost."""
        self.audio_ready[str(index)] = audio_path
        if index < len(self.scripts):
            self.scripts[index]["audio_path"] = audio_path
            self.scripts[index]["status"] = "Prêt"
            self.scripts[index]["progress"] = 1.0
            self.scripts[index]["cost"] += cost
        self.total_session_cost += cost

    @classmethod
    def load_from_env(cls):
        """Loads initial state from environment variables."""
        return cls(api_key=os.getenv("GOOGLE_API_KEY", ""))

    def hydrate_from_settings(self, settings: dict[str, Any]) -> None:
        """Hydrates the state with small persistent settings from client browser storage.

        Args:
            settings: Dictionary of saved preferences and parameters.
        """
        self.api_key = settings.get("api_key", self.api_key)

        # Migrate deprecated/old default models
        version = settings.get("version", 0)
        t_model = settings.get("transcript_model", self.transcript_model)
        if version < 2:
            if (
                t_model
                in (
                    "gemini-3-flash-preview",
                    "gemini-2.5-flash-preview",
                    "gemini-2.5-flash",
                )
                or t_model == "gemini-2.5-pro-preview"
            ):
                t_model = DEFAULT_TRANSCRIPT_MODEL
        else:
            if t_model == "gemini-2.5-pro-preview":
                t_model = "gemini-2.5-pro"
            elif t_model == "gemini-2.5-flash-preview":
                t_model = "gemini-2.5-flash"
        self.transcript_model = t_model

        tts_model = settings.get("tts_model", self.tts_model)
        if version < 2 and tts_model == "gemini-2.5-flash-preview-tts":
            tts_model = DEFAULT_TTS_MODEL
        self.tts_model = tts_model

        self.current_category = settings.get("current_category", self.current_category)
        self.shared_context = settings.get("shared_context", self.shared_context)
        self.duration_val = settings.get("duration_val", self.duration_val)
        self.age_val = settings.get("age_val", self.age_val)

    def extract_settings(self) -> dict[str, Any]:
        """Extracts only the small persistent configuration settings for browser cookie storage.

        Returns:
            A dictionary containing only the serializable preference parameters.
        """
        return {
            "api_key": self.api_key,
            "transcript_model": self.transcript_model,
            "tts_model": self.tts_model,
            "current_category": self.current_category,
            "shared_context": self.shared_context,
            "duration_val": self.duration_val,
            "age_val": self.age_val,
            "version": 2,
        }

    def hydrate_history(self, scripts_list: list[dict[str, Any]]) -> None:
        """Hydrates scripts history from browser local storage, auto-correcting active states to error.

        Args:
            scripts_list: List of serialized script history dictionaries.
        """
        self.scripts = []
        self.total_session_cost = 0.0
        self.audio_ready = {}

        for i, script in enumerate(scripts_list):
            cost = script.get("cost", 0.0)
            self.total_session_cost += cost

            status = script.get("status", "Erreur")
            progress = script.get("progress", 0.0)
            audio_path = script.get("audio_path")

            if status in ("En attente", "Génération du script", "Synthèse audio"):
                status = "Erreur"
                progress = 0.0

            restored_script = {
                "items": script.get("items", []),
                "cost": cost,
                "status": status,
                "progress": progress,
                "duration_seconds": script.get("duration_seconds", 0.0),
                "audio_path": audio_path,
                "theme": script.get("theme", f"Episode {i + 1}"),
            }
            self.scripts.append(restored_script)

            if status == "Prêt" and audio_path:
                self.audio_ready[str(restored_script["theme"])] = audio_path
