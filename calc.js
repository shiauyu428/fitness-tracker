// Pure calculation logic for the fitness tracker. No DOM access — testable standalone.
(function () {

  // 1RM estimate via Epley formula. At reps=1 the "estimate" is exact by
  // definition (you already lifted it once), so skip the formula's ~3.3% inflation.
  function epley1RM(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  }

  // Warm-up sets are excluded here (and everywhere else 1RM/volume is derived)
  // — they're sub-maximal by definition, so counting them would understate how
  // hard a "PR" really was, or inflate training volume with ramp-up reps.
  function bestSetEstimated1RM(sets) {
    if (!sets || sets.length === 0) return 0;
    return sets.reduce((max, s) => s.warmup ? max : Math.max(max, epley1RM(s.weight, s.reps)), 0);
  }

  // Two independent flags, `weight` is always ONE object's weight:
  //  - unilateral: each side is trained as its own effort (reps entered are per side) -> x2
  //  - dualWeight: one weight in each hand at the same time (8kg+8kg) -> x2
  // 1RM/PR deliberately ignore both and use the number as entered.
  function exerciseVolume(exercise) {
    if (!exercise || !exercise.sets) return 0;
    const multiplier = (exercise.unilateral ? 2 : 1) * (exercise.dualWeight ? 2 : 1);
    return exercise.sets.reduce((sum, s) => s.warmup ? sum : sum + (s.weight || 0) * (s.reps || 0), 0) * multiplier;
  }

  function sessionVolume(session) {
    if (!session || !session.exercises) return 0;
    return session.exercises.reduce((sum, ex) => sum + exerciseVolume(ex), 0);
  }

  // Best estimated 1RM (and the weight/date that produced it) for one exercise name
  // across all sessions, sorted chronologically. Returns null if never trained.
  function computePR(sessions, exerciseName) {
    let best = null;
    const sorted = [...sessions].sort((a, b) => a.date.localeCompare(b.date));
    for (const session of sorted) {
      for (const ex of session.exercises || []) {
        if (ex.name !== exerciseName) continue;
        for (const set of ex.sets || []) {
          if (set.warmup) continue;
          const est = epley1RM(set.weight, set.reps);
          if (!best || est > best.best1RM) {
            best = { best1RM: est, maxWeight: set.weight, reps: set.reps, date: session.date };
          }
        }
      }
    }
    return best;
  }

  // ISO week key (Mon-Sun), e.g. "2026-W33".
  function isoWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    // Shift to the Thursday of this week to make the ISO week number well-defined.
    const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
    d.setDate(d.getDate() - day + 3);
    const firstThursday = new Date(d.getFullYear(), 0, 4);
    const firstDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstDay + 3);
    const weekNum = 1 + Math.round((d - firstThursday) / (7 * 86400000));
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }

  function mondayOf(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }

  // Local-calendar-date string (avoids UTC drift from toISOString in timezones
  // ahead of UTC, which would otherwise shift dates back by one day).
  function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Aggregated session volume for each of the last `numWeeks` weeks, ending with
  // the week containing `refDateStr` (defaults to today). Weeks run Mon-Sun and
  // are returned oldest-first.
  function weeklyVolumes(sessions, numWeeks, refDateStr) {
    const ref = refDateStr || toDateStr(new Date());
    const refMonday = mondayOf(ref);
    const weeks = [];
    for (let i = numWeeks - 1; i >= 0; i--) {
      const monday = new Date(refMonday);
      monday.setDate(monday.getDate() - i * 7);
      weeks.push({ key: isoWeekKey(toDateStr(monday)), weekStart: toDateStr(monday), volume: 0 });
    }
    const byKey = new Map(weeks.map(w => [w.key, w]));
    for (const session of sessions) {
      const key = isoWeekKey(session.date);
      const bucket = byKey.get(key);
      if (bucket) bucket.volume += sessionVolume(session);
    }
    return weeks;
  }

  // Map of dateStr -> number of sessions logged that day, for the last `numDays`
  // days ending at refDateStr (defaults to today).
  function frequencyHeatmapData(sessions, numDays, refDateStr) {
    const ref = refDateStr || toDateStr(new Date());
    const refDate = new Date(ref + 'T00:00:00');
    const map = {};
    const totalDays = (numDays || 12) * 7;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(refDate);
      d.setDate(d.getDate() - i);
      map[toDateStr(d)] = 0;
    }
    for (const session of sessions) {
      if (session.date in map) {
        map[session.date] = (map[session.date] || 0) + 1;
      }
    }
    return map;
  }

  // Count of sets per body-part category within [fromDateStr, toDateStr] inclusive.
  function bodyPartDistribution(sessions, fromDateStr, toDateStr) {
    const dist = {};
    for (const session of sessions) {
      if (session.date < fromDateStr || session.date > toDateStr) continue;
      for (const ex of session.exercises || []) {
        const cat = ex.category || '其他';
        const count = (ex.sets || []).length;
        if (count === 0) continue;
        dist[cat] = (dist[cat] || 0) + count;
      }
    }
    return dist;
  }

  // %1RM helpers for the standalone RM calculator (table of weight/reps at each intensity).
  function weightForPercent(oneRM, percent) {
    return oneRM * percent / 100;
  }
  // Inverse of the Epley formula: reps such that weightForPercent(1RM,percent) is what
  // you could lift for that many reps. Keeps the calculator self-consistent with the
  // Epley 1RM estimate used everywhere else in the app.
  function repsForPercent(percent) {
    if (percent >= 100) return 1;
    return Math.max(1, Math.round(30 * (100 / percent - 1)));
  }

  // How close a given estimated 1RM is to the all-time-best estimated 1RM for
  // that exercise, as a percentage — e.g. "this session was trained at 82% of
  // your current 1RM". Guards against divide-by-zero when there's no PR yet.
  function intensityPercent(estimated1RM, allTimeBest1RM) {
    if (!allTimeBest1RM) return 0;
    return (estimated1RM / allTimeBest1RM) * 100;
  }

  // ---- AI export: a plain-text training log (with the question to ask) to paste
  // into an AI chat. Pure so it can be tested; the app just supplies the data. ----
  function fmtWeightText(ex, w) { return ex.dualWeight ? `${w}+${w}` : `${w}`; }

  function aiSetLine(ex, s, label) {
    const rir = (s.rir !== undefined && s.rir !== null && s.rir !== '') ? ` (RIR ${s.rir})` : '';
    if (ex.inputType === 'reps_only') return `${label}: ${s.reps}下${rir}`;
    if (ex.inputType === 'duration') return `${label}: ${s.seconds}秒`;
    return `${label}: ${fmtWeightText(ex, s.weight)}kg×${s.reps}${rir}`;
  }

  function aiExportText(opts) {
    const sessions = opts.sessions || [];
    const weights = opts.weights || [];
    const goals = (opts.goals || []).filter(g => g && g.trim());
    const fromDate = opts.fromDate || '0000-00-00';
    const toDate = opts.toDate || '9999-99-99';
    const inRange = sessions
      .filter(s => s.date >= fromDate && s.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    const r1 = n => Math.round(n * 10) / 10;
    const out = [];

    out.push('# 健身訓練紀錄（供 AI 分析）');
    out.push(`範圍：${opts.fromDate || '最早'} ～ ${opts.toDate || '今天'}，共 ${inRange.length} 次訓練`);
    out.push('');
    out.push('## 請你幫我');
    out.push('1. 檢視課表：各部位的訓練量／組數是否平衡（推拉、上下肢）、有沒有遺漏或過量的部位');
    out.push('2. 進步狀況：哪些動作的訓練量或預估 1RM 在進步、哪些停滯或退步');
    out.push('3. 訓練頻率與恢復是否合理（含酸痛紀錄）');
    out.push('4. 具體調整建議：動作、組數、次數、重量、頻率，並對照我的目標');
    out.push('');
    out.push('## 名詞說明');
    out.push('- 訓練量 = 重量×次數加總，熱身組不計');
    out.push('- 標示「單邊」＝左右邊分開各做一次（次數為單邊次數，訓練量已 ×2）');
    out.push('- 標示「雙持」＝左右手各拿一個重量（8+8kg 表示每手 8kg，訓練量已 ×2）');
    out.push('- 預估 1RM 以 Epley 公式：重量×(1+次數/30)，熱身組不計');
    out.push('- RIR = 這組結束時還能再做幾下（保留次數）');
    out.push('');

    if (goals.length) {
      out.push('## 我目前的目標／近日重點');
      goals.forEach(g => out.push(`- ${g.trim()}`));
      out.push('');
    }

    if (inRange.length === 0) {
      out.push('（這個範圍內沒有訓練紀錄）');
      return out.join('\n');
    }

    // Overview
    const spanDays = Math.max(1, Math.round((new Date(inRange[inRange.length - 1].date + 'T00:00:00') - new Date(inRange[0].date + 'T00:00:00')) / 86400000) + 1);
    const perWeek = r1(inRange.length / (spanDays / 7));
    out.push('## 總覽');
    out.push(`- 訓練次數：${inRange.length}（約每週 ${perWeek} 次）`);
    const setsByCat = {};
    inRange.forEach(s => (s.exercises || []).forEach(ex => {
      const n = (ex.sets || []).filter(st => !st.warmup).length;
      if (n) setsByCat[ex.category || '其他'] = (setsByCat[ex.category || '其他'] || 0) + n;
    }));
    out.push(`- 各部位工作組數：${Object.entries(setsByCat).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${n}`).join('、') || '無'}`);
    const numWeeks = Math.min(26, Math.max(1, Math.ceil(spanDays / 7)));
    const wk = weeklyVolumes(inRange, numWeeks, inRange[inRange.length - 1].date).filter(w => w.volume > 0);
    if (wk.length) out.push(`- 每週總訓練量(kg)：${wk.map(w => `${w.weekStart} ${Math.round(w.volume)}`).join('；')}`);
    out.push('');

    // Per-exercise summary (weight x reps only)
    const byName = new Map();
    inRange.forEach(s => (s.exercises || []).forEach(ex => {
      if ((ex.inputType || 'weight_reps') !== 'weight_reps') return;
      if (!byName.has(ex.name)) byName.set(ex.name, []);
      byName.get(ex.name).push({ date: s.date, ex });
    }));
    if (byName.size) {
      out.push('## 各動作摘要（重量×次數）');
      [...byName.entries()].forEach(([name, list]) => {
        const first = list[0], last = list[list.length - 1];
        const pr = computePR(sessions, name);
        const flags = (last.ex.unilateral ? '單邊' : '') + (last.ex.dualWeight ? (last.ex.unilateral ? '、雙持' : '雙持') : '');
        out.push(`- ${name}${flags ? `（${flags}）` : ''}：練 ${list.length} 次｜歷史最佳預估1RM ${pr ? r1(pr.best1RM) : '-'}kg（${pr ? pr.date : '-'}）｜訓練量 ${list.length > 1 ? `${first.date} ${Math.round(exerciseVolume(first.ex))}kg → ${last.date} ${Math.round(exerciseVolume(last.ex))}kg` : `${Math.round(exerciseVolume(last.ex))}kg`}`);
      });
      out.push('');
    }

    // Session-by-session log
    out.push('## 逐次訓練紀錄');
    inRange.forEach(s => {
      out.push(`### ${s.date}`);
      (s.exercises || []).forEach(ex => {
        const flags = (ex.unilateral ? '【單邊】' : '') + (ex.dualWeight ? '【雙持】' : '');
        out.push(`${ex.name}（${ex.category || '其他'}）${flags}${ex.note ? `　備註：${ex.note}` : ''}`);
        let w = 0, u = 0;
        (ex.sets || []).forEach(st => {
          if (st.warmup) { u++; out.push('  ' + aiSetLine(ex, st, `熱身${u}`)); }
          else { w++; out.push('  ' + aiSetLine(ex, st, `訓練組${w}`)); }
        });
        if ((ex.inputType || 'weight_reps') === 'weight_reps') out.push(`  小計：${Math.round(exerciseVolume(ex))}kg`);
        if (ex.soreness && ex.soreness.level) out.push(`  酸痛：${({ none: '無酸痛', mild: '輕度', moderate: '中度', severe: '太強' })[ex.soreness.level] || ex.soreness.level}${ex.soreness.note ? `（${ex.soreness.note}）` : ''}`);
      });
      if (s.notes) out.push(`訓練備註：${s.notes}`);
      out.push('');
    });

    const bw = weights.filter(x => x.date >= fromDate && x.date <= toDate).sort((a, b) => a.date.localeCompare(b.date));
    if (bw.length) {
      out.push('## 體重紀錄');
      out.push(bw.map(x => `${x.date} ${x.weight}kg`).join('；'));
    }
    return out.join('\n');
  }

  const Calc = {
    epley1RM,
    bestSetEstimated1RM,
    sessionVolume,
    exerciseVolume,
    computePR,
    isoWeekKey,
    weeklyVolumes,
    frequencyHeatmapData,
    bodyPartDistribution,
    weightForPercent,
    repsForPercent,
    intensityPercent,
    aiExportText,
    toDateStr,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  } else {
    window.Calc = Calc;
  }
})();
