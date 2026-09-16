// Storage Layer for Kids Podcast PWA
// Uses localStorage for settings and IndexedDB for full offline Podcast history & audio Blobs

const DB_NAME = 'KidsPodcastDB';
const DB_VERSION = 1;
const STORE_NAME = 'episodes';

// --- LocalStorage Settings ---
const SETTINGS_KEY = 'kids_podcast_pwa_settings';

export function getSettings() {
  const defaults = {
    apiKey: '',
    scriptModel: 'gemini-3.8-flash',
    ttsModel: 'gemini-2.5-pro-preview-tts',
    kidsContext: 'Deux enfants curieux et dynamiques. Aiment les découvertes, la nature et les aventures.',
    targetAge: 6,
    duration: 7
  };

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch (e) {
    console.warn("Could not read settings from localStorage:", e);
    return defaults;
  }
}

export function saveSettings(settings) {
  try {
    const current = getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error("Could not save settings:", e);
    return settings;
  }
}

// --- IndexedDB Episodes Store ---

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveEpisode(episode) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const item = {
      id: episode.id || 'ep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      timestamp: episode.timestamp || Date.now(),
      category: episode.category,
      theme: episode.theme,
      age: episode.age,
      duration: episode.duration,
      scriptItems: episode.scriptItems || [],
      audioBlob: episode.audioBlob || null,
      durationSeconds: episode.durationSeconds || 0,
      cost: episode.cost || 0,
      scriptCost: episode.scriptCost || 0,
      audioCost: episode.audioCost || 0,
      status: episode.status || 'ready'
    };

    const request = store.put(item);
    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllEpisodes() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort newest first
      const items = (request.result || []).sort((a, b) => b.timestamp - a.timestamp);
      resolve(items);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteEpisode(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// --- Batch Jobs Storage (LocalStorage) ---
const BATCH_JOBS_KEY = 'kids_podcast_batch_jobs';

function sanitizeBatchJob(job) {
  if (!job) return job;
  const clean = { ...job };
  // Never persist heavy payloads, responses or base64 audio into localStorage (5MB limit)
  delete clean.raw;
  delete clean.audioBase64;
  delete clean.response;
  return clean;
}

export function getAllBatchJobs() {
  try {
    const raw = localStorage.getItem(BATCH_JOBS_KEY);
    if (!raw) return [];
    const jobs = JSON.parse(raw);
    if (!Array.isArray(jobs)) return [];

    let neededCleaning = false;
    const sanitizedJobs = jobs.map(j => {
      if (j && (j.raw || j.audioBase64 || j.response)) {
        neededCleaning = true;
        return sanitizeBatchJob(j);
      }
      return j;
    });

    if (neededCleaning) {
      try {
        localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(sanitizedJobs));
        console.log("Auto-cleaned heavy raw batch data from localStorage.");
      } catch (err) {
        console.warn("Could not write sanitized jobs:", err);
      }
    }
    return sanitizedJobs;
  } catch (e) {
    console.warn("Could not read batch jobs from localStorage:", e);
    return [];
  }
}

export function saveBatchJob(job) {
  try {
    const cleanJob = sanitizeBatchJob(job);
    const jobs = getAllBatchJobs();
    const existingIdx = jobs.findIndex(j => j.id === cleanJob.id);
    if (existingIdx >= 0) {
      jobs[existingIdx] = { ...jobs[existingIdx], ...cleanJob };
    } else {
      jobs.unshift(cleanJob);
    }
    localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(jobs));
    return cleanJob;
  } catch (e) {
    console.error("Could not save batch job:", e);
    return job;
  }
}

export function updateBatchJob(jobId, updates) {
  try {
    const cleanUpdates = sanitizeBatchJob(updates);
    const jobs = getAllBatchJobs();
    const idx = jobs.findIndex(j => j.id === jobId);
    if (idx >= 0) {
      jobs[idx] = { ...jobs[idx], ...cleanUpdates };
      delete jobs[idx].raw;
      delete jobs[idx].audioBase64;
      delete jobs[idx].response;
      localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(jobs));
      return jobs[idx];
    }
  } catch (e) {
    console.error("Could not update batch job:", e);
    // Emergency cleanup if quota is hit
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      try {
        const raw = localStorage.getItem(BATCH_JOBS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          const sanitized = parsed.map(sanitizeBatchJob);
          localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(sanitized));
        }
      } catch (inner) {
        console.error("Emergency storage cleanup failed:", inner);
      }
    }
  }
  return null;
}

export function deleteBatchJob(jobId) {
  try {
    let jobs = getAllBatchJobs();
    jobs = jobs.filter(j => j.id !== jobId);
    localStorage.setItem(BATCH_JOBS_KEY, JSON.stringify(jobs));
    return true;
  } catch (e) {
    console.error("Could not delete batch job:", e);
    return false;
  }
}

