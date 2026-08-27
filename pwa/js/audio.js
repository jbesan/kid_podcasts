// In-Browser Audio Engine for Kids Podcast PWA
// Converts Gemini TTS raw PCM 24kHz Base64 data into lightweight MP3 (or standard WAV) Blobs

/**
 * Converts a base64 string of raw PCM 16-bit Little-Endian 24kHz mono audio into an MP3 Blob using lamejs.
 * Falls back to WAV Blob if lamejs is not loaded.
 * 
 * @param {string} base64Data Raw PCM data in base64
 * @param {number} sampleRate Default 24000 Hz
 * @param {number} bitRate Default 128 kbps (lightweight & high fidelity voice)
 * @returns {Blob} audio/mp3 Blob (or audio/wav fallback)
 */
export function pcmBase64ToMp3Blob(base64Data, sampleRate = 24000, bitRate = 128) {
  const binaryString = window.atob(base64Data);
  const pcmBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    pcmBytes[i] = binaryString.charCodeAt(i);
  }

  // If lamejs is available, encode directly into MP3
  if (typeof window !== 'undefined' && window.lamejs) {
    try {
      const mp3encoder = new window.lamejs.Mp3Encoder(1, sampleRate, bitRate);
      const samples = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);
      const sampleBlockSize = 1152;
      const mp3Data = [];

      for (let i = 0; i < samples.length; i += sampleBlockSize) {
        const chunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(chunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }

      return new Blob(mp3Data, { type: 'audio/mp3' });
    } catch (err) {
      console.warn("lamejs MP3 encoding error, falling back to WAV:", err);
    }
  }

  // Fallback to WAV Blob
  return pcmBase64ToWavBlob(base64Data, sampleRate, 1, 16);
}

/**
 * Converts a base64 string of raw PCM 16-bit Little-Endian 24kHz mono audio into a WAV Blob.
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
  return new Blob([wavHeader, pcmBytes], { type: 'audio/wav' });
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
 * Downloads or shares the MP3 audio file via mobile native share menu.
 */
export async function shareOrDownloadAudio(blob, filename = "podcast.mp3") {
  const mimeType = blob.type || 'audio/mp3';
  const file = new File([blob], filename, { type: mimeType });
  
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: filename.replace(/\.(mp3|wav)$/i, ""),
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
