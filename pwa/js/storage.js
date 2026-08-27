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
    scriptModel: 'gemini-3.1-pro-preview',
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
