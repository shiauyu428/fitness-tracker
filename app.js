(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------
  const KEY_SESSIONS = 'fitness_sessions_v1';
  const KEY_WEIGHT = 'fitness_bodyweight_v1';

  const DB = {
    loadSessions() {
      try { return JSON.parse(localStorage.getItem(KEY_SESSIONS)) || []; }
      catch { return []; }
    },
    saveSessions(sessions) { localStorage.setItem(KEY_SESSIONS, JSON.stringify(sessions)); scheduleSync(); },
    loadWeights() {
      try { return JSON.parse(localStorage.getItem(KEY_WEIGHT)) || []; }
      catch { return []; }
    },
    saveWeights(list) { localStorage.setItem(KEY_WEIGHT, JSON.stringify(list)); scheduleSync(); },
  };

  let sessions = DB.loadSessions();
  let weights = DB.loadWeights();

  // ---------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------
  const CATEGORIES = ['胸', '背', '腿', '肩', '手臂', '核心', '有氧', '其他'];
  const SORENESS_LEVELS = {
    none: { label: '無酸痛', emoji: '✅' },
    mild: { label: '輕度', emoji: '🙂' },
    moderate: { label: '中度', emoji: '😣' },
    severe: { label: '太強', emoji: '🥵' },
  };
  // Each preset: { name, inputType?, variants? }. inputType defaults to 'weight_reps'.
  const PRESETS = {
    '胸': [
      { name: '槓鈴臥推' },
      { name: '啞鈴臥推' },
      { name: '上斜臥推' },
      { name: '蝴蝶機夾胸' },
      { name: '伏地挺身', inputType: 'reps_only', variants: ['推牆', '跪姿', '槓上'] },
    ],
    '背': [
      { name: '硬舉' },
      { name: '引體向上' },
      { name: '槓鈴划船' },
      { name: '滑輪下拉' },
      { name: '坐姿划船' },
      { name: '單手划船', unilateral: true },
      { name: '闊背等長收縮(彈力繩)', inputType: 'duration' },
    ],
    '腿': [
      { name: '深蹲' },
      { name: '腿推' },
      { name: '腿彎舉' },
      { name: '腿伸展' },
      { name: '保加利亞分腿蹲', unilateral: true },
      { name: '分腿蹲', unilateral: true },
      { name: '側蹲' },
      { name: '登階', inputType: 'reps_only' },
      { name: '單腳硬舉 / 單腳RDL', unilateral: true },
      { name: '強化腳底板', inputType: 'reps_only' },
    ],
    '肩': [
      { name: '肩推' },
      { name: '側平舉' },
      { name: '直立划船' },
      { name: '反向飛鳥' },
      { name: '地雷管肩推', variants: ['站姿', '分腿站', '跪姿'], unilateral: true },
    ],
    '手臂': [
      { name: '二頭彎舉' },
      { name: '三頭下壓' },
      { name: '錘式彎舉' },
      { name: '窄握臥推' },
    ],
    '核心': [
      { name: '捲腹' },
      { name: '棒式' },
      { name: '懸吊抬腿' },
      { name: '俄羅斯轉體' },
      { name: 'Side Bend', inputType: 'reps_only' },
      { name: '哥本哈根棒式', inputType: 'duration' },
    ],
    '有氧': [
      { name: '跑步' },
      { name: '飛輪' },
      { name: '划船機' },
      { name: '登階機' },
    ],
    '其他': [],
  };

  // ---- User-managed additions/removals on top of the built-in PRESETS above ----
  const KEY_CUSTOM_PRESETS = 'fitness_custom_presets_v1'; // { category: [preset, ...] }
  const KEY_HIDDEN_PRESETS = 'fitness_hidden_presets_v1'; // ["category::name", ...]

  function loadCustomPresets() {
    try { return JSON.parse(localStorage.getItem(KEY_CUSTOM_PRESETS)) || {}; }
    catch { return {}; }
  }
  function saveCustomPresets() { localStorage.setItem(KEY_CUSTOM_PRESETS, JSON.stringify(customPresets)); }
  function loadHiddenPresets() {
    try { return JSON.parse(localStorage.getItem(KEY_HIDDEN_PRESETS)) || []; }
    catch { return []; }
  }
  function saveHiddenPresets() { localStorage.setItem(KEY_HIDDEN_PRESETS, JSON.stringify([...hiddenPresets])); }

  let customPresets = loadCustomPresets();
  let hiddenPresets = new Set(loadHiddenPresets());

  // The list actually shown in pickers: built-ins minus hidden, plus this category's custom ones.
  function effectivePresetsFor(category) {
    const base = (PRESETS[category] || []).filter(p => !hiddenPresets.has(`${category}::${p.name}`));
    const custom = customPresets[category] || [];
    return [...base, ...custom];
  }

  // ---------------------------------------------------------------------
  // Utils
  // ---------------------------------------------------------------------
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }
  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function addDays(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return toDateStr(d);
  }
  function fmtShort(dateStr) {
    const [, m, d] = dateStr.split('-');
    return `${parseInt(m)}/${parseInt(d)}`;
  }
  function fmtWeekday(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
  }
  function round1(n) { return Math.round(n * 10) / 10; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------
  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach(p => p.hidden = p.id !== tabId);
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    if (tabId === 'tab-history') renderHistory();
    if (tabId === 'tab-pr') renderPRList();
    if (tabId === 'tab-charts') renderCharts();
    if (tabId === 'tab-weight') renderWeightTab();
  }
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ---------------------------------------------------------------------
  // TAB 1: 新增紀錄 (Log)
  // ---------------------------------------------------------------------
  let draft = { exercises: [] };
  let editingSessionId = null;

  const sessionDateInput = document.getElementById('sessionDate');
  sessionDateInput.value = todayStr();

  const exerciseListEl = document.getElementById('exerciseList');
  const liveSummaryEl = document.getElementById('liveSummary');

  function draftVolume() {
    return draft.exercises.reduce((sum, ex) => sum + window.Calc.exerciseVolume(ex), 0);
  }
  function draftSetCount() {
    return draft.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  }

  // Working (non-warm-up) sets only — mirrors calc.js's own warmup exclusion
  // for exercise types calc.js doesn't handle the totals for (reps-only, duration).
  function workingSets(ex) { return ex.sets.filter(s => !s.warmup); }

  // `unilateral` (each side trained separately) and `dualWeight` (a weight in each
  // hand, e.g. 8+8kg) are independent — any combination is valid.
  function weightText(ex, w) { return ex.dualWeight ? `${w}+${w}` : `${w}`; }
  // Per-exercise toggles in the draft card; dualWeight only makes sense when a weight is logged.
  function exFlagRowHtml(ex) {
    const dual = ex.inputType === 'weight_reps'
      ? `<button class="chip chip-sm${ex.dualWeight ? ' selected' : ''}" data-action="toggle-dual" data-ex-id="${ex.id}" title="左右手各拿一個重量，例如 8+8kg">雙持（各拿一個）</button>`
      : '';
    return `<div class="chip-row ex-flag-row">
      <button class="chip chip-sm${ex.unilateral ? ' selected' : ''}" data-action="toggle-unilateral" data-ex-id="${ex.id}" title="左右邊分開各做一次">單邊（左右各做）</button>${dual}
    </div>`;
  }
  function exBadgesHtml(ex) {
    return (ex.unilateral ? '<span class="uni-badge">單邊</span>' : '') + (ex.dualWeight ? '<span class="uni-badge">雙持</span>' : '');
  }

  // Per-exercise footer summary, depending on how this exercise is logged.
  function exerciseFooterText(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    if (ex.inputType === 'reps_only') {
      const total = workingSets(ex).reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
      return ex.unilateral ? `總次數：${total} 下（左右各算）` : `總次數：${total} 下`;
    }
    if (ex.inputType === 'duration') {
      const total = workingSets(ex).reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
      return ex.unilateral ? `總時間：${total} 秒（左右各算）` : `總時間：${total} 秒`;
    }
    const vol = round1(window.Calc.exerciseVolume(ex));
    const notes = [ex.unilateral ? '左右各做' : '', ex.dualWeight ? '雙持' : ''].filter(Boolean).join('、');
    return `這動作總量：${vol} kg${notes ? `（${notes}）` : ''}`;
  }

  // Generic single-number "how much was done" for an exercise, regardless of
  // logging type: kg for weight×reps, total reps for reps-only, total seconds for duration.
  // Warm-up sets are excluded, same as calc.js does for the weight×reps case.
  function exerciseMetric(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    if (ex.inputType === 'reps_only') return workingSets(ex).reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
    if (ex.inputType === 'duration') return workingSets(ex).reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
    return window.Calc.exerciseVolume(ex);
  }
  function exerciseMetricUnit(ex) {
    if (ex.inputType === 'reps_only') return '下';
    if (ex.inputType === 'duration') return '秒';
    return 'kg';
  }

  // Past occurrences of an exercise (by exact name) within the last `days` days,
  // newest first. Excludes the session currently being edited so a re-save doesn't
  // compare against its own prior version.
  function getExerciseHistory(name, days) {
    const since = addDays(todayStr(), -days);
    const results = [];
    sessions.forEach(s => {
      if (s.id === editingSessionId) return;
      if (s.date < since) return;
      s.exercises.forEach(ex => { if (ex.name === name) results.push({ date: s.date, ex }); });
    });
    results.sort((a, b) => b.date.localeCompare(a.date));
    return results;
  }

  // The most recent instance of this exact exercise name across all history
  // (no time window — used for things meant to persist indefinitely, like
  // equipment setup notes or "what did I actually lift last time"). Returns
  // the full exercise object (with .sets, .note, ...) or null.
  function getLatestExerciseInstance(name) {
    let latest = null;
    sessions.forEach(s => {
      if (s.id === editingSessionId) return;
      s.exercises.forEach(ex => {
        if (ex.name === name) {
          if (!latest || s.date > latest.date) latest = { date: s.date, ex };
        }
      });
    });
    return latest ? latest.ex : null;
  }

  // The most recent non-empty note ever left on this exact exercise name, e.g.
  // "J-hook height 13, safety bar 3" for a squat rack setup, so it can pre-fill next time.
  function getLatestNoteForExercise(name) {
    const latest = getLatestExerciseInstance(name);
    return (latest && latest.note) || '';
  }

  function sorenessReminderHtml(history) {
    const soreEntry = history.find(h => h.ex.soreness);
    if (!soreEntry) return '';
    const { level, note } = soreEntry.ex.soreness;
    const info = SORENESS_LEVELS[level] || SORENESS_LEVELS.mild;
    return `<div class="ex-soreness-alert">⚠️ 上次（${soreEntry.date}）酸痛：${info.emoji} ${info.label}${note ? `　—　「${esc(note)}」` : ''}</div>`;
  }

  function exerciseHistoryBoxHtml(ex) {
    const history = getExerciseHistory(ex.name, 90);
    if (history.length === 0) {
      return `<div class="ex-history empty" data-history-for="${ex.id}">近3個月沒有「${esc(ex.name)}」的紀錄</div>`;
    }
    const last = history[0];
    const unit = exerciseMetricUnit(ex);
    const avg = history.reduce((s, h) => s + exerciseMetric(h.ex), 0) / history.length;
    const currentMetric = exerciseMetric(ex);
    let diffHtml = '';
    if (currentMetric > 0) {
      const diff = round1(currentMetric - exerciseMetric(last.ex));
      const arrow = diff > 0 ? '📈' : diff < 0 ? '📉' : '➡️';
      diffHtml = `<span class="ex-diff">比上次 ${diff > 0 ? '+' : ''}${diff}${unit} ${arrow}</span>`;
    }
    return `
      <div data-history-for="${ex.id}">
        ${sorenessReminderHtml(history)}
        <div class="ex-history">
          <div>上次（${last.date}）：${last.ex.sets.map(st => formatSetLabel(last.ex, st)).join('、')}（${exerciseSubtotalLabel(last.ex)}）</div>
          <div>近3個月：練了 ${history.length} 次・平均 ${round1(avg)}${unit}／次 ${diffHtml}</div>
          ${last.ex.note ? `<div>📌 上次備註：${esc(last.ex.note)}</div>` : ''}
        </div>
      </div>`;
  }

  // RIR is opt-in per SET, not per exercise: a set only gets the input once
  // the lifter presses "+RIR" on that specific row, and it stays a plain
  // "+RIR" button on every other row until they choose to add it there too.
  function rirSlotHtml(ex, s, i) {
    if (s.rir === undefined) {
      return `<button class="rir-add-btn" data-action="add-rir" data-ex-id="${ex.id}" data-set-idx="${i}" title="記錄保留次數 (RIR)">+RIR</button>`;
    }
    return `<input type="number" inputmode="numeric" class="rir-input" placeholder="RIR" step="1" min="0" max="10"
      value="${s.rir === '' || s.rir == null ? '' : s.rir}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="rir" title="保留次數 (Reps in Reserve)">`;
  }

  // Checking this off marks the set done (highlights the row) and auto-starts
  // the floating rest timer using this exercise's configured rest duration —
  // "key in the plan ahead of time, just tap through it during the workout."
  function doneBtnHtml(ex, s, i) {
    const done = !!s.done;
    return `<button class="set-done-btn${done ? ' done' : ''}" data-action="toggle-done" data-ex-id="${ex.id}" data-set-idx="${i}" title="標記這組完成，並開始休息計時">${done ? '✓' : ''}</button>`;
  }

  // The set-index badge doubles as the warm-up toggle — tapping it marks that
  // set a warm-up (🔥) instead of adding a whole extra column to an already
  // tight row. Warm-up sets are excluded from volume/PR everywhere else.
  function setIdxBtnHtml(ex, s, i) {
    const isWarmup = !!s.warmup;
    return `<button class="set-idx-btn${isWarmup ? ' warmup' : ''}" data-action="toggle-warmup" data-ex-id="${ex.id}" data-set-idx="${i}" title="點一下標記/取消為熱身組">${isWarmup ? '🔥' : i + 1}</button>`;
  }

  function setRowHtml(ex, s, i) {
    const doneClass = s.done ? ' set-row-done' : '';
    if (ex.inputType === 'reps_only') {
      return `
        <div class="set-row-2${doneClass}">
          ${setIdxBtnHtml(ex, s, i)}
          <input type="number" inputmode="numeric" placeholder="次數" step="1" min="0"
            value="${s.reps === '' ? '' : s.reps}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="reps">
          ${rirSlotHtml(ex, s, i)}
          ${doneBtnHtml(ex, s, i)}
          <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
        </div>`;
    }
    if (ex.inputType === 'duration') {
      return `
        <div class="set-row-1b${doneClass}">
          ${setIdxBtnHtml(ex, s, i)}
          <input type="number" inputmode="numeric" placeholder="秒數" step="1" min="0"
            value="${s.seconds === '' ? '' : s.seconds}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="seconds">
          ${doneBtnHtml(ex, s, i)}
          <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
        </div>`;
    }
    return `
      <div class="set-row${doneClass}">
        ${setIdxBtnHtml(ex, s, i)}
        <input type="number" inputmode="decimal" placeholder="${ex.dualWeight ? '單顆重量 kg' : '重量 kg'}" step="0.5" min="0"
          value="${s.weight === '' ? '' : s.weight}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="weight">
        <input type="number" inputmode="numeric" placeholder="次數" step="1" min="0"
          value="${s.reps === '' ? '' : s.reps}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="reps">
        ${rirSlotHtml(ex, s, i)}
        ${doneBtnHtml(ex, s, i)}
        <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
      </div>`;
  }

  const REST_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300];
  function restSelectHtml(ex) {
    const current = ex.restSeconds || 90;
    return `<select class="rest-select" data-ex-id="${ex.id}" title="組間休息時間">
      ${REST_OPTIONS.map(s => `<option value="${s}"${s === current ? ' selected' : ''}>⏱ ${fmtMMSS(s)}</option>`).join('')}
    </select>`;
  }

  function renderExerciseList() {
    if (draft.exercises.length === 0) {
      exerciseListEl.innerHTML = '<div class="empty-state">還沒有加入動作，點下方「＋ 新增動作」開始記錄</div>';
      return;
    }
    exerciseListEl.innerHTML = draft.exercises.map((ex, idx) => `
      <div class="exercise-card" data-ex-id="${ex.id}">
        <div class="exercise-card-head">
          <div><span class="name">${esc(ex.name)}</span><span class="cat-badge">${esc(ex.category)}</span></div>
          <div class="ex-head-actions">
            <button class="btn-icon" data-action="move-up" data-ex-id="${ex.id}" title="上移" ${idx === 0 ? 'disabled' : ''}>▲</button>
            <button class="btn-icon" data-action="move-down" data-ex-id="${ex.id}" title="下移" ${idx === draft.exercises.length - 1 ? 'disabled' : ''}>▼</button>
            <button class="btn-icon" data-action="remove-exercise" data-ex-id="${ex.id}" title="移除動作">✕</button>
          </div>
        </div>
        <input type="text" class="ex-note-input" placeholder="動作備註（例如：槓高40cm、握距寬）" value="${esc(ex.note || '')}" data-ex-id="${ex.id}">
        ${exFlagRowHtml(ex)}
        ${exerciseHistoryBoxHtml(ex)}
        ${ex.sets.map((s, i) => setRowHtml(ex, s, i)).join('')}
        <button class="add-set-btn" data-action="add-set" data-ex-id="${ex.id}">＋ 新增一組</button>
        <div class="exercise-card-foot">
          <span class="exercise-vol" data-vol-for="${ex.id}">${exerciseFooterText(ex)}</span>
          ${restSelectHtml(ex)}
        </div>
      </div>
    `).join('');
  }

  function renderLiveSummary() {
    if (draft.exercises.length === 0) { liveSummaryEl.innerHTML = ''; return; }
    liveSummaryEl.innerHTML = `
      <div class="stat"><div class="num">${draft.exercises.length}</div><div class="label">動作數</div></div>
      <div class="stat"><div class="num">${draftSetCount()}</div><div class="label">總組數</div></div>
      <div class="stat"><div class="num">${round1(draftVolume())}</div><div class="label">總訓練量 (kg)</div></div>
    `;
  }

  function renderDraft() { renderExerciseList(); renderLiveSummary(); }

  exerciseListEl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.classList.contains('ex-note-input')) {
      const noteEx = draft.exercises.find(x => x.id === t.dataset.exId);
      if (noteEx) noteEx.note = t.value;
      return;
    }
    if (t.classList.contains('rest-select')) {
      const restEx = draft.exercises.find(x => x.id === t.dataset.exId);
      if (restEx) restEx.restSeconds = parseInt(t.value);
      autosaveDraft();
      return;
    }
    if (!t.dataset.field) return;
    const ex = draft.exercises.find(x => x.id === t.dataset.exId);
    if (!ex) return;
    const set = ex.sets[parseInt(t.dataset.setIdx)];
    if (!set) return;
    set[t.dataset.field] = t.value === '' ? '' : parseFloat(t.value);
    const volEl = exerciseListEl.querySelector(`[data-vol-for="${ex.id}"]`);
    if (volEl) volEl.textContent = exerciseFooterText(ex);
    const histEl = exerciseListEl.querySelector(`[data-history-for="${ex.id}"]`);
    if (histEl) histEl.outerHTML = exerciseHistoryBoxHtml(ex);
    renderLiveSummary();
    autosaveDraft();
  });

  function defaultSetFor(ex, last) {
    const carryRir = last && last.rir !== undefined ? { rir: '' } : {};
    if (ex.inputType === 'reps_only') {
      return { reps: last ? last.reps : '', ...carryRir };
    }
    if (ex.inputType === 'duration') return { seconds: last ? last.seconds : '' };
    return { weight: last ? last.weight : '', reps: last ? last.reps : '', ...carryRir };
  }

  exerciseListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const exId = btn.dataset.exId;
    const ex = draft.exercises.find(x => x.id === exId);
    if (btn.dataset.action === 'remove-exercise') {
      draft.exercises = draft.exercises.filter(x => x.id !== exId);
    } else if (btn.dataset.action === 'add-set') {
      const last = ex.sets[ex.sets.length - 1];
      ex.sets.push(defaultSetFor(ex, last));
    } else if (btn.dataset.action === 'remove-set') {
      ex.sets.splice(parseInt(btn.dataset.setIdx), 1);
      if (ex.sets.length === 0) draft.exercises = draft.exercises.filter(x => x.id !== exId);
    } else if (btn.dataset.action === 'add-rir') {
      const set = ex.sets[parseInt(btn.dataset.setIdx)];
      if (set) set.rir = '';
    } else if (btn.dataset.action === 'toggle-unilateral') {
      ex.unilateral = !ex.unilateral;
    } else if (btn.dataset.action === 'toggle-dual') {
      ex.dualWeight = !ex.dualWeight;
    } else if (btn.dataset.action === 'toggle-warmup') {
      const set = ex.sets[parseInt(btn.dataset.setIdx)];
      if (set) set.warmup = !set.warmup;
    } else if (btn.dataset.action === 'toggle-done') {
      const set = ex.sets[parseInt(btn.dataset.setIdx)];
      if (!set) return;
      const wasDone = !!set.done;
      set.done = !wasDone;
      if (!wasDone && set.done) {
        const secs = ex.restSeconds || 90;
        startTimer(secs);
        toast(`✅ 完成！休息 ${fmtMMSS(secs)} 倒數中`);
      }
    } else if (btn.dataset.action === 'move-up') {
      const i = draft.exercises.findIndex(x => x.id === exId);
      if (i > 0) [draft.exercises[i - 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i - 1]];
    } else if (btn.dataset.action === 'move-down') {
      const i = draft.exercises.findIndex(x => x.id === exId);
      if (i !== -1 && i < draft.exercises.length - 1) [draft.exercises[i + 1], draft.exercises[i]] = [draft.exercises[i], draft.exercises[i + 1]];
    }
    renderDraft();
    autosaveDraft();
  });

  // ---- Exercise picker modal ----
  const modal = document.getElementById('exerciseModal');
  const categoryChipsEl = document.getElementById('categoryChips');
  const exerciseNameInput = document.getElementById('exerciseNameInput');
  const exercisePresetsList = document.getElementById('exercisePresets');
  const presetQuickPickEl = document.getElementById('presetQuickPick');
  const inputTypeChipsEl = document.getElementById('inputTypeChips');
  const variantFieldEl = document.getElementById('variantField');
  const variantChipsEl = document.getElementById('variantChips');
  const regressionToggleEl = document.getElementById('regressionToggle');
  const unilateralToggleEl = document.getElementById('unilateralToggle');
  const dualWeightToggleEl = document.getElementById('dualWeightToggle');
  const addNewNameToPresetsBtn = document.getElementById('addNewNameToPresets');
  const addNewNamePreviewEl = document.getElementById('addNewNamePreview');

  let selectedCategory = CATEGORIES[0];
  let currentInputType = 'weight_reps';
  let currentVariants = null;
  let selectedVariant = null;
  let isRegression = false;
  let isUnilateral = false;
  let isDualWeight = false;

  function setUnilateral(value) {
    isUnilateral = value;
    unilateralToggleEl.classList.toggle('selected', isUnilateral);
  }
  function setDualWeight(value) {
    isDualWeight = value;
    dualWeightToggleEl.classList.toggle('selected', isDualWeight);
  }

  categoryChipsEl.innerHTML = CATEGORIES.map(c => `<button class="chip" data-cat="${c}">${c}</button>`).join('');

  function findPreset(name) {
    return effectivePresetsFor(selectedCategory).find(p => p.name === name);
  }

  function setInputType(type) {
    currentInputType = type;
    inputTypeChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.type === type));
  }

  function setVariants(variants) {
    currentVariants = variants || null;
    selectedVariant = variants ? variants[0] : null;
    if (variants) {
      variantFieldEl.hidden = false;
      variantChipsEl.innerHTML = variants.map(v => `<button class="chip${v === selectedVariant ? ' selected' : ''}" data-variant="${esc(v)}">${esc(v)}</button>`).join('');
    } else {
      variantFieldEl.hidden = true;
      variantChipsEl.innerHTML = '';
    }
  }

  function refreshModalForCategory() {
    categoryChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.cat === selectedCategory));
    const presets = effectivePresetsFor(selectedCategory);
    exercisePresetsList.innerHTML = presets.map(p => `<option value="${esc(p.name)}">`).join('');
    presetQuickPickEl.innerHTML = presets.map(p => `<button class="preset-chip" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  }

  // Shows a "add to my exercise list" quick-add chip whenever the typed name
  // doesn't match anything already in this category's list — so a brand new
  // exercise can be saved as a preset on the spot, no trip to 動作管理 needed.
  function updateAddNewNameVisibility() {
    const name = exerciseNameInput.value.trim();
    if (!name || findPreset(name)) {
      addNewNameToPresetsBtn.hidden = true;
      return;
    }
    addNewNamePreviewEl.textContent = name;
    addNewNameToPresetsBtn.hidden = false;
  }
  exerciseNameInput.addEventListener('input', updateAddNewNameVisibility);
  addNewNameToPresetsBtn.addEventListener('click', () => {
    const name = exerciseNameInput.value.trim();
    if (!name) return;
    const preset = { name, inputType: currentInputType };
    if (isUnilateral) preset.unilateral = true;
    if (isDualWeight) preset.dualWeight = true;
    hiddenPresets.delete(`${selectedCategory}::${name}`);
    customPresets[selectedCategory] = (customPresets[selectedCategory] || []).filter(p => p.name !== name);
    customPresets[selectedCategory].push(preset);
    saveCustomPresets();
    saveHiddenPresets();
    refreshModalForCategory();
    updateAddNewNameVisibility();
    toast(`已把「${name}」加入常用動作清單`);
  });

  categoryChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectedCategory = chip.dataset.cat;
    setInputType('weight_reps');
    setVariants(null);
    setUnilateral(false);
    setDualWeight(false);
    refreshModalForCategory();
    updateAddNewNameVisibility();
  });
  presetQuickPickEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    exerciseNameInput.value = chip.dataset.name;
    const preset = findPreset(chip.dataset.name);
    setInputType((preset && preset.inputType) || 'weight_reps');
    setVariants(preset && preset.variants);
    setUnilateral(!!(preset && preset.unilateral));
    setDualWeight(!!(preset && preset.dualWeight));
    updateAddNewNameVisibility();
  });
  inputTypeChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setInputType(chip.dataset.type);
  });
  variantChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectedVariant = chip.dataset.variant;
    variantChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.variant === selectedVariant));
  });
  regressionToggleEl.addEventListener('click', () => {
    isRegression = !isRegression;
    regressionToggleEl.classList.toggle('selected', isRegression);
  });
  unilateralToggleEl.addEventListener('click', () => setUnilateral(!isUnilateral));
  dualWeightToggleEl.addEventListener('click', () => setDualWeight(!isDualWeight));

  function openModal() {
    exerciseNameInput.value = '';
    selectedCategory = CATEGORIES[0];
    isRegression = false;
    regressionToggleEl.classList.remove('selected');
    setInputType('weight_reps');
    setVariants(null);
    setUnilateral(false);
    setDualWeight(false);
    refreshModalForCategory();
    addNewNameToPresetsBtn.hidden = true;
    modal.hidden = false;
  }
  function closeModal() { modal.hidden = true; }
  document.getElementById('addExerciseBtn').addEventListener('click', openModal);
  document.getElementById('closeExerciseModal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  document.getElementById('confirmAddExercise').addEventListener('click', () => {
    let name = exerciseNameInput.value.trim();
    if (!name) { toast('請輸入動作名稱'); return; }
    if (currentVariants && selectedVariant) name += `（${selectedVariant}）`;
    if (isRegression) name += '（退階）';
    const lastInstance = getLatestExerciseInstance(name);
    draft.exercises.push({
      id: uid(), name, category: selectedCategory, inputType: currentInputType, unilateral: isUnilateral, dualWeight: isDualWeight,
      note: (lastInstance && lastInstance.note) || '',
      restSeconds: (lastInstance && lastInstance.restSeconds) || 90,
      sets: [defaultSetFor({ inputType: currentInputType }, null)],
    });
    closeModal();
    renderDraft();
    autosaveDraft();
  });

  // ---- Exercise manager modal (#3: add your own exercises / hide default ones) ----
  const exerciseManagerModal = document.getElementById('exerciseManagerModal');
  const managerCategoryChipsEl = document.getElementById('managerCategoryChips');
  const managerPresetListEl = document.getElementById('managerPresetList');
  const managerNewNameEl = document.getElementById('managerNewName');
  const managerInputTypeChipsEl = document.getElementById('managerInputTypeChips');
  const managerUnilateralToggleEl = document.getElementById('managerUnilateralToggle');
  const managerDualToggleEl = document.getElementById('managerDualToggle');

  let managerCategory = CATEGORIES[0];
  let managerInputType = 'weight_reps';
  let managerUnilateral = false;
  let managerDual = false;

  managerCategoryChipsEl.innerHTML = CATEGORIES.map(c => `<button class="chip" data-cat="${c}">${c}</button>`).join('');

  function refreshManagerCategoryChips() {
    managerCategoryChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.cat === managerCategory));
  }

  function renderManagerPresetList() {
    const list = effectivePresetsFor(managerCategory);
    if (list.length === 0) {
      managerPresetListEl.innerHTML = '<div class="empty-state">這個分類還沒有動作</div>';
      return;
    }
    const customNames = new Set((customPresets[managerCategory] || []).map(p => p.name));
    const typeLabel = t => t === 'reps_only' ? '僅次數' : t === 'duration' ? '秒數' : '重量×次數';
    managerPresetListEl.innerHTML = list.map(p => {
      const isCustom = customNames.has(p.name);
      return `
        <div class="manager-preset-row">
          <div>
            <span class="manager-preset-name">${esc(p.name)}</span>
            <span class="manager-preset-meta">${typeLabel(p.inputType)}${p.unilateral ? '・單邊' : ''}${p.dualWeight ? '・雙持' : ''}${isCustom ? '・自訂' : ''}</span>
          </div>
          <button class="btn btn-sm btn-danger" data-action="${isCustom ? 'delete-custom' : 'hide-preset'}" data-name="${esc(p.name)}">
            ${isCustom ? '刪除' : '隱藏'}
          </button>
        </div>`;
    }).join('');
  }

  managerCategoryChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    managerCategory = chip.dataset.cat;
    refreshManagerCategoryChips();
    renderManagerPresetList();
  });
  managerPresetListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const name = btn.dataset.name;
    if (btn.dataset.action === 'hide-preset') {
      hiddenPresets.add(`${managerCategory}::${name}`);
      saveHiddenPresets();
    } else if (btn.dataset.action === 'delete-custom') {
      customPresets[managerCategory] = (customPresets[managerCategory] || []).filter(p => p.name !== name);
      saveCustomPresets();
    }
    renderManagerPresetList();
  });
  managerInputTypeChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    managerInputType = chip.dataset.type;
    managerInputTypeChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
  });
  managerUnilateralToggleEl.addEventListener('click', () => {
    managerUnilateral = !managerUnilateral;
    managerUnilateralToggleEl.classList.toggle('selected', managerUnilateral);
  });
  managerDualToggleEl.addEventListener('click', () => {
    managerDual = !managerDual;
    managerDualToggleEl.classList.toggle('selected', managerDual);
  });
  document.getElementById('managerAddBtn').addEventListener('click', () => {
    const name = managerNewNameEl.value.trim();
    if (!name) { toast('請輸入動作名稱'); return; }
    const preset = { name, inputType: managerInputType };
    if (managerUnilateral) preset.unilateral = true;
    if (managerDual) preset.dualWeight = true;
    hiddenPresets.delete(`${managerCategory}::${name}`); // un-hide in case this re-adds a built-in name
    customPresets[managerCategory] = (customPresets[managerCategory] || []).filter(p => p.name !== name);
    customPresets[managerCategory].push(preset);
    saveCustomPresets();
    saveHiddenPresets();
    managerNewNameEl.value = '';
    managerInputType = 'weight_reps';
    managerInputTypeChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.type === 'weight_reps'));
    managerUnilateral = false;
    managerUnilateralToggleEl.classList.remove('selected');
    managerDual = false;
    managerDualToggleEl.classList.remove('selected');
    renderManagerPresetList();
    toast(`已新增「${name}」`);
  });

  document.getElementById('openExerciseManager').addEventListener('click', () => {
    managerCategory = CATEGORIES[0];
    refreshManagerCategoryChips();
    renderManagerPresetList();
    exerciseManagerModal.hidden = false;
  });
  document.getElementById('closeExerciseManagerModal').addEventListener('click', () => { exerciseManagerModal.hidden = true; });
  exerciseManagerModal.addEventListener('click', (e) => { if (e.target === exerciseManagerModal) exerciseManagerModal.hidden = true; });

  // ---- Save session ----
  function rirFieldFor(s) {
    return s.rir !== '' && s.rir != null ? { rir: Number(s.rir) } : {};
  }
  function warmupFieldFor(s) {
    return s.warmup ? { warmup: true } : {};
  }

  function cleanSetsFor(ex) {
    if (ex.inputType === 'reps_only') {
      return ex.sets
        .filter(s => s.reps !== '' && Number(s.reps) > 0)
        .map(s => ({ reps: Number(s.reps), ...rirFieldFor(s), ...warmupFieldFor(s) }));
    }
    if (ex.inputType === 'duration') {
      return ex.sets
        .filter(s => s.seconds !== '' && Number(s.seconds) > 0)
        .map(s => ({ seconds: Number(s.seconds), ...warmupFieldFor(s) }));
    }
    return ex.sets
      .filter(s => s.weight !== '' && s.reps !== '' && Number(s.weight) >= 0 && Number(s.reps) > 0)
      .map(s => ({ weight: Number(s.weight), reps: Number(s.reps), ...rirFieldFor(s), ...warmupFieldFor(s) }));
  }

  const logTitleEl = document.getElementById('logTitle');
  const editBannerEl = document.getElementById('editBanner');
  const saveSessionBtnEl = document.getElementById('saveSessionBtn');

  // ---- Draft autosave (so an in-progress "new" entry survives a tab switch,
  // an accidental close, or the phone locking before you hit save) ----
  const KEY_DRAFT = 'fitness_draft_v1';
  function autosaveDraft() {
    if (editingSessionId) return; // editing an existing session has its own save flow
    if (draft.exercises.length === 0) { localStorage.removeItem(KEY_DRAFT); return; }
    try {
      localStorage.setItem(KEY_DRAFT, JSON.stringify({
        date: sessionDateInput.value,
        notes: document.getElementById('sessionNotes').value,
        exercises: draft.exercises,
      }));
    } catch (e) { /* storage full or unavailable — draft just won't persist */ }
  }
  function clearDraftAutosave() { localStorage.removeItem(KEY_DRAFT); }
  function restoreDraftIfAny() {
    try {
      const raw = localStorage.getItem(KEY_DRAFT);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved || !Array.isArray(saved.exercises) || saved.exercises.length === 0) return;
      draft = { exercises: saved.exercises };
      if (saved.date) sessionDateInput.value = saved.date;
      document.getElementById('sessionNotes').value = saved.notes || '';
      toast('已還原上次未儲存的紀錄草稿');
    } catch (e) { /* corrupt draft — ignore it rather than crash the app */ }
  }
  sessionDateInput.addEventListener('input', autosaveDraft);
  document.getElementById('sessionNotes').addEventListener('input', autosaveDraft);

  // ---- Workout templates ("下次訓練菜單") — a named, reusable exercise list.
  // Templates only store *which* exercises (name/category/type), never fixed
  // weights: applying one always pulls in whatever you actually lifted last
  // time via getLatestExerciseInstance, so the numbers stay current. ----
  const KEY_TEMPLATES = 'fitness_templates_v1';
  function loadTemplates() {
    try { return JSON.parse(localStorage.getItem(KEY_TEMPLATES)) || []; }
    catch { return []; }
  }
  function saveTemplatesToStorage() { localStorage.setItem(KEY_TEMPLATES, JSON.stringify(templates)); }
  let templates = loadTemplates();

  const templatesModal = document.getElementById('templatesModal');
  const templatesListEl = document.getElementById('templatesList');

  function renderTemplatesList() {
    if (templates.length === 0) {
      templatesListEl.innerHTML = '<div class="empty-state">還沒有範本，去歷史紀錄找一次訓練按「存成範本」</div>';
      return;
    }
    templatesListEl.innerHTML = templates.map(t => `
      <div class="manager-preset-row">
        <div>
          <div class="manager-preset-name">${esc(t.name)}</div>
          <span class="manager-preset-meta">${t.exercises.map(e => esc(e.name)).join('、')}</span>
        </div>
        <div class="ex-head-actions">
          <button class="btn btn-sm btn-primary" data-action="apply-template" data-id="${t.id}">套用</button>
          <button class="btn-icon" data-action="delete-template" data-id="${t.id}" title="刪除範本">✕</button>
        </div>
      </div>`).join('');
  }

  function applyTemplate(templateId) {
    const t = templates.find(x => x.id === templateId);
    if (!t) return;
    t.exercises.forEach(item => {
      const lastEx = getLatestExerciseInstance(item.name);
      const sets = lastEx && lastEx.sets.length > 0
        ? lastEx.sets.map(st => ({ ...st }))
        : [defaultSetFor({ inputType: item.inputType }, null)];
      draft.exercises.push({
        id: uid(),
        name: item.name,
        category: item.category,
        inputType: item.inputType || 'weight_reps',
        unilateral: item.unilateral,
        dualWeight: item.dualWeight,
        note: (lastEx && lastEx.note) || '',
        restSeconds: (lastEx && lastEx.restSeconds) || 90,
        sets,
      });
    });
    renderDraft();
    autosaveDraft();
    templatesModal.hidden = true;
    toast(`已套用範本「${t.name}」，重量次數已帶入上次數字`);
  }

  templatesListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'apply-template') {
      applyTemplate(id);
    } else if (btn.dataset.action === 'delete-template') {
      const t = templates.find(x => x.id === id);
      if (t && confirm(`確定要刪除範本「${t.name}」嗎？`)) {
        templates = templates.filter(x => x.id !== id);
        saveTemplatesToStorage();
        renderTemplatesList();
      }
    }
  });
  document.getElementById('applyTemplateBtn').addEventListener('click', () => {
    renderTemplatesList();
    templatesModal.hidden = false;
  });
  document.getElementById('closeTemplatesModal').addEventListener('click', () => { templatesModal.hidden = true; });
  templatesModal.addEventListener('click', (e) => { if (e.target === templatesModal) templatesModal.hidden = true; });

  function resetLogFormToNew() {
    editingSessionId = null;
    draft = { exercises: [] };
    document.getElementById('sessionNotes').value = '';
    sessionDateInput.value = todayStr();
    logTitleEl.textContent = '新增紀錄';
    editBannerEl.hidden = true;
    saveSessionBtnEl.textContent = '儲存這次訓練';
    renderDraft();
  }

  function startEditSession(id) {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    editingSessionId = id;
    draft = {
      exercises: s.exercises.map(ex => ({
        id: ex.id || uid(),
        name: ex.name,
        category: ex.category,
        inputType: ex.inputType || 'weight_reps',
        unilateral: ex.unilateral,
        dualWeight: ex.dualWeight,
        soreness: ex.soreness,
        note: ex.note,
        restSeconds: ex.restSeconds || 90,
        sets: ex.sets.map(st => ({ ...st })),
      })),
    };
    sessionDateInput.value = s.date;
    document.getElementById('sessionNotes').value = s.notes || '';
    logTitleEl.textContent = '編輯紀錄';
    editBannerEl.hidden = false;
    saveSessionBtnEl.textContent = '更新這次訓練';
    renderDraft();
    switchTab('tab-log');
  }
  document.getElementById('cancelEditBtn').addEventListener('click', resetLogFormToNew);

  saveSessionBtnEl.addEventListener('click', () => {
    const date = sessionDateInput.value || todayStr();
    const cleanExercises = draft.exercises
      .map(ex => ({
        id: ex.id, name: ex.name, category: ex.category, inputType: ex.inputType, unilateral: ex.unilateral, dualWeight: ex.dualWeight,
        soreness: ex.soreness, note: (ex.note || '').trim(), restSeconds: ex.restSeconds || 90,
        sets: cleanSetsFor(ex),
      }))
      .filter(ex => ex.sets.length > 0);

    if (cleanExercises.length === 0) {
      toast('請至少填寫一組完整的紀錄');
      return;
    }

    // Compare PRs against history excluding the session being edited, so re-saving
    // an already-PR set doesn't get flagged as a "new" PR against itself.
    const priorSessions = editingSessionId ? sessions.filter(s => s.id !== editingSessionId) : sessions;
    const newPRs = [];
    cleanExercises.filter(ex => (ex.inputType || 'weight_reps') === 'weight_reps').forEach(ex => {
      const prevPR = window.Calc.computePR(priorSessions, ex.name);
      const prevBest = prevPR ? prevPR.best1RM : 0;
      const thisBest = window.Calc.bestSetEstimated1RM(ex.sets);
      if (thisBest > prevBest + 0.01) newPRs.push(ex.name);
    });
    const notes = document.getElementById('sessionNotes').value.trim();

    if (editingSessionId) {
      const idx = sessions.findIndex(s => s.id === editingSessionId);
      if (idx !== -1) {
        sessions[idx] = { ...sessions[idx], date, notes, exercises: cleanExercises };
      }
      DB.saveSessions(sessions);
      resetLogFormToNew();
      toast(newPRs.length > 0 ? `🎉 已更新！新PR：${newPRs.join('、')}` : '已更新這次訓練！');
      switchTab('tab-history');
    } else {
      const session = { id: uid(), date, notes, exercises: cleanExercises, createdAt: Date.now() };
      sessions.push(session);
      DB.saveSessions(sessions);
      clearDraftAutosave();
      resetLogFormToNew();
      toast(newPRs.length > 0 ? `🎉 已儲存！新PR：${newPRs.join('、')}` : '已儲存這次訓練！');
    }
  });

  // ---------------------------------------------------------------------
  // TAB 2: 歷史
  // ---------------------------------------------------------------------
  const historyListEl = document.getElementById('historyList');
  const historySearchEl = document.getElementById('historySearch');
  let openSessionIds = new Set();

  function formatSetLabel(ex, s) {
    const rirSuffix = (s.rir !== undefined && s.rir !== null && s.rir !== '') ? ` (RIR ${s.rir})` : '';
    const warmupPrefix = s.warmup ? '🔥' : '';
    if (ex.inputType === 'reps_only') return `${warmupPrefix}${s.reps}下${rirSuffix}`;
    if (ex.inputType === 'duration') return `${warmupPrefix}${s.seconds}秒`;
    return warmupPrefix + `${weightText(ex, s.weight)}kg×${s.reps}` + rirSuffix;
  }
  function exerciseSubtotalLabel(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    const hasWarmup = ex.sets.some(s => s.warmup);
    const warmupNote = hasWarmup ? '，不含熱身' : '';
    if (ex.inputType === 'reps_only') {
      const total = workingSets(ex).reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
      return ex.unilateral ? `共 ${total} 下（左右各算${warmupNote}）` : `共 ${total} 下${hasWarmup ? '（不含熱身）' : ''}`;
    }
    if (ex.inputType === 'duration') {
      const total = workingSets(ex).reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
      return ex.unilateral ? `共 ${total} 秒（左右各算${warmupNote}）` : `共 ${total} 秒${hasWarmup ? '（不含熱身）' : ''}`;
    }
    return `小計 ${round1(window.Calc.exerciseVolume(ex))} kg${hasWarmup ? '（不含熱身）' : ''}`;
  }

  // Single "total for this exercise" figure, formatted with its unit — kg for
  // weight×reps, reps or seconds otherwise. This is what shows on the right
  // side of each exercise row, in both history and the coach-facing share view.
  function exerciseTotalLabel(ex) {
    return `${round1(exerciseMetric(ex))} ${exerciseMetricUnit(ex)}`;
  }

  function sorenessBtnHtml(ex, sessionId) {
    if (ex.soreness) {
      const info = SORENESS_LEVELS[ex.soreness.level];
      return `<button class="soreness-badge" data-action="soreness" data-session-id="${sessionId}" data-ex-id="${ex.id}">
        ${info.emoji} ${info.label}${ex.soreness.note ? '・' + esc(ex.soreness.note) : ''}
      </button>`;
    }
    return `<button class="soreness-add-btn" data-action="soreness" data-session-id="${sessionId}" data-ex-id="${ex.id}">🩹 記錄延遲性酸痛</button>`;
  }

  // Two-column exercise row: name + sets on the left, this exercise's own
  // total on the right — used in both the history list and the share view.
  function exerciseTableRowHtml(ex, sessionId) {
    return `
      <div class="ex-table-row">
        <div class="ex-table-left">
          <div class="ex-table-name">${esc(ex.name)}<span class="cat-badge">${esc(ex.category)}</span>${exBadgesHtml(ex)}</div>
          <div class="ex-table-sets">${ex.sets.length} 組・${ex.sets.map(st => formatSetLabel(ex, st)).join('、')}</div>
          ${ex.note ? `<div class="ex-note-display">📌 ${esc(ex.note)}</div>` : ''}
          ${sessionId ? sorenessBtnHtml(ex, sessionId) : ''}
        </div>
        <div class="ex-table-right">${exerciseTotalLabel(ex)}</div>
      </div>`;
  }

  function renderHistory() {
    const term = historySearchEl.value.trim().toLowerCase();
    let list = [...sessions].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    if (term) {
      list = list.filter(s =>
        s.exercises.some(ex => ex.name.toLowerCase().includes(term)) ||
        (s.notes && s.notes.toLowerCase().includes(term))
      );
    }
    if (list.length === 0) {
      historyListEl.innerHTML = '<div class="empty-state">還沒有符合的訓練紀錄</div>';
      return;
    }
    historyListEl.innerHTML = list.map(s => {
      const vol = window.Calc.sessionVolume(s);
      const setCount = s.exercises.reduce((n, ex) => n + ex.sets.length, 0);
      const open = openSessionIds.has(s.id);
      return `
      <div class="session-item">
        <div class="session-item-head" data-action="toggle" data-id="${s.id}">
          <div><div class="date">${s.date}（${fmtWeekday(s.date)}）</div>
            <div class="meta">${s.exercises.length} 個動作・${setCount} 組・共 ${round1(vol)} kg</div>
            <div class="meta ex-names">${s.exercises.map(ex => esc(ex.name)).join('、')}</div></div>
          <div>${open ? '▲' : '▼'}</div>
        </div>
        <div class="session-item-body ${open ? 'open' : ''}">
          <div class="ex-table">
            ${s.exercises.map(ex => exerciseTableRowHtml(ex, s.id)).join('')}
          </div>
          ${s.notes ? `<div class="session-notes">📝 ${esc(s.notes)}</div>` : ''}
          <div class="session-actions">
            <button class="btn btn-sm btn-outline" data-action="edit" data-id="${s.id}">編輯</button>
            <button class="btn btn-sm btn-outline" data-action="share" data-id="${s.id}">📤 分享</button>
            <button class="btn btn-sm btn-outline" data-action="save-template" data-id="${s.id}">📋 存成範本</button>
            <button class="btn btn-sm btn-danger" data-action="delete" data-id="${s.id}">刪除這筆紀錄</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  historyListEl.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    if (el.dataset.action === 'toggle') {
      if (openSessionIds.has(id)) openSessionIds.delete(id); else openSessionIds.add(id);
      renderHistory();
    } else if (el.dataset.action === 'edit') {
      startEditSession(id);
    } else if (el.dataset.action === 'soreness') {
      openSorenessModal(el.dataset.sessionId, el.dataset.exId);
    } else if (el.dataset.action === 'share') {
      openShareModal(id);
    } else if (el.dataset.action === 'save-template') {
      const s = sessions.find(x => x.id === id);
      if (!s) return;
      const name = prompt('這個範本要取什麼名字？（例如：推日、腿日A）', '');
      if (!name || !name.trim()) return;
      templates.push({
        id: uid(),
        name: name.trim(),
        exercises: s.exercises.map(ex => ({ name: ex.name, category: ex.category, inputType: ex.inputType, unilateral: ex.unilateral, dualWeight: ex.dualWeight })),
      });
      saveTemplatesToStorage();
      toast(`已存成範本「${name.trim()}」`);
    } else if (el.dataset.action === 'delete') {
      const s = sessions.find(x => x.id === id);
      if (s && confirm(`確定要刪除 ${s.date} 的訓練紀錄嗎？此動作無法復原。`)) {
        sessions = sessions.filter(x => x.id !== id);
        DB.saveSessions(sessions);
        if (editingSessionId === id) resetLogFormToNew();
        renderHistory();
        toast('已刪除');
      }
    }
  });
  historySearchEl.addEventListener('input', renderHistory);

  // ---- Soreness (DOMS) logging modal ----
  const sorenessModal = document.getElementById('sorenessModal');
  const sorenessTargetEl = document.getElementById('sorenessTarget');
  const sorenessLevelChipsEl = document.getElementById('sorenessLevelChips');
  const sorenessNoteEl = document.getElementById('sorenessNote');
  let sorenessTarget = null; // { sessionId, exId }
  let sorenessSelectedLevel = 'mild';

  function openSorenessModal(sessionId, exId) {
    const s = sessions.find(x => x.id === sessionId);
    const ex = s && s.exercises.find(x => x.id === exId);
    if (!ex) return;
    sorenessTarget = { sessionId, exId };
    sorenessTargetEl.textContent = `${esc(ex.name)}（${s.date}）`;
    sorenessSelectedLevel = (ex.soreness && ex.soreness.level) || 'mild';
    sorenessLevelChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.level === sorenessSelectedLevel));
    sorenessNoteEl.value = (ex.soreness && ex.soreness.note) || '';
    sorenessModal.hidden = false;
  }
  function closeSorenessModal() { sorenessModal.hidden = true; }
  document.getElementById('closeSorenessModal').addEventListener('click', closeSorenessModal);
  sorenessModal.addEventListener('click', (e) => { if (e.target === sorenessModal) closeSorenessModal(); });
  sorenessLevelChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    sorenessSelectedLevel = chip.dataset.level;
    sorenessLevelChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c.dataset.level === sorenessSelectedLevel));
  });
  document.getElementById('saveSorenessBtn').addEventListener('click', () => {
    if (!sorenessTarget) return;
    const s = sessions.find(x => x.id === sorenessTarget.sessionId);
    const ex = s && s.exercises.find(x => x.id === sorenessTarget.exId);
    if (!ex) return;
    ex.soreness = { level: sorenessSelectedLevel, note: sorenessNoteEl.value.trim() };
    DB.saveSessions(sessions);
    closeSorenessModal();
    renderHistory();
    toast('已記錄酸痛狀況');
  });

  // ---- Share / export view (for showing a coach) ----
  // Every set gets its own line ("訓練組 N: ..." / "熱身 N: ..."), matching the
  // per-set log format lifters are used to reading, rather than a summarized total.
  const shareModal = document.getElementById('shareModal');
  const shareModalBodyEl = document.getElementById('shareModalBody');
  let shareText = '';

  function shareSetLine(ex, s, label) {
    const rirSuffix = (s.rir !== undefined && s.rir !== null && s.rir !== '') ? ` (RIR ${s.rir})` : '';
    if (ex.inputType === 'reps_only') return `${label}: ${s.reps} 次${rirSuffix}`;
    if (ex.inputType === 'duration') return `${label}: ${fmtMMSS(s.seconds)}`;
    return `${label}: ${weightText(ex, s.weight)} kg × ${s.reps}${rirSuffix}`;
  }

  // Working sets numbered "訓練組 1, 2, 3…" and warm-ups separately "熱身 1, 2…",
  // in whichever order they were actually performed.
  function exerciseShareLines(ex) {
    const lines = [];
    let workingIdx = 0, warmupIdx = 0;
    ex.sets.forEach(st => {
      if (st.warmup) {
        warmupIdx++;
        lines.push(shareSetLine(ex, st, `熱身 ${warmupIdx}`));
      } else {
        workingIdx++;
        lines.push(shareSetLine(ex, st, `訓練組 ${workingIdx}`));
      }
    });
    return lines;
  }

  function buildShareText(s) {
    const lines = [`🏋️ ${s.date}（${fmtWeekday(s.date)}）訓練紀錄`, ''];
    s.exercises.forEach((ex, i) => {
      if (i > 0) lines.push('');
      lines.push(ex.name + (ex.unilateral ? '（單邊）' : '') + (ex.dualWeight ? '（雙持）' : ''));
      lines.push(...exerciseShareLines(ex));
      if (ex.note) lines.push(`備註: ${ex.note}`);
    });
    if (s.notes) { lines.push(''); lines.push(`訓練備註: ${s.notes}`); }
    return lines.join('\n');
  }

  function exerciseShareBlockHtml(ex) {
    return `
      <div class="share-exercise-block">
        <div class="share-exercise-name">${esc(ex.name)}${exBadgesHtml(ex)}</div>
        ${exerciseShareLines(ex).map(l => `<div class="share-set-line">${esc(l)}</div>`).join('')}
        ${ex.note ? `<div class="share-note-line">備註: ${esc(ex.note)}</div>` : ''}
      </div>`;
  }

  function openShareModal(sessionId) {
    const s = sessions.find(x => x.id === sessionId);
    if (!s) return;
    shareModalBodyEl.innerHTML = `
      <div class="share-head">
        <div class="share-date">${s.date}（${fmtWeekday(s.date)}）</div>
      </div>
      ${s.exercises.map(ex => exerciseShareBlockHtml(ex)).join('')}
      ${s.notes ? `<div class="session-notes">📝 ${esc(s.notes)}</div>` : ''}
    `;
    shareText = buildShareText(s);
    shareModal.hidden = false;
  }
  function closeShareModal() { shareModal.hidden = true; }
  document.getElementById('closeShareModal').addEventListener('click', closeShareModal);
  shareModal.addEventListener('click', (e) => { if (e.target === shareModal) closeShareModal(); });
  document.getElementById('copyShareTextBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      toast('已複製，可以貼給教練了');
    } catch (e) {
      toast('複製失敗，請手動選取文字複製');
    }
  });

  // ---------------------------------------------------------------------
  // Export for AI analysis: plain text (question + goals + full log) the user
  // pastes into an AI chat. The sync file lives in Drive's hidden appDataFolder,
  // which an AI can't read, so the data has to leave the app this way.
  // ---------------------------------------------------------------------
  const aiExportModal = document.getElementById('aiExportModal');
  const aiExportTextEl = document.getElementById('aiExportText');
  const aiExportInfoEl = document.getElementById('aiExportInfo');
  const aiRangeChipsEl = document.getElementById('aiRangeChips');
  let aiRangeWeeks = 12;

  function refreshAiExport() {
    const to = todayStr();
    let from = null;
    if (aiRangeWeeks > 0) {
      const d = new Date(to + 'T00:00:00');
      d.setDate(d.getDate() - aiRangeWeeks * 7 + 1);
      from = window.Calc.toDateStr(d);
    }
    const text = window.Calc.aiExportText({ sessions, weights, goals, fromDate: from, toDate: to });
    aiExportTextEl.value = text;
    const count = sessions.filter(s => (!from || s.date >= from) && s.date <= to).length;
    aiExportInfoEl.textContent = `${count} 次訓練・約 ${text.length.toLocaleString()} 字`;
  }

  document.getElementById('openAiExport').addEventListener('click', () => {
    refreshAiExport();
    aiExportModal.hidden = false;
  });
  function closeAiExport() { aiExportModal.hidden = true; }
  document.getElementById('closeAiExportModal').addEventListener('click', closeAiExport);
  aiExportModal.addEventListener('click', (e) => { if (e.target === aiExportModal) closeAiExport(); });
  aiRangeChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    aiRangeWeeks = parseInt(chip.dataset.weeks, 10);
    aiRangeChipsEl.querySelectorAll('.chip').forEach(c => c.classList.toggle('selected', c === chip));
    refreshAiExport();
  });
  document.getElementById('copyAiExportBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(aiExportTextEl.value);
      toast('已複製，貼到 Claude 對話就能分析了');
    } catch (e) {
      aiExportTextEl.select();
      toast('自動複製失敗，已選取文字，請手動複製');
    }
  });
  document.getElementById('downloadAiExportBtn').addEventListener('click', () => {
    const blob = new Blob([aiExportTextEl.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `健身紀錄_${todayStr()}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  // ---------------------------------------------------------------------
  // TAB 3: PR / 1RM
  // ---------------------------------------------------------------------
  const prListEl = document.getElementById('prList');
  const prDetailEl = document.getElementById('prDetail');

  function allExerciseNames() {
    const map = new Map(); // name -> { category, lastDate }
    sessions.forEach(s => s.exercises.forEach(ex => {
      if ((ex.inputType || 'weight_reps') !== 'weight_reps') return; // 1RM only applies to weight×reps exercises
      const cur = map.get(ex.name);
      if (!cur || s.date > cur.lastDate) map.set(ex.name, { category: ex.category, lastDate: s.date });
    }));
    return [...map.entries()].sort((a, b) => b[1].lastDate.localeCompare(a[1].lastDate));
  }

  function renderPRList() {
    prDetailEl.hidden = true;
    prListEl.hidden = false;
    const names = allExerciseNames();
    if (names.length === 0) {
      prListEl.innerHTML = '<div class="empty-state">還沒有任何訓練紀錄，先去新增一筆吧！</div>';
      return;
    }
    prListEl.innerHTML = names.map(([name, info]) => {
      const pr = window.Calc.computePR(sessions, name);
      return `
      <div class="pr-item" data-name="${esc(name)}">
        <div><div class="ex-name">${esc(name)}</div><div class="ex-cat">${esc(info.category)}</div></div>
        <div class="pr-values">
          <div class="rm-val">${round1(pr.best1RM)} kg</div>
          <div class="max-w">實測 ${pr.maxWeight}kg × ${pr.reps} 下（${pr.date}）</div>
        </div>
      </div>`;
    }).join('');
  }

  prListEl.addEventListener('click', (e) => {
    const item = e.target.closest('.pr-item');
    if (!item) return;
    showPRDetail(item.dataset.name);
  });
  document.getElementById('prBackBtn').addEventListener('click', () => {
    prDetailEl.hidden = true;
    prListEl.hidden = false;
  });

  function showPRDetail(name) {
    prListEl.hidden = true;
    prDetailEl.hidden = false;
    document.getElementById('prDetailName').textContent = name;

    const history = sessions
      .filter(s => s.exercises.some(ex => ex.name === name))
      .map(s => {
        const ex = s.exercises.filter(e => e.name === name)
          .sort((a, b) => window.Calc.bestSetEstimated1RM(b.sets) - window.Calc.bestSetEstimated1RM(a.sets))[0];
        const bestSet = [...ex.sets].sort((a, b) => window.Calc.epley1RM(b.weight, b.reps) - window.Calc.epley1RM(a.weight, a.reps))[0];
        return { date: s.date, est1RM: window.Calc.bestSetEstimated1RM(ex.sets), weight: bestSet.weight, reps: bestSet.reps };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    document.getElementById('prDetailChart').innerHTML = buildLineChart(
      history.map(h => ({ label: fmtShort(h.date), value: h.est1RM })), { unit: 'kg' }
    );

    const maxVal = Math.max(...history.map(h => h.est1RM));
    document.getElementById('prDetailTable').innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;">
        <thead><tr style="color:var(--text-dim);text-align:left;">
          <th style="padding:6px 4px;">日期</th><th>重量×次數</th><th>估算1RM</th><th></th>
        </tr></thead>
        <tbody>
          ${[...history].reverse().map(h => `
            <tr style="border-top:1px solid var(--border);">
              <td style="padding:6px 4px;">${h.date}</td>
              <td>${h.weight}kg × ${h.reps}</td>
              <td>${round1(h.est1RM)} kg</td>
              <td>${h.est1RM >= maxVal - 0.01 ? '🏆' : ''}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  // ---------------------------------------------------------------------
  // RM 計算機 (standalone, not tied to logged history)
  // ---------------------------------------------------------------------
  const rmCalcModal = document.getElementById('rmCalcModal');
  const rmCalcWeightInput = document.getElementById('rmCalcWeight');
  const rmCalcRepsInput = document.getElementById('rmCalcReps');
  const rmCalcResultEl = document.getElementById('rmCalcResult');
  const rmCalcTableEl = document.getElementById('rmCalcTable');
  const RM_PERCENTS = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50];

  function renderRmCalc() {
    const weight = parseFloat(rmCalcWeightInput.value);
    const reps = parseFloat(rmCalcRepsInput.value);
    if (!weight || weight <= 0 || !reps || reps <= 0) {
      rmCalcResultEl.innerHTML = '';
      rmCalcTableEl.innerHTML = '<div class="empty-state">輸入重量與次數即可看到估算結果</div>';
      return;
    }
    const oneRM = window.Calc.epley1RM(weight, reps);
    rmCalcResultEl.innerHTML = `
      <div class="stat"><div class="num">${round1(oneRM)}</div><div class="label">估算 1RM (kg)</div></div>
    `;
    rmCalcTableEl.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px;">
        <thead><tr style="color:var(--text-dim);text-align:left;">
          <th style="padding:6px 4px;">強度</th><th>重量</th><th>參考次數</th>
        </tr></thead>
        <tbody>
          ${RM_PERCENTS.map(p => `
            <tr style="border-top:1px solid var(--border);${p === 100 ? 'font-weight:700;' : ''}">
              <td style="padding:6px 4px;">${p}%</td>
              <td>${round1(window.Calc.weightForPercent(oneRM, p))} kg</td>
              <td>${window.Calc.repsForPercent(p)} 下</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  document.getElementById('openRmCalcBtn').addEventListener('click', () => {
    rmCalcModal.hidden = false;
    renderRmCalc();
  });
  document.getElementById('closeRmCalcModal').addEventListener('click', () => { rmCalcModal.hidden = true; });
  rmCalcModal.addEventListener('click', (e) => { if (e.target === rmCalcModal) rmCalcModal.hidden = true; });
  rmCalcWeightInput.addEventListener('input', renderRmCalc);
  rmCalcRepsInput.addEventListener('input', renderRmCalc);

  // ---------------------------------------------------------------------
  // TAB 4: 圖表
  // ---------------------------------------------------------------------
  // ---- Per-exercise tracking card: volume trend, estimated 1RM trend, and
  // training intensity (%1RM) trend, all for one selected exercise. ----
  const exerciseTrackSelectEl = document.getElementById('exerciseTrackSelect');

  function exerciseTrackingSeries(name) {
    const history = sessions
      .filter(s => s.exercises.some(ex => ex.name === name))
      .map(s => {
        const ex = s.exercises.filter(e => e.name === name)
          .sort((a, b) => window.Calc.bestSetEstimated1RM(b.sets) - window.Calc.bestSetEstimated1RM(a.sets))[0];
        return { date: s.date, volume: window.Calc.exerciseVolume(ex), est1RM: window.Calc.bestSetEstimated1RM(ex.sets) };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
    const allTimeBest1RM = history.reduce((max, h) => Math.max(max, h.est1RM), 0);
    history.forEach(h => { h.intensityPct = window.Calc.intensityPercent(h.est1RM, allTimeBest1RM); });
    return { history, allTimeBest1RM };
  }

  function renderExerciseTracking(name) {
    const bodyEl = document.getElementById('exerciseTrackBody');
    if (!name) { bodyEl.innerHTML = ''; return; }
    const { history, allTimeBest1RM } = exerciseTrackingSeries(name);
    if (history.length === 0) {
      bodyEl.innerHTML = '<div class="empty-state">還沒有這個動作的紀錄</div>';
      return;
    }
    bodyEl.innerHTML = `
      <div class="track-stat">目前估算1RM：<strong>${round1(allTimeBest1RM)} kg</strong>・共練過 ${history.length} 次</div>
      <h4>訓練總量趨勢</h4>
      <div class="chart-box">${buildLineChart(history.map(h => ({ label: fmtShort(h.date), value: round1(h.volume) })), { unit: 'kg' })}</div>
      <h4>估算1RM趨勢</h4>
      <div class="chart-box">${buildLineChart(history.map(h => ({ label: fmtShort(h.date), value: round1(h.est1RM) })), { unit: 'kg' })}</div>
      <h4>訓練強度（占目前1RM的百分比）</h4>
      <div class="chart-box">${buildLineChart(history.map(h => ({ label: fmtShort(h.date), value: round1(h.intensityPct) })), { unit: '%' })}</div>
    `;
  }

  exerciseTrackSelectEl.addEventListener('change', () => renderExerciseTracking(exerciseTrackSelectEl.value));

  function populateExerciseTrackSelect() {
    const names = allExerciseNames().map(([n]) => n);
    const prevValue = exerciseTrackSelectEl.value;
    exerciseTrackSelectEl.innerHTML = names.length
      ? names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('')
      : '<option value="">還沒有重量×次數類的紀錄</option>';
    if (names.includes(prevValue)) exerciseTrackSelectEl.value = prevValue;
    renderExerciseTracking(exerciseTrackSelectEl.value);
  }

  function renderCharts() {
    // Weekly volume
    const weeks = window.Calc.weeklyVolumes(sessions, 12, todayStr());
    document.getElementById('volumeChart').innerHTML = weeks.length && weeks.some(w => w.volume > 0)
      ? buildBarChart(weeks.map(w => ({ label: fmtShort(w.weekStart), value: round1(w.volume) })), { unit: 'kg' })
      : '<div class="empty-state">還沒有資料</div>';

    // Frequency heatmap (12 weeks)
    const freqMap = window.Calc.frequencyHeatmapData(sessions, 12, todayStr());
    document.getElementById('freqHeatmap').innerHTML = buildHeatmap(freqMap, todayStr());

    // Body part distribution (last 30 days)
    const from = addDays(todayStr(), -29);
    const dist = window.Calc.bodyPartDistribution(sessions, from, todayStr());
    const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
    document.getElementById('bodyPartChart').innerHTML = entries.length
      ? buildHBarChart(entries.map(([label, value]) => ({ label, value })), { unit: '組' })
      : '<div class="empty-state">近 30 天還沒有訓練紀錄</div>';

    populateExerciseTrackSelect();
  }

  // ---------------------------------------------------------------------
  // TAB 5: 體重
  // ---------------------------------------------------------------------
  const weightDateInput = document.getElementById('weightDate');
  weightDateInput.value = todayStr();

  document.getElementById('addWeightBtn').addEventListener('click', () => {
    const date = weightDateInput.value || todayStr();
    const w = parseFloat(document.getElementById('weightInput').value);
    if (!w || w <= 0) { toast('請輸入有效體重'); return; }
    weights = weights.filter(x => x.date !== date); // one entry per day, latest wins
    weights.push({ id: uid(), date, weight: w });
    weights.sort((a, b) => a.date.localeCompare(b.date));
    DB.saveWeights(weights);
    document.getElementById('weightInput').value = '';
    renderWeightTab();
    toast('已記錄體重');
  });

  function renderWeightTab() {
    document.getElementById('weightChart').innerHTML = weights.length
      ? buildLineChart(weights.map(w => ({ label: fmtShort(w.date), value: w.weight })), { unit: 'kg' })
      : '<div class="empty-state">還沒有體重紀錄</div>';

    const listEl = document.getElementById('weightList');
    const sorted = [...weights].sort((a, b) => b.date.localeCompare(a.date));
    listEl.innerHTML = sorted.map((w, i) => {
      const prev = sorted[i + 1];
      const delta = prev ? round1(w.weight - prev.weight) : null;
      const deltaStr = delta === null ? '' : (delta > 0 ? `<span style="color:var(--red)">+${delta}</span>` : delta < 0 ? `<span style="color:var(--green)">${delta}</span>` : '持平');
      return `
        <div class="session-item">
          <div class="session-item-head">
            <div><div class="date">${w.date}</div><div class="meta">${deltaStr}</div></div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="font-weight:700;">${w.weight} kg</span>
              <button class="btn-icon" data-action="del-weight" data-id="${w.id}">✕</button>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="empty-state">還沒有體重紀錄</div>';
  }

  document.getElementById('weightList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="del-weight"]');
    if (!btn) return;
    weights = weights.filter(w => w.id !== btn.dataset.id);
    DB.saveWeights(weights);
    renderWeightTab();
  });

  // ---------------------------------------------------------------------
  // SVG chart builders (no external dependencies)
  // ---------------------------------------------------------------------
  function buildBarChart(data, opts) {
    opts = opts || {};
    const W = 640, H = 180, padL = 34, padB = 26, padT = 10, padR = 8;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const maxVal = Math.max(1, ...data.map(d => d.value));
    const barW = chartW / data.length;
    const bars = data.map((d, i) => {
      const h = (d.value / maxVal) * chartH;
      const x = padL + i * barW + barW * 0.15;
      const y = padT + chartH - h;
      const showLabel = data.length <= 8 || i % 2 === 0 || i === data.length - 1;
      return `
        <rect x="${x}" y="${y}" width="${barW * 0.7}" height="${Math.max(h, 1)}" rx="3" fill="var(--accent)"></rect>
        ${showLabel ? `<text x="${x + barW * 0.35}" y="${H - 8}" font-size="10" fill="var(--text-dim)" text-anchor="middle">${esc(d.label)}</text>` : ''}
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}" stroke="var(--border)"></line>
      <text x="${padL}" y="${padT + 6}" font-size="10" fill="var(--text-dim)">${round1(maxVal)}${opts.unit || ''}</text>
      ${bars}
    </svg>`;
  }

  function buildLineChart(data, opts) {
    opts = opts || {};
    data = data.filter(d => Number.isFinite(d.value));
    if (data.length === 0) return '<div class="empty-state">還沒有資料</div>';
    const W = 640, H = 180, padL = 40, padB = 26, padT = 16, padR = 12;
    const chartW = W - padL - padR, chartH = H - padT - padB;
    const maxVal = Math.max(...data.map(d => d.value));
    const minVal = Math.min(...data.map(d => d.value));
    const range = (maxVal - minVal) || 1;
    const stepX = data.length > 1 ? chartW / (data.length - 1) : 0;
    const pts = data.map((d, i) => {
      const x = padL + i * stepX;
      const y = padT + chartH - ((d.value - minVal) / range) * chartH;
      return { x, y, d };
    });
    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="var(--accent)"></circle>`).join('');
    const labelEvery = Math.max(1, Math.ceil(pts.length / 7));
    const labels = pts.map((p, i) => (i % labelEvery === 0 || i === pts.length - 1)
      ? `<text x="${p.x.toFixed(1)}" y="${H - 8}" font-size="10" fill="var(--text-dim)" text-anchor="middle">${esc(p.d.label)}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <text x="4" y="${padT + 4}" font-size="10" fill="var(--text-dim)">${round1(maxVal)}${opts.unit || ''}</text>
      <text x="4" y="${padT + chartH}" font-size="10" fill="var(--text-dim)">${round1(minVal)}${opts.unit || ''}</text>
      <line x1="${padL}" y1="${padT + chartH}" x2="${W - padR}" y2="${padT + chartH}" stroke="var(--border)"></line>
      <path d="${pathD}" fill="none" stroke="var(--accent)" stroke-width="2"></path>
      ${dots}${labels}
    </svg>`;
  }

  function buildHBarChart(data, opts) {
    opts = opts || {};
    const W = 640, rowH = 30, padL = 60, padR = 50;
    const H = data.length * rowH + 10;
    const maxVal = Math.max(1, ...data.map(d => d.value));
    const rows = data.map((d, i) => {
      const y = i * rowH + 8;
      const w = ((d.value / maxVal) * (W - padL - padR));
      return `
        <text x="0" y="${y + 13}" font-size="12" fill="var(--text)">${esc(d.label)}</text>
        <rect x="${padL}" y="${y}" width="${Math.max(w, 2)}" height="16" rx="4" fill="var(--accent)"></rect>
        <text x="${padL + w + 6}" y="${y + 13}" font-size="11" fill="var(--text-dim)">${d.value}${opts.unit || ''}</text>
      `;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${rows}</svg>`;
  }

  function buildHeatmap(freqMap, refDateStr) {
    const refMonday = mondayOf(refDateStr);
    const cell = 14, gap = 3, padL = 20, padT = 14;
    const cols = 12;
    const W = padL + cols * (cell + gap), H = padT + 7 * (cell + gap) + 4;
    let rects = '';
    let monthLabels = '';
    let lastMonth = '';
    for (let c = 0; c < cols; c++) {
      const colMonday = new Date(refMonday);
      colMonday.setDate(colMonday.getDate() - (cols - 1 - c) * 7);
      const monthStr = `${colMonday.getMonth() + 1}月`;
      if (monthStr !== lastMonth) {
        monthLabels += `<text x="${padL + c * (cell + gap)}" y="10" font-size="9" fill="var(--text-dim)">${monthStr}</text>`;
        lastMonth = monthStr;
      }
      for (let r = 0; r < 7; r++) {
        const d = new Date(colMonday);
        d.setDate(d.getDate() + r);
        const dateStr = toDateStr(d);
        const count = freqMap[dateStr] || 0;
        const cls = count === 0 ? 'h0' : count === 1 ? 'h2' : count === 2 ? 'h3' : 'h4';
        const colorVar = { h0: 'var(--bg-input)', h2: '#ff7a4588', h3: '#ff7a45bb', h4: 'var(--accent)' }[cls];
        const x = padL + c * (cell + gap);
        const y = padT + r * (cell + gap);
        rects += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${colorVar}"><title>${dateStr}：${count} 次訓練</title></rect>`;
      }
    }
    const dayLabels = ['一', '三', '五'].map((lbl, i) => {
      const r = [0, 2, 4][i];
      return `<text x="2" y="${padT + r * (cell + gap) + cell - 2}" font-size="9" fill="var(--text-dim)">${lbl}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${monthLabels}${dayLabels}${rects}</svg>`;
  }

  // ---------------------------------------------------------------------
  // Rest timer (floating widget, available on every tab)
  // ---------------------------------------------------------------------
  const timerFab = document.getElementById('timerFab');
  const timerPanel = document.getElementById('timerPanel');
  const timerDisplay = document.getElementById('timerDisplay');
  const timerCustomInput = document.getElementById('timerCustomInput');
  const timerPauseBtn = document.getElementById('timerPauseBtn');

  // Countdown is anchored to an absolute end timestamp, not a per-second tick
  // counter: browsers throttle/suspend timers while the app is in the background,
  // so counting ticks would stall. The remaining time is always recomputed from
  // the wall clock, and re-checked when the page becomes visible again.
  const KEY_TIMER_END = 'fitness_timer_end';
  let timerRemaining = 0;
  let timerEndAt = 0;
  let timerInterval = null;
  let timerRunning = false;

  function persistTimerEnd() {
    try {
      if (timerRunning) localStorage.setItem(KEY_TIMER_END, String(timerEndAt));
      else localStorage.removeItem(KEY_TIMER_END);
    } catch (e) { /* storage unavailable — timer still works in memory */ }
  }

  function fmtMMSS(totalSeconds) {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateTimerUI() {
    timerDisplay.textContent = fmtMMSS(timerRemaining);
    timerFab.textContent = (timerRunning || timerRemaining > 0) ? fmtMMSS(timerRemaining) : '⏱️';
    timerFab.classList.toggle('active', timerRunning);
    timerPauseBtn.textContent = timerRunning ? '暫停' : '繼續';
  }

  function timerTick() {
    if (!timerRunning) return;
    timerRemaining = Math.max(0, Math.ceil((timerEndAt - Date.now()) / 1000));
    if (timerRemaining <= 0) {
      clearInterval(timerInterval);
      timerRunning = false;
      persistTimerEnd();
      updateTimerUI();
      onTimerDone();
      return;
    }
    updateTimerUI();
  }

  function runTimerFor(seconds) {
    clearInterval(timerInterval);
    timerRemaining = seconds;
    timerEndAt = Date.now() + seconds * 1000;
    timerRunning = true;
    persistTimerEnd();
    updateTimerUI();
    timerInterval = setInterval(timerTick, 250);
  }

  // Created lazily on a real click (startTimer is only ever called from a
  // click handler), which "unlocks" audio on iOS/Safari. Building the
  // AudioContext later, inside the setInterval callback when the timer
  // finishes, is NOT a user gesture and gets silently blocked on iOS — so we
  // grab it here instead and just reuse it in beep().
  let audioCtx = null;
  function unlockAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }

  function startTimer(seconds) {
    unlockAudio();
    runTimerFor(seconds);
  }

  function pauseResumeTimer() {
    if (timerRemaining <= 0) return;
    if (timerRunning) {
      timerTick();
      if (!timerRunning) return;
      clearInterval(timerInterval);
      timerRunning = false;
      persistTimerEnd();
      updateTimerUI();
    } else {
      unlockAudio();
      runTimerFor(timerRemaining);
    }
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerRemaining = 0;
    persistTimerEnd();
    updateTimerUI();
  }

  function beep() {
    try {
      const ctx = audioCtx;
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      [0, 0.3, 0.6].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.2, ctx.currentTime + delay);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + 0.2);
      });
    } catch (e) { /* Web Audio unavailable — silently skip the sound */ }
  }

  function onTimerDone() {
    beep();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    toast('⏰ 休息時間到！');
    timerFab.classList.add('done-flash');
    setTimeout(() => timerFab.classList.remove('done-flash'), 2000);
  }

  timerFab.addEventListener('click', () => { timerPanel.hidden = !timerPanel.hidden; });
  document.querySelectorAll('.timer-presets .chip').forEach(btn => {
    btn.addEventListener('click', () => startTimer(parseInt(btn.dataset.secs)));
  });
  document.getElementById('timerCustomStart').addEventListener('click', () => {
    const secs = parseInt(timerCustomInput.value);
    if (secs > 0) startTimer(secs);
  });
  timerPauseBtn.addEventListener('click', pauseResumeTimer);
  document.getElementById('timerResetBtn').addEventListener('click', resetTimer);

  // Coming back from another app/tab: recompute from the clock right away (and
  // fire the "done" alert if the rest ended while we were away).
  document.addEventListener('visibilitychange', () => { if (!document.hidden) timerTick(); });
  window.addEventListener('pageshow', timerTick);
  window.addEventListener('focus', timerTick);

  // Survive the OS discarding the page while backgrounded: resume a rest that is still running.
  (function restoreTimer() {
    let end = 0;
    try { end = parseInt(localStorage.getItem(KEY_TIMER_END), 10) || 0; } catch (e) { return; }
    if (end > Date.now()) {
      timerEndAt = end;
      timerRemaining = Math.ceil((end - Date.now()) / 1000);
      timerRunning = true;
      updateTimerUI();
      timerInterval = setInterval(timerTick, 250);
    } else if (end) {
      persistTimerEnd();
    }
  })();

  // ---------------------------------------------------------------------
  // Google Drive sync (optional) — stores one JSON file in the app's hidden
  // Drive "appDataFolder" (invisible in the user's normal Drive UI). Same
  // pattern as this developer's other personal trackers: last-write-wins,
  // whole-file replace, pushed 3s after any local change, pulled on load.
  // ---------------------------------------------------------------------
  const GDRIVE_CLIENT_ID = '675940238157-ahcuged7kgcbcvsc8e6kun2s7nvg6n5h.apps.googleusercontent.com';
  // drive.appdata does the actual sync; userinfo.email is only so we can show
  // *which* Google account is connected — appdata is scoped per-account, so
  // two devices signed into different accounts will silently sync to two
  // separate, unrelated folders and never see each other's data.
  const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
  const GDRIVE_FILE_NAME = 'fitness_tracker_sync.json';

  const syncModalEl = document.getElementById('syncModal');
  const syncStatusEl = document.getElementById('syncStatus');
  const syncAccountHintEl = document.getElementById('syncAccountHint');
  const btnGdriveSyncEl = document.getElementById('btnGdriveSync');
  const btnGdriveSignoutEl = document.getElementById('btnGdriveSignout');
  const btnGdrivePullNowEl = document.getElementById('btnGdrivePullNow');
  const btnGdrivePushNowEl = document.getElementById('btnGdrivePushNow');

  let gdriveToken = null;
  let gdriveSyncTimer = null;
  let gdriveFileId = null;
  let gdriveImporting = false;

  function setSyncStatus(msg, color) {
    syncStatusEl.textContent = msg;
    syncStatusEl.style.color = color || '';
  }

  function gdriveLoadScript() {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined' && google.accounts) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('無法載入 Google 登入元件'));
      document.head.appendChild(s);
    });
  }

  async function gdriveInit() {
    const saved = localStorage.getItem('gdrive_token');
    if (!saved) return;
    let wasPreviouslyConnected = true;
    try {
      const t = JSON.parse(saved);
      if (t.expires_at > Date.now() + 60000) {
        gdriveToken = t;
        await gdriveOnSignedIn();
        return;
      }
    } catch (e) { wasPreviouslyConnected = false; /* malformed cached token — fall through and clear it */ }
    localStorage.removeItem('gdrive_token');
    // Was connected before but the login quietly expired since the last visit —
    // say so instead of just reverting to "not connected" with no explanation.
    if (wasPreviouslyConnected) {
      document.getElementById('openSyncModal').classList.add('sync-warn');
      toast('☁️ Google Drive 連線已過期，記得重新連結才能繼續同步');
    }
  }

  // Kick this off as early as possible (app init, and again when the sync
  // modal opens) rather than only on the connect click. If the GIS script is
  // still loading at the moment requestAccessToken() runs, the `await` in
  // between consumes the browser's "real click" activation token, and the
  // login popup silently gets blocked — the classic "have to click twice" bug.
  gdriveLoadScript().catch(() => { /* will retry + surface the error on click */ });

  async function gdriveSignIn() {
    setSyncStatus('載入中...', 'var(--accent)');
    try { await gdriveLoadScript(); } catch (e) { setSyncStatus(e.message, 'var(--red)'); return; }
    if (!GDRIVE_CLIENT_ID || GDRIVE_CLIENT_ID.startsWith('YOUR_')) {
      setSyncStatus('尚未設定 Google Client ID，請先完成 Google Cloud 設定', 'var(--red)');
      return;
    }
    const client = google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: async (resp) => {
        if (resp.error) { setSyncStatus('登入失敗：' + resp.error, 'var(--red)'); return; }
        gdriveToken = { access_token: resp.access_token, expires_at: Date.now() + resp.expires_in * 1000 };
        localStorage.setItem('gdrive_token', JSON.stringify(gdriveToken));
        await gdriveOnSignedIn();
      },
    });
    client.requestAccessToken();
  }

  // dueToExpiry: true when this was triggered by a failed/expired API call
  // (not a deliberate manual disconnect) — shows a toast and flags the header
  // icon red, since this can otherwise happen silently while the sync modal
  // isn't open and just quietly stop auto-syncing for good.
  function gdriveSignOut(dueToExpiry) {
    if (gdriveToken && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(gdriveToken.access_token, () => {});
    }
    gdriveToken = null;
    gdriveFileId = null;
    localStorage.removeItem('gdrive_token');
    btnGdriveSyncEl.hidden = false;
    btnGdriveSignoutEl.hidden = true;
    btnGdrivePullNowEl.hidden = true;
    btnGdrivePushNowEl.hidden = true;
    syncAccountHintEl.hidden = true;
    document.getElementById('openSyncModal').classList.toggle('sync-warn', !!dueToExpiry);
    if (dueToExpiry) {
      setSyncStatus('連線已過期，請重新連結', 'var(--red)');
      toast('☁️ Google Drive 連線已過期，記得點右上角重新連結');
    } else {
      setSyncStatus('已中斷 Google Drive 連結');
    }
  }

  async function gdriveShowAccount() {
    try {
      const r = await gdriveFetch('https://www.googleapis.com/oauth2/v3/userinfo');
      const info = await r.json();
      if (info.email) {
        syncAccountHintEl.textContent = `目前連結帳號：${info.email}　（兩台裝置要看到同一份資料，這裡必須完全一樣）`;
        syncAccountHintEl.hidden = false;
      }
    } catch (e) { /* non-essential — just skip showing the account if this fails */ }
  }

  async function gdriveOnSignedIn() {
    btnGdriveSyncEl.hidden = true;
    btnGdriveSignoutEl.hidden = false;
    btnGdrivePullNowEl.hidden = false;
    btnGdrivePushNowEl.hidden = false;
    document.getElementById('openSyncModal').classList.remove('sync-warn');
    setSyncStatus('☁️ 同步中...', 'var(--accent)');
    gdriveShowAccount();
    await gdrivePull();
  }

  async function gdriveFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization: `Bearer ${gdriveToken.access_token}` });
    const r = await fetch(url, opts);
    if (r.status === 401) { gdriveSignOut(true); throw new Error('登入已過期，請重新連結'); }
    return r;
  }

  async function gdriveFindFile() {
    if (gdriveFileId) return gdriveFileId;
    const r = await gdriveFetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime)&q=name%3D%22' + GDRIVE_FILE_NAME + '%22');
    const data = await r.json();
    gdriveFileId = (data.files && data.files[0] && data.files[0].id) || null;
    return gdriveFileId;
  }

  async function gdrivePull() {
    try {
      const fileId = await gdriveFindFile();
      if (!fileId) {
        setSyncStatus('首次連結，上傳本機資料...', 'var(--accent)');
        await gdrivePush();
        return;
      }
      const metaR = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`);
      const meta = await metaR.json();
      const cloudTime = new Date(meta.modifiedTime).getTime();
      const localTime = parseInt(localStorage.getItem('gdrive_last_push') || '0');
      if (cloudTime > localTime + 5000) {
        setSyncStatus('⬇ 下載雲端最新資料...', 'var(--accent)');
        const dlR = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        const data = await dlR.json();
        gdriveImporting = true;
        if (Array.isArray(data.sessions)) DB.saveSessions(data.sessions);
        if (Array.isArray(data.weights)) DB.saveWeights(data.weights);
        gdriveImporting = false;
        localStorage.setItem('gdrive_last_push', cloudTime.toString());
        setSyncStatus('✓ 已同步雲端資料，重新載入中...', 'var(--green)');
        setTimeout(() => location.reload(), 800);
      } else {
        setSyncStatus('✓ 資料已是最新', 'var(--green)');
      }
    } catch (e) {
      setSyncStatus('同步失敗：' + e.message, 'var(--red)');
    }
  }

  async function gdrivePush() {
    if (!gdriveToken) return;
    try {
      setSyncStatus('☁️ 儲存中...', 'var(--accent)');
      const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), sessions, weights });
      const fileId = await gdriveFindFile();
      let url, method;
      if (fileId) {
        url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&fields=id,modifiedTime`;
        method = 'PATCH';
      } else {
        url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';
        method = 'POST';
      }
      const meta = JSON.stringify(Object.assign({ name: GDRIVE_FILE_NAME }, fileId ? {} : { parents: ['appDataFolder'] }));
      const body = new FormData();
      body.append('metadata', new Blob([meta], { type: 'application/json' }));
      body.append('file', new Blob([payload], { type: 'application/json' }));
      const r = await gdriveFetch(url, { method, body });
      const result = await r.json();
      if (!fileId) gdriveFileId = result.id;
      const serverTime = result.modifiedTime ? new Date(result.modifiedTime).getTime() : Date.now();
      localStorage.setItem('gdrive_last_push', serverTime.toString());
      setSyncStatus(`✓ 已同步 ${new Date(serverTime).toLocaleTimeString('zh-TW')}`, 'var(--green)');
    } catch (e) {
      setSyncStatus('同步失敗：' + e.message, 'var(--red)');
    }
  }

  // Debounced push, called after every local write (see DB.saveSessions/saveWeights above).
  function scheduleSync() {
    if (!gdriveToken || gdriveImporting) return;
    clearTimeout(gdriveSyncTimer);
    gdriveSyncTimer = setTimeout(gdrivePush, 3000);
  }

  document.getElementById('openSyncModal').addEventListener('click', () => {
    syncModalEl.hidden = false;
    gdriveLoadScript().catch(() => {}); // in case the app-load preload above failed (e.g. offline at the time)
  });
  document.getElementById('closeSyncModal').addEventListener('click', () => { syncModalEl.hidden = true; });
  syncModalEl.addEventListener('click', (e) => { if (e.target === syncModalEl) syncModalEl.hidden = true; });
  btnGdriveSyncEl.addEventListener('click', gdriveSignIn);
  btnGdriveSignoutEl.addEventListener('click', () => gdriveSignOut(false));
  btnGdrivePullNowEl.addEventListener('click', gdrivePull);
  btnGdrivePushNowEl.addEventListener('click', gdrivePush);

  // ---------------------------------------------------------------------
  // Recent-focus goals board ("公佈欄") — 1-3 short reminders, always
  // pinned at the top of the Log tab.
  // ---------------------------------------------------------------------
  const KEY_GOALS = 'fitness_goals_v1';
  function loadGoals() {
    try { return JSON.parse(localStorage.getItem(KEY_GOALS)) || []; }
    catch { return []; }
  }
  function saveGoalsToStorage() { localStorage.setItem(KEY_GOALS, JSON.stringify(goals)); }
  let goals = loadGoals();

  function renderGoalsBoard() {
    const listEl = document.getElementById('goalsList');
    const nonEmpty = goals.filter(g => g && g.trim());
    listEl.innerHTML = nonEmpty.length
      ? nonEmpty.map(g => `<div class="goal-item">🎯 ${esc(g)}</div>`).join('')
      : '<div class="goals-empty">還沒有設定目標，點右上角 ✏️ 新增</div>';
  }

  const goalsModal = document.getElementById('goalsModal');
  document.getElementById('editGoalsBtn').addEventListener('click', () => {
    document.getElementById('goalInput1').value = goals[0] || '';
    document.getElementById('goalInput2').value = goals[1] || '';
    document.getElementById('goalInput3').value = goals[2] || '';
    goalsModal.hidden = false;
  });
  document.getElementById('closeGoalsModal').addEventListener('click', () => { goalsModal.hidden = true; });
  goalsModal.addEventListener('click', (e) => { if (e.target === goalsModal) goalsModal.hidden = true; });
  document.getElementById('saveGoalsBtn').addEventListener('click', () => {
    goals = [
      document.getElementById('goalInput1').value.trim(),
      document.getElementById('goalInput2').value.trim(),
      document.getElementById('goalInput3').value.trim(),
    ].filter(g => g);
    saveGoalsToStorage();
    renderGoalsBoard();
    goalsModal.hidden = true;
    toast('已更新近期目標');
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  document.getElementById('todayLabel').textContent = todayStr();
  restoreDraftIfAny();
  renderDraft();
  renderGoalsBoard();
  gdriveInit();
})();
