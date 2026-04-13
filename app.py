import streamlit as st
import os
import json
import time
import re
import warnings
import concurrent.futures
from datetime import datetime
from dotenv import load_dotenv
from podcast_generator import PodcastGenerator

# --- STREAMLIT THREAD SAFETY HELPER ---
def add_streamlit_context():
    """Robust helper to attach Streamlit context to a thread across versions."""
    try:
        from streamlit.runtime.scriptrunner.script_run_context import add_script_run_ctx
    except ImportError:
        try:
            from streamlit.runtime.scriptrunner import add_script_run_ctx
        except ImportError:
            try:
                from streamlit.scriptrunner import add_script_run_ctx
            except ImportError:
                return # Give up if no known path works
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
    "gemini-3-flash-text-in": 0.50,
    "gemini-3-flash-text-out": 3.00,
    "gemini-2.5-flash-tts-in": 0.50,
    "gemini-2.5-flash-tts-out": 10.00
}

def calculate_cost(tokens_in_text, tokens_out_text, audio_duration_seconds):
    # Text costs
    cost_text = (tokens_in_text * PRICING["gemini-3-flash-text-in"] + tokens_out_text * PRICING["gemini-3-flash-text-out"]) / 1_000_000
    # Audio costs: 25 tokens per second (input + output handled as one pass for simplicity in Gemini)
    # Actually for TTS we usually care about the output. 
    # Let's count 25 tokens/sec for the output audio.
    audio_tokens = int(audio_duration_seconds * 25)
    cost_audio = (audio_tokens * PRICING["gemini-2.5-flash-tts-out"]) / 1_000_000
    return cost_text + cost_audio

@st.dialog("📜 Historique des Podcasts")
def show_history_dialog():
    if os.path.exists(HISTORY_FILE):
        with open(HISTORY_FILE, "r") as f:
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
            f.write("Charlotte et Maxime, 5 ans, habitent dans le Sud-Ouest de la France.")
    
    with open(CONTEXT_FILE, "r") as f:
        current_context = f.read()
        
    new_context = st.text_area("Préférences, maison, jardin...", value=current_context, height=300, key="dialog_context_area")
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
    category = st.text_input("📁 Catégorie (Thème)", value="Animaux", placeholder="Ex: Animaux, Espace, Histoire...")
    themes_raw = st.text_area(
        "Sujets (un par ligne)", 
        placeholder="Le cycle de l'eau\nLes abeilles...", 
        height=150,
        key="input_themes"
    )
    
    duration = st.slider(
        "⏳ Durée (min)", 
        3, 10, 5, 
        key="input_duration"
    )
    age = st.slider("👶 Âge des enfants", 3, 12, 6, key="input_age")
    
    if st.button("🚀 1. Générer les Scripts", type="primary", use_container_width=True, key="generate_btn"):
        themes = [t.strip() for t in themes_raw.split("\n") if t.strip()][:10]
        if not themes:
            st.error("Veuillez entrer au moins un sujet !")
        elif not category:
            st.error("Veuillez entrer une catégorie !")
        else:
            api_key = os.getenv("GOOGLE_API_KEY")
            if not api_key:
                st.error("ERREUR: GOOGLE_API_KEY non trouvée dans .env")
            else:
                # IMPORTANT: Reset and start generation
                st.session_state.scripts = [] 
                st.session_state.audio_ready = {} 
                
                with open(CONTEXT_FILE, "r") as f:
                    shared_context = f.read()
                
                gen = PodcastGenerator(api_key)
                
                # --- PARALLEL SCRIPT GENERATION ---
                st.info(f"Début de la génération pour {len(themes)} sujet(s)...")
                
                def process_script(i, t):
                    # Attach streamlit context to thread for UI updates
                    add_streamlit_context()
                    try:
                        word_count_target = duration * 200
                        script_data = gen.generate_script(shared_context, t, duration, age, word_count=word_count_target)
                        
                        tokens_in = (len(shared_context) + len(t) + 1500) // 4
                        tokens_out = len(json.dumps(script_data)) // 4
                        cost = calculate_cost(tokens_in, tokens_out, 0)
                        
                        return {
                            "id": i,
                            "theme": t,
                            "category": category,
                            "age": age,
                            "script": script_data,
                            "cost_est": cost,
                            "tokens_in": tokens_in,
                            "tokens_out": tokens_out
                        }
                    except Exception as e:
                        return {"theme": t, "error": str(e)}

                # Use max 5 concurrent workers for scripts
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    futures = [executor.submit(process_script, i, t) for i, t in enumerate(themes)]
                    for future in concurrent.futures.as_completed(futures):
                        res = future.result()
                        if "error" in res:
                            st.error(f"❌ Erreur pour '{res['theme']}': {res['error']}")
                        else:
                            st.session_state.scripts.append(res)
                            st.success(f"✅ '{res['theme']}' terminé.")
                
                # Maintain original input order
                st.session_state.scripts.sort(key=lambda x: x.get('id', 0))
                
                st.success("Toutes les rédactions sont terminées.")
                st.rerun()

    if has_scripts:
        if st.button("🧹 Reset / Tout effacer", use_container_width=True, key="reset_btn"):
            st.session_state.scripts = []
            st.session_state.audio_ready = {}
            st.rerun()

# --- COLUMN 2: PREVIEWS ---
if col2 is not None:
    with col2:
        st.header("📝 Aperçu & Validation")
        
        # --- BATCH SYNTHESIS BUTTON ---
        pending_count = len([s for s in st.session_state.scripts if s['id'] not in st.session_state.audio_ready])
        if pending_count > 1:
            if st.button(f"🔊 Tout Synthétiser ({pending_count} podcasts)", use_container_width=True, type="secondary"):
                progress_bar = st.progress(0)
                status_text = st.empty()
                
                api_key = os.getenv("GOOGLE_API_KEY")
                gen = PodcastGenerator(api_key)
                
                def process_audio(idx, item):
                    # Attach streamlit context to thread for UI updates
                    add_streamlit_context()
                    theme = item['theme']
                    category = item['category']
                    try:
                        area_key = f"edit_area_{idx}_{theme}"
                        final_script = item['script']
                        if area_key in st.session_state:
                            final_script = json.loads(st.session_state[area_key])
                        
                        audio_path = gen.generate_podcast_audio(final_script, category, theme)
                        
                        from pydub import AudioSegment
                        audio_seg = AudioSegment.from_file(audio_path)
                        duration_secs = len(audio_seg) / 1000.0
                        total_cost = calculate_cost(item['tokens_in'], item['tokens_out'], duration_secs)
                        
                        return {
                            "idx": idx,
                            "audio_path": audio_path,
                            "cost": total_cost,
                            "duration": duration_secs,
                            "theme": theme
                        }
                    except Exception as e:
                        return {"theme": theme, "error": str(e)}

                # Use max 5 concurrent workers for audio synthesis (respects 10 RPM limit)
                with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
                    pending_items = [(i, s) for i, s in enumerate(st.session_state.scripts) if s['id'] not in st.session_state.audio_ready]
                    futures = [executor.submit(process_audio, idx, item) for idx, item in pending_items]
                    
                    completed = 0
                    total_count = len(futures)
                    for future in concurrent.futures.as_completed(futures):
                        res = future.result()
                        completed += 1
                        if "error" in res:
                            st.error(f"❌ Erreur pour '{res['theme']}': {res['error']}")
                        else:
                            idx = res['idx']
                            script_id = st.session_state.scripts[idx]['id']
                            st.session_state.audio_ready[script_id] = res['audio_path']
                            st.session_state.scripts[idx]['cost_final'] = res['cost']
                            st.session_state.scripts[idx]['duration_final'] = res['duration']
                            
                            # History entry
                            with open(HISTORY_FILE, "a") as hf:
                                date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                                dur_min = f"{res['duration']/60.0:.1f}min"
                                hf.write(f"| {date_str} | {res['theme']} | {dur_min} | {res['theme']} | {res['cost']:.4f}$ | {res['audio_path']} |\n")
                            
                            st.success(f"✅ '{res['theme']}' terminé.")
                        
                        progress_bar.progress(completed / total_count)
                
                status_text.success("Synthèse par lot terminée !")
                time.sleep(1)
                st.rerun()
        
        for idx, item in enumerate(st.session_state.scripts):
            with st.container(border=True):
                col_sub1, col_sub2 = st.columns([0.7, 0.3])
                with col_sub1:
                    st.subheader(f"📍 {item['theme']}")
                with col_sub2:
                    if 'cost_final' in item:
                        st.write(f"💰 Réel: **{item['cost_final']:.4f}$**")
                    else:
                        st.write(f"💸 Est: **{item['cost_est']:.4f}$**")
                
                script_json = json.dumps(item['script'], indent=2, ensure_ascii=False)
                edited_text = st.text_area("Script", value=script_json, height=200, key=f"edit_area_{idx}_{item['theme']}")
                
                if st.button(f"🔊 2. Synthèse Audio ({item['theme']})", key=f"syn_{idx}", type="primary", use_container_width=True):
                    try:
                        api_key = os.getenv("GOOGLE_API_KEY")
                        gen = PodcastGenerator(api_key)
                        
                        # UPDATE session state with edited text before proceeding
                        final_script = json.loads(edited_text)
                        st.session_state.scripts[idx]['script'] = final_script
                        
                        with st.spinner("🎤 Synthèse audio (Multi-Speaker)..."):
                            audio_path = gen.generate_podcast_audio(final_script, item['category'], item['theme'])
                            st.session_state.audio_ready[item['id']] = audio_path
                            
                            # Real audio duration for cost
                            from pydub import AudioSegment
                            audio_seg = AudioSegment.from_file(audio_path)
                            duration_secs = len(audio_seg) / 1000.0
                            
                            total_cost = calculate_cost(item['tokens_in'], item['tokens_out'], duration_secs)
                            
                            # PERSIST in session state for UI
                            st.session_state.scripts[idx]['cost_final'] = total_cost
                            st.session_state.scripts[idx]['duration_final'] = duration_secs
                            
                            with open(HISTORY_FILE, "a") as hf:
                                date_str = datetime.now().strftime("%Y-%m-%d %H:%M")
                                total_duration_min = f"{duration_secs/60.0:.1f}min"
                                # Format: | Date | Theme | Duration | Description | Cost | File Path |
                                hf.write(f"| {date_str} | {item['theme']} | {total_duration_min} | {item['theme']} | {total_cost:.4f}$ | {audio_path} |\n")
                            
                            st.success("✅ Audio prêt !")
                            st.rerun()
                    except Exception as e:
                        st.error(f"Erreur synthèse: {str(e)}")
                
                if item['id'] in st.session_state.audio_ready:
                    audio_file = st.session_state.audio_ready[item['id']]
                    if os.path.exists(audio_file):
                        with open(audio_file, "rb") as f:
                            st.audio(f.read(), format="audio/mp3")
                        st.download_button("💾 Télécharger", data=open(audio_file, "rb").read(), file_name=os.path.basename(audio_file), mime="audio/mp3", key=f"dl_{idx}")

st.markdown("---")
st.caption("Kids Podcast Generator V1 • Antigravity")
