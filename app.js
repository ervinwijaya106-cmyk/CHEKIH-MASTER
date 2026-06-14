/* ============================================================
   SCORE CEKIH — app.js  (Complete, No Placeholders)
   Premium Card Game Score Tracker by Sadewa Corp
   Vanilla JavaScript — No frameworks
   ============================================================ */

'use strict';

// ============================================================
// CONSTANTS
// ============================================================
const SETUP_ANIMAL       = ['Dragon','Tiger','Eagle','Qilin'];
const SETUP_ANIMAL_EMOJI = ['🐉','🐯','🦅','🦄'];
const SETUP_BORDER_VIDEO = [
  'video/border_1.webm',
  'video/border_2.webm',
  'video/border_3.webm',
  'video/border_4.webm',
];
const SETUP_WATERMARK = [
  'images/card_1.png',
  'images/card_2.png',
  'images/card_3.png',
  'images/card_4.png',
];
const SETUP_REWARD_VIDEO = [
  'video/dragon.mp4',
  'video/tiger.mp4',
  'video/eagle.mp4',
  'video/qilin.mp4',
];
const ACHIEVEMENTS_DEF = [
  { id:'tukang_ngocok', label:'Tukang Ngocok Kartu',          emoji:'🃏', cond: p => p.score < 0 },
  { id:'tukang_bakar',  label:'Tukang Bakar',                  emoji:'🔥', cond: p => (p.burns||0) >= 3 },
  { id:'hari_apes',     label:'Hari Apes Gak Ada Yang Tau',    emoji:'😵', cond: p => (p.burned||0) >= 5 },
  { id:'dewa_kartu',    label:'Dewa Kartu',                    emoji:'👑', cond: p => (p.highestScore||0) >= 500 },
  { id:'dewa_segala',   label:'Dewa Dari Segala Dewa',         emoji:'🌟', cond: p => (p.stars||0) > 1 },
  { id:'triple_burn',   label:'Triple Burn',                   emoji:'💥', cond: p => (p.tripleBurn||0) > 0 },
];
const AI_COMMENTS_RANDOM = [
  'Wah tipis banget selisihnya!',
  'Kayaknya ada yang mau comeback nih',
  'Hati-hati yang di bawah lagi ngintip!',
  'Situasi makin panas!',
  'Siapa yang bakal menang ya?',
  'Jangan santai dulu, masih panjang!',
  'Fokus fokus!',
  'Wah berbahaya ini!',
];

// ============================================================
// CENTRALIZED STATE
// ============================================================
let gameState = {
  screen: 'setup',      // 'setup' | 'game' | 'newround'
  round: 1,
  turn: 0,
  victoryTarget: 1000,
  players: [],
  /* player shape: {
       id, name, setupPos (0-3), score, stars, rank, prevRank,
       burns, burned, tripleBurn, highestScore,
       isInRecoveryMode, recoveryStartTurn,
       consecutiveMinus, consecutiveMinusWavPlayed,
       burnedBy, chartScores:[]
     }
  */
  history: [],
  burnCandidates: [],  // [{attackerId, victimId, attackerName, victimName}]
  burnHistory: [],     // [{text, round, turn}]
  achievements: {},    // {playerName: [{id,label,emoji}]}
  playerArchive: {},   // {playerName: {name,stars,burns,burned,tripleBurn,highestScore}}
  chartData: [],       // [{round,turn,scores:{id:score}}]
  aiComment: '',
  musicOn: true,
  lightMode: false,
  prevRankMap: null,   // {id: rank} from previous turn
  undoStack: [],
};

// ============================================================
// AUDIO STATE
// ============================================================
let bgMusic = null;
let bgMusicVolume = 1.0;
let currentWav = null;

// ============================================================
// DEEP CLONE
// ============================================================
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================================
// LOCAL STORAGE
// ============================================================
let saveDebounce = null;
function saveState() {
  clearTimeout(saveDebounce);
  saveDebounce = setTimeout(() => {
    try {
      const toSave = deepClone(gameState);
      toSave.undoStack = []; // don't persist undo stack
      localStorage.setItem('scoreCekih_v2', JSON.stringify(toSave));
    } catch(e) { console.warn('LS save:', e); }
  }, 200);
}

function loadState() {
  try {
    const raw = localStorage.getItem('scoreCekih_v2');
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge preserving undoStack
      gameState = Object.assign({}, gameState, parsed);
      gameState.undoStack = [];
    }
  } catch(e) { console.warn('LS load:', e); }
}

// ============================================================
// UNDO STACK
// ============================================================
function pushUndo() {
  const snap = deepClone(gameState);
  snap.undoStack = [];
  gameState.undoStack.push(snap);
  if (gameState.undoStack.length > 30) gameState.undoStack.shift();
}

// ============================================================
// AUDIO FUNCTIONS
// ============================================================
function initBgMusic() {
  bgMusic = new Audio('audio/casino_bg.mp3');
  bgMusic.loop = true;
  bgMusic.volume = bgMusicVolume;
  if (gameState.musicOn) bgMusic.play().catch(() => {});
}

function getMaleVoice() {
  return new Promise(resolve => {
    function pick(voices) {
      return voices.find(v => v.lang === 'id-ID' && /male|pria|laki/i.test(v.name))
          || voices.find(v => v.lang === 'id-ID')
          || voices.find(v => v.lang && v.lang.startsWith('id'))
          || voices[0]
          || null;
    }
    let voices = speechSynthesis.getVoices();
    if (voices.length > 0) { resolve(pick(voices)); return; }
    const handler = () => {
      voices = speechSynthesis.getVoices();
      speechSynthesis.removeEventListener('voiceschanged', handler);
      resolve(pick(voices));
    };
    speechSynthesis.addEventListener('voiceschanged', handler);
    setTimeout(() => resolve(pick(speechSynthesis.getVoices())), 2000);
  });
}

async function speakWithDuck(text) {
  if (!text) return;
  return new Promise(async resolve => {
    try {
      speechSynthesis.cancel();
      if (bgMusic && !bgMusic.paused) bgMusic.volume = 0.15;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'id-ID';
      utter.rate = 1;
      utter.pitch = 0.8;
      utter.volume = 1;
      try {
        const voice = await getMaleVoice();
        if (voice) utter.voice = voice;
      } catch(e) {}
      const restore = () => {
        try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e) {}
        resolve();
      };
      utter.onend  = restore;
      utter.onerror = restore;
      speechSynthesis.speak(utter);
    } catch(e) {
      try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e2) {}
      resolve();
    }
  });
}

function playWavWithDuck(src) {
  return new Promise(resolve => {
    try {
      if (bgMusic && !bgMusic.paused) bgMusic.volume = 0.15;
      const audio = new Audio(src);
      currentWav = audio;
      const restore = () => {
        try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e) {}
        currentWav = null;
        resolve();
      };
      audio.onended = restore;
      audio.onerror = restore;
      audio.play().catch(restore);
    } catch(e) {
      try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e2) {}
      resolve();
    }
  });
}

function playClickSound() {
  try {
    const audio = new Audio('audio/klik.wav');
    audio.volume = 0.5;
    audio.play().catch(() => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i/data.length);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start();
      } catch(e2) {}
    });
  } catch(e) {}
}

function stopAllAudio() {
  try { speechSynthesis.cancel(); } catch(e) {}
  if (currentWav) {
    try { currentWav.pause(); currentWav.currentTime = 0; } catch(e) {}
    currentWav = null;
  }
  try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e) {}
}

// ============================================================
// NUMBER HELPERS
// ============================================================
function numberToBahasaIndonesia(n) {
  if (typeof n !== 'number' || isNaN(n)) return 'nol';
  if (n === 0) return 'nol';
  let prefix = '';
  if (n < 0) { prefix = 'minus '; n = Math.abs(n); }
  const ones = ['','satu','dua','tiga','empat','lima','enam','tujuh','delapan','sembilan',
    'sepuluh','sebelas','dua belas','tiga belas','empat belas','lima belas',
    'enam belas','tujuh belas','delapan belas','sembilan belas'];
  const tens = ['','','dua puluh','tiga puluh','empat puluh','lima puluh',
    'enam puluh','tujuh puluh','delapan puluh','sembilan puluh'];
  function conv(num) {
    if (num === 0) return '';
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000) {
      const h = Math.floor(num/100);
      const rem = num%100;
      return (h===1?'seratus':ones[h]+' ratus') + (rem?' '+conv(rem):'');
    }
    if (num < 1000000) {
      const th = Math.floor(num/1000);
      const rem = num%1000;
      return (th===1?'seribu':conv(th)+' ribu') + (rem?' '+conv(rem):'');
    }
    return String(num);
  }
  return (prefix + conv(n)).trim();
}

// ============================================================
// PURE CALCULATIONS
// ============================================================
function calculateRanking(players) {
  // Returns {id: rankNumber(1-based)}
  const sorted = [...players].sort((a,b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.setupPos||0) - (b.setupPos||0);
  });
  const map = {};
  sorted.forEach((p,i) => { map[p.id] = i+1; });
  return map;
}

function detectBurnCandidates(prevRankMap, newRankMap, prevPlayersArr, newPlayersArr, currentTurn) {
  // No burns on turn 1
  if (currentTurn <= 1) return [];
  if (!prevRankMap || Object.keys(prevRankMap).length === 0) return [];

  const prevMap = {};
  prevPlayersArr.forEach(p => { prevMap[p.id] = p; });
  const newMap = {};
  newPlayersArr.forEach(p => { newMap[p.id] = p; });

  // Players who JUST exited recovery this turn
  const justExitedRecovery = new Set();
  newPlayersArr.forEach(p => {
    const prev = prevMap[p.id];
    if (prev && prev.isInRecoveryMode && !p.isInRecoveryMode) {
      justExitedRecovery.add(p.id);
    }
  });

  const candidates = [];

  newPlayersArr.forEach(attacker => {
    const aRankBefore = prevRankMap[attacker.id];
    const aRankAfter  = newRankMap[attacker.id];
    if (!aRankBefore || !aRankAfter) return;
    // Attacker must have RISEN (lower rank number = better position)
    if (aRankAfter >= aRankBefore) return;

    newPlayersArr.forEach(victim => {
      if (victim.id === attacker.id) return;
      const vRankBefore = prevRankMap[victim.id];
      const vRankAfter  = newRankMap[victim.id];
      if (!vRankBefore || !vRankAfter) return;

      // Victim was ABOVE attacker before (vRankBefore < aRankBefore)
      if (vRankBefore >= aRankBefore) return;
      // Victim is now BELOW attacker (vRankAfter > aRankAfter)
      if (vRankAfter <= aRankAfter) return;

      // Victim score must be > 0 after turn
      const victimNew = newMap[victim.id];
      if (!victimNew || victimNew.score <= 0) return;

      // Victim must NOT be in recovery
      if (victimNew.isInRecoveryMode) return;

      // Former recovery players cannot burn each other this turn
      if (justExitedRecovery.has(attacker.id) && justExitedRecovery.has(victim.id)) return;

      // No duplicates
      if (!candidates.find(c => c.attackerId===attacker.id && c.victimId===victim.id)) {
        candidates.push({
          attackerId: attacker.id,
          victimId: victim.id,
          attackerName: attacker.name,
          victimName: victim.name,
          attackerSetupPos: attacker.setupPos,
        });
      }
    });
  });
  return candidates;
}

function updateRecoveryStatus(players, currentTurn) {
  return players.map(p => {
    if (p.isInRecoveryMode && p.recoveryStartTurn !== null) {
      // Recovery lasts 1 full turn: protected until recoveryStartTurn+1 inclusive
      // At currentTurn == recoveryStartTurn+2, recovery ends
      if (currentTurn > p.recoveryStartTurn + 1) {
        return { ...p, isInRecoveryMode: false, recoveryStartTurn: null };
      }
    }
    return { ...p };
  });
}

function getDangerLevel(score, target) {
  if (score < 0) return 'critical';
  const pct = score / target;
  if (pct >= 0.85) return 'safe';
  if (pct >= 0.6)  return 'caution';
  if (pct >= 0.3)  return 'danger';
  return 'critical';
}

function getDangerInfo(score, target) {
  const lvl = getDangerLevel(score, target);
  return {
    safe:     { emoji:'🟢', text:'Safe',    cls:'badge-danger-safe' },
    caution:  { emoji:'🟡', text:'Caution', cls:'badge-danger-caution' },
    danger:   { emoji:'🟠', text:'Danger',  cls:'badge-danger-danger' },
    critical: { emoji:'🔴', text:'Critical',cls:'badge-danger-critical' },
  }[lvl];
}

// ============================================================
// RENDER SYSTEM
// ============================================================
function render() {
  const pages = {
    setup:    'setup-page',
    game:     'game-page',
    newround: 'new-round-page',
  };
  Object.entries(pages).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (key === gameState.screen) {
      el.style.display = (key === 'game') ? 'flex' : 'block';
    } else {
      el.style.display = 'none';
    }
  });

  if (gameState.screen === 'game') {
    renderHeader();
    renderCards();
    renderBurnPanel();
    const activeTabBtn = document.querySelector('.tab-btn.active');
    const activeTab = activeTabBtn ? activeTabBtn.dataset.tab : 'ranking';
    renderTabContent(activeTab);
    renderAIComment();
  } else if (gameState.screen === 'newround') {
    renderNewRoundPage();
  }
}

function renderHeader() {
  const ri = document.getElementById('header-round-info');
  if (ri) ri.textContent = `Round ${gameState.round} · Turn ${gameState.turn}`;
  const vt = document.getElementById('header-target');
  if (vt) vt.textContent = `Target: ${gameState.victoryTarget}`;
  // Music button states
  const gmb = document.getElementById('game-music-btn');
  if (gmb) gmb.textContent = gameState.musicOn ? '🎵' : '🔇';
  const gmbb = document.getElementById('game-music-bottom-btn');
  if (gmbb) gmbb.textContent = gameState.musicOn ? '🎵 Music' : '🔇 Music';
}

function renderCards() {
  const grid = document.getElementById('cards-grid');
  if (!grid) return;

  // Calculate rankings
  const rankMap = calculateRanking(gameState.players);
  gameState.players.forEach(p => { p.rank = rankMap[p.id]; });

  // Track rank changes for bounce animation
  const prevRanks = {};
  grid.querySelectorAll('[data-player-id]').forEach(c => {
    const id = c.dataset.playerId;
    const badge = c.querySelector('[data-rank-badge]');
    if (badge) prevRanks[id] = parseInt(badge.dataset.rankValue||'0');
  });

  grid.innerHTML = '';
  gameState.players.forEach(p => {
    const card = buildPlayerCard(p, prevRanks[p.id]);
    grid.appendChild(card);
  });

  // Start border videos
  grid.querySelectorAll('video[data-border-video]').forEach(v => {
    v.play().catch(() => {});
  });
}

function buildPlayerCard(p, prevRankNum) {
  const rankNum = p.rank || 1;
  const rankChanged = prevRankNum && prevRankNum !== rankNum;

  const card = document.createElement('div');
  card.className = `player-card rank-${rankNum}`;
  card.id = `card-${p.id}`;
  card.dataset.playerId = p.id;
  card.dataset.setupPos = p.setupPos;

  // ── Layer 1: Border video (full opacity, dominant)
  const vid = document.createElement('video');
  vid.className = 'card-border-video';
  vid.src = SETUP_BORDER_VIDEO[p.setupPos];
  vid.autoplay = true;
  vid.loop = true;
  vid.muted = true;
  vid.setAttribute('playsinline', '');
  vid.setAttribute('data-border-video', '');
  card.appendChild(vid);

  // ── Layer 2: Suit watermark (low opacity)
  const wm = document.createElement('img');
  wm.className = 'card-watermark';
  wm.src = SETUP_WATERMARK[p.setupPos];
  wm.alt = '';
  card.appendChild(wm);

  // ── Layer 3: Dark overlay for readability
  const overlay = document.createElement('div');
  overlay.className = 'card-overlay';
  card.appendChild(overlay);

  // ── Layer 4: Card content
  const content = document.createElement('div');
  content.className = 'card-content';

  // Row 1: Rank badge + Stars
  const topRow = document.createElement('div');
  topRow.className = 'card-top';

  const rankBadge = document.createElement('span');
  rankBadge.className = `rank-badge rank-${rankNum}${rankChanged ? ' bounce' : ''}`;
  rankBadge.textContent = `#${rankNum}`;
  rankBadge.dataset.rankBadge = '';
  rankBadge.dataset.rankValue = String(rankNum);

  const starsEl = document.createElement('span');
  starsEl.className = 'stars-display';
  starsEl.textContent = (p.stars||0) > 0 ? '⭐'.repeat(Math.min(p.stars,5)) : '';

  topRow.appendChild(rankBadge);
  topRow.appendChild(starsEl);
  content.appendChild(topRow);

  // Row 2: Player name
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:1px;';
  const nameEl = document.createElement('div');
  nameEl.className = 'card-name';
  nameEl.id = `name-${p.id}`;
  nameEl.style.flex = '1';
  nameEl.textContent = p.name;
  nameRow.appendChild(nameEl);
  content.appendChild(nameRow);

  // Row 3: Score
  const isNeg = p.score < 0;
  const scoreEl = document.createElement('div');
  scoreEl.className = `card-score${isNeg ? ' negative' : ''}`;
  scoreEl.id = `score-disp-${p.id}`;
  scoreEl.textContent = (isNeg ? '👎 ' : '') + p.score;
  content.appendChild(scoreEl);

  // Row 4: Badges
  const badgesRow = document.createElement('div');
  badgesRow.className = 'card-badges';

  if (p.isInRecoveryMode) {
    const rb = document.createElement('span');
    rb.className = 'badge badge-recovery';
    rb.textContent = '🔄 Recovery';
    badgesRow.appendChild(rb);
  }

  const dangerInf = getDangerInfo(p.score, gameState.victoryTarget);
  const db = document.createElement('span');
  db.className = `badge ${dangerInf.cls}`;
  db.textContent = `${dangerInf.emoji} ${dangerInf.text}`;
  badgesRow.appendChild(db);

  content.appendChild(badgesRow);

  // Row 5: Progress bar
  const pct = Math.max(0, Math.min(100, (p.score / gameState.victoryTarget) * 100));
  const pbWrap = document.createElement('div');
  pbWrap.className = 'card-progress';
  const pbFill = document.createElement('div');
  pbFill.className = 'card-progress-fill';
  pbFill.style.width = pct + '%';
  pbWrap.appendChild(pbFill);
  content.appendChild(pbWrap);

  // Row 6: Score input
  const inputRow = document.createElement('div');
  inputRow.className = 'card-input-row';
  const inp = document.createElement('input');
  inp.type = 'number';
  inp.className = 'card-score-input';
  inp.id = `input-${p.id}`;
  inp.placeholder = '±score';
  inp.setAttribute('inputmode', 'numeric');
  inp.min = '-9999';
  inp.max = '1000';
  inputRow.appendChild(inp);
  content.appendChild(inputRow);

  card.appendChild(content);
  return card;
}

function renderBurnPanel() {
  const panel = document.getElementById('burn-panel');
  if (!panel) return;

  if (!gameState.burnCandidates || gameState.burnCandidates.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  const list = document.getElementById('burn-candidate-list');
  if (!list) return;
  list.innerHTML = '';

  gameState.burnCandidates.forEach((c, idx) => {
    const item = document.createElement('div');
    item.className = 'burn-candidate';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.id = `burn-cb-${idx}`;
    cb.value = idx;
    cb.checked = true;
    const lbl = document.createElement('label');
    lbl.htmlFor = `burn-cb-${idx}`;
    lbl.innerHTML = `🔥 <strong>${escHtml(c.attackerName)}</strong> membakar <strong>${escHtml(c.victimName)}</strong>`;
    item.appendChild(cb);
    item.appendChild(lbl);
    list.appendChild(item);
  });
}

function renderAIComment() {
  const el = document.getElementById('ai-comment-text');
  if (el) el.textContent = gameState.aiComment || '...';
}

function renderTabContent(tabId) {
  const area = document.getElementById('tab-content-' + tabId);
  if (!area) return;

  switch(tabId) {
    case 'ranking': {
      const rankMap = calculateRanking(gameState.players);
      const sorted = [...gameState.players].sort((a,b) => rankMap[a.id] - rankMap[b.id]);
      area.innerHTML = `<table class="rank-table">
        <thead><tr><th>#</th><th>Player</th><th>Score</th><th>⭐</th><th>🔥</th></tr></thead>
        <tbody>${sorted.map(p => `<tr>
          <td><span class="rank-badge rank-${rankMap[p.id]}" style="display:inline-block">#${rankMap[p.id]}</span></td>
          <td>${escHtml(p.name)}</td>
          <td style="color:${p.score<0?'#e53935':'inherit'};font-weight:700">${p.score}</td>
          <td>${(p.stars||0)}</td>
          <td>${(p.burns||0)}</td>
        </tr>`).join('')}</tbody>
      </table>`;
      break;
    }
    case 'history': {
      if (!gameState.history || gameState.history.length === 0) {
        area.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:0.75rem;padding:6px">No history yet.</div>';
        return;
      }
      const rev = [...gameState.history].reverse();
      area.innerHTML = rev.map(h => {
        const burnsHtml = h.burns && h.burns.length > 0
          ? h.burns.map(b => `<span class="history-burn">🔥${escHtml(b.attackerName)}→${escHtml(b.victimName)}</span>`).join(' ')
          : '';
        const sc = h.scoreChanges
          ? Object.entries(h.scoreChanges).map(([nm,v]) => `${escHtml(nm)}: ${v>0?'+':''}${v}`).join(' | ')
          : '';
        return `<div class="history-entry"><span class="history-turn">R${h.round}T${h.turn}</span> <span>${sc}</span> ${burnsHtml}</div>`;
      }).join('');
      break;
    }
    case 'achievements': {
      let html = '';
      Object.entries(gameState.achievements||{}).forEach(([pname, achs]) => {
        if (!achs || achs.length === 0) return;
        html += `<div class="section-title" style="margin-top:4px">${escHtml(pname)}</div>`;
        achs.forEach(a => {
          html += `<div class="ach-item unlocked">${a.emoji} ${a.label}</div>`;
        });
      });
      if (!html) html = '<div style="color:rgba(255,255,255,0.4);font-size:0.75rem;padding:6px">No achievements yet.</div>';
      area.innerHTML = html;
      break;
    }
    case 'statistics': {
      if (!gameState.players.length) { area.innerHTML = ''; return; }
      area.innerHTML = `<div class="stats-grid">${gameState.players.map(p => `
        <div class="stat-card">
          <div class="stat-label">${escHtml(p.name)}</div>
          <div class="stat-val">${p.score}</div>
          <div class="stat-label">Score · ⭐${p.stars||0}</div>
          <div class="stat-label">🔥Burns: ${p.burns||0}</div>
          <div class="stat-label">💀Burned: ${p.burned||0}x</div>
          <div class="stat-label">Best: ${p.highestScore||0}</div>
        </div>`).join('')}
      </div>`;
      break;
    }
    case 'archive': {
      const entries = Object.values(gameState.playerArchive||{});
      if (entries.length === 0) {
        area.innerHTML = '<div style="color:rgba(255,255,255,0.4);font-size:0.75rem;padding:6px">No archive yet.</div>';
        return;
      }
      area.innerHTML = entries.map(a => `
        <div class="archive-item">
          <span class="archive-name">${escHtml(a.name)}</span>
          <span style="font-size:0.65rem;color:rgba(255,255,255,0.5)">⭐${a.stars||0} 🔥${a.burns||0} 💥${a.tripleBurn||0} Best:${a.highestScore||0}</span>
        </div>`).join('');
      break;
    }
    case 'chart': {
      renderChart();
      break;
    }
  }
}

// ============================================================
// CHART RENDERER
// ============================================================
function renderChart() {
  const canvas = document.getElementById('score-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const data = gameState.chartData || [];
  const w = canvas.offsetWidth || canvas.parentElement?.offsetWidth || 280;
  const h = 180;
  canvas.width = w;
  canvas.height = h;
  ctx.clearRect(0, 0, w, h);

  if (data.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('No chart data yet.', 20, 80);
    return;
  }

  const COLORS = ['#c9a84c','#b0b8c1','#cd7f32','#e53935'];
  const pad = { t:12, r:8, b:22, l:34 };
  const pw = w - pad.l - pad.r;
  const ph = h - pad.t - pad.b;

  const ids = gameState.players.map(p => p.id);
  let allScores = [0];
  data.forEach(d => ids.forEach(id => { if (d.scores[id] !== undefined) allScores.push(d.scores[id]); }));
  const minS = Math.min(0, ...allScores);
  const maxS = Math.max(gameState.victoryTarget, ...allScores);
  const range = maxS - minS || 1;

  // Background grid
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (ph/4)*i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l+pw, y); ctx.stroke();
    const val = Math.round(maxS - (range/4)*i);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(val, pad.l-2, y+3);
  }

  // Lines per player
  ids.forEach((id, pi) => {
    const player = gameState.players.find(p => p.id === id);
    if (!player) return;
    const color = COLORS[pi % COLORS.length];
    const pts = data.map((d, di) => ({
      x: pad.l + (di / Math.max(data.length-1, 1)) * pw,
      y: pad.t + ph - (((d.scores[id]||0) - minS) / range) * ph,
    }));
    if (pts.length < 1) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
    pts.forEach(pt => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3, 0, Math.PI*2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    // Legend
    ctx.fillStyle = color;
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(player.name.substring(0,8), pad.l + pi*62, h-4);
  });
}

// ============================================================
// NEW ROUND PAGE
// ============================================================
function renderNewRoundPage() {
  const page = document.getElementById('new-round-page');
  if (!page) return;

  const playerFields = gameState.players.map((p,i) => `
    <div class="input-group">
      <label>${SETUP_ANIMAL_EMOJI[p.setupPos]} Player ${i+1} (${SETUP_ANIMAL[p.setupPos]})</label>
      <input type="text" id="nr-player-${p.id}" value="${escAttr(p.name)}" placeholder="${escAttr(p.name)}" maxlength="20">
    </div>`).join('');

  page.innerHTML = `
    <div style="max-width:480px;margin:0 auto;padding:16px 16px 30px;">
      <img src="images/joker.png" alt="Logo" style="display:block;width:60px;height:60px;object-fit:contain;margin:0 auto 8px;filter:drop-shadow(0 0 10px #c9a84c);" onerror="this.style.display='none'">
      <div style="text-align:center;font-size:1.3rem;font-weight:800;color:#c9a84c;letter-spacing:2px;">⭐ ROUND COMPLETE!</div>
      <div style="text-align:center;font-size:0.75rem;color:rgba(255,255,255,0.6);margin-bottom:14px;">Starting Round ${gameState.round + 1}</div>

      <div class="setup-card">
        <h3>🎯 Victory Target</h3>
        <div class="input-group">
          <select id="nr-target">
            <option value="500" ${gameState.victoryTarget===500?'selected':''}>500 points</option>
            <option value="750" ${gameState.victoryTarget===750?'selected':''}>750 points</option>
            <option value="1000" ${gameState.victoryTarget===1000?'selected':''}>1000 points</option>
            <option value="1500" ${gameState.victoryTarget===1500?'selected':''}>1500 points</option>
            <option value="custom">Custom...</option>
          </select>
        </div>
        <div id="nr-custom-wrap" class="input-group" style="display:none;">
          <input type="number" id="nr-custom-val" placeholder="Enter custom target" min="100" max="99999">
        </div>
      </div>

      <div class="setup-card" style="margin-top:8px;">
        <h3>👥 Players</h3>
        ${playerFields}
      </div>

      <button class="btn btn-gold btn-full" id="nr-start-btn" style="font-size:1rem;padding:14px;margin-top:12px;">
        🎮 START NEW ROUND
      </button>
    </div>`;

  const nrSel = page.querySelector('#nr-target');
  const nrCW  = page.querySelector('#nr-custom-wrap');
  if (nrSel && nrCW) {
    nrSel.addEventListener('change', () => {
      nrCW.style.display = nrSel.value === 'custom' ? '' : 'none';
    });
  }

  const nrBtn = page.querySelector('#nr-start-btn');
  if (nrBtn) {
    nrBtn.addEventListener('click', () => {
      playClickSound();
      startNewRound();
    });
  }
}

// ============================================================
// GAME INITIALIZATION
// ============================================================
function initGame(playerNames, victoryTarget) {
  const prevArchive = gameState.playerArchive || {};

  const players = playerNames.map((name, i) => {
    const arch = prevArchive[name] || {};
    return {
      id: 'p' + (i+1),
      name: name,
      setupPos: i,
      score: 0,
      stars:       arch.stars       || 0,
      rank: i+1,
      prevRank: i+1,
      burns:       arch.burns       || 0,
      burned:      arch.burned      || 0,
      tripleBurn:  arch.tripleBurn  || 0,
      highestScore:arch.highestScore|| 0,
      isInRecoveryMode: false,
      recoveryStartTurn: null,
      consecutiveMinus: 0,
      consecutiveMinusWavPlayed: false,
      burnedBy: null,
      chartScores: [],
    };
  });

  gameState.screen = 'game';
  gameState.round = gameState.round || 1;
  gameState.turn = 0;
  gameState.victoryTarget = victoryTarget;
  gameState.players = players;
  gameState.history = [];
  gameState.burnCandidates = [];
  gameState.burnHistory = [];
  gameState.chartData = [];
  gameState.aiComment = '🎮 Permainan dimulai!';
  gameState.prevRankMap = null;

  // Ensure achievements map
  players.forEach(p => {
    if (!gameState.achievements[p.name]) gameState.achievements[p.name] = [];
  });

  updateArchive();
  saveState();
  render();
  speakWithDuck('Permainan dimulai');
}

function startNewRound() {
  const page = document.getElementById('new-round-page');
  let newTarget = gameState.victoryTarget;
  const nrSel = page ? page.querySelector('#nr-target') : null;
  if (nrSel) {
    if (nrSel.value === 'custom') {
      const cv = parseInt(page.querySelector('#nr-custom-val')?.value);
      newTarget = (cv && cv > 0) ? cv : gameState.victoryTarget;
    } else {
      newTarget = parseInt(nrSel.value) || gameState.victoryTarget;
    }
  }

  const newNames = gameState.players.map(p => {
    const inp = page ? page.querySelector(`#nr-player-${p.id}`) : null;
    const val = inp ? inp.value.trim() : '';
    return val || p.name;
  });

  gameState.round += 1;
  gameState.turn = 0;
  gameState.victoryTarget = newTarget;
  gameState.burnCandidates = [];
  gameState.prevRankMap = null;
  gameState.chartData = [];
  gameState.history = [];
  gameState.burnHistory = [];
  gameState.aiComment = '';

  gameState.players = gameState.players.map((p, i) => ({
    ...p,
    name: newNames[i],
    score: 0,
    rank: i+1,
    prevRank: i+1,
    isInRecoveryMode: false,
    recoveryStartTurn: null,
    consecutiveMinus: 0,
    consecutiveMinusWavPlayed: false,
    burnedBy: null,
  }));

  // Ensure achievement entries for new names
  gameState.players.forEach(p => {
    if (!gameState.achievements[p.name]) gameState.achievements[p.name] = [];
  });

  updateArchive();
  gameState.screen = 'game';
  saveState();
  render();
  ensureBorderVideosPlaying();
  speakWithDuck('Permainan dimulai');
}

// ============================================================
// SAVE TURN
// ============================================================
async function saveTurn() {
  // Collect inputs
  const inputs = {};
  gameState.players.forEach(p => {
    const inp = document.getElementById(`input-${p.id}`);
    const raw = inp ? inp.value.trim() : '';
    if (raw === '') {
      inputs[p.id] = 0;
    } else {
      let num = parseInt(raw);
      if (isNaN(num)) num = 0;
      inputs[p.id] = num; // negative unlimited; positive max 1000
      if (num > 1000) inputs[p.id] = 1000;
    }
  });

  // Push undo snapshot BEFORE changes
  pushUndo();

  // Advance turn
  gameState.turn += 1;

  // Step 1: Update recovery status at start of this turn
  const prevPlayers = deepClone(gameState.players);
  gameState.players = updateRecoveryStatus(gameState.players, gameState.turn);

  // Get prevRankMap BEFORE applying scores
  const prevRankMap = (gameState.turn <= 1)
    ? (() => { const m={}; gameState.players.forEach((p,i)=>{ m[p.id]=i+1; }); return m; })()
    : (gameState.prevRankMap || (() => { const m={}; gameState.players.forEach((p,i)=>{ m[p.id]=i+1; }); return m; })());

  // Step 2: Apply scores
  const scoreChanges = {};
  gameState.players = gameState.players.map(p => {
    const delta = inputs[p.id] || 0;
    const newScore = p.score + delta;
    scoreChanges[p.name] = delta;
    let cm = p.consecutiveMinus;
    let cmPlayed = p.consecutiveMinusWavPlayed;
    if (delta < 0) { cm++; } else { cm = 0; cmPlayed = false; }
    const hs = Math.max(p.highestScore||0, newScore);
    return { ...p, score: newScore, consecutiveMinus: cm, consecutiveMinusWavPlayed: cmPlayed, highestScore: hs };
  });

  // Step 3: Recalculate ranking
  const newRankMap = calculateRanking(gameState.players);
  gameState.players = gameState.players.map(p => ({
    ...p,
    prevRank: prevRankMap[p.id] || p.rank,
    rank: newRankMap[p.id],
  }));
  gameState.prevRankMap = newRankMap;

  // Step 4: Detect burn candidates
  const newBurnCandidates = detectBurnCandidates(
    prevRankMap, newRankMap,
    prevPlayers, gameState.players,
    gameState.turn
  );
  gameState.burnCandidates = newBurnCandidates;

  // Step 5: Chart data
  const chartEntry = { round: gameState.round, turn: gameState.turn, scores: {} };
  gameState.players.forEach(p => { chartEntry.scores[p.id] = p.score; });
  gameState.chartData.push(chartEntry);

  // Step 6: History
  gameState.history.push({
    round: gameState.round,
    turn: gameState.turn,
    scoreChanges,
    burns: [],
  });

  // Step 7: AI analysis
  gameState.aiComment = generateAIComment();

  // Step 8: Check achievements
  checkAchievements();
  updateArchive();
  saveState();

  // Step 9: Card flip animation + score counters
  gameState.players.forEach(p => {
    const card = document.getElementById(`card-${p.id}`);
    if (card) {
      card.classList.remove('flip');
      void card.offsetWidth;
      card.classList.add('flip');
      setTimeout(() => card.classList.remove('flip'), 700);
    }
    const prevP = prevPlayers.find(pp => pp.id === p.id);
    const fromScore = prevP ? prevP.score : 0;
    animateScoreCounter(p.id, fromScore, p.score);
  });

  render();

  // Clear inputs
  gameState.players.forEach(p => {
    const inp = document.getElementById(`input-${p.id}`);
    if (inp) inp.value = '';
  });

  // Check consecutive minus WAV
  for (const p of gameState.players) {
    if (p.consecutiveMinus >= 3 && !p.consecutiveMinusWavPlayed) {
      gameState.players = gameState.players.map(pp =>
        pp.id === p.id ? { ...pp, consecutiveMinusWavPlayed: true } : pp
      );
      saveState();
      // Play after audio sequence
    }
  }

  // Check victory
  const winner = gameState.players.find(p => p.score >= gameState.victoryTarget);

  if (gameState.burnCandidates.length === 0) {
    // No burns — audio sequence immediately
    if (!winner) {
      await audioSequenceNoBurn();
    } else {
      await runWinSequence(winner);
    }
  } else {
    // Wait for user burn confirmation — no audio until then
    renderBurnPanel();
  }
}

// ============================================================
// AUDIO SEQUENCES
// ============================================================
async function audioSequenceNoBurn() {
  await shuffleAndScoreTTS();
}

async function shuffleAndScoreTTS() {
  // Shuffle card TTS
  const shuffler = findShuffler();
  if (shuffler) {
    await speakWithDuck(`${shuffler.name} tolong kocok kartunya ya`);
  }
  // Total score TTS
  for (const p of gameState.players) {
    await speakWithDuck(`${p.name} mendapatkan ${numberToBahasaIndonesia(p.score)} poin`);
  }
  // Consecutive minus WAV
  for (const p of gameState.players) {
    if (p.consecutiveMinus >= 3 && p.consecutiveMinusWavPlayed) {
      await playWavWithDuck('audio/kok_minus_terus_sih_gamau_menang.wav');
      break;
    }
  }
  // Mulai dari 0
  for (const p of gameState.players) {
    if (p.score < 0) {
      await playWavWithDuck('audio/mulai_dari_0_ya_bapak.wav');
      break;
    }
  }
  // Random AI TTS
  const randomComment = AI_COMMENTS_RANDOM[Math.floor(Math.random() * AI_COMMENTS_RANDOM.length)];
  await speakWithDuck(randomComment);
}

function findShuffler() {
  const ps = gameState.players;
  if (!ps || ps.length === 0) return null;
  // Most negative
  const negatives = ps.filter(p => p.score < 0);
  if (negatives.length > 0) {
    return negatives.reduce((a,b) => a.score < b.score ? a : b);
  }
  // No negative: smallest score
  return ps.reduce((a,b) => a.score < b.score ? a : b);
}

// ============================================================
// CONFIRM BURN
// ============================================================
async function confirmBurn() {
  const checkboxes = document.querySelectorAll('#burn-candidate-list input[type=checkbox]:checked');
  const selectedIndices = Array.from(checkboxes).map(cb => parseInt(cb.value));
  const selected = selectedIndices.map(i => gameState.burnCandidates[i]).filter(Boolean);

  if (selected.length === 0) {
    await cancelBurn();
    return;
  }

  // Push undo before burn changes
  pushUndo();

  // Group by attacker
  const byAttacker = {};
  selected.forEach(c => {
    if (!byAttacker[c.attackerId]) byAttacker[c.attackerId] = [];
    byAttacker[c.attackerId].push(c);
  });

  const burnRecords = [];

  for (const [attackerId, victims] of Object.entries(byAttacker)) {
    const isTriple = victims.length >= 3;

    // Update attacker stats
    gameState.players = gameState.players.map(p => {
      if (p.id !== attackerId) return p;
      return {
        ...p,
        burns: (p.burns||0) + victims.length,
        tripleBurn: isTriple ? (p.tripleBurn||0) + 1 : (p.tripleBurn||0),
      };
    });

    // Process each victim
    victims.forEach(c => {
      gameState.players = gameState.players.map(p => {
        if (p.id !== c.victimId) return p;
        return {
          ...p,
          score: 0,
          burned: (p.burned||0) + 1,
          isInRecoveryMode: true,
          recoveryStartTurn: gameState.turn,
          burnedBy: attackerId,
        };
      });
      burnRecords.push(c);
    });

    // Screen shake for triple burn
    if (isTriple) {
      document.body.classList.add('screen-shake');
      setTimeout(() => document.body.classList.remove('screen-shake'), 800);
    }
  }

  // Update chart data — burned scores set to 0
  if (gameState.chartData.length > 0) {
    const last = gameState.chartData[gameState.chartData.length-1];
    burnRecords.forEach(c => { last.scores[c.victimId] = 0; });
  }

  // Update history
  if (gameState.history.length > 0) {
    gameState.history[gameState.history.length-1].burns = burnRecords;
  }
  burnRecords.forEach(c => {
    gameState.burnHistory.unshift({
      text: `🔥 ${c.attackerName} membakar ${c.victimName}`,
      round: gameState.round,
      turn: gameState.turn,
    });
  });

  gameState.burnCandidates = [];

  // Recalculate ranking after burns
  const newRankMap = calculateRanking(gameState.players);
  gameState.players = gameState.players.map(p => ({ ...p, rank: newRankMap[p.id] }));
  gameState.prevRankMap = newRankMap;

  checkAchievements();
  updateArchive();
  saveState();
  render();

  // Burn animations + card shakes
  burnRecords.forEach(c => {
    const attacker = gameState.players.find(p => p.id === c.attackerId);
    const victimCard = document.getElementById(`card-${c.victimId}`);
    if (attacker && victimCard) {
      triggerBurnAnimation(attacker.setupPos, victimCard);
    }
    if (victimCard) {
      victimCard.classList.remove('shake');
      void victimCard.offsetWidth;
      victimCard.classList.add('shake');
      setTimeout(() => victimCard.classList.remove('shake'), 800);
    }
  });

  // Check victory after burns
  const winner = gameState.players.find(p => p.score >= gameState.victoryTarget);

  // Audio sequence — STEP 3 burn TTS first
  for (const c of burnRecords) {
    await speakWithDuck(`${c.attackerName} membakar ${c.victimName}`);
  }

  if (winner) {
    await runWinSequence(winner);
  } else {
    await shuffleAndScoreTTS();
  }
}

async function cancelBurn() {
  playClickSound();
  gameState.burnCandidates = [];
  saveState();
  render();
  await shuffleAndScoreTTS();
}

// ============================================================
// BURN ANIMATION EFFECTS (CSS particle only, no GIF/video)
// ============================================================
function triggerBurnAnimation(attackerSetupPos, victimCardEl) {
  if (!victimCardEl) return;
  const overlay = document.createElement('div');
  overlay.className = 'burn-overlay';
  const animal = SETUP_ANIMAL[attackerSetupPos];
  switch(animal) {
    case 'Dragon': createFireEffect(overlay); break;
    case 'Tiger':  createSlashEffect(overlay); break;
    case 'Eagle':  createDiveEffect(overlay); break;
    case 'Qilin':  createLightningEffect(overlay); break;
  }
  victimCardEl.appendChild(overlay);
  setTimeout(() => { try { overlay.remove(); } catch(e) {} }, 2000);
}

function createFireEffect(container) {
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'fire-particle';
    const x = 5 + Math.random() * 90;
    const y = 10 + Math.random() * 70;
    const w = 4 + Math.random() * 7;
    const h2 = 8 + Math.random() * 14;
    const dur = (0.5 + Math.random() * 0.8).toFixed(2);
    const delay = (Math.random() * 0.5).toFixed(2);
    p.style.cssText = `left:${x}%;top:${y}%;width:${w}px;height:${h2}px;--dur:${dur}s;animation-delay:${delay}s;`;
    container.appendChild(p);
  }
}

function createSlashEffect(container) {
  const slashes = [
    { top:'15%', left:'15%', ang:'45deg' },
    { top:'30%', left:'35%', ang:'50deg' },
    { top:'50%', left:'55%', ang:'42deg' },
    { top:'20%', left:'60%', ang:'40deg' },
  ];
  slashes.forEach((s, i) => {
    const p = document.createElement('div');
    p.className = 'slash-particle';
    p.style.cssText = `top:${s.top};left:${s.left};--ang:${s.ang};height:${35+Math.random()*20}px;animation-delay:${i*0.1}s;`;
    container.appendChild(p);
  });
}

function createDiveEffect(container) {
  for (let i = 0; i < 6; i++) {
    const p = document.createElement('div');
    p.className = 'dive-particle';
    p.style.cssText = `top:${8+i*12}%;left:${8+i*12}%;animation-delay:${i*0.08}s;width:${15+Math.random()*18}px;`;
    container.appendChild(p);
  }
}

function createLightningEffect(container) {
  for (let i = 0; i < 5; i++) {
    const p = document.createElement('div');
    p.className = 'lightning-particle';
    p.style.cssText = `top:${5+i*18}%;left:${15+i*16}%;animation-delay:${i*0.09}s;height:${38+Math.random()*22}px;`;
    container.appendChild(p);
  }
}

// ============================================================
// WIN SEQUENCE
// ============================================================
async function runWinSequence(winner) {
  // Award star
  gameState.players = gameState.players.map(p =>
    p.id === winner.id ? { ...p, stars: (p.stars||0)+1, highestScore: Math.max(p.highestScore||0, p.score) } : p
  );
  checkAchievements();
  updateArchive();
  saveState();
  render();

  // Gold flash
  const flash = document.getElementById('gold-flash');
  if (flash) {
    flash.classList.add('active');
    setTimeout(() => flash.classList.remove('active'), 900);
  }

  // Reward video (true fullscreen)
  await playRewardVideo(winner);

  // TTS
  await speakWithDuck(`Selamat ya ${winner.name} mendapatkan bintang satu`);
  await speakWithDuck('Ronde selesai, selamat berjuang dan fokus');

  // Go to new round
  gameState.screen = 'newround';
  saveState();
  render();
}

function playRewardVideo(winner) {
  return new Promise(resolve => {
    const videoSrc = SETUP_REWARD_VIDEO[winner.setupPos];
    const overlay = document.getElementById('reward-overlay');
    const vid = document.getElementById('reward-video');
    if (!overlay || !vid) { resolve(); return; }

    // Duck background music
    if (bgMusic && !bgMusic.paused) bgMusic.volume = 0.15;

    const cleanup = () => {
      try {
        overlay.style.display = 'none';
        vid.pause();
        vid.src = '';
        if (bgMusic) bgMusic.volume = bgMusicVolume;
      } catch(e) {}
      resolve();
    };

    const timer = setTimeout(cleanup, 11500);

    vid.onended = () => { clearTimeout(timer); cleanup(); };
    vid.onerror = () => { clearTimeout(timer); cleanup(); };

    vid.src = videoSrc;
    vid.muted = false;
    vid.volume = 1.0;
    vid.loop = false;
    vid.playsInline = true;

    overlay.style.display = 'flex';

    vid.play().catch(err => {
      console.warn('Reward video play error:', err);
      // Try again (unmuted autoplay may need gesture context)
      setTimeout(() => {
        vid.muted = false;
        vid.play().catch(() => {
          // If all fails, just let timer fire
          console.warn('Reward video failed to play, will skip after timer');
        });
      }, 100);
    });
  });
}

// ============================================================
// SCORE COUNTER ANIMATION
// ============================================================
function animateScoreCounter(playerId, from, to) {
  const el = document.getElementById(`score-disp-${playerId}`);
  if (!el) return;
  const duration = 500;
  const start = performance.now();
  const diff = to - from;
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
    const cur = Math.round(from + diff * ease);
    el.textContent = (cur < 0 ? '👎 ' : '') + cur;
    el.className = `card-score${cur < 0 ? ' negative' : ''}`;
    if (t < 1) requestAnimationFrame(step);
    else {
      el.textContent = (to < 0 ? '👎 ' : '') + to;
      el.className = `card-score${to < 0 ? ' negative' : ''}`;
      el.classList.add('score-updated');
      setTimeout(() => el.classList.remove('score-updated'), 500);
    }
  }
  requestAnimationFrame(step);
}

// ============================================================
// AI COMMENTATOR
// ============================================================
function generateAIComment() {
  const ps = gameState.players;
  if (!ps || ps.length === 0) return AI_COMMENTS_RANDOM[0];
  const rankMap = calculateRanking(ps);
  const sorted = [...ps].sort((a,b) => rankMap[a.id] - rankMap[b.id]);
  const leader = sorted[0];
  const last   = sorted[sorted.length-1];
  const gap = leader.score - last.score;
  const contextComments = [];
  if (gap < 30 && gameState.turn > 1) contextComments.push(`⚡ Sangat ketat! Selisih hanya ${gap} poin!`);
  if (last.score < 0) contextComments.push(`💀 ${last.name} dalam zona bahaya dengan ${last.score} poin!`);
  if (leader.score >= gameState.victoryTarget * 0.8) contextComments.push(`🚀 ${leader.name} mendekati kemenangan!`);
  const recovering = ps.filter(p => p.isInRecoveryMode);
  if (recovering.length > 0) contextComments.push(`🔄 ${recovering.map(p=>p.name).join(', ')} dalam Recovery Mode.`);
  if (gameState.burnCandidates && gameState.burnCandidates.length > 0) contextComments.push(`🔥 Ada ${gameState.burnCandidates.length} kandidat burn!`);
  if (gameState.turn === 1) contextComments.push('🎮 Ronde baru dimulai! Semangat semua!');
  const all = [...contextComments, ...AI_COMMENTS_RANDOM];
  return all[Math.floor(Math.random() * all.length)];
}

// ============================================================
// ACHIEVEMENTS
// ============================================================
function checkAchievements() {
  gameState.players.forEach(p => {
    if (!gameState.achievements[p.name]) gameState.achievements[p.name] = [];
    ACHIEVEMENTS_DEF.forEach(def => {
      const has = gameState.achievements[p.name].find(a => a.id === def.id);
      if (!has && def.cond(p)) {
        gameState.achievements[p.name].push({ id: def.id, label: def.label, emoji: def.emoji });
      }
    });
  });
}

// ============================================================
// PLAYER ARCHIVE
// ============================================================
function updateArchive() {
  if (!gameState.players) return;
  gameState.players.forEach(p => {
    const ex = gameState.playerArchive[p.name] || { name:p.name, stars:0, burns:0, burned:0, tripleBurn:0, highestScore:0 };
    gameState.playerArchive[p.name] = {
      name: p.name,
      stars:        Math.max(ex.stars||0,        p.stars||0),
      burns:        Math.max(ex.burns||0,        p.burns||0),
      burned:       Math.max(ex.burned||0,       p.burned||0),
      tripleBurn:   Math.max(ex.tripleBurn||0,   p.tripleBurn||0),
      highestScore: Math.max(ex.highestScore||0, p.highestScore||0),
    };
  });
}

// ============================================================
// UNDO
// ============================================================
function undoAction() {
  stopAllAudio();

  // Stop reward video
  const overlay = document.getElementById('reward-overlay');
  const vid = document.getElementById('reward-video');
  if (overlay && overlay.style.display !== 'none') {
    overlay.style.display = 'none';
    if (vid) { try { vid.pause(); vid.src = ''; } catch(e) {} }
    try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e) {}
  }

  if (gameState.undoStack.length === 0) {
    showToast('Nothing to undo!');
    return;
  }

  const prev = gameState.undoStack.pop();
  const savedUndo = gameState.undoStack;
  gameState = { ...prev, undoStack: savedUndo };
  saveState();
  render();
  ensureBorderVideosPlaying();
  showToast('↩ Undone');
}

// ============================================================
// BORDER VIDEOS — ensure always playing
// ============================================================
function ensureBorderVideosPlaying() {
  setTimeout(() => {
    document.querySelectorAll('video[data-border-video]').forEach(v => {
      if (v.paused) v.play().catch(() => {});
    });
  }, 150);
}

// ============================================================
// EDIT NAMES MODAL
// ============================================================
function openEditNameModal() {
  const modal = document.getElementById('edit-name-modal');
  const fields = document.getElementById('edit-name-fields');
  if (!modal || !fields) return;
  fields.innerHTML = gameState.players.map(p => `
    <div class="input-group">
      <label>${SETUP_ANIMAL_EMOJI[p.setupPos]} ${SETUP_ANIMAL[p.setupPos]} (Setup ${p.setupPos+1})</label>
      <input type="text" id="edit-name-${p.id}" value="${escAttr(p.name)}" maxlength="20">
    </div>`).join('');
  modal.classList.add('active');
}

function closeEditNameModal() {
  const modal = document.getElementById('edit-name-modal');
  if (modal) modal.classList.remove('active');
}

function saveEditedNames() {
  gameState.players = gameState.players.map(p => {
    const inp = document.getElementById(`edit-name-${p.id}`);
    const newName = inp ? inp.value.trim() : '';
    if (!newName) return p;
    if (newName !== p.name) {
      // Migrate achievements
      if (gameState.achievements[p.name]) {
        gameState.achievements[newName] = [...(gameState.achievements[newName]||[]), ...gameState.achievements[p.name]];
        delete gameState.achievements[p.name];
      }
    }
    return { ...p, name: newName || p.name };
  });
  updateArchive();
  saveState();
  closeEditNameModal();
  render();
}

// ============================================================
// RESET GAME
// ============================================================
function resetGame() {
  if (!confirm('Reset entire game?\n(Statistics, achievements, and player archive will be preserved.)')) return;
  stopAllAudio();

  const savedAchievements = gameState.achievements;
  const savedArchive = gameState.playerArchive;

  gameState = {
    screen: 'setup',
    round: 1,
    turn: 0,
    victoryTarget: 1000,
    players: [],
    history: [],
    burnCandidates: [],
    burnHistory: [],
    achievements: savedAchievements,
    playerArchive: savedArchive,
    chartData: [],
    aiComment: '',
    musicOn: gameState.musicOn,
    lightMode: gameState.lightMode,
    prevRankMap: null,
    undoStack: [],
  };
  saveState();
  render();
}

// ============================================================
// SCREENSHOT
// ============================================================
function takeScreenshot() {
  showToast('📸 Use your device screenshot button (or browser screenshot tools).');
}

// ============================================================
// FULLSCREEN
// ============================================================
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => showToast('Fullscreen not supported'));
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

// ============================================================
// MUSIC TOGGLE
// ============================================================
function toggleMusic() {
  gameState.musicOn = !gameState.musicOn;
  if (bgMusic) {
    if (gameState.musicOn) bgMusic.play().catch(() => {});
    else bgMusic.pause();
  }
  saveState();
  renderHeader();
  const sb = document.getElementById('setup-music-btn');
  if (sb) sb.textContent = gameState.musicOn ? '🎵 Music' : '🔇 Music';
}

// ============================================================
// LIGHT MODE
// ============================================================
function applyLightMode() {
  document.body.classList.toggle('light-mode', !!gameState.lightMode);
}

function toggleLightMode() {
  gameState.lightMode = !gameState.lightMode;
  applyLightMode();
  saveState();
}

// ============================================================
// TOAST
// ============================================================
function showToast(msg, dur = 2500) {
  let el = document.getElementById('sc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sc-toast';
    el.style.cssText = 'position:fixed;bottom:88px;left:50%;transform:translateX(-50%);background:rgba(20,20,20,0.95);color:#fff;padding:8px 20px;border-radius:24px;font-size:0.8rem;z-index:9998;pointer-events:none;border:1px solid rgba(201,168,76,0.4);transition:opacity 0.3s;max-width:90vw;text-align:center;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = '0'; }, dur);
}

// ============================================================
// HTML HELPERS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  if (!str) return '';
  return String(str).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ============================================================
// EVENT LISTENERS SETUP
// ============================================================
function setupEventListeners() {

  // ── Setup page buttons
  const startBtn = document.getElementById('start-game-btn');
  if (startBtn) startBtn.addEventListener('click', () => {
    playClickSound();
    const names = [1,2,3,4].map(i => {
      const v = document.getElementById(`setup-player-${i}`)?.value.trim();
      return v || `Player ${i}`;
    });
    const sel = document.getElementById('setup-victory-target');
    let target = 1000;
    if (sel) {
      if (sel.value === 'custom') {
        const cv = parseInt(document.getElementById('setup-custom-target')?.value);
        target = (cv && cv > 0) ? cv : 1000;
      } else {
        target = parseInt(sel.value) || 1000;
      }
    }
    initGame(names, target);
  });

  const setupTargetSel = document.getElementById('setup-victory-target');
  if (setupTargetSel) {
    setupTargetSel.addEventListener('change', () => {
      const cw = document.getElementById('setup-custom-wrap');
      if (cw) cw.style.display = setupTargetSel.value === 'custom' ? '' : 'none';
    });
  }

  const setupLightBtn = document.getElementById('setup-light-btn');
  if (setupLightBtn) setupLightBtn.addEventListener('click', () => { playClickSound(); toggleLightMode(); });

  const setupMusicBtn = document.getElementById('setup-music-btn');
  if (setupMusicBtn) setupMusicBtn.addEventListener('click', () => { playClickSound(); toggleMusic(); });

  // ── Game header buttons
  const gameMusicBtn = document.getElementById('game-music-btn');
  if (gameMusicBtn) gameMusicBtn.addEventListener('click', () => { playClickSound(); toggleMusic(); });

  const gameLightBtn = document.getElementById('game-light-btn');
  if (gameLightBtn) gameLightBtn.addEventListener('click', () => { playClickSound(); toggleLightMode(); });

  const fsBtn = document.getElementById('fullscreen-btn');
  if (fsBtn) fsBtn.addEventListener('click', () => { playClickSound(); toggleFullscreen(); });

  const ssBtn = document.getElementById('screenshot-btn');
  if (ssBtn) ssBtn.addEventListener('click', () => { playClickSound(); takeScreenshot(); });

  // ── Action bar
  const saveTurnBtn = document.getElementById('save-turn-btn');
  if (saveTurnBtn) saveTurnBtn.addEventListener('click', () => {
    playClickSound();
    saveTurn();
  });

  const undoBtn = document.getElementById('undo-btn');
  if (undoBtn) undoBtn.addEventListener('click', () => {
    playClickSound();
    undoAction();
  });

  const gameMusicBottomBtn = document.getElementById('game-music-bottom-btn');
  if (gameMusicBottomBtn) gameMusicBottomBtn.addEventListener('click', () => { playClickSound(); toggleMusic(); });

  const gameEditBtn = document.getElementById('game-edit-btn');
  if (gameEditBtn) gameEditBtn.addEventListener('click', () => { playClickSound(); openEditNameModal(); });

  // ── Burn panel
  const confirmBurnBtn = document.getElementById('confirm-burn-btn');
  if (confirmBurnBtn) confirmBurnBtn.addEventListener('click', () => {
    playClickSound();
    confirmBurn();
  });

  const cancelBurnBtn = document.getElementById('cancel-burn-btn');
  if (cancelBurnBtn) cancelBurnBtn.addEventListener('click', () => {
    playClickSound();
    cancelBurn();
  });

  // ── Reset
  const resetBtn = document.getElementById('reset-btn');
  if (resetBtn) resetBtn.addEventListener('click', () => { playClickSound(); resetGame(); });

  // ── Edit name modal
  const editNameSaveBtn = document.getElementById('edit-name-save-btn');
  if (editNameSaveBtn) editNameSaveBtn.addEventListener('click', () => { playClickSound(); saveEditedNames(); });

  const editNameCancelBtn = document.getElementById('edit-name-cancel-btn');
  if (editNameCancelBtn) editNameCancelBtn.addEventListener('click', () => { playClickSound(); closeEditNameModal(); });

  // ── Reward skip button
  const rewardSkipBtn = document.getElementById('reward-skip-btn');
  if (rewardSkipBtn) {
    rewardSkipBtn.addEventListener('click', () => {
      const overlay = document.getElementById('reward-overlay');
      const vid = document.getElementById('reward-video');
      if (overlay) overlay.style.display = 'none';
      if (vid) { try { vid.pause(); vid.src = ''; } catch(e) {} }
      try { if (bgMusic) bgMusic.volume = bgMusicVolume; } catch(e) {}
    });
  }

  // ── Tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playClickSound();
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-content-area').forEach(a => {
        a.classList.toggle('active', a.id === 'tab-content-'+tabId);
      });
      renderTabContent(tabId);
    });
  });

  // ── Visibility change — keep border videos playing
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && gameState.screen === 'game') {
      ensureBorderVideosPlaying();
    }
  });

  // ── Unlock background music on first user interaction
  document.addEventListener('pointerdown', () => {
    if (bgMusic && bgMusic.paused && gameState.musicOn) bgMusic.play().catch(() => {});
  }, { once: true });

  // ── Close modal on overlay click
  const editModal = document.getElementById('edit-name-modal');
  if (editModal) {
    editModal.addEventListener('click', e => {
      if (e.target === editModal) closeEditNameModal();
    });
  }
}

// ============================================================
// BOOT
// ============================================================
function boot() {
  loadState();
  applyLightMode();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // Init background music
  initBgMusic();

  // Update setup music button text
  const smb = document.getElementById('setup-music-btn');
  if (smb) smb.textContent = gameState.musicOn ? '🎵 Music' : '🔇 Music';

  // Setup event listeners
  setupEventListeners();

  // Pre-fetch voices
  speechSynthesis.getVoices();

  // Wait for loading animation + voices
  Promise.all([
    new Promise(res => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) { res(); return; }
      const h = () => { speechSynthesis.removeEventListener('voiceschanged', h); res(); };
      speechSynthesis.addEventListener('voiceschanged', h);
      setTimeout(res, 2500);
    }),
    new Promise(res => setTimeout(res, 2700)),
  ]).then(() => {
    render();
    if (gameState.screen === 'game') ensureBorderVideosPlaying();

    const ls = document.getElementById('loading-screen');
    if (ls) {
      ls.classList.add('hidden');
      setTimeout(() => { ls.style.display = 'none'; }, 900);
    }
  });
}

// ── Start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
