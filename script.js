// script.js with toast notification, flip animation, and multi-mode support

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH_MS = Date.UTC(2025, 0, 1);

function getDailyIndex() {
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((todayUTC - EPOCH_MS) / MS_PER_DAY);
}


const GAME_STATE_KEY_BASE = 'fww_gamestate';
const STATS_KEY_BASE = 'fww_stats';

// Settings & State
let isInitializing = false;
let isGameLoading = false;
let isSyncing = false;
const settings = {
  theme: localStorage.getItem('fww_theme') || 'dark', // 'light' or 'dark'
  colorblind: localStorage.getItem('fww_colorblind') === 'true',
  sound: localStorage.getItem('fww_sound') !== 'false',
  music: localStorage.getItem('fww_music') === 'true', // Default to OFF to be polite
  haptic: localStorage.getItem('fww_haptic') !== 'false'
};

const SoundEngine = {
  ctx: null,
  ambienceGain: null,
  ambienceNodes: [],
  harmonyNodes: [],
  tensionNodes: [],
  isPlayingAmbience: false,

  init() {
    if (this.ctx && this.ctx.state !== 'closed') {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('AudioContext not supported');
    }
  },

  // ---- SFX ----
  playThump() {
    if (!settings.sound || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  },
  playDing() {
    if (!settings.sound || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  },
  playWin() {
    if (!settings.sound || !this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.08, now + i * 0.12 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.5);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.5);
    });
  },

  // ---- Ambience ----
  startAmbience() {
    if (!settings.music || !this.ctx) return;
    if (this.isPlayingAmbience) return;
    this.isPlayingAmbience = true;
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    this.ambienceGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 3);
    this.ambienceGain.connect(this.ctx.destination);
    this.addDrone(130.81, 'sine', 0.5);
    this.addDrone(196.00, 'sine', 0.3);
  },
  stopAmbience() {
    if (!this.isPlayingAmbience || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    if (this.ambienceGain.gain.cancelScheduledValues) this.ambienceGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, now);
    this.ambienceGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    setTimeout(() => {
      this.ambienceNodes.forEach(n => { try { n.stop(); } catch (e) { } });
      this.harmonyNodes.forEach(n => { try { n.osc.stop(); } catch (e) { } });
      if (this.tensionNode) { try { this.tensionNode.stop(); } catch (e) { } }
      this.ambienceNodes = [];
      this.harmonyNodes = [];
      this.tensionNode = null;
      this.isPlayingAmbience = false;
    }, 1600);
  },
  addDrone(freq, type, vol) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    this.ambienceNodes.push(osc);
  },
  updateAmbience(greenCount, rowCount) {
    if (!this.isPlayingAmbience) return;
    const freqs = [261.63, 329.63, 392.00, 493.88, 523.25];
    while (this.harmonyNodes.length < greenCount && this.harmonyNodes.length < freqs.length) {
      this.addHarmonyLayer(freqs[this.harmonyNodes.length]);
    }
    if (rowCount >= 5 && greenCount < 2 && !this.tensionNode) {
      this.addTensionLayer(185.00);
    }
  },
  addHarmonyLayer(freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, this.ctx.currentTime + 4);
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    this.harmonyNodes.push({ osc, gain });
  },
  addTensionLayer(freq) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.03, this.ctx.currentTime + 5);
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    osc.start();
    this.tensionNode = osc;
  },

  resetAmbience() {
    if (!this.isPlayingAmbience) return;
    this.stopAmbience();
    setTimeout(() => { if (settings.music) this.startAmbience(); }, 1700);
  }
};

const HapticEngine = {
  vibrate(pattern) {
    if (settings.haptic && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }
};

const VoiceInputManager = {
  recognition: null,
  isListening: false,
  commands: {
    'enter': 'ENTER', 'submit': 'ENTER', 'go': 'ENTER',
    'delete': 'BACKSPACE', 'backspace': 'BACKSPACE', 'back': 'BACKSPACE', 'erase': 'BACKSPACE',
    'clear': 'CLEAR', 'reset': 'CLEAR',
    'alpha': 'A', 'apple': 'A',
    'bravo': 'B', 'boy': 'B', 'ball': 'B',
    'charlie': 'C', 'cat': 'C',
    'delta': 'D', 'dog': 'D',
    'echo': 'E', 'elephant': 'E',
    'foxtrot': 'F', 'fish': 'F',
    'golf': 'G', 'girl': 'G',
    'hotel': 'H', 'house': 'H',
    'india': 'I', 'ice': 'I',
    'juliett': 'J', 'juliet': 'J', 'jam': 'J',
    'kilo': 'K', 'kite': 'K',
    'lima': 'L', 'lion': 'L',
    'mike': 'M', 'man': 'M', 'mom': 'M',
    'november': 'N', 'no': 'N',
    'oscar': 'O', 'orange': 'O',
    'papa': 'P', 'paul': 'P',
    'quebec': 'Q', 'queen': 'Q',
    'romeo': 'R', 'rat': 'R',
    'sierra': 'S', 'sun': 'S', 'snake': 'S',
    'tango': 'T', 'tomcat': 'T',
    'uniform': 'U', 'umbrella': 'U',
    'victor': 'V', 'van': 'V',
    'whiskey': 'W', 'water': 'W',
    'x-ray': 'X', 'xray': 'X', 'xylophone': 'X',
    'yankee': 'Y', 'yellow': 'Y', 'yes': 'Y',
    'zulu': 'Z', 'zebra': 'Z'
  },

  init() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      const btn = document.getElementById('mic-btn');
      if (btn) btn.style.display = 'none';
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.recognition = new SpeechRecognition();
    // Detect iOS to disable continuous mode (it is buggy on Safari)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.recognition.continuous = !isIOS;
    this.recognition.interimResults = false;
    this.recognition.lang = 'en-US';

    this.recognition.onstart = () => {
      this.isListening = true;
      this.updateUI(true);
      showToast("Listening...");
    };

    this.recognition.onend = () => {
      // Auto-restart if we didn't explicitly stop? 
      // For now, let's just update UI. Browsers might stop it automatically after silence.
      this.isListening = false;
      this.updateUI(false);
    };

    this.recognition.onresult = (event) => {
      // In continuous mode, iterate through new results
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          const transcript = event.results[i][0].transcript.toLowerCase().trim();
          console.log("Voice input:", transcript);
          this.processCommand(transcript);
        }
      }
    };

    this.recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed') {
        showToast("Mic permission denied");
      }
      this.isListening = false;
      this.updateUI(false);
    };

    // Attach listener
    const btn = document.getElementById('mic-btn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        // Prevent focus loss from keyboard interaction issues
        e.preventDefault();
        this.toggle();
      });
    }
  },

  toggle() {
    if (this.isListening) {
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.warn("Speech start failed", e);
      }
    }
  },

  updateUI(listening) {
    const btn = document.getElementById('mic-btn');
    if (btn) {
      if (listening) {
        btn.classList.add('listening');
        btn.textContent = '🛑';
        btn.style.backgroundColor = '#ef4444'; // Red
      } else {
        btn.classList.remove('listening');
        btn.textContent = '🎙️';
        btn.style.backgroundColor = ''; // Reset
      }
    }
  },

  processCommand(rawText) {
    // Sanitize: remove periods, commas, extra spaces
    const cleanText = rawText.replace(/[^a-z0-9\s]/g, '').trim();
    console.log(`Processing clean voice input: "${cleanText}"`);
    showToast(`Heard: "${cleanText}"`); // Debug feedback

    // 1. Direct letter match (single char)
    if (cleanText.length === 1 && /[a-z]/.test(cleanText)) {
      handleKey(cleanText.toUpperCase());
      return;
    }

    // 2. Command or Dictionary match
    if (this.commands[cleanText]) {
      const cmd = this.commands[cleanText];
      showToast(`Action: ${cmd}`); // Debug feedback
      if (cmd === 'CLEAR') {
        while (currentCol > 0) {
          handleKey('BACKSPACE');
        }
      } else {
        handleKey(cmd);
      }
      return;
    }

    // 3. Fallback: Check if user said a sequence of letters "A B C"
    const noSpaces = cleanText.replace(/\s+/g, '');
    if (noSpaces.length <= 6 && /^[a-z]+$/.test(noSpaces)) {
      for (let char of noSpaces) {
        handleKey(char.toUpperCase());
      }
      return;
    }

    showToast(`Ignored: "${cleanText}"`);
  }
};

// --- Firebase Auth & Sync Manager ---
const AuthManager = {
  db: null,
  auth: null,
  user: null,
  isInitialized: false,

  init() {
    if (typeof firebase === 'undefined') {
      console.warn("Firebase scripts not loaded or blocked.");
      return;
    }
    try {
      firebase.initializeApp(window.firebaseConfig);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      this.isInitialized = true;
      this.listen();
    } catch (e) {
      console.error("Firebase init failed:", e);
    }
  },

  listen() {
    this.auth.onAuthStateChanged(async (user) => {
      const loggedInNow = !this.user && user;
      this.user = user;
      this.updateUI();
      if (user) {
        if (isSyncing) return;
        isSyncing = true;
        const changed = await this.syncFromCloud();
        // If we just logged in, or if something changed in the background, reload
        if (loggedInNow || changed) {
          await startGame(activeDayIndex, true);
        }
        isSyncing = false;
      }
    });
  },

  async syncFromCloud() {
    if (!this.user) return false;
    let anyChanged = false;
    try {
      // Sync Stats
      for (let m of [4, 5, 6]) {
        const doc = await this.db.collection('users').doc(this.user.uid).collection('stats').doc(`mode_${m}`).get();
        const localStats = getStatsForMode(m);

        if (doc.exists) {
          const cloudStats = doc.data();
          if (localStats.played > cloudStats.played) {
            await this.syncStatsToCloud(m, localStats);
          }
          else if (cloudStats.played > localStats.played) {
            localStorage.setItem(`${STATS_KEY_BASE}_${m}`, JSON.stringify(cloudStats));
            anyChanged = true;
          }
        } else if (localStats.played > 0) {
          await this.syncStatsToCloud(m, localStats);
        }
      }

      // Sync Current Game State (Bidirectional today's progress for ALL modes)
      for (let m of [4, 5, 6]) {
        const key = getGameStateKey(activeDayIndex, m);
        const cloudState = await this.fetchGameStateFromCloud(activeDayIndex, m);
        const localStateStr = localStorage.getItem(key);
        let localState = null;
        try { localState = localStateStr ? JSON.parse(localStateStr) : null; } catch (e) { }

        if (cloudState) {
          const cloudIsAhead = !localState ||
            (cloudState.guesses.length > localState.guesses.length) ||
            (cloudState.gameStatus !== 'IN_PROGRESS' && (!localState || localState.gameStatus === 'IN_PROGRESS'));

          if (cloudIsAhead) {
            console.log(`Cloud state is ahead for mode ${m}. Updating local storage.`);
            localStorage.setItem(key, JSON.stringify(cloudState));
            anyChanged = true;
          } else if (localState && localState.guesses.length > cloudState.guesses.length) {
            console.log(`Local state is ahead for mode ${m}. Updating cloud.`);
            await this.syncGameStateToCloudCustom(localState, m);
          }
        } else if (localState && (localState.guesses.length > 0 || localState.gameStatus !== 'IN_PROGRESS')) {
          console.log(`Pushing local state for mode ${m} to cloud (was missing).`);
          await this.syncGameStateToCloudCustom(localState, m);
        }
      }

      // Reload current display
      if (document.getElementById('stats-modal').classList.contains('open')) {
        showStatsModal(currentWordLength);
      }
      return anyChanged;
    } catch (e) {
      console.error("Cloud sync failed:", e);
      return false;
    }
  },

  async syncStatsToCloud(mode, stats) {
    if (!this.user || !this.isInitialized) return;
    try {
      await this.db.collection('users').doc(this.user.uid).collection('stats').doc(`mode_${mode}`).set(stats);
    } catch (e) {
      console.error("Cloud stats save failed:", e);
    }
  },

  async syncGameStateToCloud(state) {
    await this.syncGameStateToCloudCustom(state, currentWordLength);
  },

  async syncGameStateToCloudCustom(state, mode) {
    if (!this.user || !this.isInitialized) return;
    try {
      const key = `state_${state.dayIndex}_m${mode}`;
      await this.db.collection('users').doc(this.user.uid).collection('games').doc(key).set(state);
    } catch (e) {
      console.error("Cloud state save failed:", e);
    }
  },

  async fetchGameStateFromCloud(dayIndex, mode) {
    if (!this.user || !this.isInitialized) return null;
    try {
      const key = `state_${dayIndex}_m${mode}`;
      const doc = await this.db.collection('users').doc(this.user.uid).collection('games').doc(key).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.error("Cloud state fetch failed:", e);
      return null;
    }
  },

  updateUI() {
    const authBtn = document.getElementById('auth-btn');
    const signedOutView = document.getElementById('auth-signed-out');
    const signedInView = document.getElementById('auth-signed-in');
    const emailDisplay = document.getElementById('user-email-display');

    if (this.user) {
      authBtn.textContent = '👤'; // Could change to avatar or initials
      signedOutView.style.display = 'none';
      signedInView.style.display = 'block';
      emailDisplay.textContent = this.user.email || 'Anonymous User';
    } else {
      authBtn.textContent = '👤';
      signedOutView.style.display = 'block';
      signedInView.style.display = 'none';
    }
  },

  async login(email, password) {
    try {
      await this.auth.signInWithEmailAndPassword(email, password);
      showToast("Logged in successfully!");
    } catch (e) {
      showToast(e.message);
    }
  },

  async signup(email, password) {
    try {
      await this.auth.createUserWithEmailAndPassword(email, password);
      showToast("Account created!");
    } catch (e) {
      showToast(e.message);
    }
  },

  async googleLogin() {
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      // Force account selection
      provider.setCustomParameters({
        prompt: 'select_account'
      });
      await this.auth.signInWithPopup(provider);
      showToast("Google log in successful!");
      document.getElementById('auth-modal').classList.remove('open');
    } catch (e) {
      showToast(e.message);
    }
  },

  logout() {
    this.auth.signOut();
    showToast("Signed out.");
  }
};
AuthManager.init();


const WORDS_DATA = {
  4: { hashes: new Set(), solutions: [] },
  5: { hashes: new Set(), solutions: [] },
  6: { hashes: new Set(), solutions: [] }
};
let WORDS_HASHES = new Set(); // Active hash set for validation
let WORDS_SOLUTIONS = []; // Active solution list
let solution = '';

function hash32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function deobfuscate(buffer) {
  const xorKey = 0x55;
  const decoded = new Uint8Array(buffer).map(b => b ^ xorKey);
  return new TextDecoder().decode(decoded).split(',').filter(Boolean);
}

// Hidden reset variables
let logoTapCount = 0;
let logoTapTimer = null;

// Load secure binary word data for a specific mode
async function loadSecureWords(mode) {
  if (WORDS_DATA[mode].solutions.length > 0) {
    WORDS_HASHES = WORDS_DATA[mode].hashes;
    WORDS_SOLUTIONS = WORDS_DATA[mode].solutions;
    return;
  }
  try {
    const [dictRes, solRes] = await Promise.all([
      fetch(`dict${mode}.bin`),
      fetch(`sol${mode}.dat`)
    ]);

    const dictBuf = await dictRes.arrayBuffer();
    const solBuf = await solRes.arrayBuffer();

    // Load hashes into a Set for O(1) secure validation
    const u32 = new Uint32Array(dictBuf);
    WORDS_DATA[mode].hashes = new Set(u32);

    // Deobfuscate solutions
    WORDS_DATA[mode].solutions = deobfuscate(solBuf);

    WORDS_HASHES = WORDS_DATA[mode].hashes;
    WORDS_SOLUTIONS = WORDS_DATA[mode].solutions;
  } catch (err) {
    console.error(`Failed to load secure words for mode ${mode}:`, err);
  }
}

let currentWordLength = 5;
let activeDayIndex = getDailyIndex();
let currentRow = 0, currentCol = 0;
let gameStatus = 'IN_PROGRESS'; // 'IN_PROGRESS', 'WON', 'LOST'
let isSubmitting = false; // Guard for animations
let hintsUsed = false;
const rows = [];

// Initialize
(async function init() {
  // Start with default or saved mode
  const savedMode = localStorage.getItem('fww_last_mode');
  if (savedMode && ['4', '5', '6'].includes(savedMode)) {
    currentWordLength = parseInt(savedMode);
  }

  // Initialize mode buttons
  setupModeButtons();
  initHolidays();
  setupSettings();
  updateDynamicBackground();

  // Update UI to reflect saved mode initial state
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.mode) === currentWordLength);
  });

  // Load only the current required words
  await loadSecureWords(currentWordLength);

  // Initialize Voice
  VoiceInputManager.init();

  await startGame();

  // Sync when tab is focused
  window.addEventListener('focus', async () => {
    if (AuthManager.user && !isSyncing) {
      isSyncing = true;
      const changed = await AuthManager.syncFromCloud();
      if (changed) {
        await startGame(activeDayIndex, true);
      }
      isSyncing = false;
    }
  });
})();

function getStatsKey() {
  return `${STATS_KEY_BASE}_${currentWordLength}`;
}

function getGameStateKey(dayIdx = activeDayIndex, wordLen = currentWordLength) {
  // Use a day-specific key to support Archive
  return `${GAME_STATE_KEY_BASE}_${wordLen}_d${dayIdx}`;
}

function setupModeButtons() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = parseInt(btn.dataset.mode);
      if (mode !== currentWordLength) {
        switchMode(mode);
      }
    });
  });
}

async function switchMode(mode) {
  currentWordLength = mode;
  localStorage.setItem('fww_last_mode', mode);

  // Update UI
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.mode) === mode);
  });

  // Ensure words for new mode are loaded
  await loadSecureWords(mode);

  // Restart game - persist the currently selected day
  await startGame(activeDayIndex);
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

// Settings UI & Modal Logic
function setupSettings() {
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const closeBtn = settingsModal.querySelector('.close-btn');

  const themeBtn = document.getElementById('theme-btn');
  const colorblindToggle = document.getElementById('colorblind-toggle');
  const soundToggle = document.getElementById('sound-toggle');
  const hapticToggle = document.getElementById('haptic-toggle');

  // Load initial states
  if (settings.theme === 'dark') {
    document.body.classList.add('dark-mode');
    themeBtn.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    themeBtn.textContent = '🌙';
  }

  if (settings.colorblind) {
    document.body.classList.add('colorblind-mode');
    colorblindToggle.checked = true;
  }

  soundToggle.checked = settings.sound;
  hapticToggle.checked = settings.haptic;

  // Listeners
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('open');
    SoundEngine.init(); // Essential to unlock audio on user gesture
  });

  closeBtn.addEventListener('click', () => settingsModal.classList.remove('open'));
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.classList.remove('open'); });

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
    settings.theme = isDark ? 'dark' : 'light';
    localStorage.setItem('fww_theme', settings.theme);
    updateDynamicBackground();
    HapticEngine.vibrate(20);
    SoundEngine.playThump();
  });

  colorblindToggle.addEventListener('change', () => {
    settings.colorblind = colorblindToggle.checked;
    document.body.classList.toggle('colorblind-mode', settings.colorblind);
    localStorage.setItem('fww_colorblind', settings.colorblind);
    HapticEngine.vibrate(20);
  });

  soundToggle.addEventListener('change', () => {
    settings.sound = soundToggle.checked;
    localStorage.setItem('fww_sound', settings.sound);
    if (settings.sound) {
      SoundEngine.init();
      SoundEngine.playDing();
    }
  });

  // Music Toggle
  const musicToggle = document.getElementById('music-toggle');
  if (musicToggle) {
    musicToggle.checked = settings.music;
    musicToggle.addEventListener('change', () => {
      settings.music = musicToggle.checked;
      localStorage.setItem('fww_music', settings.music);
      if (settings.music) {
        SoundEngine.init();
        SoundEngine.startAmbience();
      } else {
        SoundEngine.stopAmbience();
      }
    });
  }

  hapticToggle.addEventListener('change', () => {
    settings.haptic = hapticToggle.checked;
    localStorage.setItem('fww_haptic', settings.haptic);
    HapticEngine.vibrate(50);
  });
}

// Hint System
function useHint() {
  if (gameStatus !== 'IN_PROGRESS' || isSubmitting || hintsUsed) return;

  const hintBtn = document.getElementById('hint-btn');

  // Find a position that isn't solved in any previous row
  let hintPos = -1;
  const solvedIndices = new Set();

  // Check rows already played
  for (let r = 0; r < currentRow; r++) {
    rows[r].forEach((tile, i) => {
      if (tile.classList.contains('correct')) solvedIndices.add(i);
    });
  }

  // Find first unsolved index
  for (let i = 0; i < currentWordLength; i++) {
    if (!solvedIndices.has(i)) {
      hintPos = i;
      break;
    }
  }

  if (hintPos === -1) {
    showToast("You've already solved all letters!");
    return;
  }

  hintsUsed = true;
  if (hintBtn) hintBtn.classList.add('disabled');

  const letter = solution[hintPos];
  showToast(`Hint: The letter at pos ${hintPos + 1} is ${letter}`);

  // Auto-fill in current row
  const tile = rows[currentRow][hintPos];
  tile.textContent = letter;
  tile.classList.add('hinted', 'correct');
  updateKeyboard(letter, 'correct');

  HapticEngine.vibrate(50);
  SoundEngine.playDing();

  // After hint is placed, sync cursor if it lands on the hint
  if (currentCol === hintPos) {
    currentCol++;
    // If we land on another hint (unlikely but safe), skip it
    while (currentCol < currentWordLength && rows[currentRow][currentCol].classList.contains('hinted')) {
      currentCol++;
    }
  }

  saveGame();
}

// Archive Logic
function openArchive() {
  const modal = document.getElementById('archive-modal');
  const list = document.getElementById('archive-list');
  list.innerHTML = '';

  const today = getDailyIndex();
  // Show last 14 days
  for (let i = 0; i < 14; i++) {
    const day = today - i;
    const date = new Date(EPOCH_MS + day * MS_PER_DAY);
    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

    const isCurrentDay = (day === activeDayIndex);

    let modesHTML = '';
    [4, 5, 6].forEach(m => {
      const stateKey = getGameStateKey(day, m);
      const savedState = localStorage.getItem(stateKey);
      let statusClass = 'not-played';
      if (savedState) {
        try {
          const state = JSON.parse(savedState);
          if (state.gameStatus === 'WON') statusClass = 'correct';
          else if (state.gameStatus === 'LOST') statusClass = 'absent';
          else statusClass = 'present';
        } catch (e) { }
      }

      // Highlight if this specific mode/day is active
      const isActive = (isCurrentDay && m === currentWordLength);
      modesHTML += `<div class="archive-tile ${statusClass} ${isActive ? 'active' : ''}" data-day="${day}" data-mode="${m}">${m}</div>`;
    });

    const item = document.createElement('div');
    item.className = `archive-item ${isCurrentDay ? 'active-row' : ''}`;
    item.innerHTML = `
      <div class="archive-date-info">
        <div class="archive-date">${dateStr}${day === today ? ' (Today)' : ''}</div>
        ${isCurrentDay ? '<div class="active-label">CURRENT PUZZLE</div>' : ''}
      </div>
      <div class="archive-modes">
        ${modesHTML}
      </div>
    `;

    // Add listeners to tiles
    item.querySelectorAll('.archive-tile').forEach(tile => {
      tile.addEventListener('click', async () => {
        const targetDay = parseInt(tile.dataset.day);
        const targetMode = parseInt(tile.dataset.mode);

        if (targetMode !== currentWordLength) {
          await switchMode(targetMode);
        }
        await startGame(targetDay);
        modal.classList.remove('open');
      });
    });

    list.appendChild(item);
  }

  // Handle outside click and close button FOR ONE TIME setup or here
  const closeBtn = modal.querySelector('.close-btn');
  closeBtn.onclick = () => modal.classList.remove('open');
  modal.onclick = (e) => { if (e.target === modal) modal.classList.remove('open'); };

  modal.classList.add('open');
}

function getStats() {
  const defaultStats = {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    guesses: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 }
  };
  try {
    const s = localStorage.getItem(getStatsKey());
    return s ? { ...defaultStats, ...JSON.parse(s) } : defaultStats;
  } catch {
  }
}

function getStatsForMode(mode) {
  const defaultStats = {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    guesses: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 }
  };
  try {
    const s = localStorage.getItem(`${STATS_KEY_BASE}_${mode}`);
    return s ? { ...defaultStats, ...JSON.parse(s) } : defaultStats;
  } catch {
    return defaultStats;
  }
}

function saveStats(stats) {
  localStorage.setItem(getStatsKey(), JSON.stringify(stats));
  AuthManager.syncStatsToCloud(currentWordLength, stats);
}

function updateStats(won, guessCount) {
  const stats = getStats();
  stats.played++;
  if (won) {
    stats.won++;
    stats.currentStreak++;
    if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
    stats.guesses[guessCount]++;
  } else {
    stats.currentStreak = 0;
    stats.guesses.fail++;
  }
  saveStats(stats);
}

function showStatsModal(mode = currentWordLength) {
  const stats = getStatsForMode(mode);

  // Update Stats Toggle UI
  document.querySelectorAll('.stats-mode-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.mode) === mode);
  });

  document.getElementById('stat-played').textContent = stats.played;
  const winPct = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
  document.getElementById('stat-win').textContent = winPct;
  document.getElementById('stat-streak').textContent = stats.currentStreak;
  document.getElementById('stat-max').textContent = stats.maxStreak;

  const graph = document.getElementById('guess-graph');
  graph.innerHTML = '';

  const maxVal = Math.max(...Object.values(stats.guesses).filter(v => typeof v === 'number'));

  // Rows 1-6
  for (let i = 1; i <= 6; i++) {
    const count = stats.guesses[i] || 0;
    const widthPct = maxVal > 0 ? Math.max(7, (count / maxVal) * 100) : 7; // Min width 7%

    const row = document.createElement('div');
    row.className = 'graph-row';

    const label = document.createElement('div');
    label.className = 'graph-idx';
    label.textContent = i;

    const barCont = document.createElement('div');
    barCont.className = 'graph-bar-container';

    const bar = document.createElement('div');
    bar.className = 'graph-bar';
    // Highlight if looking at current mode and just won
    if (mode === currentWordLength && gameStatus === 'WON' && currentRow + 1 === i) {
      bar.classList.add('highlight');
    }
    bar.style.width = `${widthPct}%`;
    bar.textContent = count;
    if (count > 0) bar.style.paddingLeft = '5px';

    barCont.appendChild(bar);
    row.appendChild(label);
    row.appendChild(barCont);
    graph.appendChild(row);
  }
}

async function startGame(dayIdx = null, force = false) {
  if (isGameLoading && !force) return;
  isGameLoading = true;

  if (settings.music) {
    SoundEngine.init(); // Ensure context allowed
    SoundEngine.resetAmbience();
  }
  if (isInitializing && !force) return;
  isInitializing = true;

  // Use current day if none provided
  if (dayIdx !== null) {
    activeDayIndex = dayIdx;
  } else {
    activeDayIndex = getDailyIndex();
  }

  // Ensure words are loaded (wait if necessary)
  if (WORDS_SOLUTIONS.length === 0) {
    await loadSecureWords(currentWordLength);
  }
  // Double check
  if (WORDS_SOLUTIONS.length === 0) {
    console.error("Words failed to load. Aborting startGame.");
    isInitializing = false;
    return;
  }

  // Reset active variables
  currentRow = 0;
  currentCol = 0;
  gameStatus = 'IN_PROGRESS';
  isSubmitting = false;
  hintsUsed = false;
  rows.length = 0;

  // Update UI Date
  const dateEl = document.getElementById('game-date');
  if (dateEl) {
    const puzzleDate = new Date(EPOCH_MS + activeDayIndex * MS_PER_DAY);
    dateEl.textContent = puzzleDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  }

  // Update Hint UI
  const hintBtn = document.getElementById('hint-btn');
  if (hintBtn) hintBtn.classList.remove('disabled');

  // Word of the day based on local date
  const solutionIndex = ((activeDayIndex % WORDS_SOLUTIONS.length) + WORDS_SOLUTIONS.length) % WORDS_SOLUTIONS.length;
  solution = WORDS_SOLUTIONS[solutionIndex];

  // Rebuild Grid
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  rows.length = 0;

  for (let i = 0; i < 6; i++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'row';
    const rowTiles = [];
    for (let j = 0; j < currentWordLength; j++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      rowDiv.appendChild(tile);
      rowTiles.push(tile);
    }
    grid.appendChild(rowDiv);
    rows.push(rowTiles);
  }

  // Reset State
  currentRow = 0;
  currentCol = 0;
  gameStatus = 'IN_PROGRESS';

  // Clear keyboard colors
  document.querySelectorAll('.key').forEach(k => {
    k.classList.remove('correct', 'present', 'absent');
  });

  document.body.focus();
  await loadGame(activeDayIndex);
  isInitializing = false;
}

// One-time Setup for Input
window.addEventListener('keydown', (e) => {
  SoundEngine.init(); // Initialize on first keypress
  onKey(e);
});
document.querySelectorAll('#keyboard .key').forEach(btn => {
  btn.addEventListener('click', () => {
    SoundEngine.init(); // Initialize on first click
    const k = btn.dataset.key || btn.textContent;
    onKey({ key: k });
  });
});

// Setup Hidden Reset on Logo (One time)
const logo = document.querySelector('.logo');
if (logo) {
  logo.addEventListener('click', () => {
    logoTapCount++;
    clearTimeout(logoTapTimer);

    if (logoTapCount >= 7) {
      // Reset All Games (All days, all modes)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('fww_gamestate')) {
          localStorage.removeItem(key);
        }
      });
      showToast('All Games & Hints Reset!');
      setTimeout(() => window.location.reload(), 1000);
      logoTapCount = 0;
    } else {
      logoTapTimer = setTimeout(() => {
        logoTapCount = 0;
      }, 2000); // 2 seconds between taps allowed
    }
  });
}

// Archive Date Listener
const archiveDate = document.getElementById('game-date');
if (archiveDate) {
  archiveDate.addEventListener('click', openArchive);
}

// Hint Button Listener
const hintBtn = document.getElementById('hint-btn');
if (hintBtn) {
  hintBtn.addEventListener('click', useHint);
}

// Help Modal
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
if (helpBtn && helpModal) {
  helpBtn.addEventListener('click', () => {
    helpModal.classList.add('open');
  });
  helpModal.querySelector('.close-btn').addEventListener('click', () => {
    helpModal.classList.remove('open');
  });
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.remove('open');
  });
}

// Auth Modal
const authBtn = document.getElementById('auth-btn');
const authModal = document.getElementById('auth-modal');
if (authBtn && authModal) {
  authBtn.addEventListener('click', () => authModal.classList.add('open'));
  authModal.querySelector('.close-btn').addEventListener('click', () => authModal.classList.remove('open'));
  authModal.addEventListener('click', (e) => { if (e.target === authModal) authModal.classList.remove('open'); });

  // Tab switching
  const tabs = authModal.querySelectorAll('.auth-tab');
  const submitBtn = document.getElementById('auth-submit-btn');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      submitBtn.textContent = isLogin ? 'Login' : 'Create Account';
    });
  });

  submitBtn.addEventListener('click', () => {
    const activeTab = authModal.querySelector('.auth-tab.active').dataset.tab;
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-password').value;

    if (activeTab === 'login') {
      AuthManager.login(email, pass).then(() => {
        if (AuthManager.user) {
          authModal.classList.remove('open');
        }
      });
    } else {
      AuthManager.signup(email, pass).then(() => {
        if (AuthManager.user) {
          authModal.classList.remove('open');
        }
      });
    }
  });

  document.getElementById('google-login-btn').addEventListener('click', () => AuthManager.googleLogin());
  document.getElementById('logout-btn').addEventListener('click', () => AuthManager.logout());
}

// Stats UI (One time)
const statsBtn = document.getElementById('stats-btn');
const modal = document.getElementById('stats-modal');
const closeBtn = modal.querySelector('.close-btn');

if (statsBtn && modal) {
  statsBtn.addEventListener('click', () => {
    showStatsModal(currentWordLength);
    modal.classList.add('open');
  });
  closeBtn.addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('open');
  });

  // Stats Mode Toggles
  document.querySelectorAll('.stats-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      showStatsModal(parseInt(btn.dataset.mode));
    });
  });
}


function saveGame() {
  if (isGameLoading) return; // Don't save while we are trying to load
  const guesses = rows
    .map(row => row.map(tile => tile.textContent).join(''))
    .filter(word => word.length === currentWordLength); // Only complete guesses

  // Check if there is a hinted tile in the current row
  let hintedLetter = null;
  let hintedPos = null;
  if (hintsUsed && rows[currentRow]) {
    const tileIdx = rows[currentRow].findIndex(t => t.classList.contains('hinted'));
    if (tileIdx !== -1) {
      hintedLetter = rows[currentRow][tileIdx].textContent;
      hintedPos = tileIdx;
    }
  }

  const state = {
    dayIndex: activeDayIndex,
    guesses: guesses,
    gameStatus: gameStatus,
    hintsUsed: hintsUsed,
    hintedLetter: hintedLetter,
    hintedPos: hintedPos
  };
  localStorage.setItem(getGameStateKey(), JSON.stringify(state));
  AuthManager.syncGameStateToCloud(state);
}

async function loadGame(currentDayIndex) {
  isGameLoading = true;
  const key = getGameStateKey(currentDayIndex, currentWordLength);
  let localStateJSON = localStorage.getItem(key);
  let localState = null;
  if (localStateJSON) {
    try { localState = JSON.parse(localStateJSON); } catch (e) { }
  }

  // Always try to check cloud if logged in, especially if local is fresh or missing
  if (AuthManager.user) {
    try {
      const cloudState = await AuthManager.fetchGameStateFromCloud(currentDayIndex, currentWordLength);
      if (cloudState) {
        // Conflict Resolution:
        // Use cloud if:
        // 1. No local state
        // 2. Cloud has more guesses
        // 3. Cloud is WON/LOST but local is not
        const cloudIsAhead = !localState ||
          (cloudState.guesses.length > localState.guesses.length) ||
          (cloudState.gameStatus !== 'IN_PROGRESS' && localState.gameStatus === 'IN_PROGRESS');

        if (cloudIsAhead) {
          console.log(`Cloud state is ahead for mode ${currentWordLength}. Syncing...`);
          localState = cloudState;
          localStorage.setItem(key, JSON.stringify(cloudState));
        }
      }
    } catch (e) {
      console.error("Cloud load failed, falling back to local:", e);
    }
  }

  if (!localState) {
    isGameLoading = false;
    return;
  }

  try {
    const state = localState;
    // Safety check: day must match
    if (state.dayIndex !== currentDayIndex) {
      isGameLoading = false;
      return;
    }

    // Restore Guesses
    state.guesses.forEach((guess) => {
      if (guess.length !== currentWordLength) return;
      // Set letters
      guess.split('').forEach((letter, i) => {
        if (rows[currentRow] && rows[currentRow][i]) {
          rows[currentRow][i].textContent = letter;
        }
      });

      // Apply colors (Instant, no animation)
      const result = evaluateGuess(guess);
      rows[currentRow].forEach((tile, i) => {
        tile.classList.add(result[i]);
        updateKeyboard(guess[i], result[i]);
      });

      currentRow++;
    });

    gameStatus = state.gameStatus;
    hintsUsed = !!state.hintsUsed;

    // Restore Hint UI
    const hintBtn = document.getElementById('hint-btn');
    if (hintsUsed && hintBtn) hintBtn.classList.add('disabled');

    // Restore hinted tile visually if game is in progress
    if (hintsUsed && state.hintedLetter && state.hintedPos !== null && rows[currentRow]) {
      const tile = rows[currentRow][state.hintedPos];
      if (tile) {
        tile.textContent = state.hintedLetter;
        tile.classList.add('hinted', 'correct');
        updateKeyboard(state.hintedLetter, 'correct');
      }
    }

    // Sync cursor
    while (currentCol < currentWordLength && rows[currentRow] && rows[currentRow][currentCol].classList.contains('hinted')) {
      currentCol++;
    }

    if (gameStatus === 'WON' || gameStatus === 'LOST') {
      if (gameStatus === 'WON') {
        currentRow = 6; // Lock input
      }
    }

    isGameLoading = false;
  } catch (e) {
    console.warn('Failed to load game state', e);
    localStorage.removeItem(getGameStateKey());
    isGameLoading = false;
  }
}

function evaluateGuess(guess) {
  if (!solution) return new Array(currentWordLength).fill('absent');
  const solArr = solution.split('');
  const solCount = {};
  solArr.forEach(l => solCount[l] = (solCount[l] || 0) + 1);
  const states = Array(currentWordLength).fill('absent');

  // First pass: correct
  guess.split('').forEach((l, i) => {
    if (l === solArr[i]) {
      states[i] = 'correct';
      solCount[l]--;
    }
  });

  // Second pass: present
  guess.split('').forEach((l, i) => {
    if (states[i] === 'absent' && solCount[l] > 0) {
      states[i] = 'present';
      solCount[l]--;
    }
  });
  return states;
}

function updateKeyboard(letter, state) {
  const keyBtn = findKeyBtn(letter);
  if (!keyBtn) return;

  if (state === 'correct') {
    keyBtn.classList.add('correct');
    keyBtn.classList.remove('present', 'absent');
  } else if (state === 'present' && !keyBtn.classList.contains('correct')) {
    keyBtn.classList.add('present');
  } else if (state === 'absent' && !keyBtn.classList.contains('correct') && !keyBtn.classList.contains('present')) {
    keyBtn.classList.add('absent');
  }
}

function handleKey(key) {
  key = key.toUpperCase();
  if (gameStatus !== 'IN_PROGRESS' || currentRow >= 6) return;

  if (key === 'ENTER') {
    checkGuess();
  } else if (key === 'BACKSPACE') {
    deleteLetter();
  } else if (/^[A-Z]$/.test(key) && currentCol < currentWordLength) {
    HapticEngine.vibrate(20);
    SoundEngine.playThump();
    addLetter(key);
  }
}

function onKey(e) {
  handleKey(e.key);
}

function addLetter(letter) {
  // If current tile is hinted, skip to next non-hinted
  while (currentCol < currentWordLength && rows[currentRow][currentCol].classList.contains('hinted')) {
    currentCol++;
  }

  if (currentCol < currentWordLength && rows[currentRow] && rows[currentRow][currentCol]) {
    // Clear invalid state if user types again
    if (currentCol === 0 || rows[currentRow][0].classList.contains('invalid')) {
      rows[currentRow].forEach(tile => tile.classList.remove('invalid', 'shake'));
    }

    rows[currentRow][currentCol].textContent = letter;
    currentCol++;

    // Skip next tiles if they are hinted
    while (currentCol < currentWordLength && rows[currentRow][currentCol].classList.contains('hinted')) {
      currentCol++;
    }
  }
}

function deleteLetter() {
  if (currentCol > 0) {
    // Re-check for invalid state removal on delete
    const row = rows[currentRow];
    row.forEach(tile => tile.classList.remove('invalid', 'shake'));

    currentCol--;
    // Skip backward over hinted tiles
    while (currentCol > 0 && rows[currentRow][currentCol].classList.contains('hinted')) {
      currentCol--;
    }

    // Only clear if not hinted
    if (!rows[currentRow][currentCol].classList.contains('hinted')) {
      rows[currentRow][currentCol].textContent = '';
    } else {
      // If we landed on a hint during deletion, it means there are no non-hinted letters left to delete before it.
      // We should stay at the position just after the hint or at the hint if it's the very first tile.
    }
  }
}

function findKeyBtn(ch) {
  return Array.from(document.querySelectorAll('#keyboard .key')).find(b => b.textContent === ch);
}


function checkGuess() {
  if (isSubmitting || gameStatus !== 'IN_PROGRESS') return;
  let correctCountForAudio = 0;

  const guess = rows[currentRow].map(t => t.textContent).join('');
  if (guess.length < currentWordLength) {
    showToast('Not enough letters');
    HapticEngine.vibrate([40, 40, 40]);
    return;
  }

  if (!WORDS_HASHES.has(hash32(guess))) {
    rows[currentRow].forEach(tile => tile.classList.add('invalid', 'shake'));
    HapticEngine.vibrate([100, 50, 100]);
    showToast('Not in word list');
    return;
  }

  isSubmitting = true;

  // Use helper to calculate states
  const states = evaluateGuess(guess);

  // Animate tiles
  rows[currentRow].forEach((tile, i) => {
    const state = states[i];
    const letter = guess[i];
    setTimeout(() => {
      tile.classList.add('flip');
      tile.addEventListener('animationend', () => {
        tile.classList.remove('flip');
        tile.classList.add(state);
        updateKeyboard(letter, state);
        if (state === 'correct') {
          SoundEngine.playDing();
          HapticEngine.vibrate(30);
          correctCountForAudio++; // Track greens
        } else {
          HapticEngine.vibrate(15);
        }
      }, { once: true });
    }, i * 350);
  });

  // After animations
  setTimeout(() => {
    if (guess === solution) {
      gameStatus = 'WON';
      saveGame();
      updateStats(true, currentRow + 1); // 1-based guess count
      showToast('Great');
      SoundEngine.playWin();
      SoundEngine.updateAmbience(5, currentRow); // Full resolve
      HapticEngine.vibrate([100, 30, 200, 50, 500]);

      setTimeout(() => {
        showStatsModal();
        document.getElementById('stats-modal').classList.add('open');
      }, 1500);
      if (typeof window.confetti === 'function') {
        const kb = document.getElementById('keyboard');
        const yPos = kb ? kb.getBoundingClientRect().top / window.innerHeight : 0.75;
        window.confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: Math.max(0, Math.min(1, yPos - 0.1)) }
        });
      }
      currentRow = 6;
    } else {
      currentRow++;
      currentCol = 0;
      if (currentRow === 6) {
        gameStatus = 'LOST';
        showToast(`The word was ${solution} `);
        SoundEngine.stopAmbience(); // Silence on loss
        updateStats(false, 6);
        setTimeout(() => {
          showStatsModal();
          document.getElementById('stats-modal').classList.add('open');
        }, 1500);
      }
      saveGame();
      // Update ambience based on progress (Greens)
      SoundEngine.updateAmbience(correctCountForAudio, currentRow + 1);
    }
    isSubmitting = false;
  }, currentWordLength * 400 + 400); // Increased buffer to ensure all flips finish
}


// ---- Countdown to Next Puzzle ----
(function () {
  const countdownEl = document.getElementById('countdown');
  function updateCountdown() {
    const now = new Date();
    const nextMidnightUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1
    ));
    const diff = nextMidnightUTC - now;
    const hours = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const minutes = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const seconds = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    countdownEl.innerText = `Next word in ${hours}:${minutes}:${seconds} `;
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);
})();

// Aesthetic - Dynamic Backgrounds & Holidays
function initHolidays() {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const day = now.getDate();

  // Christmas: Dec 24, 25, 26
  if (month === 11 && (day >= 24 && day <= 26)) {
    document.body.classList.add('holiday-christmas');
  }
  // New Year: Dec 31, Jan 1
  else if ((month === 11 && day === 31) || (month === 0 && day === 1)) {
    document.body.classList.add('holiday-newyear');
  }
}

function updateDynamicBackground() {
  const bg = document.getElementById('dynamic-bg');
  if (!bg) return;
  bg.innerHTML = ''; // Clear existing

  const isDark = document.body.classList.contains('dark-mode');

  if (isDark) {
    // Twinkling Stars - Disabled for wallpaper
    /*
    for (let i = 0; i < 50; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      const size = Math.random() * 2 + 1;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.left = `${Math.random() * 100}%`;
      star.style.top = `${Math.random() * 100}%`;
      star.style.setProperty('--duration', `${Math.random() * 3 + 2}s`);
      star.style.animationDelay = `${Math.random() * 5}s`;
      bg.appendChild(star);
    }
    */
  } else {
    // Drifting Clouds - Disabled in favor of polished wallpaper
    /*
    for (let i = 0; i < 6; i++) {
      const cloud = document.createElement('div');
      cloud.className = 'cloud';
      const size = Math.random() * 100 + 100;
      cloud.style.width = `${size}px`;
      cloud.style.height = `${size * 0.6}px`;
      cloud.style.left = `${Math.random() * -100}%`;
      cloud.style.top = `${Math.random() * 70}%`;
      cloud.style.animationDuration = `${Math.random() * 60 + 60}s`;
      cloud.style.animationDelay = `${Math.random() * 20}s`;
      bg.appendChild(cloud);
    }
    */
  }
}
