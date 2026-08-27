// In-Browser Audio Engine for Kids Podcast PWA
// Converts Gemini TTS raw PCM 24kHz Base64 data into standard playable WAV Blobs

/**
 * Converts a base64 string of raw PCM 16-bit Little-Endian 24kHz mono audio into a WAV Blob.
 * 
 * @param {string} base64Data Raw PCM data in base64
 * @param {number} sampleRate Default 24000 Hz
 * @param {number} numChannels Default 1 (Mono)
 * @param {number} bitsPerSample Default 16-bit
 * @returns {Blob} Standard audio/wav Blob
 */
export function pcmBase64ToWavBlob(base64Data, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const binaryString = window.atob(base64Data);
  const pcmBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  const pcmLength = pcmBytes.length;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // 1. "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmLength, true); // ChunkSize
  writeString(view, 8, 'WAVE');

  // 2. "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true);  // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true);  // SampleRate (24000)
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  view.setUint32(28, byteRate, true);    // ByteRate (48000)
  const blockAlign = numChannels * (bitsPerSample / 8);
  view.setUint16(32, blockAlign, true);  // BlockAlign (2)
  view.setUint16(34, bitsPerSample, true);// BitsPerSample (16)

  // 3. "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, pcmLength, true);   // Subchunk2Size

  // Combine Header + PCM bytes
  const wavBlob = new Blob([wavHeader, pcmBytes], { type: 'audio/wav' });
  return wavBlob;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Calculates audio duration in seconds from PCM byte length.
 */
export function getPcmDurationSeconds(byteLength, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  return byteLength / bytesPerSecond;
}

/**
 * Formats seconds into MM:SS format.
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

/**
 * Downloads or shares the audio file via mobile native share menu.
 */
export async function shareOrDownloadAudio(blob, filename = "podcast.wav") {
  const file = new File([blob], filename, { type: "audio/wav" });
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename.replace(".wav", ""),
        text: "Épisode de podcast pour enfants généré avec Kids Podcast Studio !"
      });
      return true;
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.warn("Share failed, falling back to download:", e);
      }
    }
  }

  // Fallback standard download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 2000);
  return true;
}
