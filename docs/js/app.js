// Main Application Controller for Kids Podcast PWA
import { CATEGORIES, DEFAULT_TRANSCRIPT_MODEL, DEFAULT_TTS_MODEL } from './prompts.js';
import { generateScript, synthesizePodcastAudio, createTtsBatchJob, checkBatchJobStatus, fetchBatchJobResults } from './gemini.js';
import { calculateCost } from './cost.js';
import { formatTime, shareOrDownloadAudio, downloadAudioFileDirect, pcmBase64ToMp3Blob, getPcmDurationSeconds } from './audio.js';
import { 
  getSettings, 
  saveSettings, 
  saveEpisode, 
  getAllEpisodes, 
  deleteEpisode,
  saveBatchJob,
  getAllBatchJobs,
  updateBatchJob,
  deleteBatchJob
} from './storage.js';

// --- State ---
let state = {
  activeScreen: 'create',
  generationMode: 'direct', // 'direct' | 'batch'
  category: CATEGORIES[0],
  theme: '',
  batchGroups: [
    {
      id: 'bg_' + Date.now(),
      categoryId: CATEGORIES[0].id,
      topics: []
    }
  ],
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
  elements.btnGenerateText = document.getElementById('btn-generate-text');
  elements.progressCard = document.getElementById('progress-card');
  elements.progressBar = document.getElementById('progress-bar');
  elements.progressStatus = document.getElementById('progress-status');
  elements.progressSub = document.getElementById('progress-sub');
  elements.progressPct = document.getElementById('progress-pct');
  elements.progressTimer = document.getElementById('progress-timer');
  elements.episodesFeed = document.getElementById('episodes-feed');
  elements.emptyFeed = document.getElementById('empty-feed');

  // Mode Toggle & Containers
  elements.modeBtnDirect = document.getElementById('mode-btn-direct');
  elements.modeBtnBatch = document.getElementById('mode-btn-batch');
  elements.containerModeDirect = document.getElementById('container-mode-direct');
  elements.containerModeBatch = document.getElementById('container-mode-batch');
  elements.batchGroupsList = document.getElementById('batch-groups-list');
  elements.batchTotalCount = document.getElementById('batch-total-count');

  // Batches Feed
  elements.batchJobsSection = document.getElementById('batch-jobs-section');
  elements.batchBadgeCount = document.getElementById('batch-badge-count');
  elements.batchJobsFeed = document.getElementById('batch-jobs-feed');
  
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
  renderBatchGroups();
  setupAudioListeners();
  await refreshEpisodesList();
  await refreshBatchJobsUI();

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
  window.switchGenerationMode = switchGenerationMode;
  window.selectCategory = selectCategory;
  window.adjustAge = adjustAge;
  window.setDuration = setDuration;
  window.handleGenerateClick = handleGenerateClick;
  window.openSettings = openSettings;
  window.closeSettings = closeSettings;
  window.saveSettingsFromUI = saveSettingsFromUI;
  window.playEpisode = playEpisode;
  window.togglePlayPause = togglePlayPause;
  window.skipAudio = skipAudio;
  window.cycleSpeed = cycleSpeed;
  window.shareCurrentAudio = shareCurrentAudio;
  window.deleteEpisodeById = deleteEpisodeById;
  window.downloadEpisodeDirect = downloadEpisodeDirect;

  // Batch specific window bindings
  window.addBatchGroup = addBatchGroup;
  window.removeBatchGroup = removeBatchGroup;
  window.changeGroupCategory = changeGroupCategory;
  window.removeTopicPill = removeTopicPill;
  window.handleTopicInputKeyDown = handleTopicInputKeyDown;
  window.addTopicFromInput = addTopicFromInput;
  window.checkAllBatchesStatus = checkAllBatchesStatus;
  window.checkSingleBatch = checkSingleBatch;
  window.retrieveBatch = retrieveBatch;
  window.deleteBatch = deleteBatch;
});

// --- Generation Mode Toggle ---
function switchGenerationMode(mode) {
  state.generationMode = mode;
  const isDirect = mode === 'direct';

  if (elements.modeBtnDirect) {
    elements.modeBtnDirect.className = isDirect
      ? "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-md flex items-center justify-center gap-1.5"
      : "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5";
  }

  if (elements.modeBtnBatch) {
    elements.modeBtnBatch.className = !isDirect
      ? "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all bg-indigo-600 text-white shadow-md flex items-center justify-center gap-1.5"
      : "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5";
  }

  if (elements.containerModeDirect) {
    elements.containerModeDirect.classList.toggle('hidden', !isDirect);
  }
  if (elements.containerModeBatch) {
    elements.containerModeBatch.classList.toggle('hidden', isDirect);
  }

  if (elements.btnGenerateText) {
    elements.btnGenerateText.innerText = isDirect
      ? "Générer le Podcast (~2 min)"
      : "Lancer le Batch (Scripts immédiats + TTS -50%)";
  }
}

// --- Categories Rendering (Direct Mode) ---
function renderCategories() {
  if (!elements.categoriesContainer) return;
  elements.categoriesContainer.innerHTML = '';

  CATEGORIES.forEach((cat) => {
    const isSelected = cat.id === state.category.id;
    const btn = document.createElement('button');
    btn.type = 'button';
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

// --- Progressive Batch Builder (Batch Mode) ---
function renderBatchGroups() {
  if (!elements.batchGroupsList) return;
  elements.batchGroupsList.innerHTML = '';

  let totalTopics = 0;

  state.batchGroups.forEach((group, gIdx) => {
    totalTopics += group.topics.length;
    const card = document.createElement('div');
    card.className = "bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-sm";

    // Build Category Options
    const optionsHtml = CATEGORIES.map(c => `
      <option value="${c.id}" ${c.id === group.categoryId ? 'selected' : ''}>
        ${c.icon} ${c.name}
      </option>
    `).join('');

    // Build Pills Html
    const pillsHtml = group.topics.map((topic, tIdx) => `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold animate-fadeIn">
        <span>${escapeHtml(topic)}</span>
        <button type="button" onclick="removeTopicPill('${group.id}', ${tIdx})" class="text-indigo-400 hover:text-rose-400 text-[10px] font-bold transition-colors">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </span>
    `).join('');

    card.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 flex-1">
          <span class="text-[10px] font-bold text-slate-500 uppercase font-mono">Univers ${gIdx + 1}</span>
          <select 
            onchange="changeGroupCategory('${group.id}', this.value)" 
            class="bg-slate-950 border border-slate-800 text-white text-xs rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none focus:border-indigo-500">
            ${optionsHtml}
          </select>
        </div>
        ${state.batchGroups.length > 1 ? `
          <button type="button" onclick="removeBatchGroup('${group.id}')" title="Supprimer cet univers" class="text-slate-500 hover:text-rose-400 p-1 text-xs transition-colors">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        ` : ''}
      </div>

      <!-- Pills & Input Container -->
      <div class="space-y-2">
        <div class="flex flex-wrap gap-1.5 min-h-[28px] items-center">
          ${pillsHtml}
          ${group.topics.length === 0 ? `
            <span class="text-[11px] text-slate-500 italic">Aucun sujet ajouté pour cet univers</span>
          ` : ''}
        </div>

        <div class="flex items-center gap-1.5 pt-1">
          <div class="relative flex-1">
            <input 
              id="input-topic-${group.id}" 
              type="text" 
              placeholder="Ajouter un sujet... (ex: Les dunes)"
              onkeydown="handleTopicInputKeyDown(event, '${group.id}')"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button 
            type="button" 
            onclick="addTopicFromInput('${group.id}')" 
            title="Ajouter ce sujet" 
            class="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-sm">
            <i class="fa-solid fa-plus"></i>
          </button>
        </div>
        <p class="text-[10px] text-slate-500 italic">Appuyez sur Entrée ou séparez par une virgule pour ajouter plusieurs sujets.</p>
      </div>
    `;

    elements.batchGroupsList.appendChild(card);
  });

  if (elements.batchTotalCount) {
    elements.batchTotalCount.innerText = `${totalTopics} épisode${totalTopics > 1 ? 's' : ''}`;
  }
}

function addBatchGroup() {
  const unusedCat = CATEGORIES.find(c => !state.batchGroups.some(g => g.categoryId === c.id)) || CATEGORIES[0];
  state.batchGroups.push({
    id: 'bg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    categoryId: unusedCat.id,
    topics: []
  });
  renderBatchGroups();
}

function removeBatchGroup(groupId) {
  if (state.batchGroups.length <= 1) return;
  state.batchGroups = state.batchGroups.filter(g => g.id !== groupId);
  renderBatchGroups();
}

function changeGroupCategory(groupId, catId) {
  const group = state.batchGroups.find(g => g.id === groupId);
  if (group) {
    group.categoryId = catId;
  }
}

function addTopicPill(groupId, topicText) {
  const clean = topicText.trim();
  if (!clean) return;
  const group = state.batchGroups.find(g => g.id === groupId);
  if (group) {
    if (!group.topics.includes(clean)) {
      group.topics.push(clean);
    }
  }
  renderBatchGroups();
}

function removeTopicPill(groupId, topicIdx) {
  const group = state.batchGroups.find(g => g.id === groupId);
  if (group && group.topics[topicIdx] !== undefined) {
    group.topics.splice(topicIdx, 1);
  }
  renderBatchGroups();
}

function handleTopicInputKeyDown(event, groupId) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addTopicFromInput(groupId);
  }
}

function addTopicFromInput(groupId) {
  const input = document.getElementById(`input-topic-${groupId}`);
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const parts = val.split(',').map(s => s.trim()).filter(Boolean);
  parts.forEach(p => addTopicPill(groupId, p));
  input.value = '';
  input.focus();
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[m]);
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

  window.scrollTo(0, 0);
}

// --- Concurrency Helper (Max 5 concurrent promises) ---
async function pMap(items, mapper, concurrency = 5) {
  const results = new Array(items.length);
  let currentIndex = 0;

  async function worker() {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await mapper(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// --- Main Generation Dispatcher ---
async function handleGenerateClick() {
  if (state.isGenerating) return;
  if (state.generationMode === 'batch') {
    await startBatchPipeline();
  } else {
    await startDirectGeneration();
  }
}

// ================= MODE 1: DIRECT GENERATION =================
async function startDirectGeneration() {
  const theme = elements.themeInput?.value?.trim();
  if (!theme) {
    alert("Veuillez saisir un sujet pour le podcast (ex: Les requins, Le Mont Saint-Michel...)");
    elements.themeInput?.focus();
    return;
  }

  const settings = getSettings();
  if (!settings.apiKey) {
    alert("Veuillez d'abord configurer votre clé Google AI Studio dans les Réglages ⚙️.");
    openSettings();
    return;
  }

  state.isGenerating = true;
  updateGenerationUI(true, "1/2. Écriture du script avec Sophie & Marc...", "✨ Structuration pédagogique & intégration de 5 mots d'anglais...", 15);

  let wakeLock = null;
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      console.warn("WakeLock not available:", e);
    }
  }

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

    updateGenerationUI(true, "2/2. Synthèse vocale Studio en cours...", "🎙️ Enregistrement audio multi-locuteurs (~1 à 2 min)...", 50);

    // 2. Synthesize Audio
    const audioResult = await synthesizePodcastAudio({
      apiKey: settings.apiKey,
      scriptItems: scriptResult.items,
      model: settings.ttsModel || DEFAULT_TTS_MODEL
    });

    updateGenerationUI(true, "Finalisation de l'épisode...", "✨ Compression MP3 et calcul des coûts...", 95);

    // 3. Calculate Cost (Standard direct pricing)
    const costData = calculateCost({
      tokensInText: scriptResult.usage.promptTokens,
      tokensOutText: scriptResult.usage.candidatesTokens,
      textModel: settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL,
      audioDurationSeconds: audioResult.durationSeconds,
      ttsModel: settings.ttsModel || DEFAULT_TTS_MODEL,
      audioInTokens: audioResult.usage.promptTokens,
      audioOutTokens: audioResult.usage.candidatesTokens,
      isBatch: false
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

// ================= MODE 2: BATCH PIPELINE (2 PASSES) =================
async function startBatchPipeline() {
  const settings = getSettings();
  if (!settings.apiKey) {
    alert("Veuillez d'abord configurer votre clé Google AI Studio dans les Réglages ⚙️.");
    openSettings();
    return;
  }

  // Collect all topics with their category
  const allTasks = [];
  state.batchGroups.forEach(group => {
    const catObj = CATEGORIES.find(c => c.id === group.categoryId) || CATEGORIES[0];
    group.topics.forEach(t => {
      allTasks.push({
        id: 'ep_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        category: catObj.name,
        theme: t,
        age: state.age,
        duration: state.duration,
        scriptItems: [],
        scriptUsage: null,
        scriptCost: 0
      });
    });
  });

  if (allTasks.length === 0) {
    alert("Veuillez ajouter au moins un sujet dans vos univers avant de lancer le batch.");
    return;
  }

  state.isGenerating = true;

  let secondsElapsed = 0;
  if (elements.progressTimer) elements.progressTimer.innerText = "0:00";
  const timerInterval = setInterval(() => {
    secondsElapsed++;
    if (elements.progressTimer) {
      elements.progressTimer.innerText = formatTime(secondsElapsed);
    }
  }, 1000);

  try {
    // ----------------------------------------------------
    // PASSE 1 (Directe) : Génération des scripts en parallèle (Max 5 concurrents)
    // ----------------------------------------------------
    let completedScripts = 0;
    updateGenerationUI(true, "Passe 1/2. Écriture des scripts en direct...", `✨ Génération multi-threads (0/${allTasks.length} prêts)...`, 10);

    const scriptModel = settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL;

    await pMap(allTasks, async (ep) => {
      const scriptRes = await generateScript({
        apiKey: settings.apiKey,
        category: ep.category,
        theme: ep.theme,
        duration: ep.duration,
        age: ep.age,
        context: settings.kidsContext,
        model: scriptModel
      });

      ep.scriptItems = scriptRes.items;
      ep.scriptUsage = scriptRes.usage;

      completedScripts++;
      const pct = Math.round(10 + (completedScripts / allTasks.length) * 55); // 10% to 65%
      updateGenerationUI(
        true,
        `Passe 1/2. Écriture des scripts (${completedScripts}/${allTasks.length})...`,
        `✨ Dernier écrit : ${ep.theme} (${ep.category})`,
        pct
      );
      return ep;
    }, 5);

    // ----------------------------------------------------
    // PASSE 2 (Différée) : Soumission TTS groupée au Gemini Batch API (-50% coût)
    // ----------------------------------------------------
    updateGenerationUI(true, "Passe 2/2. Envoi du lot au Gemini Batch API...", `📦 Création du job asynchrone (-50% de coût)...`, 85);

    const batchRes = await createTtsBatchJob({
      apiKey: settings.apiKey,
      episodes: allTasks,
      model: settings.ttsModel || DEFAULT_TTS_MODEL
    });

    // Save batch job locally in storage
    saveBatchJob({
      id: batchRes.jobName,
      displayName: `Batch du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} (${allTasks.length} épisodes)`,
      createdAt: Date.now(),
      state: "JOB_STATE_PENDING",
      episodes: allTasks
    });

    clearInterval(timerInterval);
    updateGenerationUI(false);

    // Reset batch builder form
    state.batchGroups = [{ id: 'bg_' + Date.now(), categoryId: CATEGORIES[0].id, topics: [] }];
    renderBatchGroups();

    await refreshBatchJobsUI();

    alert(`✅ Batch de ${allTasks.length} épisodes envoyé avec succès à Google !\n\nVous pouvez fermer votre ordinateur ou éteindre votre téléphone.\nLe traitement s'effectue en arrière-plan chez Google à tarif réduit (-50%).\n\nConsultez l'avancement dans la section « Batches en cours ».`);

  } catch (error) {
    clearInterval(timerInterval);
    console.error("Erreur Batch Pipeline:", error);
    alert(`Erreur lors du lancement du batch : ${error.message}`);
    updateGenerationUI(false);
  } finally {
    clearInterval(timerInterval);
    state.isGenerating = false;
  }
}

// --- Batches Feed & Polling ---
async function refreshBatchJobsUI() {
  const jobs = getAllBatchJobs();

  if (!elements.batchJobsSection || !elements.batchJobsFeed) return;

  if (jobs.length === 0) {
    elements.batchJobsSection.classList.add('hidden');
    return;
  }

  elements.batchJobsSection.classList.remove('hidden');
  if (elements.batchBadgeCount) elements.batchBadgeCount.innerText = jobs.length;
  elements.batchJobsFeed.innerHTML = '';

  jobs.forEach(job => {
    const card = document.createElement('div');
    card.className = "bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-md";

    const isDone = job.state === "JOB_STATE_SUCCEEDED";
    const isFailed = job.state === "JOB_STATE_FAILED" || job.state === "JOB_STATE_CANCELLED";

    const topicsSummary = job.episodes.map(e => e.theme).join(', ');

    let badgeHtml = '';
    if (isDone) {
      badgeHtml = `<span class="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-[10px] font-bold">Prêt</span>`;
    } else if (isFailed) {
      badgeHtml = `<span class="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full text-[10px] font-bold">Échec</span>`;
    } else {
      badgeHtml = `<span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-[10px] font-bold animate-pulse">En cours chez Google...</span>`;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-bold text-white">${job.displayName}</h4>
            ${badgeHtml}
          </div>
          <p class="text-[11px] text-slate-400 truncate max-w-[260px] mt-0.5" title="${escapeHtml(topicsSummary)}">
            ${escapeHtml(topicsSummary)}
          </p>
        </div>
        <button onclick="window.deleteBatch('${job.id}')" title="Supprimer ce batch" class="text-slate-500 hover:text-rose-400 p-1 text-xs transition-colors">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>

      <div class="bg-slate-950 rounded-2xl p-2.5 flex items-center justify-between gap-3 border border-slate-800">
        ${isDone ? `
          <button onclick="window.retrieveBatch('${job.id}')" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl flex items-center gap-1.5 text-xs font-bold shadow-md transition-all">
            <i class="fa-solid fa-cloud-arrow-down"></i>
            <span>Récupérer & Sauvegarder (${job.episodes.length} MP3)</span>
          </button>
        ` : `
          <button onclick="window.checkSingleBatch('${job.id}')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-all">
            <i class="fa-solid fa-arrows-rotate text-[10px]"></i>
            <span>Vérifier le statut</span>
          </button>
        `}
        <span class="text-[10px] font-mono text-slate-500">${job.id.replace('batches/', '')}</span>
      </div>
    `;

    elements.batchJobsFeed.appendChild(card);
  });
}

async function checkAllBatchesStatus(manual = false) {
  const jobs = getAllBatchJobs();
  const settings = getSettings();
  if (!settings.apiKey || jobs.length === 0) return;

  let updatedCount = 0;
  for (const job of jobs) {
    if (job.state !== "JOB_STATE_SUCCEEDED") {
      try {
        const res = await checkBatchJobStatus({ apiKey: settings.apiKey, jobName: job.id });
        if (res.state !== job.state) {
          updateBatchJob(job.id, { state: res.state, raw: res.raw });
          updatedCount++;
        }
      } catch (e) {
        console.warn(`Erreur lors de la vérification du batch ${job.id}:`, e);
      }
    }
  }

  await refreshBatchJobsUI();
  if (manual) {
    alert(updatedCount > 0 ? "Statuts des batches mis à jour !" : "Tous les statuts sont à jour.");
  }
}

async function checkSingleBatch(jobId) {
  const settings = getSettings();
  if (!settings.apiKey) {
    alert("Clé API manquante dans les Réglages.");
    return;
  }
  try {
    const res = await checkBatchJobStatus({ apiKey: settings.apiKey, jobName: jobId });
    updateBatchJob(jobId, { state: res.state, raw: res.raw });
    await refreshBatchJobsUI();

    if (res.state === "JOB_STATE_SUCCEEDED") {
      alert("🎉 Le batch est terminé et prêt à être récupéré !");
    } else {
      alert(`Statut actuel du batch : ${res.state.replace('JOB_STATE_', '')}`);
    }
  } catch (e) {
    alert(`Erreur de vérification : ${e.message}`);
  }
}

async function retrieveBatch(jobId) {
  const settings = getSettings();
  const jobs = getAllBatchJobs();
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  try {
    const checkRes = await checkBatchJobStatus({ apiKey: settings.apiKey, jobName: jobId });
    if (checkRes.state !== "JOB_STATE_SUCCEEDED") {
      alert(`Ce batch n'est pas encore terminé (${checkRes.state}).`);
      return;
    }

    const results = await fetchBatchJobResults({ apiKey: settings.apiKey, batchData: checkRes.raw });
    let savedCount = 0;

    for (let i = 0; i < job.episodes.length; i++) {
      const ep = job.episodes[i];
      const res = results.find(r => r.episodeId === ep.id) || results[i];

      if (res && res.audioBase64) {
        const mp3Blob = pcmBase64ToMp3Blob(res.audioBase64, 24000, 128);
        const binaryString = window.atob(res.audioBase64);
        const durationSeconds = getPcmDurationSeconds(binaryString.length, 24000, 1, 16);

        const costData = calculateCost({
          tokensInText: ep.scriptUsage?.promptTokens || 0,
          tokensOutText: ep.scriptUsage?.candidatesTokens || 0,
          textModel: settings.scriptModel || DEFAULT_TRANSCRIPT_MODEL,
          audioDurationSeconds: durationSeconds,
          ttsModel: settings.ttsModel || DEFAULT_TTS_MODEL,
          audioInTokens: res.usage?.promptTokens,
          audioOutTokens: res.usage?.candidatesTokens,
          isBatch: true
        });

        await saveEpisode({
          category: ep.category,
          theme: ep.theme,
          age: ep.age,
          duration: ep.duration,
          scriptItems: ep.scriptItems || [],
          audioBlob: mp3Blob,
          durationSeconds,
          cost: costData.totalCost,
          scriptCost: costData.scriptCost,
          audioCost: costData.audioCost,
          status: "Prêt"
        });

        savedCount++;
      }
    }

    deleteBatchJob(jobId);
    await refreshBatchJobsUI();
    await refreshEpisodesList();

    alert(`✨ ${savedCount} épisode${savedCount > 1 ? 's ont' : ' a'} été récupéré${savedCount > 1 ? 's' : ''}, converti${savedCount > 1 ? 's' : ''} en MP3 et ajouté${savedCount > 1 ? 's' : ''} à votre bibliothèque !`);

  } catch (e) {
    console.error("Erreur récupération batch:", e);
    alert(`Erreur lors de la récupération du batch : ${e.message}`);
  }
}

function deleteBatch(jobId) {
  if (confirm("Supprimer ce batch de la liste ?")) {
    deleteBatchJob(jobId);
    refreshBatchJobsUI();
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

  if (episode.audioBlob) {
    const audioUrl = URL.createObjectURL(episode.audioBlob);
    audioPlayer.src = audioUrl;
    audioPlayer.playbackRate = playbackRates[currentRateIdx];
    audioPlayer.play().catch(e => console.warn("Autoplay blocked:", e));
  }

  if (elements.playerTitle) elements.playerTitle.innerText = episode.theme;
  if (elements.playerCategory) elements.playerCategory.innerText = episode.category;
  if (elements.playerMeta) {
    elements.playerMeta.innerText = `Sophie & Marc • ${Math.round(episode.durationSeconds / 60)} min (${episode.age} ans)`;
  }

  const catObj = CATEGORIES.find(c => c.name.toLowerCase() === episode.category?.toLowerCase());
  if (elements.playerIcon) elements.playerIcon.innerText = catObj ? catObj.icon : "🎙️";

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
          <button onclick="deleteEpisodeById('${ep.id}', event)" title="Supprimer cet épisode" class="text-slate-500 hover:text-rose-400 p-1 text-xs transition-colors">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>

      <div class="bg-slate-950 rounded-2xl p-2.5 flex items-center justify-between gap-2 border border-slate-800">
        <button onclick="window.playEpisodeFromFeed('${ep.id}')" class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-1.5 text-xs font-semibold shadow-md">
          <i class="fa-solid fa-play text-[10px]"></i>
          <span>Écouter</span>
        </button>

        <span class="text-[10px] font-mono text-slate-400">${(ep.cost || 0).toFixed(2)}$</span>

        <div class="flex items-center gap-1">
          <!-- Direct download MP3 button for Mac / Yoto / Deezer -->
          <button onclick="window.downloadEpisodeDirect('${ep.id}')" title="Télécharger le MP3 (pour Yoto / Deezer)" class="p-1.5 text-slate-400 hover:text-indigo-300 rounded-lg hover:bg-slate-900 text-xs transition-colors">
            <i class="fa-solid fa-download"></i>
          </button>

          <!-- Native mobile share button -->
          <button onclick="window.shareEpisodeFromFeed('${ep.id}')" title="Partager (WhatsApp, AirDrop, Fichiers...)" class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-900 text-xs transition-colors">
            <i class="fa-solid fa-arrow-up-from-bracket"></i>
          </button>
        </div>
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

window.downloadEpisodeDirect = (id) => {
  const ep = state.episodes.find(e => e.id === id);
  if (ep && ep.audioBlob) {
    const filename = `${ep.category} - ${ep.theme}.mp3`;
    downloadAudioFileDirect(ep.audioBlob, filename);
  } else {
    alert("Fichier audio non disponible.");
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
