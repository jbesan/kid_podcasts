// Gemini Client-Side REST API Module for Kids Podcast PWA
import { buildScriptPrompt, SCRIPT_JSON_SCHEMA, buildTtsPrompt, DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL } from './prompts.js';
import { pcmBase64ToWavBlob, getPcmDurationSeconds } from './audio.js';

const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Helper to call Gemini REST endpoint with smart retries on 429 / transient errors.
 */
async function callGeminiApiWithRetry(model, payload, apiKey, maxRetries = 3) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Clé API Google AI Studio manquante. Veuillez la renseigner dans les Réglages.");
  }

  const url = `${BASE_API_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  let attempt = 0;
  let baseDelay = 3000; // 3 seconds

  while (attempt < maxRetries) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        return await response.json();
      }

      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (e) {
        errorData = { error: { message: errorText } };
      }

      const status = response.status;
      const isRateLimit = status === 429 || (errorData.error && errorData.error.status === "RESOURCE_EXHAUSTED");
      const isTransient = status >= 500 && status <= 504;

      if (!isRateLimit && !isTransient) {
        const message = errorData?.error?.message || `Erreur API Gemini (${status})`;
        throw new Error(message);
      }

      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(errorData?.error?.message || `Trop de requêtes (429 / Limite atteinte après ${maxRetries} tentatives).`);
      }

      const waitTime = baseDelay * attempt + Math.random() * 1500;
      console.warn(`[Gemini API] Quota ou erreur temporaire (${status}). Nouvelle tentative dans ${Math.round(waitTime / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    } catch (e) {
      if (attempt >= maxRetries || e.message.includes("Clé API")) {
        throw e;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
    }
  }

  throw new Error("Échec de la communication avec l'API Gemini après plusieurs tentatives.");
}

/**
 * Generates the podcast script with structured JSON schema.
 */
export async function generateScript({
  apiKey,
  category,
  theme,
  duration = 7,
  age = 7,
  context = "",
  model = DEFAULT_TRANSCRIPT_MODEL
}) {
  const prompt = buildScriptPrompt({ category, theme, duration, age, context });

  const payload = {
    contents: [
      {
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: SCRIPT_JSON_SCHEMA,
      temperature: 0.8
    }
  };

  const data = await callGeminiApiWithRetry(model, payload, apiKey);

  if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
    throw new Error("Réponse vide reçue pour la génération du script.");
  }

  const rawJson = data.candidates[0].content.parts[0].text;
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error("Impossible de décoder le script JSON généré.");
  }

  const items = parsed.items || (Array.isArray(parsed) ? parsed : []);
  const usageMetadata = data.usageMetadata || {};

  return {
    items,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    }
  };
}

/**
 * Synthesizes the podcast dialogue into audio using Gemini Multi-Speaker TTS.
 */
export async function synthesizePodcastAudio({
  apiKey,
  scriptItems,
  model = DEFAULT_TTS_MODEL
}) {
  const ttsPrompt = buildTtsPrompt(scriptItems);

  const payload = {
    contents: [
      {
        parts: [{ text: ttsPrompt }]
      }
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      temperature: 1.0,
      speechConfig: {
        voiceConfig: undefined,
        multiSpeakerVoiceConfig: {
          speakerVoiceConfigs: [
            {
              speaker: "Sophie",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Erinome"
                }
              }
            },
            {
              speaker: "Marc",
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Algieba"
                }
              }
            }
          ]
        }
      }
    }
  };

  const data = await callGeminiApiWithRetry(model, payload, apiKey);

  let audioBase64 = null;
  if (data.candidates && data.candidates[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        audioBase64 = part.inlineData.data;
        break;
      }
    }
  }

  if (!audioBase64) {
    throw new Error("Aucune donnée audio reçue dans la réponse TTS de Gemini.");
  }

  // Convert raw PCM 24kHz Base64 to standard WAV Blob
  const wavBlob = pcmBase64ToWavBlob(audioBase64, 24000, 1, 16);
  const binaryString = window.atob(audioBase64);
  const durationSeconds = getPcmDurationSeconds(binaryString.length, 24000, 1, 16);

  const usageMetadata = data.usageMetadata || {};

  return {
    audioBlob: wavBlob,
    durationSeconds,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    }
  };
}
