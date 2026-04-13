import os
import json
import re
import io
import time
from google import genai
from pydantic import BaseModel
from typing import List
from pydub import AudioSegment

class ScriptItem(BaseModel):
    speaker: str
    text: str

class PodcastScript(BaseModel):
    items: List[ScriptItem]

class PodcastGenerator:
    def __init__(self, api_key):
        if not api_key or api_key == "votre_cle_api_ici":
            raise ValueError("Une clé API Google GenAI valide est requise.")
        self.client = genai.Client(api_key=api_key)
        self.prompt_template_path = "transcript_prompt_template.md"
        self.tts_prompt_template_path = "tts_prompt_template.md"

    def _call_with_retry(self, model_id, prompt, config, max_retries=5):
        """Helper to call Gemini API with smart retry for 429 errors."""
        import time
        import re
        
        attempt = 0
        base_delay = 5
        
        while attempt < max_retries:
            try:
                # Actual Gemini call
                return self.client.models.generate_content(
                    model=model_id,
                    contents=prompt,
                    config=config
                )
            except Exception as e:
                attempt += 1
                error_msg = str(e)
                
                # Check for rate limit (429) or transient server errors (500, 503, 504)
                is_rate_limit = "429" in error_msg or "ResourceExhausted" in error_msg or "quota" in error_msg.lower()
                is_transient_server_error = any(code in error_msg for code in ["500", "503", "504"]) or "internal error" in error_msg.lower() or "service unavailable" in error_msg.lower()
                
                if is_rate_limit:
                    import random
                    # Dump the raw error for manual inspection
                    # print(f"DEBUG: [429] Raw error data: {error_msg}")
                    
                    wait_time = None
                    
                    # 1. Try to extract from structured error details (handles both retry_delay and retryDelay)
                    try:
                        if hasattr(e, 'details'):
                            for detail in getattr(e, 'details', []):
                                if isinstance(detail, dict):
                                    # Handle both CamelCase and snake_case
                                    rd = detail.get('retry_delay') or detail.get('retryDelay') or detail.get('retry_after')
                                    if rd:
                                        # rd can be {"seconds": 2} or a string like "2s"
                                        if isinstance(rd, dict) and 'seconds' in rd:
                                            wait_time = float(rd['seconds']) + 1.0
                                            break
                                        elif isinstance(rd, str):
                                            # Find digits (including decimals) before 's'
                                            rd_match = re.search(r"(\d+(?:\.\d+)?)s?", rd)
                                            if rd_match:
                                                wait_time = float(rd_match.group(1)) + 1.0
                                                break
                    except: pass

                    # 2. Broader Regex fallback (now support floats: 2.25s)
                    if wait_time is None:
                        # Improved regex to handle decimals (e.g., 2.25s) and space variants
                        retry_match = re.search(r"(?:after|in|seconds|retry_delay|retry_after|retrydelay|delay):\s*(\d+(?:\.\d+)?)", error_msg, re.IGNORECASE)
                        if retry_match:
                            wait_time = float(retry_match.group(1)) + 1.0
                    
                    # 3. Default backoff fallback
                    if wait_time is None:
                        wait_time = (base_delay * attempt)
                    
                    # Add jitter to avoid thundering herd
                    wait_time += random.uniform(0.5, 3.0)
                    
                    print(f"DEBUG: [429] Rate limit hit. Waiting {wait_time:.1f}s... (Att {attempt}/{max_retries})")
                    time.sleep(wait_time)
                elif is_transient_server_error:
                    import random
                    # Soft retry with exponential backoff for internal errors
                    wait_time = (base_delay * (2 ** (attempt - 1))) + random.uniform(0.5, 3.0)
                    print(f"DEBUG: [{error_msg[:15]}...] Transient error. Waiting {wait_time:.1f}s... (Att {attempt}/{max_retries})")
                    time.sleep(wait_time)
                else:
                    print(f"DEBUG: [ERROR] Non-retryable error for {model_id}: {error_msg}")
                    raise e
        
        raise Exception(f"Max retries ({max_retries}) reached for model {model_id}.")

    def generate_script(self, context, theme, duration, age, word_count=1000):
        if os.path.exists(self.prompt_template_path):
            with open(self.prompt_template_path, "r") as f:
                template = f.read()
        else:
            template = "Topic: {theme}\nDuration: {duration} minutes\nTarget Age: {age}\nWord Count: {word_count}\nContext: {context}\nGenerate a podcast script in JSON format."

        prompt = template.format(theme=theme, duration=duration, age=age, context=context, word_count=word_count)
        
        print(f"--- Calling Gemini 3.0 Flash for Topic: {theme} ---")
        
        try:
            # We use a wrapper class PodcastScript to ensure a stable top-level JSON object
            schema = PodcastScript.model_json_schema()
            
            response = self._call_with_retry(
                model_id="gemini-3-flash-preview",
                prompt=prompt,
                config={
                    'response_mime_type': 'application/json',
                    'response_json_schema': schema
                }
            )
            
            if not response.text:
                raise ValueError("L'API Gemini a retourné une réponse vide.")
            
            data = json.loads(response.text)
            # Unwrap the list if we used the PodcastScript wrapper
            if isinstance(data, dict) and "items" in data:
                return data["items"]
            return data
        except Exception as e:
            print(f"DEBUG: Exception during Gemini call or JSON parsing: {str(e)}")
            if 'response' in locals() and hasattr(response, 'text'):
                print(f"DEBUG: Raw response tail (last 100 chars): ...{response.text[-100:]}")
            raise e

    def synthesize_multi_speaker(self, script_items, model_id="gemini-2.5-flash-preview-tts"):
        """Uses MultiSpeakerVoiceConfig to synthesize a full conversation at once."""
        from google.genai import types
        import random
        
        # 1. Format the multi-speaker prompt using Robust Prompt structure
        # Labels are in English (markdown), content in French for the model.
        
        if os.path.exists(self.tts_prompt_template_path):
            with open(self.tts_prompt_template_path, "r") as f:
                template = f.read()
        else:
            # Fallback if file missing
            template = "# AUDIO PROFILE: Sophie\n## Experte\n# AUDIO PROFILE: Marc\n## Apprenant\n##### TRANSCRIPT"

        dialogue_lines = []
        for item in script_items:
            raw_speaker = item.get('speaker', 'Sophie').lower()
            clean_speaker = "Sophie" if 'sophie' in raw_speaker else "Marc" if 'marc' in raw_speaker else "Sophie"
            text = item.get('text', '')
            # Clean up potential existing tags like [Sophie - enthousiaste]
            text = re.sub(r'\[(Sophie|Marc)\s*-\s*([^\]]+)\]', r'[\2]', text, flags=re.IGNORECASE)
            dialogue_lines.append(f"{clean_speaker}: [pause 300ms] {text}")
            
        full_text = template + "\n" + "\n".join(dialogue_lines)
        
        # 2. Setup MultiSpeaker Config
        multi_speaker_config = types.MultiSpeakerVoiceConfig(
            speaker_voice_configs=[
                types.SpeakerVoiceConfig(
                    speaker="Sophie",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Erinome")
                    )
                ),
                types.SpeakerVoiceConfig(
                    speaker="Marc",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Algieba")
                    )
                )
            ]
        )
        
        # 3. Request logic with explicit retry for "no audio" edge cases
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            t0 = time.time()
            try:
                config = types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    temperature=1.0, 
                    speech_config=types.SpeechConfig(
                        language_code="fr-FR",
                        multi_speaker_voice_config=multi_speaker_config
                    )
                )
                
                print(f"DEBUG: [TTS START] Requesting {len(script_items)} segments for {model_id} (Attempt {attempt}/{max_attempts})")

                # Internal retry logic for network/429/500 errors
                response = self._call_with_retry(
                    model_id=model_id,
                    prompt=full_text,
                    config=config,
                    max_retries=7 # More retries for the heavy TTS call
                )
                
                audio_data = None
                if response.candidates and response.candidates[0].content:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, 'inline_data'):
                            audio_data = part.inline_data.data
                            break
                
                if not audio_data:
                    # If API said 200 OK but returned nothing, it's a transient failure
                    raise ValueError("Aucune donnée audio reçue du modèle (Transient API fail)")
                
                latency = time.time() - t0
                print(f"DEBUG: [TTS SUCCESS] Received {len(audio_data)} bytes in {latency:.2f}s")
                
                return AudioSegment(
                    data=audio_data,
                    sample_width=2,
                    frame_rate=24000,
                    channels=1
                )

            except Exception as e:
                # If we still have attempts left and it's a "no audio" error or transient, walk away and try again
                if attempt < max_attempts and ("Aucune donnée" in str(e) or "500" in str(e) or "429" in str(e)):
                    wait = 5 * attempt + random.uniform(1, 4)
                    print(f"DEBUG: [TTS RETRY] Attempt {attempt} failed ({str(e)}). Retrying in {wait:.1f}s...")
                    time.sleep(wait)
                else:
                    print(f"DEBUG: [TTS FINAL ERROR] Failed after {attempt} attempts: {str(e)}")
                    raise e

    def generate_podcast_audio(self, script, category, theme):
        """Generates full podcast audio in a single pass for consistency."""
        print(f"--- Generating Multi-Speaker Audio (Single Pass) for {category} - {theme} ---")
        start_time = time.time()
        
        combined_audio = self.synthesize_multi_speaker(script)
                
        end_time = time.time()
        print(f"--- Multi-Speaker Finish (Total duration: {end_time - start_time:.2f}s) ---")
            
        # Clean path naming
        def clean_name(name):
            return re.sub(r'[\\/*?:"<>|]', "", name).strip()

        safe_cat = clean_name(category)
        safe_theme = clean_name(theme)
        output_dir = "podcasts"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            
        base_filename = f"{safe_cat} - {safe_theme}"
        output_path = os.path.join(output_dir, f"{base_filename}.mp3")
        
        # Collision handling with (N) suffix
        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(output_dir, f"{base_filename} ({counter}).mp3")
            counter += 1

        # Add 5 seconds of silence at the end to prevent truncation by players
        combined_audio += AudioSegment.silent(duration=5000)
        
        combined_audio.export(output_path, format="mp3")
        return output_path
