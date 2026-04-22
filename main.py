import json
import os

from dotenv import load_dotenv
from nicegui import app, ui

from models.state import AppState
from podcast_generator import PodcastGenerator
from utils.cost_calculator import calculate_cost

# Load environment variables
load_dotenv(override=True)

# Configure Media Serving
if not os.path.exists("podcasts"):
    os.makedirs("podcasts")
app.add_media_files("/podcasts", "podcasts")


class PodcastCard(ui.card):
    """
    Native NiceGUI component for an individual podcast episode card.
    Encapsulates episode state, script editing, and audio synthesis logic.
    """

    def __init__(
        self,
        index: int,
        script_data: dict,
        app_state: AppState,
        gen: PodcastGenerator | None,
    ):
        super().__init__()
        self.index = index
        self.script_data = script_data
        self.state = app_state
        self.generator = gen
        self.classes("w-full q-pa-md bordered shadow-2")
        self.build()

    def build(self) -> None:
        """Constructs the UI elements for the podcast card."""
        with self:
            with ui.row().classes("w-full justify-between items-center"):
                ui.label(f"Episode {self.index + 1}").classes("text-h6")
                ui.label(
                    f"Coût Script: {self.script_data.get('cost', 0):.4f} $"
                ).classes("text-caption")

            # Editable Transcript
            self.editor = ui.textarea(
                label="Script (JSON)",
                value=json.dumps(self.script_data.get("items", []), indent=2),
            ).classes("w-full h-64")

            with ui.row().classes("w-full justify-end q-mt-sm"):
                self.synth_btn = ui.button(
                    "Synthèse Audio", on_click=self.synthesize
                ).props("rounded elevated color=secondary icon=mic")
                self.spinner = ui.spinner(size="lg").classes("q-ml-md")
                self.spinner.set_visibility(False)

            # Audio Player (hidden until ready)
            self.audio_player = ui.audio(src="").classes("w-full q-mt-md")
            self.audio_player.set_visibility(False)

            # Update if already ready
            if str(self.index) in self.state.audio_ready:
                self.show_audio(self.state.audio_ready[str(self.index)])

    def show_audio(self, path: str) -> None:
        """
        Displays the audio player for a generated MP3 file.

        Args:
            path: Local filesystem path to the MP3 file.
        """
        # Map filesystem path to media URL
        filename = os.path.basename(path)
        media_url = f"/podcasts/{filename}"
        self.audio_player.source = media_url
        self.audio_player.set_visibility(True)
        self.synth_btn.set_visibility(False)

    async def synthesize(self) -> None:
        """Handles the asynchronous synthesis of audio from the edited script."""
        if not self.generator:
            ui.notify(
                "Générateur non initialisé. Vérifiez votre clé API.", type="negative"
            )
            return

        self.synth_btn.disable()
        self.spinner.set_visibility(True)
        try:
            # Parse edited script
            try:
                items = json.loads(self.editor.value)
            except json.JSONDecodeError:
                ui.notify("Erreur de format JSON dans le script", type="negative")
                return

            # Call generator (Async)
            path, usage = await self.generator.generate_podcast_audio_async(
                items,
                category=self.state.current_category,
                theme=f"Episode {self.index + 1}",
                model_id=self.state.tts_model,
            )

            # Calculate cost
            cost_info = calculate_cost(
                tokens_in_text=0,  # Already paid
                tokens_out_text=0,
                audio_duration_seconds=0,
                text_model=self.state.transcript_model,
                tts_model=self.state.tts_model,
                audio_in_tokens=usage["prompt_tokens"],
                audio_out_tokens=usage["candidates_tokens"],
            )

            # Update state
            self.state.set_audio(self.index, path, cost_info["total_cost"])
            self.show_audio(path)
            ui.notify(f"Synthèse terminée: {os.path.basename(path)}", type="positive")

        except Exception as e:
            import traceback

            traceback.print_exc()
            ui.notify(f"Erreur de synthèse: {str(e)}", type="negative")
        finally:
            self.spinner.set_visibility(False)
            self.synth_btn.enable()


@ui.page("/")
def main_page():
    """Main application page for the Podcast Generator."""
    # 1. Per-connection State Hydration
    user_data = app.storage.user.get("state")
    if user_data:
        try:
            state = AppState(**user_data)
        except Exception as e:
            print(f"[WARN] Could not restore user state: {e}")
            state = AppState.load_from_env()
    else:
        state = AppState.load_from_env()

    # Deferred Generator initialization
    try:
        generator = PodcastGenerator(api_key=state.api_key) if state.api_key else None
    except ValueError:
        generator = None

    # 2. Reusable Dialogs (Defined once per connection)
    with ui.dialog() as context_dialog, ui.card().classes("w-full max-w-lg"):
        ui.label("Contexte Partagé").classes("text-h6")
        ui.textarea(
            "Informations sur les enfants (prénoms, intérêts, etc.)"
        ).bind_value(state, "shared_context").classes("w-full h-64")
        with ui.row().classes("w-full justify-end"):
            ui.button("Fermer", on_click=context_dialog.close).props("flat")

    with ui.dialog() as history_dialog, ui.card().classes("w-full max-w-2xl"):
        ui.label("Historique des Générations").classes("text-h6")

        def load_history():
            content = ""
            if os.path.exists("history.md"):
                with open("history.md") as f:
                    content = f.read()
            history_markdown.content = content or "Aucun historique disponible."

        history_markdown = ui.markdown("").classes("w-full h-96 overflow-auto")
        with ui.row().classes("w-full justify-end"):
            ui.button("Fermer", on_click=history_dialog.close).props("flat")

    # 3. Header with Cost
    with ui.header().classes("items-center justify-between bg-primary text-white"):
        ui.label("Kids Podcast Generator").classes("text-h6")
        with ui.row().classes("items-center"):
            ui.label("Total Session: ").classes("text-subtitle2")
            ui.label().bind_text_from(
                state, "total_session_cost", backward=lambda x: f"{x:.4f} $"
            ).classes("text-h6 text-weight-bold")

    # 4. Settings Drawer
    with ui.left_drawer(value=True).classes("bg-slate-50"):
        ui.label("Paramètres").classes("text-h6 q-mb-md")

        # API Key
        def on_api_key_change(e):
            nonlocal generator
            try:
                generator = PodcastGenerator(api_key=e.value) if e.value else None
            except ValueError:
                generator = None

        ui.input(
            "Google API Key",
            password=True,
            password_toggle_button=True,
            on_change=on_api_key_change,
        ).bind_value(state, "api_key").classes("w-full")

        # Model Selectors
        ui.select(
            options=[
                "gemini-3-flash-preview",
                "gemini-3.1-flash-lite-preview",
                "gemini-3.1-pro-preview",
                "gemini-2.5-flash-preview",
                "gemini-2.5-pro-preview",
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

        ui.separator().classes("q-my-md")

        # Persistence confirmation
        ui.button(
            "Sauvegarder",
            on_click=lambda: (
                app.storage.user.update({"state": state.model_dump()}),
                ui.notify("Paramètres sauvegardés localement", type="positive"),
            ),
        ).props("flat color=primary").classes("w-full")

        ui.separator().classes("q-my-md")

        ui.button(
            "Éditer le Contexte", on_click=context_dialog.open, icon="psychology"
        ).classes("w-full q-mb-sm")
        ui.button(
            "Voir l'Historique",
            on_click=lambda: (load_history(), history_dialog.open()),
            icon="history",
        ).classes("w-full")

    # 5. Main Content
    with ui.column().classes("w-full max-w-4xl mx-auto q-pa-lg"):
        ui.label("Configuration du Podcast").classes("text-h5 q-mb-md")

        with ui.grid(columns=2).classes("w-full gap-4"):
            theme_input = ui.input(
                "Thèmes (séparés par des virgules)",
                placeholder="ex: Espace, Dinosaures",
            ).classes("w-full")
            ui.input("Catégorie", value="Éducation").bind_value(
                state, "current_category"
            ).classes("w-full")

        with ui.grid(columns=2).classes("w-full gap-4"):
            duration_slider = ui.slider(min=1, max=10, value=3).classes("w-full")
            ui.label().bind_text_from(
                duration_slider, "value", backward=lambda v: f"Durée: {v} min"
            )
            age_slider = ui.slider(min=3, max=12, value=7).classes("w-full")
            ui.label().bind_text_from(
                age_slider, "value", backward=lambda v: f"Âge: {v} ans"
            )

        async def generate_scripts():
            if not theme_input.value:
                ui.notify("Veuillez entrer au moins un thème", type="warning")
                return

            if not generator:
                ui.notify(
                    "Générateur non initialisé. Vérifiez votre clé API.",
                    type="negative",
                )
                return

            gen_btn.disable()
            status_label.set_text("Génération des scripts en cours...")

            try:
                themes = [t.strip() for t in theme_input.value.split(",")]
                for theme in themes:
                    # Async Generation
                    items, usage = await generator.generate_script_async(
                        context=state.shared_context,
                        theme=theme,
                        duration=duration_slider.value,
                        age=age_slider.value,
                        model_id=state.transcript_model,
                    )

                    # Calculate cost
                    cost_info = calculate_cost(
                        tokens_in_text=usage["prompt_tokens"],
                        tokens_out_text=usage["candidates_tokens"],
                        audio_duration_seconds=0,
                        text_model=state.transcript_model,
                        tts_model=state.tts_model,
                    )

                    # Update state and UI
                    state.add_script(items, cost_info["total_cost"])
                    with cards_container:
                        PodcastCard(
                            len(state.scripts) - 1, state.scripts[-1], state, generator
                        )

                ui.notify(f"{len(themes)} scripts générés !", type="positive")
            except Exception as e:
                import traceback

                traceback.print_exc()
                ui.notify(f"Erreur: {str(e)}", type="negative")
            finally:
                gen_btn.enable()
                status_label.set_text("")

        with ui.row().classes("w-full justify-center q-my-lg"):
            gen_btn = ui.button("Générer les Scripts", on_click=generate_scripts).props(
                "size=lg rounded elevated color=primary icon=auto_awesome"
            )
            status_label = ui.label("").classes("text-italic q-ml-md self-center")

        ui.separator()

        # 6. Podcast Cards List
        ui.label("Scripts Générés").classes("text-h6 q-mt-md")
        cards_container = ui.column().classes("w-full gap-6")

        # Load existing scripts from state (for tab reload)
        with cards_container:
            for i, s in enumerate(state.scripts):
                PodcastCard(i, s, state, generator)


# Run the app
# storage_secret is required for app.storage.user (per-client state)
storage_secret = os.getenv("STORAGE_SECRET")
if not storage_secret:
    print("[WARN] STORAGE_SECRET not found in environment. Using insecure default.")
    storage_secret = "dev_secret_insecure"

ui.run(
    title="Kids Podcast Generator",
    storage_secret=storage_secret,
    port=8080,
)
