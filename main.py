import json
import logging
import os
from collections.abc import Callable
from typing import Any

from dotenv import load_dotenv
from nicegui import Client, app, ui

from models.state import AppState
from podcast_generator import PodcastGenerator
from utils.cost_calculator import calculate_cost

# Load environment variables
load_dotenv(override=True)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("kid_podcasts.main")

# Configure Media Serving
if not os.path.exists("podcasts"):
    os.makedirs("podcasts")
app.add_media_files("/podcasts", "podcasts")


class PodcastCard(ui.card):
    """
    Modern NiceGUI component for an individual podcast episode card.
    """

    def __init__(
        self,
        index: int,
        script_data: dict,
        app_state: AppState,
        gen: list[PodcastGenerator | None],
        retry_fn: Callable[[dict, "PodcastCard"], Any] | None = None,
    ):
        super().__init__()
        self.index = index
        self.script_data = script_data
        self.state = app_state
        self.generator = gen
        self.retry_fn = retry_fn
        self.classes(
            "w-full q-pa-none rounded-xl overflow-hidden border border-slate-100 shadow-sm hover:shadow-md transition-shadow"
        )
        self._content = ui.refreshable(self._render_content)
        with self:
            self._content()

    def _render_content(self) -> None:
        """Constructs the UI elements for the podcast card."""
        status = self.script_data.get("status", "Unknown")
        theme = self.script_data.get("theme", f"Episode {self.index + 1}")
        cost = self.script_data.get("cost", 0.0)
        progress = self.script_data.get("progress", 0.0)
        duration = self.script_data.get("duration_seconds", 0.0)
        audio_path = self.script_data.get("audio_path")

        # Color mapping for status badges
        badge_colors = {
            "En attente": "bg-slate-100 text-slate-600",
            "Génération du script": "bg-blue-100 text-blue-600",
            "Synthèse audio": "bg-orange-100 text-orange-600",
            "Prêt": "bg-green-100 text-green-600",
            "Erreur": "bg-red-100 text-red-600",
        }
        color_class = badge_colors.get(status, "bg-slate-100 text-slate-600")

        # Quasar colors for progress bar
        color_props = {
            "En attente": "grey-5",
            "Génération du script": "blue",
            "Synthèse audio": "orange",
            "Prêt": "green",
            "Erreur": "red",
        }
        color_prop = color_props.get(status, "grey-5")

        with ui.row().classes(
            "w-full items-center justify-between q-pa-md gap-4 flex-wrap sm:flex-nowrap"
        ):
            # 1. Episode & Title
            with ui.column().classes("gap-0 min-w-[150px]"):
                ui.label(theme).classes("text-sm font-bold text-slate-800 line-clamp-1")
                ui.label(f"Episode {self.index + 1}").classes(
                    "text-[10px] text-slate-400"
                )

            # 2. Status Badge & Mini Progress Bar
            with ui.row().classes("items-center gap-3 shrink-0"):
                with ui.row().classes(
                    f"items-center q-px-sm q-py-xs rounded text-[10px] font-bold uppercase tracking-wider {color_class} gap-1"
                ):
                    if "Génération" in status or "Synthèse" in status:
                        ui.spinner(size="10px")
                    ui.label(status)

                if status in ("Génération du script", "Synthèse audio"):
                    ui.linear_progress(value=progress, show_value=False).props(
                        f'color="{color_prop}"'
                    ).classes("w-16 h-1 rounded")
                    ui.label(f"{int(progress * 100)}%").classes(
                        "text-[10px] text-slate-400"
                    )

            # 3. Cost & Duration Info
            with ui.row().classes(
                "items-center gap-2 text-caption text-slate-500 text-xs shrink-0"
            ):
                ui.label(f"Coût : {cost:.4f} $")
                if status == "Prêt" and duration > 0:
                    m = int(duration // 60)
                    s = int(duration % 60)
                    duration_str = f"{m}m {s}s" if m > 0 else f"{s}s"
                    ui.label(f"• Durée : {duration_str}").classes(
                        "font-medium text-slate-700"
                    )

            # 4. Actions (Audio, Download, Retry)
            with ui.row().classes("items-center gap-2 shrink-0"):
                if status == "Prêt" and audio_path:
                    filename = os.path.basename(audio_path)
                    media_url = f"/podcasts/{filename}"
                    ui.audio(src=media_url).classes("h-8 w-40")
                    ui.button(on_click=lambda: ui.download(media_url, filename)).props(
                        "flat round dense icon=download"
                    ).classes("text-primary")

                elif status == "Erreur":
                    retry = self.retry_fn
                    if retry:
                        ui.button(
                            "Réessayer", on_click=lambda: retry(self.script_data, self)
                        ).props("flat color=primary icon=refresh").classes("text-xs")

    def refresh(self) -> None:
        self._content.refresh()


class SettingsDialog(ui.dialog):
    """Dialog for technical settings (API Keys, Models)."""

    def __init__(self, state: AppState, on_change=None):
        super().__init__()
        self.state = state
        self.on_change = on_change
        with self, ui.card().classes("w-full max-w-md q-pa-lg shadow-24"):
            ui.label("Paramètres Techniques").classes("text-h5 q-mb-md")

            # Google AI Studio Help Card (BYOK Guide)
            with ui.card().classes(
                "w-full bg-blue-50 border border-blue-100 q-pa-md rounded-lg q-mb-md gap-1"
            ):
                with ui.row().classes("items-center gap-2"):
                    ui.icon("auto_awesome", size="1.2rem").classes("text-blue-600")
                    ui.label("Clé API Gemini Gratuite").classes(
                        "font-bold text-blue-800 text-sm"
                    )
                ui.markdown(
                    "1. Accédez à [Google AI Studio](https://aistudio.google.com/)\n"
                    '2. Cliquez sur **"Get API key"** (Projet gratuit à 0$/mois)\n'
                    "3. Copiez-collez votre clé ci-dessous."
                ).classes("text-xs text-blue-700 q-ml-sm")
                with ui.row().classes("items-center gap-1 q-mt-xs q-ml-sm"):
                    ui.icon("lock", size="0.9rem").classes("text-slate-500")
                    ui.label(
                        "Stocké uniquement dans votre navigateur via cookie chiffré."
                    ).classes("text-[10px] text-slate-500 italic")

            # API Key Input
            self.api_input = (
                ui.input(
                    "Google API Key",
                    password=True,
                    password_toggle_button=True,
                    on_change=self._handle_api_change,
                )
                .bind_value(state, "api_key")
                .classes("w-full")
            )

            ui.separator().classes("q-my-md")

            ui.label("Modèles Gemini").classes("text-subtitle1 q-mb-sm")
            ui.select(
                options=[
                    "gemini-3.5-flash",
                    "gemini-3-flash-preview",
                    "gemini-3.1-pro-preview",
                    "gemini-2.5-flash",
                    "gemini-2.5-pro",
                    "gemini-2.0-flash",
                ],
                label="Script Model",
            ).bind_value(state, "transcript_model").classes("w-full")

            ui.select(
                options=[
                    "gemini-2.5-flash-preview-tts",
                    "gemini-2.5-pro-preview-tts",
                    "gemini-3.1-flash-tts-preview",
                ],
                label="TTS Model",
            ).bind_value(state, "tts_model").classes("w-full")

            with ui.row().classes("w-full justify-end q-mt-lg"):
                ui.button("Sauvegarder", on_click=self._save).props(
                    "unelevated color=primary"
                )
                ui.button("Fermer", on_click=self.close).props("flat")

    def _handle_api_change(self, e):
        if self.on_change:
            self.on_change(e.value)

    def _save(self):
        # Save to server-side user storage
        settings = self.state.extract_settings()
        app.storage.user["settings"] = settings
        # Sync to client-side localStorage to survive scale-to-zero events
        ui.run_javascript(
            f"localStorage.setItem('kids_podcast_settings', {json.dumps(json.dumps(settings))})"
        )
        ui.notify("Paramètres sauvegardés", type="positive")
        self.close()


@ui.page("/")
async def main_page(client: Client):
    """Main application page for the Podcast Generator."""
    state = AppState.load_from_env()

    # Generator reference
    generator = [None]  # Use a list to make it mutable in closures

    # 1. Try to load from server-side user storage first
    settings = app.storage.user.get("settings")
    history = app.storage.user.get("history")

    # 2. If server-side storage is empty, wait for client WebSocket and load from localStorage
    if not settings or not history:
        await client.connected()

        if not settings:
            try:
                settings_str = await ui.run_javascript(
                    "localStorage.getItem('kids_podcast_settings')"
                )
                if settings_str:
                    settings = json.loads(settings_str)
                    state.hydrate_from_settings(settings)
                    app.storage.user["settings"] = settings
                    if state.api_key:
                        generator[0] = PodcastGenerator(api_key=state.api_key)
            except Exception as e:
                logger.warning("Could not restore settings from localStorage: %s", e)
        else:
            try:
                state.hydrate_from_settings(settings)
                if state.api_key:
                    generator[0] = PodcastGenerator(api_key=state.api_key)
            except Exception as e:
                logger.warning("Could not restore user settings state: %s", e)

        if not history:
            try:
                history_str = await ui.run_javascript(
                    "localStorage.getItem('kids_podcast_history')"
                )
                if history_str:
                    history = json.loads(history_str)
                    state.hydrate_history(history)
                    app.storage.user["history"] = history
            except Exception as e:
                logger.warning("Could not restore history from localStorage: %s", e)
        else:
            try:
                state.hydrate_history(history)
            except Exception as e:
                logger.warning("Could not restore history state: %s", e)
    else:
        try:
            state.hydrate_from_settings(settings)
            if state.api_key:
                generator[0] = PodcastGenerator(api_key=state.api_key)
        except Exception as e:
            logger.warning("Could not restore user settings state: %s", e)

        try:
            state.hydrate_history(history)
        except Exception as e:
            logger.warning("Could not restore history state: %s", e)

    def update_gen(key):
        try:
            generator[0] = PodcastGenerator(api_key=key) if key else None
        except Exception:
            generator[0] = None

    # 2. Dialogs
    settings_dialog = SettingsDialog(state, on_change=update_gen)

    # 3. Header with Cost
    with (
        ui.header()
        .classes(
            "items-center justify-between bg-white text-slate-800 shadow-md q-px-lg"
        )
        .style("backdrop-filter: blur(10px); background: rgba(255,255,255,0.8)")
    ):
        with ui.row().classes("items-center gap-2"):
            ui.icon("mic_external_on", size="2rem").classes("text-primary")
            ui.label("Kids Podcast Generator").classes("text-h6 font-bold")

        with ui.row().classes("items-center gap-4"):
            with ui.row().classes(
                "items-center bg-blue-50 q-px-md q-py-xs rounded-full border border-blue-100"
            ):
                ui.label("Total Session: ").classes(
                    "text-caption text-blue-600 font-medium"
                )
                ui.label().bind_text_from(
                    state, "total_session_cost", backward=lambda x: f"{x:.4f} $"
                ).classes("text-subtitle1 text-blue-800 font-bold")

            ui.button(on_click=settings_dialog.open).props(
                "flat round icon=settings"
            ).classes("text-slate-500")

    # 4. Main Content (Two-Column Layout)
    with ui.element("div").classes(
        "w-full max-w-7xl mx-auto q-pa-lg gap-8 grid grid-cols-1 md:grid-cols-12 items-start"
    ):
        # LEFT COLUMN (Form) - Span 5 out of 12 columns
        with ui.column().classes("col-span-1 md:col-span-5 w-full gap-6"):  # noqa: SIM117
            ui.label("Configure Your Podcast").classes(
                "text-h5 font-bold text-slate-700"
            )
            # Podcast Configuration Card
            with ui.card().classes(  # noqa: SIM117
                "w-full q-pa-lg border border-slate-100 rounded-xl shadow-sm gap-4"
            ):
                with ui.column().classes("w-full gap-4"):  # noqa: SIM117
                    # Kids Context
                    with ui.column().classes("w-full gap-1"):
                        ui.label("Kids Context").classes(
                            "text-subtitle2 font-bold text-slate-600"
                        )
                        ui.textarea(
                            placeholder="Detailed description of the children (names, ages, interests, favorite topics)...",
                        ).bind_value(state, "shared_context").classes(
                            "w-full h-32"
                        ).props("outlined")

                    # Category
                    with ui.column().classes("w-full gap-1"):
                        ui.label("Category").classes(
                            "text-subtitle2 font-bold text-slate-600"
                        )
                        ui.input(
                            placeholder="e.g. Bedtime Stories, Educational"
                        ).bind_value(state, "current_category").classes("w-full").props(
                            "outlined"
                        )

                    # Topic
                    with ui.column().classes("w-full gap-1"):
                        ui.label("Topic").classes(
                            "text-subtitle2 font-bold text-slate-600"
                        )
                        theme_input = (
                            ui.input(
                                placeholder="e.g. Space Adventures, Magical Creatures",
                            )
                            .classes("w-full")
                            .props("outlined")
                        )

                    # Duration (min)
                    with ui.column().classes("w-full gap-1"):
                        with ui.row().classes("w-full justify-between items-center"):
                            ui.label("Duration (min)").classes(
                                "text-subtitle2 font-bold text-slate-500"
                            )
                            ui.label().bind_text_from(
                                state, "duration_val", backward=lambda v: f"{v} min"
                            ).classes("text-primary font-bold")
                        ui.slider(min=3, max=10, step=1, value=7).bind_value(
                            state, "duration_val"
                        ).classes("w-full")

                    # Age (years)
                    with ui.column().classes("w-full gap-1"):
                        with ui.row().classes("w-full justify-between items-center"):
                            ui.label("Age (years)").classes(
                                "text-subtitle2 font-bold text-slate-500"
                            )
                            ui.label().bind_text_from(
                                state, "age_val", backward=lambda v: f"{v} years"
                            ).classes("text-primary font-bold")
                        ui.slider(min=3, max=12, value=7).bind_value(
                            state, "age_val"
                        ).classes("w-full")

                    # Generate Button
                    with ui.row().classes("w-full justify-center q-mt-md"):
                        ui.button(
                            "GÉNÉRER LE PODCAST", on_click=lambda: generate_scripts()
                        ).props(
                            "size=md unelevated color=primary icon=auto_awesome"
                        ).classes(
                            "px-8 py-3 rounded-full font-bold shadow-md transform hover:scale-105 transition-all"
                        )

        # RIGHT COLUMN (Episodes) - Span 7 out of 12 columns
        with ui.column().classes("col-span-1 md:col-span-7 w-full gap-6"):
            ui.label("Generated Episodes").classes("text-h5 font-bold text-slate-700")
            cards_container = ui.column().classes("w-full gap-6")

        import asyncio

        sem = asyncio.Semaphore(5)

        def save_history() -> None:
            try:
                app.storage.user["history"] = state.scripts
                with client:
                    ui.run_javascript(
                        f"localStorage.setItem('kids_podcast_history', {json.dumps(json.dumps(state.scripts))})"
                    )
            except Exception as e:
                logger.warning("Failed to save history: %s", e)

        async def run_pipeline(script_data: dict, card: PodcastCard) -> None:
            async with sem:
                theme = script_data["theme"]
                logger.info(
                    "Starting podcast generation pipeline for subject: '%s'", theme
                )
                script_data["status"] = "Génération du script"
                script_data["progress"] = 0.25
                with client:
                    card.refresh()
                    save_history()

                try:
                    gen_instance = generator[0]
                    if not gen_instance:
                        raise ValueError("Générateur non initialisé.")

                    # 1. Generate script
                    logger.info(
                        "Step 1/3: Requesting script generation for '%s'...", theme
                    )
                    items, usage = await gen_instance.generate_script(
                        context=state.shared_context,
                        category=state.current_category,
                        theme=theme,
                        duration=state.duration_val,
                        age=state.age_val,
                        model_id=state.transcript_model,
                    )

                    cost_info = calculate_cost(
                        tokens_in_text=usage["prompt_tokens"],
                        tokens_out_text=usage["candidates_tokens"],
                        audio_duration_seconds=0,
                        text_model=state.transcript_model,
                        tts_model=state.tts_model,
                    )
                    script_data["items"] = items
                    script_data["cost"] = cost_info["total_cost"]
                    state.total_session_cost += cost_info["total_cost"]
                    logger.info(
                        "Step 1/3 completed: Script successfully generated for '%s'. Cost: %.6f$",
                        theme,
                        cost_info["total_cost"],
                    )

                    # 2. Generate audio
                    logger.info(
                        "Step 2/3: Starting TTS voice synthesis for '%s'...", theme
                    )
                    script_data["status"] = "Synthèse audio"
                    script_data["progress"] = 0.75
                    with client:
                        card.refresh()
                        save_history()

                    (
                        path,
                        duration_seconds,
                        audio_usage,
                    ) = await gen_instance.generate_podcast_audio(
                        items,
                        category=state.current_category,
                        theme=theme,
                        model_id=state.tts_model,
                    )

                    audio_cost_info = calculate_cost(
                        tokens_in_text=0,
                        tokens_out_text=0,
                        audio_duration_seconds=duration_seconds,
                        text_model=state.transcript_model,
                        tts_model=state.tts_model,
                        audio_in_tokens=audio_usage["prompt_tokens"],
                        audio_out_tokens=audio_usage["candidates_tokens"],
                    )

                    # 3. Finalize
                    script_data["audio_path"] = path
                    script_data["duration_seconds"] = duration_seconds
                    script_data["cost"] += audio_cost_info["total_cost"]
                    state.total_session_cost += audio_cost_info["total_cost"]

                    state.audio_ready[str(theme)] = path

                    script_data["status"] = "Prêt"
                    script_data["progress"] = 1.0
                    logger.info(
                        "Step 3/3 completed: Audio synthesis ready. File saved at '%s'. Cost: %.6f$",
                        path,
                        audio_cost_info["total_cost"],
                    )
                    logger.info(
                        "Generation pipeline finished successfully for '%s'. Total cost: %.6f$, Duration: %.2fs",
                        theme,
                        script_data["cost"],
                        duration_seconds,
                    )
                    with client:
                        card.refresh()
                        save_history()
                        ui.notify(f"Podcast terminé : {theme}", type="positive")

                except Exception as e:
                    logger.error("Pipeline failed for theme '%s': %s", theme, e)
                    logger.exception(e)
                    script_data["status"] = "Erreur"
                    script_data["progress"] = 0.0
                    with client:
                        card.refresh()
                        save_history()
                        ui.notify(
                            f"Erreur pour '{theme}': {str(e)}",
                            type="negative",
                        )

        async def retry_pipeline(script_data: dict, card: PodcastCard) -> None:
            script_data["status"] = "En attente"
            script_data["progress"] = 0.0
            with client:
                card.refresh()
                save_history()
            asyncio.create_task(run_pipeline(script_data, card))

        async def generate_scripts():
            if not theme_input.value:
                ui.notify("Veuillez entrer un sujet", type="warning")
                return

            if not generator[0]:
                ui.notify(
                    "Générateur non initialisé. Vérifiez votre clé API dans les réglages.",
                    type="negative",
                )
                return

            # Auto-save current settings/context to user storage & localStorage
            settings = state.extract_settings()
            app.storage.user["settings"] = settings
            ui.run_javascript(
                f"localStorage.setItem('kids_podcast_settings', {json.dumps(json.dumps(settings))})"
            )

            theme = theme_input.value.strip()
            theme_input.value = ""  # Clear theme input immediately

            # 1. Create Placeholder Card (En attente)
            placeholder_index = len(state.scripts)
            podcast_item = {
                "items": [],
                "cost": 0.0,
                "status": "En attente",
                "progress": 0.0,
                "duration_seconds": 0.0,
                "audio_path": None,
                "theme": theme,
            }
            state.scripts.append(podcast_item)
            save_history()

            with cards_container:
                card = PodcastCard(
                    placeholder_index,
                    state.scripts[-1],
                    state,
                    generator,
                    retry_fn=retry_pipeline,
                )
                cards_container.update()

            # 2. Launch background pipeline task
            asyncio.create_task(run_pipeline(state.scripts[-1], card))

        # Load existing scripts
        with cards_container:
            for i, s in enumerate(state.scripts):
                PodcastCard(i, s, state, generator, retry_fn=retry_pipeline)


# Run the app
# storage_secret is required for app.storage.user (per-client state)
storage_secret = os.getenv("STORAGE_SECRET")
if not storage_secret:
    logger.warning("STORAGE_SECRET not found in environment. Using insecure default.")
    storage_secret = "dev_secret_insecure"

ui.run(
    title="Kids Podcast Generator",
    storage_secret=storage_secret,
    port=8080,
)
