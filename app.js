// ─── Database ───────────────────────────────────────────────────────────────
const db = new Dexie('PlankDB');
db.version(1).stores({ sessions: '++id, duration, date' });

// ─── State ──────────────────────────────────────────────────────────────────
let startTime = null;
let rafId = null;
let elapsed = 0;       // ms
let wakeLock = null;
let pendingDeleteId = null;

// ─── DOM refs ────────────────────────────────────────────────────────────────
const timerDisplay     = document.getElementById('timer-display');
const pbDisplay        = document.getElementById('pb-display');
const compDisplay      = document.getElementById('comparison-display');
const btnStart         = document.getElementById('btn-start');
const btnStop          = document.getElementById('btn-stop');
const btnSave          = document.getElementById('btn-save');
const btnRestart       = document.getElementById('btn-restart');
const btnGoHistory     = document.getElementById('btn-go-history');
const btnGoTimer       = document.getElementById('btn-go-timer');
const screenTimer      = document.getElementById('screen-timer');
const screenHistory    = document.getElementById('screen-history');
const historyList      = document.getElementById('history-list');
const historyEmpty     = document.getElementById('history-empty');
const celebOverlay     = document.getElementById('celebration-overlay');
const celebTime        = document.getElementById('celebration-time');
const btnSaveCele      = document.getElementById('btn-save-cele');
const btnRestartCele   = document.getElementById('btn-restart-cele');
const deleteDialog     = document.getElementById('delete-dialog');
const btnDeleteConfirm = document.getElementById('btn-delete-confirm');
const btnDeleteCancel  = document.getElementById('btn-delete-cancel');

// ─── Formatting ──────────────────────────────────────────────────────────────
function formatTime(ms) {
  const total = Math.floor(ms / 100);
  const tenths = total % 10;
  const secs   = Math.floor(total / 10) % 60;
  const mins   = Math.floor(total / 600);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatDate(date) {
  const d = new Date(date);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${formatTime(0).replace('00:00.0', '')}`.trim()
    + `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function formatDateEntry(date) {
  const d = new Date(date);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── Personal Best ───────────────────────────────────────────────────────────
async function getPersonalBest() {
  const best = await db.sessions.orderBy('duration').last();
  return best ? best.duration : 0;
}

async function refreshPbDisplay() {
  const pb = await getPersonalBest();
  pbDisplay.textContent = pb > 0 ? `PB: ${formatTime(pb)}` : '';
}

// ─── Timer Loop ──────────────────────────────────────────────────────────────
function tick() {
  elapsed = performance.now() - startTime;
  timerDisplay.textContent = formatTime(elapsed);
  rafId = requestAnimationFrame(tick);
}

// ─── Wake Lock ───────────────────────────────────────────────────────────────
async function acquireWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}

function releaseWakeLock() {
  if (wakeLock) { wakeLock.release(); wakeLock = null; }
}

// ─── Timer Controls ──────────────────────────────────────────────────────────
async function startTimer() {
  startTime = performance.now() - elapsed;
  rafId = requestAnimationFrame(tick);
  document.body.classList.add('timer-running');
  document.body.classList.remove('timer-stopped');

  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  btnSave.classList.add('hidden');
  btnRestart.classList.add('hidden');
  compDisplay.textContent = '';

  await acquireWakeLock();
}

async function stopTimer() {
  cancelAnimationFrame(rafId);
  rafId = null;
  elapsed = performance.now() - startTime;
  timerDisplay.textContent = formatTime(elapsed);
  releaseWakeLock();

  document.body.classList.remove('timer-running');
  document.body.classList.add('timer-stopped');

  btnStop.classList.add('hidden');
  btnStart.classList.add('hidden');
  btnSave.classList.remove('hidden');
  btnRestart.classList.remove('hidden');

  if (elapsed < 100) {
    // Essentially zero — just reset
    resetTimer();
    return;
  }

  const pb = await getPersonalBest();
  if (elapsed > pb) {
    triggerCelebration();
  } else {
    compDisplay.textContent = `YOUR BEST: ${formatTime(pb)}  —  YOU DID: ${formatTime(elapsed)}`;
  }
}

function resetTimer() {
  cancelAnimationFrame(rafId);
  rafId = null;
  elapsed = 0;
  startTime = null;
  timerDisplay.textContent = '00:00.0';
  compDisplay.textContent = '';
  document.body.classList.remove('timer-running', 'timer-stopped');

  btnStart.classList.remove('hidden');
  btnStop.classList.add('hidden');
  btnSave.classList.add('hidden');
  btnRestart.classList.add('hidden');

  celebOverlay.classList.add('hidden');
  releaseWakeLock();
}

async function saveSession() {
  if (elapsed < 100) { resetTimer(); return; }
  await db.sessions.add({ duration: elapsed, date: new Date() });
  await refreshPbDisplay();
  resetTimer();
}

// ─── Celebration ─────────────────────────────────────────────────────────────
function triggerCelebration() {
  celebTime.textContent = formatTime(elapsed);
  celebOverlay.classList.remove('hidden');

  // Force reflow so animation re-triggers
  celebOverlay.classList.remove('celebration-active');
  void celebOverlay.offsetWidth;
  celebOverlay.classList.add('celebration-active');
}

// ─── Screen Navigation ───────────────────────────────────────────────────────
function showScreen(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// ─── History ─────────────────────────────────────────────────────────────────
async function loadHistory() {
  const sessions = await db.sessions.orderBy('date').reverse().toArray();
  const pb = await getPersonalBest();

  historyList.innerHTML = '';

  if (sessions.length === 0) {
    historyEmpty.classList.remove('hidden');
    historyList.classList.add('hidden');
    return;
  }

  historyEmpty.classList.add('hidden');
  historyList.classList.remove('hidden');

  sessions.forEach(session => {
    const isPb = session.duration === pb;
    const li = document.createElement('li');
    li.className = 'history-entry' + (isPb ? ' is-pb' : '');
    li.dataset.id = session.id;

    li.innerHTML = `
      <div class="entry-left">
        <span class="entry-duration">${formatTime(session.duration)}</span>
        <span class="entry-date">${formatDateEntry(session.date)}</span>
      </div>
      ${isPb ? '<span class="entry-pb-badge">PB</span>' : ''}
      <button class="entry-delete-btn" aria-label="Delete session" data-id="${session.id}">✕</button>
    `;

    historyList.appendChild(li);
  });
}

// ─── Delete Flow ─────────────────────────────────────────────────────────────
function openDeleteDialog(id) {
  pendingDeleteId = id;
  deleteDialog.classList.remove('hidden');
}

function closeDeleteDialog() {
  pendingDeleteId = null;
  deleteDialog.classList.add('hidden');
}

async function confirmDelete() {
  if (pendingDeleteId == null) return;
  await db.sessions.delete(pendingDeleteId);
  closeDeleteDialog();
  await loadHistory();
  await refreshPbDisplay();
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
btnStart.addEventListener('click', startTimer);
btnStop.addEventListener('click', stopTimer);

btnSave.addEventListener('click', async () => {
  celebOverlay.classList.add('hidden');
  await saveSession();
});

btnRestart.addEventListener('click', () => {
  celebOverlay.classList.add('hidden');
  resetTimer();
});

btnSaveCele.addEventListener('click', async () => {
  celebOverlay.classList.add('hidden');
  await saveSession();
});

btnRestartCele.addEventListener('click', () => {
  celebOverlay.classList.add('hidden');
  resetTimer();
});

btnGoHistory.addEventListener('click', () => {
  if (rafId !== null) {
    if (!confirm('Timer is running — leave anyway?')) return;
    resetTimer();
  }
  loadHistory();
  showScreen(screenHistory);
});

btnGoTimer.addEventListener('click', () => {
  showScreen(screenTimer);
});

historyList.addEventListener('click', e => {
  const btn = e.target.closest('.entry-delete-btn');
  if (btn) openDeleteDialog(Number(btn.dataset.id));
});

btnDeleteConfirm.addEventListener('click', confirmDelete);
btnDeleteCancel.addEventListener('click', closeDeleteDialog);

deleteDialog.addEventListener('click', e => {
  if (e.target === deleteDialog) closeDeleteDialog();
});

// Re-acquire wake lock if page becomes visible again while timer is running
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && rafId !== null) acquireWakeLock();
});

// ─── Service Worker ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ─── Init ────────────────────────────────────────────────────────────────────
refreshPbDisplay();
