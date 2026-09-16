// Gemini Client-Side REST API Module for Kids Podcast PWA
import { buildScriptPrompt, SCRIPT_JSON_SCHEMA, buildTtsPrompt, DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL } from './prompts.js';
import { pcmBase64ToMp3Blob, getPcmDurationSeconds } from './audio.js';

const BASE_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Helper to call Gemini REST endpoint with smart retries on 429 / transient errors.
 */
async function callGeminiApiWithRetry(model, payload, apiKey, maxRetries = 3) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Clé API Google AI Studio manquante. Veuillez la renseigner dans les Réglages ⚙️.");
  }

  const url = `${BASE_API_URL}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
  let attempt = 0;
  let baseDelay = 3000;
  let lastError = null;

  while (attempt < maxRetries) {
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      lastError = networkError;
      attempt++;
      if (attempt >= maxRetries) {
        throw new Error(`Erreur réseau : impossible de contacter Google Gemini (${networkError.message || networkError})`);
      }
      await new Promise((resolve) => setTimeout(resolve, baseDelay * attempt));
      continue;
    }

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

    const message = errorData?.error?.message || `Erreur API Gemini (${status})`;
    lastError = new Error(message);

    // If non-retryable client error (e.g. 400 Bad Request, 401 Invalid Key, 403 Permission Denied / Leaked Key), throw immediately!
    if (!isRateLimit && !isTransient) {
      throw lastError;
    }

    attempt++;
    if (attempt >= maxRetries) {
      throw new Error(`Quota ou limite atteinte (${status}) : ${message}`);
    }

    const waitTime = baseDelay * attempt + Math.random() * 1000;
    console.warn(`[Gemini API] Retry ${attempt}/${maxRetries} dans ${Math.round(waitTime / 1000)}s... (${status})`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  throw lastError || new Error("Échec de la communication avec l'API Gemini après plusieurs tentatives.");
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

  // Convert raw PCM 24kHz Base64 to lightweight MP3 Blob (with WAV fallback)
  const mp3Blob = pcmBase64ToMp3Blob(audioBase64, 24000, 128);
  const binaryString = window.atob(audioBase64);
  const durationSeconds = getPcmDurationSeconds(binaryString.length, 24000, 1, 16);

  const usageMetadata = data.usageMetadata || {};

  return {
    audioBlob: mp3Blob,
    durationSeconds,
    usage: {
      promptTokens: usageMetadata.promptTokenCount || 0,
      candidatesTokens: usageMetadata.candidatesTokenCount || 0,
      totalTokens: usageMetadata.totalTokenCount || 0
    }
  };
}

/**
 * Creates a Gemini Batch API job for multiple podcast audio syntheses.
 * Uses 50% cheaper Batch pricing and executes fully asynchronously.
 */
export async function createTtsBatchJob({
  apiKey,
  episodes,
  model = DEFAULT_TTS_MODEL
}) {
  if (!apiKey || apiKey.trim() === "") {
    throw new Error("Clé API Google AI Studio manquante.");
  }
  if (!episodes || episodes.length === 0) {
    throw new Error("Aucun épisode à inclure dans le batch.");
  }

  const url = `${BASE_API_URL}/${encodeURIComponent(model)}:batchGenerateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const inlinedRequests = episodes.map(ep => {
    const ttsPrompt = buildTtsPrompt(ep.scriptItems);
    return {
      metadata: {
        episodeId: ep.id,
        theme: ep.theme,
        category: ep.category,
        age: String(ep.age),
        duration: String(ep.duration)
      },
      request: {
        contents: [
          {
            parts: [{ text: ttsPrompt }]
          }
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          temperature: 1.0,
          speechConfig: {
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
      }
    };
  });

  const payload = {
    batch: {
      displayName: `Kids-Podcasts-${Date.now()}`,
      inputConfig: {
        requests: {
          requests: inlinedRequests
        }
      }
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    let errMsg = errText;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errText;
    } catch (e) {}
    throw new Error(`Échec de création du batch (${response.status}) : ${errMsg}`);
  }

  const data = await response.json();
  // Name can be in data.name or data.metadata?.name (e.g. "batches/123456...")
  const jobName = data.name || data.metadata?.name;
  if (!jobName) {
    throw new Error("Impossible de trouver l'identifiant du batch retourné par Google.");
  }

  return {
    jobName,
    data
  };
}

/**
 * Checks the status of a Gemini Batch job.
 */
export async function checkBatchJobStatus({ apiKey, jobName }) {
  if (!apiKey || !jobName) {
    throw new Error("Clé API ou identifiant de batch manquant.");
  }

  // Strip leading slash if any
  const cleanName = jobName.startsWith('/') ? jobName.substring(1) : jobName;
  const url = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${encodeURIComponent(apiKey.trim())}`;

  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erreur lors de la vérification du batch (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawState = data.state || data.metadata?.state || (data.done ? "BATCH_STATE_SUCCEEDED" : "BATCH_STATE_RUNNING");
  const cleanState = rawState.replace('BATCH_STATE_', '').replace('JOB_STATE_', '');
  const isDone = data.done === true || cleanState === "SUCCEEDED" || cleanState === "FAILED" || cleanState === "CANCELLED";

  console.log(`[KidsPodcasts Batch] checkBatchJobStatus(${cleanName}):`, {
    rawState,
    normalizedState: cleanState,
    done: isDone,
    stats: data.metadata?.batchStats
  });

  return {
    jobName,
    state: cleanState,
    rawState,
    done: isDone,
    raw: data
  };
}

/**
 * Fetches and parses batch job results, extracting raw audio base64 for each episode.
 */
export async function fetchBatchJobResults({ apiKey, batchData }) {
  const raw = batchData.raw || batchData;
  console.log("[KidsPodcasts Batch] fetchBatchJobResults parsing raw payload:", raw);

  // Google API can return inlinedResponses directly or nested as { inlinedResponses: [...] }
  let inlined = raw.response?.inlinedResponses || raw.dest?.inlinedResponses || raw.metadata?.output?.inlinedResponses;
  if (inlined && !Array.isArray(inlined) && Array.isArray(inlined.inlinedResponses)) {
    inlined = inlined.inlinedResponses;
  }

  // Case 1: Inlined responses
  if (inlined && Array.isArray(inlined)) {
    console.log(`[KidsPodcasts Batch] Found ${inlined.length} inlined responses in batch.`);
    return inlined.map((item, index) => {
      const resp = item.response || {};
      const candidate = resp.candidates?.[0];
      let audioBase64 = null;
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData?.data) {
            audioBase64 = part.inlineData.data;
            break;
          }
        }
      }

      const usage = resp.usageMetadata || {};
      const episodeId = item.metadata?.episodeId;
      console.log(`[KidsPodcasts Batch] Item #${index} [${item.metadata?.theme || 'sans titre'}]: episodeId=${episodeId}, hasAudio=${Boolean(audioBase64)}, audioBase64Length=${audioBase64 ? audioBase64.length : 0}`);

      return {
        metadata: item.metadata || {},
        episodeId,
        audioBase64,
        usage: {
          promptTokens: usage.promptTokenCount || 0,
          candidatesTokens: usage.candidatesTokenCount || 0
        },
        error: item.error || (!audioBase64 ? "Aucune donnée audio reçue" : null)
      };
    });
  }

  // Case 2: Response file (JSONL)
  const responsesFile = raw.response?.responsesFile || raw.dest?.fileName;
  if (responsesFile) {
    const fileUrl = `https://generativelanguage.googleapis.com/download/v1beta/${responsesFile}:download?alt=media&key=${encodeURIComponent(apiKey.trim())}`;
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      throw new Error(`Impossible de télécharger le fichier résultat du batch (${fileResp.status})`);
    }

    const jsonlText = await fileResp.text();
    const lines = jsonlText.split('\n').filter(line => line.trim().length > 0);
    
    return lines.map(line => {
      try {
        const item = JSON.parse(line);
        const resp = item.response || {};
        const candidate = resp.candidates?.[0];
        let audioBase64 = null;
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
              audioBase64 = part.inlineData.data;
              break;
            }
          }
        }
        const usage = resp.usageMetadata || {};
        return {
          metadata: item.metadata || {},
          episodeId: item.metadata?.episodeId || item.key,
          audioBase64,
          usage: {
            promptTokens: usage.promptTokenCount || 0,
            candidatesTokens: usage.candidatesTokenCount || 0
          },
          error: item.error || (!audioBase64 ? "Aucune donnée audio reçue" : null)
        };
      } catch (e) {
        return { error: `Erreur de décodage JSONL: ${e.message}` };
      }
    });
  }

  throw new Error("Aucun résultat audio trouvé dans la réponse du batch.");
}

