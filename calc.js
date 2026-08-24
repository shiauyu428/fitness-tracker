// Pure calculation logic for the fitness tracker. No DOM access — testable standalone.
(function () {

  // 1RM estimate via Epley formula. At reps=1 the "estimate" is exact by
  // definition (you already lifted it once), so skip the formula's ~3.3% inflation.
  function epley1RM(weight, reps) {
    if (!weight || !reps) return 0;
    if (reps === 1) return weight;
    return weight * (1 + reps / 30);
  }

  function bestSetEstimated1RM(sets) {
    if (!sets || sets.length === 0) return 0;
    return sets.reduce((max, s) => Math.max(max, epley1RM(s.weight, s.reps)), 0);
  }

  // For unilateral exercises, `weight` is the load on ONE side (e.g. one dumbbell);
  // both sides did the work, so volume counts it twice (8kg+8kg, not 8kg).
  function exerciseVolume(exercise) {
    if (!exercise || !exercise.sets) return 0;
    const multiplier = exercise.unilateral ? 2 : 1;
    return exercise.sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0) * multiplier;
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
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calc;
  } else {
    window.Calc = Calc;
  }
})();
