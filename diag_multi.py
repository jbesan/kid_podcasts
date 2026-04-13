import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv(override=True)
api_key = os.getenv("GOOGLE_API_KEY")

client = genai.Client(api_key=api_key)

print("Testing if steering tags with names confuse the engine...")

multi_speaker_config = types.MultiSpeakerVoiceConfig(
    speaker_voice_configs=[
        types.SpeakerVoiceConfig(
            speaker="Sophie",
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")
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

# Case 1: Standard tags
# Case 2: Tags containing the name (as in our current prompt)
# Case 3: Mixed case/typos in speaker label
prompt = """TTS the following conversation between Sophie and Marc:
Sophie: [Sophie - enthousiaste] Bonjour !
Marc: [Marc - pédagogue] Bonjour Sophie.
"""

try:
    response = client.models.generate_content(
        model="gemini-2.5-flash-preview-tts",
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                multi_speaker_voice_config=multi_speaker_config
            )
        )
    )
    
    print("Success!")
    data = response.candidates[0].content.parts[0].inline_data.data
    if data:
        with open("diag_multi_confusion_check.pcm", "wb") as f:
            f.write(data)
        print(f"Audio saved to diag_multi_confusion_check.pcm ({len(data)} bytes)")
    else:
        print("No audio data found.")

except Exception as e:
    print(f"Error: {e}")
