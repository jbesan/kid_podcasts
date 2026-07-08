import asyncio
import json
import logging
import os
import re
from typing import Any

from google import genai
from pydantic import BaseModel
from pydub import AudioSegment

from config import DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL, MAX_RETRIES

logger = logging.getLogger("kid_podcasts.generator")


class ScriptItem(BaseModel):
    speaker: str
    text: str


class PodcastScript(BaseModel):
    items: list[ScriptItem]


class PodcastGenerator:
    def __init__(self, api_key, timeout_ms=600000):
        if not api_key or api_key == "votre_cle_api_ici":
            raise ValueError("Une clé API Google GenAI valide est requise.")
        # Settings http_options here for loop affinity and global timeout safety
        self.client = genai.Client(
            api_key=api_key, http_options={"timeout": timeout_ms}
        )
        self.prompt_template_path = "transcript_prompt_template.md"
        self.tts_prompt_template_path = "tts_prompt_template.md"

    async def _call_with_retry(
        self, model_id: str, prompt: Any, config: Any, max_retries: int = MAX_RETRIES
    ):
        """Helper to call Gemini API asynchronously with smart retry for 429 errors using asyncio.sleep."""
        attempt = 0
        base_delay = 5

        while attempt < max_retries:
            try:
                logger.info(
                    "Calling %s ASYNC (Attempt %d/%d)...",
                    model_id,
                    attempt + 1,
                    max_retries,
                )

                # Async Gemini call
                response = await self.client.aio.models.generate_content(
                    model=model_id,
                    contents=prompt,
                    config=config,
                )
                logger.info("Calling %s ASYNC -> SUCCESS", model_id)
                return response
            except Exception as e:
                error_msg = str(e).lower()

                is_rate_limit = (
                    "429" in error_msg
                    or "resourceexhausted" in error_msg
                    or "quota" in error_msg
                )
                is_transient = (
                    any(code in error_msg for code in ["500", "503", "504"])
                    or "internal error" in error_msg
                    or "deadline exceeded" in error_msg
                    or "timeout" in error_msg
                )

                if not (is_rate_limit or is_transient):
                    logger.error("Non-retryable error during %s call:", model_id)
                    logger.exception(e)
                    raise e

                attempt += 1

                if is_rate_limit:
                    import random

                    wait_time = None
                    try:
                        if hasattr(e, "details"):
                            for detail in getattr(e, "details", []):
                                if isinstance(detail, dict):
                                    rd = (
                                        detail.get("retry_delay")
                                        or detail.get("retryDelay")
                                        or detail.get("retry_after")
                                    )
                                    if rd:
                                        if isinstance(rd, dict) and "seconds" in rd:
                                            wait_time = float(rd["seconds"]) + 1.0
                                            break
                                        elif isinstance(rd, str):
                                            rd_match = re.search(
                                                r"(\d+(?:\.\d+)?)s?", rd
                                            )
                                            if rd_match:
                                                wait_time = (
                                                    float(rd_match.group(1)) + 1.0
                                                )
                                                break
                    except Exception:
                        pass

                    if wait_time is None:
                        retry_match = re.search(
                            r"(?:after|in|seconds|retry_delay|retry_after|retrydelay|delay):\s*(\d+(?:\.\d+)?)",
                            error_msg,
                            re.IGNORECASE,
                        )
                        if retry_match:
                            wait_time = float(retry_match.group(1)) + 1.0

                    if wait_time is None:
                        wait_time = base_delay * attempt

                    wait_time += random.uniform(0.5, 3.0)
                    logger.warning(
                        "DEBUG ASYNC: [429 ERROR] Rate limit hit for %s. Waiting %.1fs...",
                        model_id,
                        wait_time,
                    )
                    await asyncio.sleep(wait_time)
                elif is_transient:
                    import random

                    wait_time = (base_delay * (2 ** (attempt - 1))) + random.uniform(
                        0.5, 3.0
                    )
                    logger.warning(
                        "Transient error during %s call. Retrying in %.1fs... Error: %s",
                        model_id,
                        wait_time,
                        e,
                    )
                    await asyncio.sleep(wait_time)
                else:
                    raise e

        raise Exception(
            f"Max async retries ({max_retries}) reached for model {model_id}. Last error: {error_msg}"
        )

    async def generate_script(
        self,
        context: str,
        category: str,
        theme: str,
        duration: int,
        age: int,
        word_count: int = 1000,
        model_id: str = DEFAULT_TRANSCRIPT_MODEL,
    ) -> tuple[list[dict], dict]:
        """Generates a podcast script using the specified model."""
        logger.info(
            "Generating script for theme '%s' (category: %s, duration: %d min, age: %d, model: %s)...",
            theme,
            category,
            duration,
            age,
            model_id,
        )
        if os.path.exists(self.prompt_template_path):
            with open(self.prompt_template_path) as f:
                template = f.read()
        else:
            template = "Category: {category}\nTopic: {theme}\nDuration: {duration} minutes\nTarget Age: {age}\nWord Count: {word_count}\nContext: {context}\nGenerate a podcast script in JSON format."

        prompt = template.format(
            category=category,
            theme=theme,
            duration=duration,
            age=age,
            context=context,
            word_count=word_count,
        )

        try:
            schema = PodcastScript.model_json_schema()
            response = await self._call_with_retry(
                model_id=model_id,
                prompt=prompt,
                config={
                    "response_mime_type": "application/json",
                    "response_json_schema": schema,
                },
            )

            if not response.text:
                raise ValueError("L'API Gemini a retourné une réponse vide (Async).")

            data = json.loads(response.text)
            usage = {
                "prompt_tokens": response.usage_metadata.prompt_token_count,
                "candidates_tokens": response.usage_metadata.candidates_token_count,
                "total_tokens": response.usage_metadata.total_token_count,
            }
            logger.info(
                "Script generated successfully for '%s'. Tokens: %d (in: %d, out: %d)",
                theme,
                usage["total_tokens"],
                usage["prompt_tokens"],
                usage["candidates_tokens"],
            )
            if isinstance(data, dict) and "items" in data:
                return data["items"], usage
            return data, usage
        except Exception as e:
            logger.exception(
                "Error during generate_script for theme '%s': %s", theme, e
            )
            raise e

    async def synthesize_multi_speaker(
        self, script_items, model_id=DEFAULT_TTS_MODEL
    ) -> tuple[AudioSegment, dict]:
        """Synthesizes a full conversation using MultiSpeakerVoiceConfig."""
        import random

        from google.genai import types

        logger.info(
            "Synthesizing dialogue into audio with model %s (%d lines)...",
            model_id,
            len(script_items),
        )
        if os.path.exists(self.tts_prompt_template_path):
            with open(self.tts_prompt_template_path) as f:
                template = f.read()
        else:
            template = "# AUDIO PROFILE: Sophie\n# AUDIO PROFILE: Marc\n# DIRECTOR'S NOTES\n- articulated and clear\n#### TRANSCRIPT"

        dialogue_lines = []
        for item in script_items:
            raw_speaker = item.get("speaker", "Sophie").lower()
            clean_speaker = (
                "Sophie"
                if "sophie" in raw_speaker
                else "Marc"
                if "marc" in raw_speaker
                else "Sophie"
            )
            text = item.get("text", "")
            text = re.sub(
                r"\[(Sophie|Marc)\s*-\s*([^\]]+)\]", r"[\2]", text, flags=re.IGNORECASE
            )
            dialogue_lines.append(f"{clean_speaker}: {text}")

        full_text = template + "\n" + "\n".join(dialogue_lines)

        multi_speaker_config = types.MultiSpeakerVoiceConfig(
            speaker_voice_configs=[
                types.SpeakerVoiceConfig(
                    speaker="Sophie",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Erinome"
                        )
                    ),
                ),
                types.SpeakerVoiceConfig(
                    speaker="Marc",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(
                            voice_name="Algieba"
                        )
                    ),
                ),
            ]
        )

        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            try:
                config = types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    temperature=1.0,
                    speech_config=types.SpeechConfig(
                        language_code="fr-FR",
                        multi_speaker_voice_config=multi_speaker_config,
                    ),
                )

                response = await self._call_with_retry(
                    model_id=model_id,
                    prompt=full_text,
                    config=config,
                    max_retries=MAX_RETRIES,
                )

                audio_data = None
                if response.candidates and response.candidates[0].content:
                    for part in response.candidates[0].content.parts:
                        if hasattr(part, "inline_data"):
                            audio_data = part.inline_data.data
                            break

                if not audio_data:
                    raise ValueError("Aucune donnée audio (Async)")

                usage = {
                    "prompt_tokens": response.usage_metadata.prompt_token_count,
                    "candidates_tokens": response.usage_metadata.candidates_token_count,
                    "total_tokens": response.usage_metadata.total_token_count,
                }

                logger.info(
                    "Audio synthesis succeeded. Tokens: %d (in: %d, out: %d)",
                    usage["total_tokens"],
                    usage["prompt_tokens"],
                    usage["candidates_tokens"],
                )
                return (
                    AudioSegment(
                        data=audio_data, sample_width=2, frame_rate=24000, channels=1
                    ),
                    usage,
                )

            except Exception as e:
                if attempt < max_attempts and (
                    "Aucune donnée" in str(e) or "500" in str(e) or "429" in str(e)
                ):
                    wait = 5 * attempt + random.uniform(1, 4)
                    logger.warning(
                        "Attempt %d/%d failed for voice synthesis: %s. Retrying in %.1fs...",
                        attempt,
                        max_attempts,
                        e,
                        wait,
                    )
                    await asyncio.sleep(wait)
                else:
                    logger.error(
                        "Voice synthesis failed completely on attempt %d: %s",
                        attempt,
                        e,
                    )
                    raise e
        raise Exception("Async synthesis failed after maximum attempts.")

    async def generate_podcast_audio(
        self, script, category, theme, model_id=DEFAULT_TTS_MODEL
    ) -> tuple[str, float, dict]:
        """Generates full podcast audio asynchronously using multi-speaker synthesis."""
        logger.info("Starting full podcast audio generation for theme: '%s'...", theme)
        combined_audio, usage = await self.synthesize_multi_speaker(
            script, model_id=model_id
        )
        duration_seconds = len(combined_audio) / 1000.0

        def clean_name(name):
            return re.sub(r'[\\/*?:"<>|]', "", name).strip()

        safe_cat = clean_name(category)
        safe_theme = clean_name(theme)
        output_dir = "podcasts"
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)

        base_filename = f"{safe_cat} - {safe_theme}"
        output_path = os.path.join(output_dir, f"{base_filename}.mp3")

        counter = 1
        while os.path.exists(output_path):
            output_path = os.path.join(output_dir, f"{base_filename} ({counter}).mp3")
            counter += 1

        combined_audio += AudioSegment.silent(duration=5000)
        loop = asyncio.get_running_loop()
        logger.info("Exporting combined audio to MP3: '%s'...", output_path)
        await loop.run_in_executor(
            None, lambda: combined_audio.export(output_path, format="mp3")
        )
        logger.info("Audio export completed successfully: '%s'", output_path)
        return output_path, duration_seconds, usage
