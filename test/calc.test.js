(function () {
  const { test, assertEqual, assertClose, assertTrue } = window.TestKit;
  const Calc = window.Calc;

  // ---- epley1RM ----
  test('epley1RM: 1 rep returns the weight itself', () => {
    assertClose(Calc.epley1RM(100, 1), 100);
  });

  test('epley1RM: standard formula weight*(1+reps/30)', () => {
    // 80kg x 5 reps -> 80 * (1 + 5/30) = 93.33
    assertClose(Calc.epley1RM(80, 5), 93.33, 0.01);
  });

  test('epley1RM: 0 weight or 0 reps returns 0', () => {
    assertEqual(Calc.epley1RM(0, 5), 0);
    assertEqual(Calc.epley1RM(50, 0), 0);
  });

  // ---- bestSetEstimated1RM ----
  test('bestSetEstimated1RM: picks the set with highest estimated 1RM, not highest weight', () => {
    const sets = [
      { weight: 100, reps: 1 },  // 1RM = 100
      { weight: 80, reps: 10 },  // 1RM = 80*(1+10/30) = 106.67
    ];
    assertClose(Calc.bestSetEstimated1RM(sets), 106.67, 0.01);
  });

  test('bestSetEstimated1RM: empty set list returns 0', () => {
    assertEqual(Calc.bestSetEstimated1RM([]), 0);
  });

  test('bestSetEstimated1RM: warm-up sets are ignored even if they look impressive', () => {
    // A 100kg x5 "warm-up" would estimate ~116.7kg, way above the real working set —
    // it must not win just because the math looks bigger.
    const sets = [
      { weight: 100, reps: 5, warmup: true },
      { weight: 60, reps: 10 },
    ];
    assertClose(Calc.bestSetEstimated1RM(sets), 80, 0.01); // 60*(1+10/30)=80
  });

  // ---- sessionVolume ----
  test('sessionVolume: sums weight*reps across all exercises and sets', () => {
    const session = {
      exercises: [
        { name: 'Bench', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }] }, // 600+480=1080
        { name: 'Squat', sets: [{ weight: 100, reps: 5 }] }, // 500
      ],
    };
    assertEqual(Calc.sessionVolume(session), 1580);
  });

  test('sessionVolume: session with no exercises has 0 volume', () => {
    assertEqual(Calc.sessionVolume({ exercises: [] }), 0);
  });

  // ---- exerciseVolume ----
  test('exerciseVolume: sums weight*reps for one exercise', () => {
    const ex = { sets: [{ weight: 50, reps: 10 }, { weight: 55, reps: 8 }] };
    assertEqual(Calc.exerciseVolume(ex), 940);
  });

  test('exerciseVolume: unilateral exercises count both sides (reps are per-side)', () => {
    // 8kg x 10 reps on each side -> 160kg total for that set
    const ex = { unilateral: true, sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 160);
  });

  test('exerciseVolume: non-unilateral exercises are not doubled', () => {
    const ex = { sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 80);
  });

  test('exerciseVolume: dualWeight (one weight per hand) doubles the load, reps are not doubled', () => {
    // bilateral movement, 20kg dumbbell in each hand x 10 reps -> 400kg
    const ex = { dualWeight: true, sets: [{ weight: 20, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 400);
  });

  test('exerciseVolume: unilateral + dualWeight are independent and multiply', () => {
    const ex = { unilateral: true, dualWeight: true, sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 320); // 8 * 2 weights * 10 reps * 2 sides
  });

  test('exerciseVolume: unilateral alone (single weight, both sides) is unchanged', () => {
    const ex = { unilateral: true, sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 160);
  });

  test('exerciseVolume: warm-up sets do not count toward training volume', () => {
    const ex = { sets: [{ weight: 20, reps: 5, warmup: true }, { weight: 60, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 600); // only the 60x10 working set counts
  });

  // ---- computePR ----
  test('computePR: finds max estimated 1RM for an exercise across sessions, with date', () => {
    const sessions = [
      { date: '2026-08-01', exercises: [{ name: 'Bench', sets: [{ weight: 80, reps: 5 }] }] }, // 93.33
      { date: '2026-08-05', exercises: [{ name: 'Bench', sets: [{ weight: 90, reps: 3 }] }] }, // 99
      { date: '2026-08-03', exercises: [{ name: 'Squat', sets: [{ weight: 120, reps: 5 }] }] },
    ];
    const pr = Calc.computePR(sessions, 'Bench');
    assertClose(pr.best1RM, 99, 0.01);
    assertEqual(pr.date, '2026-08-05');
    assertEqual(pr.maxWeight, 90);
  });

  test('computePR: exercise with no history returns null', () => {
    assertEqual(Calc.computePR([], 'Deadlift'), null);
  });

  test('computePR: ignores warm-up sets when finding the best 1RM', () => {
    const sessions = [
      { date: '2026-08-01', exercises: [{ name: 'Bench', sets: [
        { weight: 100, reps: 5, warmup: true }, // would estimate ~116.7 if counted
        { weight: 60, reps: 10 }, // real working set, est. 1RM = 80
      ] }] },
    ];
    const pr = Calc.computePR(sessions, 'Bench');
    assertClose(pr.best1RM, 80, 0.01);
    assertEqual(pr.maxWeight, 60);
  });

  // ---- isoWeekKey ----
  test('isoWeekKey: groups dates within the same Mon-Sun week to the same key', () => {
    // 2026-08-10 is a Monday
    assertEqual(Calc.isoWeekKey('2026-08-10'), Calc.isoWeekKey('2026-08-16'));
    assertTrue(Calc.isoWeekKey('2026-08-10') !== Calc.isoWeekKey('2026-08-17'), 'next week should differ');
  });

  // ---- weeklyVolumes ----
  test('weeklyVolumes: aggregates session volume per week for last N weeks', () => {
    const sessions = [
      { date: '2026-08-10', exercises: [{ name: 'A', sets: [{ weight: 10, reps: 10 }] }] }, // 100, week of Aug10
      { date: '2026-08-11', exercises: [{ name: 'A', sets: [{ weight: 10, reps: 10 }] }] }, // 100, same week
      { date: '2026-08-03', exercises: [{ name: 'A', sets: [{ weight: 50, reps: 2 }] }] }, // 100, prior week
    ];
    const weeks = Calc.weeklyVolumes(sessions, 4, '2026-08-10');
    const lastWeek = weeks[weeks.length - 1];
    assertEqual(lastWeek.volume, 200);
  });

  // ---- frequencyHeatmapData ----
  test('frequencyHeatmapData: counts number of sessions per date', () => {
    const sessions = [
      { date: '2026-08-10', exercises: [] },
      { date: '2026-08-10', exercises: [] }, // two sessions same day
      { date: '2026-08-05', exercises: [] },
    ];
    const map = Calc.frequencyHeatmapData(sessions, 12, '2026-08-10');
    assertEqual(map['2026-08-10'], 2);
    assertEqual(map['2026-08-05'], 1);
  });

  // ---- weightForPercent / repsForPercent (RM calculator %1RM table) ----
  test('weightForPercent: scales 1RM by percentage', () => {
    assertEqual(Calc.weightForPercent(100, 80), 80);
    assertEqual(Calc.weightForPercent(93.3, 50), 46.65);
  });

  test('repsForPercent: 100% maps to 1 rep', () => {
    assertEqual(Calc.repsForPercent(100), 1);
  });

  test('repsForPercent: matches Epley formula inverted (e.g. 75% -> 10 reps)', () => {
    assertEqual(Calc.repsForPercent(75), 10);
    assertEqual(Calc.repsForPercent(60), 20);
  });

  // ---- intensityPercent (per-exercise chart: how close a session's estimated
  // 1RM was to the all-time best, i.e. what %1RM zone it was trained in) ----
  test('intensityPercent: session at the all-time best is 100%', () => {
    assertEqual(Calc.intensityPercent(100, 100), 100);
  });

  test('intensityPercent: scales proportionally below the best', () => {
    assertClose(Calc.intensityPercent(80, 100), 80);
  });

  test('intensityPercent: no history yet (0 denominator) returns 0, not NaN/Infinity', () => {
    assertEqual(Calc.intensityPercent(80, 0), 0);
  });

  // ---- aiExportText (plain-text training log to paste into an AI chat) ----
  const aiSessions = [
    { date: '2026-09-01', notes: '狀態不錯', exercises: [
      { name: '深蹲', category: '腿', inputType: 'weight_reps', note: '槓高40cm', sets: [
        { weight: 40, reps: 5, warmup: true },
        { weight: 100, reps: 5, rir: 2 },
      ] },
      { name: '啞鈴臥推', category: '胸', inputType: 'weight_reps', dualWeight: true, sets: [{ weight: 20, reps: 10 }] },
      { name: '單手划船', category: '背', inputType: 'weight_reps', unilateral: true, sets: [{ weight: 24, reps: 10 }] },
    ] },
    { date: '2026-01-01', exercises: [{ name: '深蹲', category: '腿', inputType: 'weight_reps', sets: [{ weight: 60, reps: 5 }] }] },
  ];
  const aiOpts = { sessions: aiSessions, weights: [{ date: '2026-09-02', weight: 70.5 }], goals: ['打開手腕活動度', ''], fromDate: '2026-08-01', toDate: '2026-09-25' };

  test('aiExportText: includes the analysis request and the goals', () => {
    const t = Calc.aiExportText(aiOpts);
    assertTrue(t.includes('請你幫我'), 'has prompt section');
    assertTrue(t.includes('打開手腕活動度'), 'has goals');
  });

  test('aiExportText: only sessions inside the date range are listed', () => {
    const t = Calc.aiExportText(aiOpts);
    assertTrue(t.includes('2026-09-01'), 'in-range session');
    assertTrue(!t.includes('2026-01-01'), 'out-of-range session must be excluded');
  });

  test('aiExportText: warm-ups are labelled, working sets shown with RIR and notes', () => {
    const t = Calc.aiExportText(aiOpts);
    assertTrue(t.includes('熱身1: 40kg×5'), 'warm-up line');
    assertTrue(t.includes('訓練組1: 100kg×5 (RIR 2)'), 'working set line');
    assertTrue(t.includes('槓高40cm'), 'exercise note');
  });

  test('aiExportText: dualWeight shows 20+20 and unilateral is flagged', () => {
    const t = Calc.aiExportText(aiOpts);
    assertTrue(t.includes('20+20kg×10'), 'dual weight notation');
    assertTrue(t.includes('單邊'), 'unilateral flag');
  });

  test('aiExportText: exercise summary uses all-time best 1RM, bodyweight is listed', () => {
    const t = Calc.aiExportText(aiOpts);
    assertTrue(t.includes('116.7'), 'squat best est 1RM 100*(1+5/30)=116.7');
    assertTrue(t.includes('70.5'), 'body weight entry');
  });

  // ---- bodyPartDistribution ----
  test('bodyPartDistribution: counts sets per category within a date range', () => {
    const sessions = [
      {
        date: '2026-08-01',
        exercises: [
          { name: 'Bench', category: '胸', sets: [{ weight: 1, reps: 1 }, { weight: 1, reps: 1 }] },
          { name: 'Row', category: '背', sets: [{ weight: 1, reps: 1 }] },
        ],
      },
      {
        date: '2020-01-01', // out of range, should be excluded
        exercises: [{ name: 'Old', category: '腿', sets: [{ weight: 1, reps: 1 }] }],
      },
    ];
    const dist = Calc.bodyPartDistribution(sessions, '2026-07-01', '2026-08-31');
    assertEqual(dist['胸'], 2);
    assertEqual(dist['背'], 1);
    assertEqual(dist['腿'], undefined);
  });
})();
