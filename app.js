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

  // Per-exercise footer summary, depending on how this exercise is logged.
  function exerciseFooterText(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    if (ex.inputType === 'reps_only') {
      const total = ex.sets.reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
      return ex.unilateral ? `總次數：${total} 下（左右各算）` : `總次數：${total} 下`;
    }
    if (ex.inputType === 'duration') {
      const total = ex.sets.reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
      return ex.unilateral ? `總時間：${total} 秒（左右各算）` : `總時間：${total} 秒`;
    }
    const vol = round1(window.Calc.exerciseVolume(ex));
    return ex.unilateral ? `這動作總量：${vol} kg（單邊重量，左右各1組）` : `這動作總量：${vol} kg`;
  }

  // Generic single-number "how much was done" for an exercise, regardless of
  // logging type: kg for weight×reps, total reps for reps-only, total seconds for duration.
  function exerciseMetric(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    if (ex.inputType === 'reps_only') return ex.sets.reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
    if (ex.inputType === 'duration') return ex.sets.reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
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

  function rirInputHtml(ex, s, i) {
    if (!ex.trackRir) return '';
    return `<input type="number" inputmode="numeric" class="rir-input" placeholder="RIR" step="1" min="0" max="10"
      value="${s.rir === '' || s.rir == null ? '' : s.rir}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="rir" title="保留次數 (Reps in Reserve)">`;
  }

  function setRowHtml(ex, s, i) {
    if (ex.inputType === 'reps_only') {
      return `
        <div class="set-row ${ex.trackRir ? 'set-row-2' : 'set-row-1'}">
          <span class="set-idx">${i + 1}</span>
          <input type="number" inputmode="numeric" placeholder="次數" step="1" min="0"
            value="${s.reps === '' ? '' : s.reps}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="reps">
          ${rirInputHtml(ex, s, i)}
          <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
        </div>`;
    }
    if (ex.inputType === 'duration') {
      return `
        <div class="set-row set-row-1">
          <span class="set-idx">${i + 1}</span>
          <input type="number" inputmode="numeric" placeholder="秒數" step="1" min="0"
            value="${s.seconds === '' ? '' : s.seconds}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="seconds">
          <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
        </div>`;
    }
    return `
      <div class="set-row ${ex.trackRir ? 'set-row-3' : ''}">
        <span class="set-idx">${i + 1}</span>
        <input type="number" inputmode="decimal" placeholder="${ex.unilateral ? '單邊重量 kg' : '重量 kg'}" step="0.5" min="0"
          value="${s.weight === '' ? '' : s.weight}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="weight">
        <input type="number" inputmode="numeric" placeholder="次數" step="1" min="0"
          value="${s.reps === '' ? '' : s.reps}" data-ex-id="${ex.id}" data-set-idx="${i}" data-field="reps">
        ${rirInputHtml(ex, s, i)}
        <button class="rm-set" data-action="remove-set" data-ex-id="${ex.id}" data-set-idx="${i}" title="移除這組">✕</button>
      </div>`;
  }

  function renderExerciseList() {
    if (draft.exercises.length === 0) {
      exerciseListEl.innerHTML = '<div class="empty-state">還沒有加入動作，點下方「＋ 新增動作」開始記錄</div>';
      return;
    }
    exerciseListEl.innerHTML = draft.exercises.map(ex => `
      <div class="exercise-card" data-ex-id="${ex.id}">
        <div class="exercise-card-head">
          <div><span class="name">${esc(ex.name)}</span><span class="cat-badge">${esc(ex.category)}</span>${ex.unilateral ? '<span class="uni-badge">單邊</span>' : ''}</div>
          <button class="btn-icon" data-action="remove-exercise" data-ex-id="${ex.id}" title="移除動作">✕</button>
        </div>
        <input type="text" class="ex-note-input" placeholder="動作備註（例如：槓高40cm、握距寬）" value="${esc(ex.note || '')}" data-ex-id="${ex.id}">
        ${exerciseHistoryBoxHtml(ex)}
        ${ex.sets.map((s, i) => setRowHtml(ex, s, i)).join('')}
        <button class="add-set-btn" data-action="add-set" data-ex-id="${ex.id}">＋ 新增一組</button>
        <div class="exercise-card-foot">
          <span class="exercise-vol" data-vol-for="${ex.id}">${exerciseFooterText(ex)}</span>
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
  });

  function defaultSetFor(ex, last) {
    if (ex.inputType === 'reps_only') {
      return { reps: last ? last.reps : '', ...(ex.trackRir ? { rir: '' } : {}) };
    }
    if (ex.inputType === 'duration') return { seconds: last ? last.seconds : '' };
    return { weight: last ? last.weight : '', reps: last ? last.reps : '', ...(ex.trackRir ? { rir: '' } : {}) };
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
    }
    renderDraft();
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
  const unilateralHintEl = document.getElementById('unilateralHint');
  const rirToggleEl = document.getElementById('rirToggle');

  let selectedCategory = CATEGORIES[0];
  let currentInputType = 'weight_reps';
  let currentVariants = null;
  let selectedVariant = null;
  let isRegression = false;
  let isUnilateral = false;
  let trackRir = false;

  function setUnilateral(value) {
    isUnilateral = value;
    unilateralToggleEl.classList.toggle('selected', isUnilateral);
    unilateralHintEl.hidden = !isUnilateral;
  }

  categoryChipsEl.innerHTML = CATEGORIES.map(c => `<button class="chip" data-cat="${c}">${c}</button>`).join('');

  function findPreset(name) {
    const list = PRESETS[selectedCategory] || [];
    return list.find(p => p.name === name);
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
    const presets = PRESETS[selectedCategory] || [];
    exercisePresetsList.innerHTML = presets.map(p => `<option value="${esc(p.name)}">`).join('');
    presetQuickPickEl.innerHTML = presets.map(p => `<button class="preset-chip" data-name="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  }
  categoryChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectedCategory = chip.dataset.cat;
    setInputType('weight_reps');
    setVariants(null);
    setUnilateral(false);
    refreshModalForCategory();
  });
  presetQuickPickEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.preset-chip');
    if (!chip) return;
    exerciseNameInput.value = chip.dataset.name;
    const preset = findPreset(chip.dataset.name);
    setInputType((preset && preset.inputType) || 'weight_reps');
    setVariants(preset && preset.variants);
    setUnilateral(!!(preset && preset.unilateral));
  });
  inputTypeChipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    setInputType(chip.dataset.type);
    if (chip.dataset.type === 'duration') {
      trackRir = false;
      rirToggleEl.classList.remove('selected');
    }
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
  rirToggleEl.addEventListener('click', () => {
    trackRir = !trackRir;
    rirToggleEl.classList.toggle('selected', trackRir);
  });

  function openModal() {
    exerciseNameInput.value = '';
    selectedCategory = CATEGORIES[0];
    isRegression = false;
    regressionToggleEl.classList.remove('selected');
    trackRir = false;
    rirToggleEl.classList.remove('selected');
    setInputType('weight_reps');
    setVariants(null);
    setUnilateral(false);
    refreshModalForCategory();
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
    draft.exercises.push({
      id: uid(), name, category: selectedCategory, inputType: currentInputType, unilateral: isUnilateral, trackRir, note: '',
      sets: [defaultSetFor({ inputType: currentInputType, trackRir }, null)],
    });
    closeModal();
    renderDraft();
  });

  // ---- Save session ----
  function rirFieldFor(s) {
    return s.rir !== '' && s.rir != null ? { rir: Number(s.rir) } : {};
  }

  function cleanSetsFor(ex) {
    if (ex.inputType === 'reps_only') {
      return ex.sets
        .filter(s => s.reps !== '' && Number(s.reps) > 0)
        .map(s => ({ reps: Number(s.reps), ...rirFieldFor(s) }));
    }
    if (ex.inputType === 'duration') {
      return ex.sets
        .filter(s => s.seconds !== '' && Number(s.seconds) > 0)
        .map(s => ({ seconds: Number(s.seconds) }));
    }
    return ex.sets
      .filter(s => s.weight !== '' && s.reps !== '' && Number(s.weight) >= 0 && Number(s.reps) > 0)
      .map(s => ({ weight: Number(s.weight), reps: Number(s.reps), ...rirFieldFor(s) }));
  }

  const logTitleEl = document.getElementById('logTitle');
  const editBannerEl = document.getElementById('editBanner');
  const saveSessionBtnEl = document.getElementById('saveSessionBtn');

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
        trackRir: ex.trackRir,
        soreness: ex.soreness,
        note: ex.note,
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
        id: ex.id, name: ex.name, category: ex.category, inputType: ex.inputType, unilateral: ex.unilateral,
        trackRir: ex.trackRir, soreness: ex.soreness, note: (ex.note || '').trim(),
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
    if (ex.inputType === 'reps_only') return `${s.reps}下${rirSuffix}`;
    if (ex.inputType === 'duration') return `${s.seconds}秒`;
    return (ex.unilateral ? `${s.weight}+${s.weight}kg×${s.reps}` : `${s.weight}kg×${s.reps}`) + rirSuffix;
  }
  function exerciseSubtotalLabel(ex) {
    const sideMul = ex.unilateral ? 2 : 1;
    if (ex.inputType === 'reps_only') {
      const total = ex.sets.reduce((s, x) => s + (Number(x.reps) || 0), 0) * sideMul;
      return ex.unilateral ? `共 ${total} 下（左右各算）` : `共 ${total} 下`;
    }
    if (ex.inputType === 'duration') {
      const total = ex.sets.reduce((s, x) => s + (Number(x.seconds) || 0), 0) * sideMul;
      return ex.unilateral ? `共 ${total} 秒（左右各算）` : `共 ${total} 秒`;
    }
    return `小計 ${round1(window.Calc.exerciseVolume(ex))} kg`;
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
            <div class="meta">${s.exercises.length} 個動作・${setCount} 組・共 ${round1(vol)} kg</div></div>
          <div>${open ? '▲' : '▼'}</div>
        </div>
        <div class="session-item-body ${open ? 'open' : ''}">
          ${s.exercises.map(ex => `
            <div class="session-ex-row">
              <span class="ex-name">${esc(ex.name)}</span>
              <span class="cat-badge">${esc(ex.category)}</span>${ex.unilateral ? '<span class="uni-badge">單邊</span>' : ''}<br>
              <span class="sets-str">${ex.sets.map(st => formatSetLabel(ex, st)).join('、')}
                （${exerciseSubtotalLabel(ex)}）</span><br>
              ${ex.note ? `<span class="ex-note-display">📌 ${esc(ex.note)}</span><br>` : ''}
              ${ex.soreness ? `
                <button class="soreness-badge" data-action="soreness" data-session-id="${s.id}" data-ex-id="${ex.id}">
                  ${SORENESS_LEVELS[ex.soreness.level].emoji} ${SORENESS_LEVELS[ex.soreness.level].label}${ex.soreness.note ? '・' + esc(ex.soreness.note) : ''}
                </button>
              ` : `
                <button class="soreness-add-btn" data-action="soreness" data-session-id="${s.id}" data-ex-id="${ex.id}">🩹 記錄延遲性酸痛</button>
              `}
            </div>
          `).join('')}
          ${s.notes ? `<div class="session-notes">📝 ${esc(s.notes)}</div>` : ''}
          <div class="session-actions">
            <button class="btn btn-sm btn-outline" data-action="edit" data-id="${s.id}">編輯</button>
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

  let timerRemaining = 0;
  let timerInterval = null;
  let timerRunning = false;

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
    timerRemaining--;
    if (timerRemaining <= 0) {
      timerRemaining = 0;
      clearInterval(timerInterval);
      timerRunning = false;
      updateTimerUI();
      onTimerDone();
      return;
    }
    updateTimerUI();
  }

  function startTimer(seconds) {
    clearInterval(timerInterval);
    timerRemaining = seconds;
    timerRunning = true;
    updateTimerUI();
    timerInterval = setInterval(timerTick, 1000);
  }

  function pauseResumeTimer() {
    if (timerRemaining <= 0) return;
    if (timerRunning) {
      clearInterval(timerInterval);
      timerRunning = false;
    } else {
      timerRunning = true;
      timerInterval = setInterval(timerTick, 1000);
    }
    updateTimerUI();
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    timerRemaining = 0;
    updateTimerUI();
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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

  // ---------------------------------------------------------------------
  // Google Drive sync (optional) — stores one JSON file in the app's hidden
  // Drive "appDataFolder" (invisible in the user's normal Drive UI). Same
  // pattern as this developer's other personal trackers: last-write-wins,
  // whole-file replace, pushed 3s after any local change, pulled on load.
  // ---------------------------------------------------------------------
  const GDRIVE_CLIENT_ID = '675940238157-ahcuged7kgcbcvsc8e6kun2s7nvg6n5h.apps.googleusercontent.com';
  const GDRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const GDRIVE_FILE_NAME = 'fitness_tracker_sync.json';

  const syncModalEl = document.getElementById('syncModal');
  const syncStatusEl = document.getElementById('syncStatus');
  const btnGdriveSyncEl = document.getElementById('btnGdriveSync');
  const btnGdriveSignoutEl = document.getElementById('btnGdriveSignout');
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
    try {
      const t = JSON.parse(saved);
      if (t.expires_at > Date.now() + 60000) {
        gdriveToken = t;
        await gdriveOnSignedIn();
        return;
      }
    } catch (e) { /* malformed cached token — fall through and clear it */ }
    localStorage.removeItem('gdrive_token');
  }

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

  function gdriveSignOut() {
    if (gdriveToken && typeof google !== 'undefined') {
      google.accounts.oauth2.revoke(gdriveToken.access_token, () => {});
    }
    gdriveToken = null;
    gdriveFileId = null;
    localStorage.removeItem('gdrive_token');
    btnGdriveSyncEl.hidden = false;
    btnGdriveSignoutEl.hidden = true;
    btnGdrivePushNowEl.hidden = true;
    setSyncStatus('已中斷 Google Drive 連結');
  }

  async function gdriveOnSignedIn() {
    btnGdriveSyncEl.hidden = true;
    btnGdriveSignoutEl.hidden = false;
    btnGdrivePushNowEl.hidden = false;
    setSyncStatus('☁️ 同步中...', 'var(--accent)');
    await gdrivePull();
  }

  async function gdriveFetch(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({}, opts.headers, { Authorization: `Bearer ${gdriveToken.access_token}` });
    const r = await fetch(url, opts);
    if (r.status === 401) { gdriveSignOut(); throw new Error('登入已過期，請重新連結'); }
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

  document.getElementById('openSyncModal').addEventListener('click', () => { syncModalEl.hidden = false; });
  document.getElementById('closeSyncModal').addEventListener('click', () => { syncModalEl.hidden = true; });
  syncModalEl.addEventListener('click', (e) => { if (e.target === syncModalEl) syncModalEl.hidden = true; });
  btnGdriveSyncEl.addEventListener('click', gdriveSignIn);
  btnGdriveSignoutEl.addEventListener('click', gdriveSignOut);
  btnGdrivePushNowEl.addEventListener('click', gdrivePush);

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  document.getElementById('todayLabel').textContent = todayStr();
  renderDraft();
  gdriveInit();
})();
