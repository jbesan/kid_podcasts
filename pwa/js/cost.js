// Token and Cost calculation utility for Kids Podcast PWA

export const PRICING = {
  text: {
    "gemini-2.5-pro": { in: 1.25, out: 10.00 },
    "gemini-3.7-flash": { in: 0.75, out: 3.75 },
    "gemini-2.5-flash": { in: 0.30, out: 2.50 },
    "gemini-3.1-pro-preview": { in: 2.00, out: 12.00 }
  },
  tts: {
    "gemini-2.5-pro-preview-tts": { in: 1.25, out: 20.00 },
    "gemini-2.5-flash-preview-tts": { in: 0.30, out: 10.00 }
  }
};

export function calculateCost({
  tokensInText = 0,
  tokensOutText = 0,
  textModel = "gemini-2.5-pro",
  audioDurationSeconds = 0,
  ttsModel = "gemini-2.5-pro-preview-tts",
  audioInTokens = null,
  audioOutTokens = null
}) {
  const textRates = PRICING.text[textModel] || PRICING.text["gemini-2.5-pro"];
  const ttsRates = PRICING.tts[ttsModel] || PRICING.tts["gemini-2.5-pro-preview-tts"];

  // 1. Script generation cost
  const scriptCost = (tokensInText * textRates.in + tokensOutText * textRates.out) / 1_000_000;

  // 2. Audio TTS cost
  // If not provided by API metadata, estimate: 25 audio tokens per second
  const audioIn = audioInTokens !== null ? audioInTokens : tokensOutText;
  const audioOut = audioOutTokens !== null ? audioOutTokens : Math.round(audioDurationSeconds * 25);

  const audioCost = (audioIn * ttsRates.in + audioOut * ttsRates.out) / 1_000_000;

  return {
    scriptCost,
    audioCost,
    totalCost: scriptCost + audioCost,
    audioInTokens: audioIn,
    audioOutTokens: audioOut
  };
}
