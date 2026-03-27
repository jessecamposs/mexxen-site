const DOT_MAP = {
  1:[5], 2:[1,9], 3:[1,5,9],
  4:[1,3,7,9], 5:[1,3,5,7,9], 6:[1,3,4,6,7,9]
};

// Feature flag — set to true to re-enable the lives/elimination system
const FEATURE_LIVES = false;

let startLives = 6;
let startSips = 2;
let players = [];
let currentPlayerIdx = 0;
let throwCount = 0;
let maxThrows = 3;
let roundLog = [];
let roundNum = 1;
let mexCount = 0;
let hasRolled = false;
let ridderIdx = null;
let firstPlayerInRound = -1;
let roundMaxThrows = 3;
let nextRoundStarterIdx = -1;
let roundPlayerOrder = [];

function addPlayerInput(name='') {
  const container = document.getElementById('playerInputs');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <input class="player-input" type="text" placeholder="Speler ${idx}" value="${name}" maxlength="14">
    <button class="remove-btn" onclick="removePlayerInput(this)">×</button>
  `;
  container.appendChild(row);
}

function removePlayerInput(btn) {
  const container = document.getElementById('playerInputs');
  if (container.children.length <= 2) return;
  btn.parentElement.remove();
  Array.from(container.children).forEach((row, i) => {
    row.querySelector('input').placeholder = `Speler ${i+1}`;
  });
}

function changeStartLives(d) {
  startLives = Math.max(1, Math.min(10, startLives + d));
  document.getElementById('livesDisplay').textContent = startLives;
}

function changeSips(d) {
  startSips = Math.max(1, Math.min(10, startSips + d));
  document.getElementById('sipsDisplay').textContent = startSips;
}

function startGame() {
  const inputs = document.querySelectorAll('.player-input');
  const names = Array.from(inputs).map((el, i) => el.value.trim() || `Speler ${i+1}`);
  if (names.length < 2) return;
  players = names.map(name => ({ name, lives: startLives, lastScore: '—', lastNumeric: null, eliminated: false }));
  ridderIdx = null;
  currentPlayerIdx = 0;
  roundNum = 1;
  document.getElementById('setupScreen').style.display = 'none';
  const gs = document.getElementById('gameScreen');
  gs.style.display = 'flex';
  startRound();
}

document.addEventListener('DOMContentLoaded', () => {
  ['','',''].forEach(() => addPlayerInput());
});

function activePlayers() { return players.filter(p => !p.eliminated); }
function activeIndices() { return players.map((p,i) => p.eliminated ? -1 : i).filter(i => i >= 0); }

function startRound() {
  document.getElementById('roundLabel').textContent = `ronde ${roundNum}`;
  mexCount = 0;
  roundMaxThrows = 3;
  maxThrows = 3;
  roundLog = [];
  renderRoundLog();
  players.forEach(p => { p.lastScore = '—'; p.lastNumeric = null; });
  const ai = activeIndices();
  const startIdx = (nextRoundStarterIdx >= 0 && ai.includes(nextRoundStarterIdx)) ? nextRoundStarterIdx : ai[0];
  nextRoundStarterIdx = -1;
  const startPos = ai.indexOf(startIdx);
  roundPlayerOrder = [...ai.slice(startPos), ...ai.slice(0, startPos)];
  firstPlayerInRound = roundPlayerOrder[0];
  currentPlayerIdx = roundPlayerOrder[0];
  startTurn();
}

function startTurn() {
  throwCount = 0;
  hasRolled = false;
  maxThrows = roundMaxThrows;

  const p = players[currentPlayerIdx];
  document.getElementById('bannerName').textContent = p.name;
  document.getElementById('bannerMeta').textContent = `${p.lives} leven${p.lives !== 1 ? 's' : ''}`;

  document.getElementById('scoreVal').textContent = '—';
  document.getElementById('scoreVal').className = 'score-value';
  document.getElementById('scoreName').textContent = '';
  const rb = document.getElementById('rollBtn');
  rb.disabled = false;
  rb.textContent = 'Gooien';
  rb.style.background = 'var(--accent)';

  const nb = document.getElementById('nextBtn');
  nb.classList.remove('visible');
  nb.onclick = null;

  updateThrowDots();
  renderScoreboard();
  clearDice();
}

function roll() {
  if (throwCount >= maxThrows) return;
  const die1 = document.getElementById('die1');
  const die2 = document.getElementById('die2');
  die1.classList.add('rolling');
  die2.classList.add('rolling');
  const flash = document.getElementById('flash');
  flash.classList.add('go');
  setTimeout(() => flash.classList.remove('go'), 120);

  let frames = 0;
  const iv = setInterval(() => {
    renderDie(1, Math.ceil(Math.random()*6));
    renderDie(2, Math.ceil(Math.random()*6));
    if (++frames >= 8) {
      clearInterval(iv);
      const a = Math.ceil(Math.random()*6);
      const b = Math.ceil(Math.random()*6);
      renderDie(1, a);
      renderDie(2, b);
      die1.classList.remove('rolling');
      die2.classList.remove('rolling');

      const res = calcScore(a, b);
      throwCount++;
      hasRolled = true;
      updateThrowDots();
      showScore(res);

      if (res.cls === 'mex') { mexCount++; maxThrows = throwCount; }
      if (res.numeric === 32) { maxThrows = throwCount; }
      if (res.numeric === 31) { maxThrows = throwCount; }

      if (a === b) {
        if (a === 1) {
          // Double 1: this player becomes the new ridder
          ridderIdx = currentPlayerIdx;
          document.getElementById('ridderEmoji').textContent = '🗡️';
          document.getElementById('ridderTitle').textContent = players[currentPlayerIdx].name;
          document.getElementById('ridderSub').textContent = `${players[currentPlayerIdx].name} is de nieuwe ridder!`;
          document.getElementById('ridderOverlay').classList.add('open');
        } else if (ridderIdx !== null) {
          // Double 2–6: ridder must drink (sips = die value)
          const sips = a;
          const ridderName = players[ridderIdx].name;
          document.getElementById('ridderEmoji').textContent = '🍺';
          document.getElementById('ridderTitle').textContent = ridderName;
          document.getElementById('ridderSub').textContent = `De ridder moet ${sips} slok${sips !== 1 ? 'ken' : ''} drinken!`;
          document.getElementById('ridderOverlay').classList.add('open');
        }
      }

      players[currentPlayerIdx].lastScore = res.score;
      players[currentPlayerIdx].lastNumeric = res.numeric;
      roundLog.push({ name: players[currentPlayerIdx].name, score: res.score, numeric: res.numeric, cls: res.cls });
      renderRoundLog();
      renderScoreboard();

      const pos = roundPlayerOrder.indexOf(currentPlayerIdx);
      const isLast = pos === roundPlayerOrder.length - 1;
      const throwsDone = throwCount >= maxThrows;

      // First player's actual throw count sets the cap for everyone else
      // (31 doesn't count — the player's turn resets)
      if (throwsDone && currentPlayerIdx === firstPlayerInRound && res.numeric !== 31) {
        roundMaxThrows = throwCount;
      }

      if (throwsDone) {
        document.getElementById('rollBtn').disabled = true;
        document.getElementById('rollBtn').style.background = '#222';
      }

      if (res.numeric === 31) {
        const nb = document.getElementById('nextBtn');
        nb.textContent = 'Gooi opnieuw →';
        nb.classList.add('visible');
        nb.onclick = startTurn;
      } else if (isLast && throwsDone) {
        const nb = document.getElementById('nextBtn');
        nb.textContent = 'Ronde afsluiten →';
        nb.classList.add('visible');
        nb.onclick = endRound;
      } else if (throwsDone) {
        const nb = document.getElementById('nextBtn');
        nb.textContent = 'Volgende speler →';
        nb.classList.add('visible');
        nb.onclick = nextPlayer;
      }
    }
  }, 50);
}

function nextPlayer() {
  if (!hasRolled) return;
  const pos = roundPlayerOrder.indexOf(currentPlayerIdx);
  if (pos < roundPlayerOrder.length - 1) {
    currentPlayerIdx = roundPlayerOrder[pos + 1];
    startTurn();
  } else {
    endRound();
  }
}

function endRound() {
  const finalMap = {};
  for (const entry of roundLog) finalMap[entry.name] = entry;
  const scores = Object.values(finalMap);
  if (scores.length === 0) return;

  const minNumeric = Math.min(...scores.map(s => s.numeric));
  const losers = scores.filter(s => s.numeric === minNumeric);
  const penalty = 1 + mexCount;
  const sipsTotal = startSips + mexCount;

  if (FEATURE_LIVES) {
    for (const loser of losers) {
      const p = players.find(pl => pl.name === loser.name);
      if (!p) continue;
      p.lives = Math.max(0, p.lives - penalty);
      if (p.lives === 0) p.eliminated = true;
    }
  }

  // First surviving loser starts the next round
  const firstSurvivorLoser = losers.find(l => !players.find(p => p.name === l.name)?.eliminated);
  nextRoundStarterIdx = firstSurvivorLoser
    ? players.findIndex(p => p.name === firstSurvivorLoser.name)
    : -1;

  renderScoreboard();

  if (FEATURE_LIVES) {
    const remaining = activePlayers();
    if (remaining.length <= 1) {
      const winner = remaining[0] || players.reduce((best, p) => (!best || p.lives > best.lives) ? p : best, null);
      document.getElementById('winnerTitle').textContent = winner.name;
      document.getElementById('winnerSub').textContent = `Winnaar na ${roundNum} rondes.\nProost!`;
      document.getElementById('winnerOverlay').classList.add('open');
      return;
    }
  }

  const loserNames = losers.map(l => l.name).join(' & ');
  let sub = `${sipsTotal} slok${sipsTotal !== 1 ? 'ken' : ''} drinken`;
  if (mexCount > 0) sub += ` (${mexCount}x Mex)`;
  if (FEATURE_LIVES) {
    const eliminated = losers.filter(l => players.find(p => p.name === l.name)?.eliminated);
    sub += `. ${penalty} leven${penalty !== 1 ? 's' : ''} kwijt.`;
    if (eliminated.length > 0) sub += `\n\n${eliminated.map(e => e.name).join(' & ')} uit het spel!`;
  }

  document.getElementById('loserTitle').textContent = loserNames;
  document.getElementById('loserSub').textContent = sub;
  document.getElementById('loserOverlay').classList.add('open');
}

function closeLoserModal() {
  document.getElementById('loserOverlay').classList.remove('open');
  roundNum++;
  if (FEATURE_LIVES) {
    const remaining = activePlayers();
    if (remaining.length <= 1) {
      const winner = remaining[0];
      document.getElementById('winnerTitle').textContent = winner ? winner.name : '—';
      document.getElementById('winnerSub').textContent = `Winnaar na ${roundNum-1} rondes.\nProost!`;
      document.getElementById('winnerOverlay').classList.add('open');
      return;
    }
  }
  startRound();
}

function closeRidderModal() {
  document.getElementById('ridderOverlay').classList.remove('open');
}

function resetGame() {
  document.getElementById('loserOverlay').classList.remove('open');
  document.getElementById('winnerOverlay').classList.remove('open');
  document.getElementById('gameScreen').style.display = 'none';
  document.getElementById('setupScreen').style.display = 'flex';
}

function renderDie(dieNum, val) {
  for (let i = 1; i <= 9; i++)
    document.getElementById(`d${dieNum}-${i}`).classList.toggle('active', DOT_MAP[val].includes(i));
}
function clearDice() {
  for (let d = 1; d <= 2; d++)
    for (let i = 1; i <= 9; i++)
      document.getElementById(`d${d}-${i}`).classList.remove('active');
}

function calcScore(a, b) {
  if ((a===1&&b===2)||(a===2&&b===1)) return { score:'MEX', numeric:9999, name:'Mex!', cls:'mex' };
  if (a === b) { const v=a*100; const name = a===1 ? 'Dubbel 1 — ridder! 🗡️' : `Dubbel ${a}`; return { score:v, numeric:v, name, cls:'high' }; }
  const high=Math.max(a,b), low=Math.min(a,b);
  if (high===3&&low===1) return { score:31, numeric:31, name:'31 — aanwijzen 🍺', cls:'low' };
  const val=high*10+low;
  if (val === 32) return { score:32, numeric:32, name:'32 — vast!', cls:'low' };
  return { score:val, numeric:val, name:'', cls: val>=54?'high':val<=32?'low':'' };
}

function showScore(res) {
  const sv = document.getElementById('scoreVal');
  sv.textContent = res.score;
  sv.className = 'score-value ' + res.cls;
  const sn = document.getElementById('scoreName');
  sn.textContent = res.name;
  sn.className = 'score-name' + (res.cls==='mex'?' special':'');
}

function updateThrowDots() {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`t${i}`);
    el.style.opacity = i > maxThrows ? '0.2' : '1';
    if (i < throwCount) el.className = 'throw-dot used';
    else if (i === throwCount) el.className = 'throw-dot current';
    else el.className = 'throw-dot';
  }
}

function renderScoreboard() {
  const sb = document.getElementById('scoreboard');
  sb.innerHTML = players.map((p, i) => {
    const isActive = i === currentPlayerIdx && !p.eliminated;
    const pips = FEATURE_LIVES ? Array.from({length: startLives}, (_, j) =>
      `<div class="life-pip ${j >= p.lives ? 'gone' : ''}"></div>`
    ).join('') : '';
    const sc = p.lastScore === 'MEX' ? 'mex' : (p.lastNumeric !== null && p.lastNumeric <= 32 && p.lastScore !== '—') ? 'low' : '';
    return `<div class="score-row ${isActive?'active-turn':''} ${p.eliminated?'eliminated':''}">
      <span class="sr-name">${p.name}${i === ridderIdx ? ' 🗡️' : ''}</span>
      <div class="sr-lives">${pips}</div>
      <span class="sr-last ${sc}">${p.lastScore}</span>
    </div>`;
  }).join('');
}

function renderRoundLog() {
  const rl = document.getElementById('roundLog');
  rl.innerHTML = roundLog.length === 0 ? '' : roundLog.map(e => `
    <div class="rh-item">
      <span class="rh-name">${e.name}</span>
      <span class="rh-score ${e.cls==='mex'?'mex':e.cls==='low'?'low':''}">${e.score}</span>
    </div>`).join('');
}

function toggleRef() { document.getElementById('refTable').classList.toggle('open'); }
