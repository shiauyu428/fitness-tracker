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

  test('exerciseVolume: unilateral exercises count both sides (weight is per-side)', () => {
    // 8kg in each hand x 10 reps -> 8+8 per rep -> 160kg total for that set
    const ex = { unilateral: true, sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 160);
  });

  test('exerciseVolume: non-unilateral exercises are not doubled', () => {
    const ex = { sets: [{ weight: 8, reps: 10 }] };
    assertEqual(Calc.exerciseVolume(ex), 80);
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
