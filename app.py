import asyncio
import json
import os
import time
import warnings
from datetime import datetime

import streamlit as st
from dotenv import load_dotenv

from podcast_generator import PodcastGenerator


# --- STREAMLIT THREAD SAFETY HELPER ---
def add_streamlit_context():
    """Robust helper to attach Streamlit context to a thread across versions."""
    try:
        from streamlit.runtime.scriptrunner.script_run_context import (  # type: ignore
            add_script_run_ctx,
        )
    except ImportError:
        try:
            from streamlit.runtime.scriptrunner import (
                add_script_run_ctx,
            )
        except ImportError:
            try:
                from streamlit.scriptrunner import add_script_run_ctx  # type: ignore
            except ImportError:
                return  # Give up if no known path works
    add_script_run_ctx()


# Load environment variables from .env (override=True to pick up manual changes)
load_dotenv(override=True)

# Suppress pydub's audioop deprecation warning
warnings.filterwarnings("ignore", category=DeprecationWarning, module="pydub")

# Page configuration
st.set_page_config(page_title="Kids Podcast Generator V1", layout="wide")

# UI Styling
st.title("🎙️ Kids Podcast Generator V1")
st.markdown("---")

# Constants
CONTEXT_FILE = "context.txt"
HISTORY_FILE = "history.md"

PRICING = {
    "text": {
        "gemini-3-flash-preview": {"in": 0.50, "out": 3.00},
        "gemini-3.1-flash-lite-preview": {"in": 0.25, "out": 1.50},
        "gemini-3.1-pro-preview": {"in": 2.00, "out": 12.00},
        "gemini-2.5-flash-preview": {"in": 0.30, "out": 2.50},
        "gemini-2.5-pro-preview": {"in": 1.25, "out": 10.00},
    },
    "tts": {
        "gemini-2.5-flash-preview-tts": {"in": 0.30, "out": 10.00},
        "gemini-2.5-pro-preview-tts": {"in": 1.25, "out": 20.00},
        "gemini-3.1-flash-tts-preview": {"in": 1.00, "out": 20.00},
    },
}


def calculate_cost(
    tokens_in_text,
    tokens_out_text,
    audio_duration_seconds,
    text_model,
    tts_model,
    audio_in_tokens=None,
    audio_out_tokens=None,
):
    """Calculates detailed cost breakdown based on model versions."""
    text_rates = PRICING["text"].get(
        text_model, PRICING["text"]["gemini-3-flash-preview"]
    )
    tts_rates = PRICING["tts"].get(
        tts_model, PRICING["tts"]["gemini-2.5-flash-preview-tts"]
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


@st.dialog("📜 Historique des Podcasts", width="large")
def show_history_dialog():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE) as f:
            history_rows = f.readlines()
        if history_rows:
            st.markdown("".join(history_rows))
        else:
            st.write("Aucun historique pour le moment.")
    else:
        st.write("Aucun historique pour le moment.")


@st.dialog("📝 Contexte des Enfants")
def show_context_dialog():
    if not os.path.exists(CONTEXT_FILE):
        with open(CONTEXT_FILE, "w") as f:
            f.write(
                "Charlotte et Maxime, 5 ans, habitent dans le Sud-Ouest de la France."
            )

    with open(CONTEXT_FILE) as f:
        current_context = f.read()

    new_context = st.text_area(
        "Préférences, maison, jardin...",
        value=current_context,
        height=300,
        key="dialog_context_area",
    )
    if st.button("Sauvegarder le Contexte", key="save_context_btn"):
        with open(CONTEXT_FILE, "w") as f:
            f.write(new_context)
        st.success("Contexte mis à jour !")
        st.rerun()


# --- SESSION STATE ---
if "scripts" not in st.session_state:
    st.session_state.scripts = []
if "audio_ready" not in st.session_state:
    st.session_state.audio_ready = {}
if "transcript_model" not in st.session_state:
    st.session_state.transcript_model = "gemini-3-flash-preview"
if "tts_model" not in st.session_state:
    st.session_state.tts_model = "gemini-2.5-flash-preview-tts"

# --- SIDEBAR: SETTINGS ---
with st.sidebar:
    st.header("⚙️ Paramètres")

    # API Key
    env_api_key = os.getenv("GOOGLE_API_KEY", "")
    user_api_key = st.text_input(
        "Clé API Google",
        value=env_api_key,
        type="password",
        key="user_api_key",
        help="La clé sera utilisée pour toutes les requêtes Gemini.",
    )

    st.markdown("---")
    st.subheader("🤖 Modèles")

    transcript_model = st.selectbox(
        "Modèle Transcription",
        options=[
            "gemini-3-flash-preview",
            "gemini-3.1-flash-lite-preview",
            "gemini-3.1-pro-preview",
            "gemini-2.5-flash-preview",
            "gemini-2.5-pro-preview",
        ],
        key="transcript_model",
        help="Modèle utilisé pour générer le script du podcast.",
    )

    tts_model = st.selectbox(
        "Modèle TTS (Audio)",
        options=[
            "gemini-2.5-flash-preview-tts",
            "gemini-2.5-pro-preview-tts",
            "gemini-3.1-flash-tts-preview",
        ],
        key="tts_model",
        help="Modèle utilisé pour la synthèse vocale multi-locuteurs.",
    )

    # st.markdown("---")
    # st.info("Les paramètres sont appliqués immédiatement aux nouvelles générations.")

# --- LAYOUT DECISION ---
has_scripts = len(st.session_state.scripts) > 0

if has_scripts:
    col1, col2 = st.columns([1, 2])
else:
    _, col1, _ = st.columns([1, 1.5, 1])
    col2 = None

# --- COLUMN 1: CONFIGURATION ---
with col1:
    st.header("⚙️ Configuration")

    btn_col1, btn_col2 = st.columns(2)
    with btn_col1:
        if st.button("📜 Historique", use_container_width=True, key="main_history_btn"):
            show_history_dialog()
    with btn_col2:
        if st.button("📝 Contexte", use_container_width=True, key="main_context_btn"):
            show_context_dialog()

    st.markdown("---")

    st.subheader("🎯 Sujets")
    category = st.text_input(
        "📁 Catégorie (Thème)",
        value="Animaux",
        placeholder="Ex: Animaux, Espace, Histoire...",
    )
    themes_raw = st.text_area(
        "Sujets (un par ligne)",
        placeholder="Le cycle de l'eau\nLes abeilles...",
        height=150,
        key="input_themes",
    )

    duration = st.slider("⏳ Durée (min)", 3, 10, 5, key="input_duration")
    age = st.slider("👶 Âge des enfants", 3, 12, 6, key="input_age")

    if st.button(
        "🚀 1. Générer les Scripts",
        type="primary",
        use_container_width=True,
        key="generate_btn",
    ):
        themes = [t.strip() for t in themes_raw.split("\n") if t.strip()][:10]
        if not themes:
            st.error("Veuillez entrer au moins un sujet !")
        elif not category:
            st.error("Veuillez entrer une catégorie !")
        else:
            api_key = user_api_key
            if not api_key:
                st.error("ERREUR: Veuillez fournir une clé API dans les paramètres.")
            else:
                # IMPORTANT: Reset and start generation
                st.session_state.scripts = []
                st.session_state.audio_ready = {}

                if os.path.exists(CONTEXT_FILE):
                    with open(CONTEXT_FILE) as f:
                        shared_context = f.read()
                else:
                    shared_context = ""

                st.info(f"Début de la génération pour {len(themes)} sujet(s)...")

                api_key = st.session_state.get(
                    "user_api_key", os.getenv("GOOGLE_API_KEY", "")
                )

                # --- ASYNC SCRIPT GENERATION ---
                async def run_script_batch(status):
                    tasks = []
                    for i, t in enumerate(themes):

                        async def process_one_script(idx, theme_text):
                            # LOCAL GEN for loop affinity
                            gen = PodcastGenerator(api_key)
                            status.write(f"✍️ Rédaction du script: **{theme_text}**...")
                            try:
                                word_count_target = duration * 250
                                script_data, usage = await gen.generate_script_async(
                                    shared_context,
                                    theme_text,
                                    duration,
                                    age,
                                    word_count=word_count_target,
                                    model_id=st.session_state.transcript_model,
                                )

                                cost_breakdown = calculate_cost(
                                    usage["prompt_tokens"],
                                    usage["candidates_tokens"],
                                    0,
                                    st.session_state.transcript_model,
                                    st.session_state.tts_model,
                                )

                                res = {
                                    "id": idx,
                                    "theme": theme_text,
                                    "category": category,
                                    "age": age,
                                    "script": script_data,
                                    "cost_est": cost_breakdown["total_cost"],
                                    "tokens_in": usage["prompt_tokens"],
                                    "tokens_out": usage["candidates_tokens"],
                                    "text_cost": cost_breakdown["text_cost"],
                                    "cost_breakdown": cost_breakdown,
                                }
                                status.write(f"✅ Terminé: **{theme_text}**")
                                return res
                            except Exception as e:
                                status.write(
                                    f"❌ Erreur pour **{theme_text}**: {str(e)}"
                                )
                                return {"theme": theme_text, "error": str(e)}

                        tasks.append(process_one_script(i, t))

                    results = await asyncio.gather(*tasks)

                    failures = []
                    for res in results:
                        if "error" in res:
                            failures.append(res)
                        else:
                            st.session_state.scripts.append(res)

                    if failures:
                        st.error(f"⚠️ {len(failures)} script(s) ont échoué.")
                        for f in failures:
                            st.warning(f"Thème '{f['theme']}': {f['error']}")

                with st.status(
                    "🚀 Génération des scripts...", expanded=True
                ) as status_box:
                    asyncio.run(run_script_batch(status_box))
                    status_box.update(label="✅ Scripts générés !", state="complete")

                # Maintain original input order
                st.session_state.scripts.sort(key=lambda x: x.get("id", 0))

                st.success("Toutes les rédactions sont terminées.")
                st.rerun()

    if has_scripts and st.button(
        "🧹 Reset / Tout effacer", use_container_width=True, key="reset_btn"
    ):
        st.session_state.scripts = []
        st.session_state.audio_ready = {}
        st.rerun()


@st.fragment
def render_podcast_card(idx, item):
    """Isolated fragment to display and synthesize a single podcast episode."""
    with st.container(border=True):
        # col_sub1, col_sub2 = st.columns([0.7, 0.3])
        # with col_sub1:
        st.subheader(f"📍 {item['theme']}")
        # with col_sub2:
        #     if "cost_final" in item:
        #         st.write(f"💰 Coût: **{item['cost_final']:.4f}$**")
        #     else:
        #         st.write(f"💸 Est: **{item['cost_est']:.4f}$**")

        script_json = json.dumps(item["script"], indent=2, ensure_ascii=False)
        edited_text = st.text_area(
            "Script",
            value=script_json,
            height=200,
            key=f"edit_area_{idx}_{item['theme']}",
        )

        # Cost Breakdown Display (Fragment isolated)
        if "cost_breakdown" in item:
            cb = item["cost_breakdown"]
            st.text(
                f"💰 Coût: $ {item['cost_final']:.4f} = Script: {item['tokens_out']} tokens ($ {cb['text_cost']:.4f}) + Audio: {cb.get('audio_out_tokens', 0)} tokens ($ {cb['audio_cost']:.4f})"
            )

        if st.button(
            f"🔊 2. Synthèse Audio ({item['theme']})",
            key=f"syn_{idx}",
            type="primary",
            use_container_width=True,
            disabled=item["id"] in st.session_state.audio_ready,
        ):
            try:
                # Use current settings from session state
                api_key = os.getenv("GOOGLE_API_KEY", "")  # Or from user_api_key widget
                # Note: user_api_key might not be accessible if it's not in session state.
                # Let's ensure it's in session state too or passed in.

                # Retrieve from session_state if we set a key for it,
                # or just use the local one if we pass it.
                # For now, I'll assume we can get it from env or it was passed?
                # Better: retrieve from sidebar widget via session_state key if we added one.
                # I'll add a key to user_api_key text_input in Step 2.1

                api_key = st.session_state.get(
                    "user_api_key", os.getenv("GOOGLE_API_KEY", "")
                )
                # gen created inside async block or inside button to ensure it matches the run context

                # UPDATE session state with edited text
                final_script = json.loads(edited_text)
                st.session_state.scripts[idx]["script"] = final_script

                st.info(f"🎤 Synthèse: **{item['theme']}**...")
                with st.spinner("Patientez pendant que l'IA parle..."):
                    # Use the new async method
                    async def run_single_syn():
                        local_gen = PodcastGenerator(api_key)
                        return await local_gen.generate_podcast_audio_async(
                            final_script,
                            item["category"],
                            item["theme"],
                            model_id=st.session_state.tts_model,
                        )

                    audio_path, usage = asyncio.run(run_single_syn())

                    from pydub import AudioSegment

                    audio_seg = AudioSegment.from_file(audio_path)
                    duration_secs = len(audio_seg) / 1000.0

                    # Calculate precise cost
                    cost_breakdown = calculate_cost(
                        item["tokens_in"],
                        item["tokens_out"],
                        duration_secs,
                        st.session_state.transcript_model,
                        st.session_state.tts_model,
                        audio_in_tokens=usage["prompt_tokens"],
                        audio_out_tokens=usage["candidates_tokens"],
                    )

                    # Update local item state
                    st.session_state.scripts[idx]["cost_final"] = cost_breakdown[
                        "total_cost"
                    ]
                    st.session_state.scripts[idx]["duration_final"] = duration_secs
                    st.session_state.scripts[idx]["cost_breakdown"] = cost_breakdown
                    st.session_state.audio_ready[item["id"]] = audio_path

                    # Update local item state

                    # Persist to history
                    with open(HISTORY_FILE, "a") as hf:
                        date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                        total_duration_min = f"{duration_secs / 60.0:.1f}min"
                        hf.write(
                            f"| {date_str} | {item['theme']} | {total_duration_min} | {item['theme']} | {cost_breakdown['total_cost']:.4f}$ | {audio_path} |\n"
                        )

                    st.success("✅ Partagé !")
                    # No scope="app" rerun here! Only fragment reruns automatically.
            except Exception as e:
                st.error(f"Erreur synthèse: {str(e)}")

        if item["id"] in st.session_state.audio_ready:
            audio_file = st.session_state.audio_ready[item["id"]]
            if os.path.exists(audio_file):
                with open(audio_file, "rb") as f:
                    audio_bytes = f.read()
                    st.audio(audio_bytes, format="audio/mp3")
                    st.download_button(
                        "💾 Télécharger",
                        data=audio_bytes,
                        file_name=os.path.basename(audio_file),
                        mime="audio/mp3",
                        key=f"dl_{idx}",
                    )


# --- COLUMN 2: PREVIEWS ---
if col2 is not None:
    with col2:
        st.header("📝 Aperçu & Validation")

        # --- BATCH SYNTHESIS BUTTON ---
        pending_count = len(
            [
                s
                for s in st.session_state.scripts
                if s["id"] not in st.session_state.audio_ready
            ]
        )
        if pending_count > 1 and st.button(
            f"🔊 Tout Synthétiser ({pending_count} podcasts)",
            use_container_width=True,
            type="secondary",
        ):
            progress_bar = st.progress(0)
            status_text = st.empty()

            api_key = st.session_state.get(
                "user_api_key", os.getenv("GOOGLE_API_KEY", "")
            )
            # gen will be created inside local functions

            # --- ASYNC BATCH SYNTHESIS ---
            async def run_batch_synthesis(status_box):
                pending_items = [
                    (i, s)
                    for i, s in enumerate(st.session_state.scripts)
                    if s["id"] not in st.session_state.audio_ready
                ]

                total_count = len(pending_items)
                completed = 0

                async def process_one(idx, item):
                    nonlocal completed
                    theme = item["theme"]
                    category = item["category"]
                    status_box.write(f"🎤 Synthèse vocale: **{theme}**...")
                    try:
                        local_gen = PodcastGenerator(api_key)
                        area_key = f"edit_area_{idx}_{theme}"
                        final_script = item["script"]
                        if area_key in st.session_state:
                            final_script = json.loads(st.session_state[area_key])

                        (
                            audio_path,
                            usage,
                        ) = await local_gen.generate_podcast_audio_async(
                            final_script,
                            category,
                            theme,
                            model_id=st.session_state.tts_model,
                        )

                        from pydub import AudioSegment

                        audio_seg = AudioSegment.from_file(audio_path)
                        duration_secs = len(audio_seg) / 1000.0
                        cost_breakdown = calculate_cost(
                            item["tokens_in"],
                            item["tokens_out"],
                            duration_secs,
                            st.session_state.transcript_model,
                            st.session_state.tts_model,
                            audio_in_tokens=usage["prompt_tokens"],
                            audio_out_tokens=usage["candidates_tokens"],
                        )

                        completed += 1
                        progress_bar.progress(completed / total_count)
                        status_box.write(f"✅ Terminé: **{theme}**")

                        return {
                            "idx": idx,
                            "audio_path": audio_path,
                            "cost": cost_breakdown["total_cost"],
                            "duration": duration_secs,
                            "theme": theme,
                            "audio_cost": cost_breakdown["audio_cost"],
                            "audio_in": usage["prompt_tokens"],
                            "audio_out": usage["candidates_tokens"],
                            "cost_breakdown": cost_breakdown,
                        }
                    except Exception as e:
                        status_box.write(f"❌ Erreur pour **{theme}**: {str(e)}")
                        return {"theme": theme, "error": str(e)}

                tasks = [process_one(idx, item) for idx, item in pending_items]
                results = await asyncio.gather(*tasks)

                failures = []
                for res in results:
                    if "error" in res:
                        failures.append(res)
                    else:
                        idx = res["idx"]
                        script_id = st.session_state.scripts[idx]["id"]
                        st.session_state.audio_ready[script_id] = res["audio_path"]
                        st.session_state.scripts[idx]["cost_final"] = res["cost"]
                        st.session_state.scripts[idx]["duration_final"] = res[
                            "duration"
                        ]
                        st.session_state.scripts[idx]["cost_breakdown"] = res[
                            "cost_breakdown"
                        ]

                        with open(HISTORY_FILE, "a") as hf:
                            date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                            dur_min = f"{res['duration'] / 60.0:.1f}min"
                            hf.write(
                                f"| {date_str} | {res['theme']} | {dur_min} | {res['theme']} | {res['cost']:.4f}$ | {res['audio_path']} |\n"
                            )

                if failures:
                    st.error(f"❌ {len(failures)} synthèse(s) ont échoué.")
                    for f in failures:
                        st.warning(f"Podcast '{f['theme']}': {f['error']}")

            with st.status(
                "🚀 Synthèse par lot en cours...", expanded=True
            ) as status_box:
                asyncio.run(run_batch_synthesis(status_box))
                status_box.update(label="✅ Synthèse terminée !", state="complete")

            status_text.success("Synthèse par lot terminée !")
            time.sleep(1)
            st.rerun()

        for idx, item in enumerate(st.session_state.scripts):
            render_podcast_card(idx, item)

st.markdown("---")
st.caption("Kids Podcast Generator V1 • Antigravity")
