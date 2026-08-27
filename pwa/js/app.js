// Main Application Controller for Kids Podcast PWA
import { CATEGORIES, DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL } from './prompts.js';
import { generateScript, synthesizePodcastAudio } from './gemini.js';
import { calculateCost } from './cost.js';
import { formatTime, shareOrDownloadAudio } from './audio.js';
import { getSettings, saveSettings, saveEpisode, getAllEpisodes, deleteEpisode } from './storage.js';

// --- State ---
let state = {
  activeScreen: 'create',
  category: CATEGORIES[0],
  theme: '',
  age: 6,
  duration: 7,
  isGenerating: false,
  activeEpisode: null,
  episodes: [],
  sessionCost: 0,
  settings: getSettings()
};

// Audio Player singleton
let audioPlayer = new Audio();
let isPlaying = false;
let playbackRates = [1.0, 1.25, 1.5, 0.9];
let currentRateIdx = 0;

// --- DOM Elements ---
const elements = {};

function initDomElements() {
  elements.sessionCost = document.getElementById('session-cost');
  elements.themeInput = document.getElementById('theme-input');
  elements.ageDisplay = document.getElementById('age-display');
  elements.ageIndicator = document.getElementById('age-indicator');
  elements.categoriesContainer = document.getElementById('categories-container');
  elements.btnGenerate = document.getElementById('btn-generate');
  elements.progressCard = document.getElementById('progress-card');
  elements.progressBar = document.getElementById('progress-bar');
  elements.progressStatus = document.getElementById('progress-status');
  elements.progressSub = document.getElementById('progress-sub');
  elements.progressPct = document.getElementById('progress-pct');
  elements.progressTimer = document.getElementById('progress-timer');
  elements.episodesFeed = document.getElementById('episodes-feed');
  elements.emptyFeed = document.getElementById('empty-feed');
  
  // Settings elements
  elements.settingsModal = document.getElementById('settings-modal');
  elements.apiKeyInput = document.getElementById('api-key-input');
  elements.kidsContextInput = document.getElementById('kids-context-input');
  elements.scriptModelSelect = document.getElementById('script-model-select');
  elements.ttsModelSelect = document.getElementById('tts-model-select');
  
  // Player screen elements
  elements.playerTitle = document.getElementById('player-title');
  elements.playerMeta = document.getElementById('player-meta');
  elements.playerCategory = document.getElementById('player-category');
  elements.playerIcon = document.getElementById('player-icon');
  elements.playerTimeCurrent = document.getElementById('player-time-current');
  elements.playerTimeTotal = document.getElementById('player-time-total');
  elements.playerProgressBar = document.getElementById('player-progress-bar');
  elements.playerProgressTrack = document.getElementById('player-progress-track');
  elements.btnPlayPause = document.getElementById('btn-play-pause');
  elements.btnSpeed = document.getElementById('btn-speed');
  elements.scriptDialogueContainer = document.getElementById('script-dialogue-container');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
  initDomElements();
  loadSettingsIntoUI();
  renderCategories();
  setupAudioListeners();
  await refreshEpisodesList();

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log("PWA Service Worker registered successfully.");
    } catch (e) {
      console.warn("Service Worker registration failed:", e);
    }
  }

  // Setup global event listeners
  window.switchScreen = switchScreen;
  window.selectCategory = selectCategory;
  window.adjustAge = adjustAge;
  window.setDuration = setDuration;
  window.startGeneration = startGeneration;
  window.openSettings = openSettings;
  window.closeSettings = closeSettings;
  window.saveSettingsFromUI = saveSettingsFromUI;
  window.playEpisode = playEpisode;
  window.togglePlayPause = togglePlayPause;
  window.skipAudio = skipAudio;
  window.cycleSpeed = cycleSpeed;
  window.shareCurrentAudio = shareCurrentAudio;
  window.deleteEpisodeById = deleteEpisodeById;
});

// --- Categories Rendering ---
function renderCategories() {
  if (!elements.categoriesContainer) return;
  elements.categoriesContainer.innerHTML = '';

  CATEGORIES.forEach((cat, idx) => {
    const isSelected = cat.id === state.category.id;
    const btn = document.createElement('button');
    btn.className = isSelected 
      ? "cat-pill flex-shrink-0 px-3.5 py-2.5 bg-indigo-600 text-white rounded-2xl border border-indigo-500 flex items-center gap-2 text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all"
      : "cat-pill flex-shrink-0 px-3.5 py-2.5 bg-slate-900 text-slate-300 hover:text-white rounded-2xl border border-slate-800 flex items-center gap-2 text-xs font-medium transition-all";
    btn.innerHTML = `<span class="text-sm">${cat.icon}</span> ${cat.name}`;
    btn.onclick = () => selectCategory(cat.id);
    elements.categoriesContainer.appendChild(btn);
  });
}

function selectCategory(catId) {
  const cat = CATEGORIES.find(c => c.id === catId);
  if (cat) {
    state.category = cat;
    renderCategories();
  }
}

// --- Age & Duration Steppers ---
function adjustAge(delta) {
  state.age = Math.max(3, Math.min(12, state.age + delta));
  if (elements.ageDisplay) elements.ageDisplay.innerText = `${state.age} ans`;
  if (elements.ageIndicator) elements.ageIndicator.innerText = `${state.age} ans`;
}

function setDuration(mins, btnElement) {
  state.duration = mins;
  document.querySelectorAll('.dur-btn').forEach(b => {
    b.className = "dur-btn flex-1 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-all";
  });
  if (btnElement) {
    btnElement.className = "dur-btn flex-1 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 text-white shadow-sm transition-all";
  }
}

// --- Screen Switching ---
function switchScreen(screenName) {
  state.activeScreen = screenName;
  ['create', 'player', 'settings'].forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    const tab = document.getElementById(`tab-${s}`);
    const nav = document.getElementById(`nav-${s}`);
    
    if (el) el.classList.add('hidden');
    if (tab) tab.className = "px-3 py-1 rounded-lg font-medium text-slate-400 hover:text-white transition-all";
    if (nav) nav.className = "flex flex-col items-center gap-1 text-slate-500 hover:text-slate-300 transition-colors";
  });

  const targetScreen = document.getElementById(`screen-${screenName}`);
  const targetTab = document.getElementById(`tab-${screenName}`);
  const targetNav = document.getElementById(`nav-${screenName}`);

  if (targetScreen) targetScreen.classList.remove('hidden');
  if (targetTab) targetTab.className = "px-3 py-1 rounded-lg font-medium bg-indigo-600 text-white transition-all shadow-sm";
  if (targetNav) targetNav.className = "flex flex-col items-center gap-1 text-indigo-400 transition-colors";

  // Scroll to top
  window.scrollTo(0, 0);
}

// --- Generation Pipeline ---
async function startGeneration() {
  const theme = elements.themeInput?.value?.trim();
  if (!theme) {
    alert("Veuillez saisir un sujet pour le podcast (ex: Les requins, Le système solaire...)");
    elements.themeInput?.focus();
    return;
  }

  const settings = getSettings();
  if (!settings.apiKey) {
    alert("Veuillez d'abord configurer votre clé Google AI Studio dans les Réglages.");
    openSettings();
    return;
  }

  state.isGenerating = true;
  updateGenerationUI(true, "1/2. Écriture du script avec Sophie & Marc...", "✨ Structuration pédagogique & intégration de 5 mots d'anglais...", 15);

  // Keep screen awake during generation so OS doesn't freeze background tasks
  let wakeLock = null;
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      console.warn("WakeLock not available:", e);
    }
  }

  // Live timer interval
  let secondsElapsed = 0;
  if (elements.progressTimer) elements.progressTimer.innerText = "0:00";
  const timerInterval = setInterval(() => {
    secondsElapsed++;
    if (elements.progressTimer) {
      elements.progressTimer.innerText = formatTime(secondsElapsed);
    }
  }, 1000);

  try {
    // 1. Generate Script
    const scriptResult = await generateScript({
      apiKey: settings.apiKey,
      category: state.category.name,
      theme,
      duration: state.duration,
      age: state.age,
      context: settings.kidsContext,
      model: settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL
    });

    updateGenerationUI(true, "2/2. Synthèse vocale Studio en cours...", "🎙️ Enregistrement audio multi-locuteurs (~2 à 3 min pour un épisode complet)...", 50);

    // 2. Synthesize Audio
    const audioResult = await synthesizePodcastAudio({
      apiKey: settings.apiKey,
      scriptItems: scriptResult.items,
      model: settings.ttsModel || DEFAULT_TTS_MODEL
    });

    updateGenerationUI(true, "Finalisation de l'épisode...", "✨ Assemblage audio et calcul des coûts...", 95);

    // 3. Calculate Cost
    const costData = calculateCost({
      tokensInText: scriptResult.usage.promptTokens,
      tokensOutText: scriptResult.usage.candidatesTokens,
      textModel: settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL,
      audioDurationSeconds: audioResult.durationSeconds,
      ttsModel: settings.ttsModel || DEFAULT_TTS_MODEL,
      audioInTokens: audioResult.usage.promptTokens,
      audioOutTokens: audioResult.usage.candidatesTokens
    });

    state.sessionCost += costData.totalCost;
    if (elements.sessionCost) {
      elements.sessionCost.innerText = `${state.sessionCost.toFixed(2)}$`;
    }

    // 4. Save Episode in IndexedDB
    const savedEpisode = await saveEpisode({
      category: state.category.name,
      theme,
      age: state.age,
      duration: state.duration,
      scriptItems: scriptResult.items,
      audioBlob: audioResult.audioBlob,
      durationSeconds: audioResult.durationSeconds,
      cost: costData.totalCost,
      scriptCost: costData.scriptCost,
      audioCost: costData.audioCost,
      status: "Prêt"
    });

    clearInterval(timerInterval);
    updateGenerationUI(false);
    await refreshEpisodesList();

    // 5. Open in player automatically
    playEpisode(savedEpisode);
    switchScreen('player');

  } catch (error) {
    clearInterval(timerInterval);
    console.error("Erreur de génération:", error);
    alert(`Erreur lors de la génération : ${error.message}`);
    updateGenerationUI(false);
  } finally {
    clearInterval(timerInterval);
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (e) {}
    }
    state.isGenerating = false;
  }
}

function updateGenerationUI(active, status = "", sub = "", pct = 0) {
  if (!elements.btnGenerate || !elements.progressCard) return;

  if (active) {
    elements.btnGenerate.classList.add('hidden');
    elements.progressCard.classList.remove('hidden');
    if (elements.progressStatus) elements.progressStatus.innerText = status;
    if (elements.progressSub) elements.progressSub.innerText = sub;
    if (elements.progressPct) elements.progressPct.innerText = `${pct}%`;
    if (elements.progressBar) elements.progressBar.style.width = `${pct}%`;
  } else {
    elements.btnGenerate.classList.remove('hidden');
    elements.progressCard.classList.add('hidden');
  }
}

// --- Audio Player Logic ---
function setupAudioListeners() {
  audioPlayer.addEventListener('timeupdate', () => {
    if (!audioPlayer.duration) return;
    const current = audioPlayer.currentTime;
    const total = audioPlayer.duration;
    const pct = (current / total) * 100;

    if (elements.playerTimeCurrent) elements.playerTimeCurrent.innerText = formatTime(current);
    if (elements.playerTimeTotal) elements.playerTimeTotal.innerText = formatTime(total);
    if (elements.playerProgressBar) elements.playerProgressBar.style.width = `${pct}%`;
  });

  audioPlayer.addEventListener('ended', () => {
    isPlaying = false;
    updatePlayButton();
  });

  audioPlayer.addEventListener('play', () => {
    isPlaying = true;
    updatePlayButton();
  });

  audioPlayer.addEventListener('pause', () => {
    isPlaying = false;
    updatePlayButton();
  });

  // Seek on progress track click
  if (elements.playerProgressTrack) {
    elements.playerProgressTrack.addEventListener('click', (e) => {
      if (!audioPlayer.duration) return;
      const rect = elements.playerProgressTrack.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      audioPlayer.currentTime = pct * audioPlayer.duration;
    });
  }
}

function playEpisode(episode) {
  state.activeEpisode = episode;

  // Load audio Blob URL
  if (episode.audioBlob) {
    const audioUrl = URL.createObjectURL(episode.audioBlob);
    audioPlayer.src = audioUrl;
    audioPlayer.playbackRate = playbackRates[currentRateIdx];
    audioPlayer.play().catch(e => console.warn("Autoplay blocked:", e));
  }

  // Update Player UI
  if (elements.playerTitle) elements.playerTitle.innerText = episode.theme;
  if (elements.playerCategory) elements.playerCategory.innerText = episode.category;
  if (elements.playerMeta) {
    elements.playerMeta.innerText = `Sophie & Marc • ${Math.round(episode.durationSeconds / 60)} min (${episode.age} ans)`;
  }

  // Find category icon
  const catObj = CATEGORIES.find(c => c.name.toLowerCase() === episode.category?.toLowerCase());
  if (elements.playerIcon) elements.playerIcon.innerText = catObj ? catObj.icon : "🎙️";

  // Render Dialogue
  renderScriptDialogue(episode.scriptItems);
}

function togglePlayPause() {
  if (!audioPlayer.src) return;
  if (isPlaying) {
    audioPlayer.pause();
  } else {
    audioPlayer.play();
  }
}

function updatePlayButton() {
  if (!elements.btnPlayPause) return;
  elements.btnPlayPause.innerHTML = isPlaying 
    ? `<i class="fa-solid fa-pause"></i>`
    : `<i class="fa-solid fa-play ml-0.5"></i>`;
}

function skipAudio(seconds) {
  if (!audioPlayer.duration) return;
  audioPlayer.currentTime = Math.max(0, Math.min(audioPlayer.duration, audioPlayer.currentTime + seconds));
}

function cycleSpeed() {
  currentRateIdx = (currentRateIdx + 1) % playbackRates.length;
  const rate = playbackRates[currentRateIdx];
  audioPlayer.playbackRate = rate;
  if (elements.btnSpeed) elements.btnSpeed.innerText = `${rate.toFixed(1)}x`;
}

async function shareCurrentAudio() {
  if (!state.activeEpisode || !state.activeEpisode.audioBlob) {
    alert("Aucun fichier audio à partager.");
    return;
  }
  const filename = `${state.activeEpisode.category} - ${state.activeEpisode.theme}.mp3`;
  await shareOrDownloadAudio(state.activeEpisode.audioBlob, filename);
}

function renderScriptDialogue(scriptItems) {
  if (!elements.scriptDialogueContainer) return;
  elements.scriptDialogueContainer.innerHTML = '';

  if (!scriptItems || scriptItems.length === 0) {
    elements.scriptDialogueContainer.innerHTML = `<p class="text-slate-500 text-xs italic">Aucun script disponible.</p>`;
    return;
  }

  scriptItems.forEach(item => {
    const isSophie = item.speaker === "Sophie";
    const div = document.createElement('div');
    div.className = isSophie
      ? "p-3 bg-slate-950/80 rounded-2xl border border-pink-500/20"
      : "p-3 bg-slate-950/50 rounded-2xl border border-amber-500/20";
    
    // Highlight English words or action tags
    let formattedText = item.text || "";
    formattedText = formattedText.replace(/\[American accent\]\s*'([^']+)'/gi, `<span class="bg-indigo-500/30 text-indigo-200 px-1 py-0.5 rounded font-bold border border-indigo-500/40">$1</span>`);
    formattedText = formattedText.replace(/\[(whispering|shouting|laughing|sighing|short pause)\]/gi, `<span class="text-indigo-400 font-mono text-[10px]">[$1]</span>`);

    div.innerHTML = `
      <div class="flex items-center gap-2 mb-1">
        <span class="font-bold text-xs ${isSophie ? 'text-pink-400' : 'text-amber-400'}">${item.speaker}</span>
      </div>
      <p class="text-slate-300 text-xs leading-relaxed">${formattedText}</p>
    `;
    elements.scriptDialogueContainer.appendChild(div);
  });
}

// --- Episodes Feed & History ---
async function refreshEpisodesList() {
  state.episodes = await getAllEpisodes();

  if (!elements.episodesFeed) return;
  elements.episodesFeed.innerHTML = '';

  if (state.episodes.length === 0) {
    if (elements.emptyFeed) elements.emptyFeed.classList.remove('hidden');
    return;
  }

  if (elements.emptyFeed) elements.emptyFeed.classList.add('hidden');

  state.episodes.forEach(ep => {
    const catObj = CATEGORIES.find(c => c.name.toLowerCase() === ep.category?.toLowerCase());
    const icon = catObj ? catObj.icon : "🎙️";
    const mins = Math.round((ep.durationSeconds || ep.duration * 60) / 60);

    const card = document.createElement('div');
    card.className = "bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 hover:border-slate-700 transition-all";
    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-lg">
            ${icon}
          </div>
          <div>
            <h4 class="text-sm font-bold text-white leading-tight">${ep.theme}</h4>
            <p class="text-[11px] text-slate-400">${mins} min • ${ep.age} ans • ${ep.category}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold">Prêt</span>
          <button onclick="deleteEpisodeById('${ep.id}', event)" class="text-slate-500 hover:text-rose-400 p-1 text-xs transition-colors">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div class="bg-slate-950 rounded-2xl p-2.5 flex items-center justify-between gap-3 border border-slate-800">
        <button onclick="window.playEpisodeFromFeed('${ep.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-1.5 text-xs font-semibold shadow-md">
          <i class="fa-solid fa-play text-[10px]"></i>
          <span>Écouter</span>
        </button>

        <span class="text-[10px] font-mono text-slate-400">${(ep.cost || 0).toFixed(2)}$</span>

        <button onclick="window.shareEpisodeFromFeed('${ep.id}')" class="text-slate-400 hover:text-white p-1 text-xs">
          <i class="fa-solid fa-arrow-up-from-bracket"></i>
        </button>
      </div>
    `;
    elements.episodesFeed.appendChild(card);
  });
}

window.playEpisodeFromFeed = (id) => {
  const ep = state.episodes.find(e => e.id === id);
  if (ep) {
    playEpisode(ep);
    switchScreen('player');
  }
};

window.shareEpisodeFromFeed = async (id) => {
  const ep = state.episodes.find(e => e.id === id);
  if (ep && ep.audioBlob) {
    await shareOrDownloadAudio(ep.audioBlob, `${ep.category} - ${ep.theme}.mp3`);
  }
};

async function deleteEpisodeById(id, event) {
  if (event) event.stopPropagation();
  if (confirm("Supprimer cet épisode ?")) {
    await deleteEpisode(id);
    await refreshEpisodesList();
  }
}

// --- Settings Management ---
function loadSettingsIntoUI() {
  const settings = getSettings();
  if (elements.apiKeyInput) elements.apiKeyInput.value = settings.apiKey || '';
  if (elements.kidsContextInput) elements.kidsContextInput.value = settings.kidsContext || '';
  if (elements.scriptModelSelect) elements.scriptModelSelect.value = settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL;
  if (elements.ttsModelSelect) elements.ttsModelSelect.value = settings.ttsModel || DEFAULT_TTS_MODEL;
}

function openSettings() {
  loadSettingsIntoUI();
  if (elements.settingsModal) elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  if (elements.settingsModal) elements.settingsModal.classList.add('hidden');
}

function saveSettingsFromUI() {
  const apiKey = elements.apiKeyInput?.value?.trim() || '';
  const kidsContext = elements.kidsContextInput?.value?.trim() || '';
  const scriptModel = elements.scriptModelSelect?.value || DEFAULT_TRANSCRIPT_MODEL;
  const ttsModel = elements.ttsModelSelect?.value || DEFAULT_TTS_MODEL;

  saveSettings({ apiKey, kidsContext, scriptModel, ttsModel });
  closeSettings();
  alert("Réglages enregistrés avec succès !");
}
