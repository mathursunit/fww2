// script.js with toast notification and flip animation

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EPOCH_MS = Date.UTC(2025, 0, 1);

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


let WORDS = [];
let solution = '';
let currentRow = 0, currentCol = 0;
let gameStatus = 'IN_PROGRESS'; // 'IN_PROGRESS', 'WON', 'LOST'
const rows = [];
const GAME_STATE_KEY = 'fww_gamestate';
const STATS_KEY = 'fww_stats';

// Hidden reset variables

// Hidden reset variables
let logoTapCount = 0;
let logoTapTimer = null;

fetch('words.txt')
  .then(r => r.text())
  .then(txt => {
    WORDS = txt.split('\n').map(w => w.trim().toUpperCase()).filter(Boolean);
    startGame();
  });

function getStats() {
  const defaultStats = {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    guesses: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, fail: 0 }
  };
  try {
    const s = localStorage.getItem(STATS_KEY);
    return s ? { ...defaultStats, ...JSON.parse(s) } : defaultStats;
  } catch {
    return defaultStats;
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
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

function showStatsModal() {
  const stats = getStats();

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
    if (gameStatus === 'WON' && currentRow + 1 === i) {
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

function getDailyIndex() {
  const now = new Date();
  const todayUTCmid = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUTCmid - EPOCH_MS) / MS_PER_DAY);
  return ((days % WORDS.length) + WORDS.length) % WORDS.length;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message.toUpperCase();
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 2000);
}

function startGame() {
  const dailyIndex = getDailyIndex();
  solution = WORDS[dailyIndex];

  document.body.focus();
  document.querySelectorAll('.row').forEach(r => rows.push(Array.from(r.children)));

  // Keyboard events
  window.addEventListener('keydown', onKey);
  document.querySelectorAll('#keyboard .key').forEach(btn => {
    btn.addEventListener('click', () => {
      const k = btn.dataset.key || btn.textContent;
      onKey({ key: k });
    });
  });

  // Setup Hidden Reset on Logo
  const logo = document.querySelector('.logo');
  if (logo) {
    logo.addEventListener('click', () => {
      logoTapCount++;
      clearTimeout(logoTapTimer);

      if (logoTapCount >= 5) {
        // Reset Game
        localStorage.removeItem(GAME_STATE_KEY);
        showToast('Game Reset!');
        setTimeout(() => window.location.reload(), 1000);
        logoTapCount = 0;
      } else {
        logoTapTimer = setTimeout(() => {
          logoTapCount = 0;
        }, 1000); // 1 second to continue tapping
      }
    });
  }

  // Stats UI
  const statsBtn = document.getElementById('stats-btn');
  const modal = document.getElementById('stats-modal');
  const closeBtn = document.querySelector('.close-btn');

  if (statsBtn && modal) {
    statsBtn.addEventListener('click', () => {
      showStatsModal();
      modal.classList.add('open');
    });
    closeBtn.addEventListener('click', () => modal.classList.remove('open'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('open');
    });
  }

  loadGame(dailyIndex);
}

function saveGame() {
  const guesses = rows
    .map(row => row.map(tile => tile.textContent).join(''))
    .filter(word => word.length === 5); // Only complete guesses

  const state = {
    dayIndex: getDailyIndex(),
    guesses: guesses,
    gameStatus: gameStatus
  };
  localStorage.setItem(GAME_STATE_KEY, JSON.stringify(state));
}

function loadGame(currentDayIndex) {
  const savedJSON = localStorage.getItem(GAME_STATE_KEY);
  if (!savedJSON) return;

  try {
    const state = JSON.parse(savedJSON);

    // Check if it's the same day
    if (state.dayIndex !== currentDayIndex) {
      localStorage.removeItem(GAME_STATE_KEY);
      return;
    }

    // Restore Guesses
    state.guesses.forEach((guess) => {
      // Set letters
      guess.split('').forEach((letter, i) => {
        rows[currentRow][i].textContent = letter;
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
    if (gameStatus === 'WON' || gameStatus === 'LOST') {
      if (gameStatus === 'WON') {
        currentRow = 6; // Lock input
        showToast('Great');
      } else if (gameStatus === 'LOST') {
        showToast(`The word was ${solution}`);
      }
    }

  } catch (e) {
    console.warn('Failed to load game state', e);
    localStorage.removeItem(GAME_STATE_KEY);
  }
}

function evaluateGuess(guess) {
  const solArr = solution.split('');
  const solCount = {};
  solArr.forEach(l => solCount[l] = (solCount[l] || 0) + 1);
  const states = Array(5).fill('absent');

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

function onKey(e) {
  const key = e.key.toUpperCase();
  if (navigator.vibrate) navigator.vibrate(50);
  if (gameStatus !== 'IN_PROGRESS' || currentRow >= 6) return;
  if (key === 'ENTER') return checkGuess();
  if (key === 'BACKSPACE') return deleteLetter();
  if (/^[A-Z]$/.test(key) && currentCol < 5) addLetter(key);
}

function addLetter(letter) {
  rows[currentRow][currentCol].textContent = letter;
  currentCol++;
}

function deleteLetter() {
  if (currentCol > 0) {
    currentCol--;
    rows[currentRow][currentCol].textContent = '';
  }
}

function findKeyBtn(ch) {
  return Array.from(document.querySelectorAll('#keyboard .key')).find(b => b.textContent === ch);
}


function checkGuess() {
  if (currentCol < 5) {
    showToast('Not enough letters');
    return;
  }
  const guess = rows[currentRow].map(t => t.textContent).join('');
  if (!WORDS.includes(guess)) {
    showToast('Not in word list');
    return;
  }

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
      }, { once: true });
    }, i * 300);
  });

  // After animations
  setTimeout(() => {
    if (guess === solution) {
      gameStatus = 'WON';
      saveGame();
      updateStats(true, currentRow + 1); // 1-based guess count
      showToast('Great');
      setTimeout(() => {
        showStatsModal();
        document.getElementById('stats-modal').classList.add('open');
      }, 1500);
      if (typeof confetti === 'function') confetti({
        particleCount: 200,
        spread: 60,
        origin: { y: 0.6 }
      });
      currentRow = 6;
    } else {
      currentRow++;
      currentCol = 0;
      if (currentRow === 6) {
        gameStatus = 'LOST';
        showToast(`The word was ${solution}`);
        updateStats(false, 6);
        setTimeout(() => {
          showStatsModal();
          document.getElementById('stats-modal').classList.add('open');
        }, 1500);
      }
      saveGame();
    }
  }, 5 * 300 + 100);
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
    countdownEl.innerText = `Next word in ${hours}:${minutes}:${seconds}`;
  }
  updateCountdown();
  setInterval(updateCountdown, 1000);
})();
