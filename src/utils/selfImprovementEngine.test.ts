import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addCustomAffirmation,
  addGoal,
  addHabit,
  addTask,
  buildLast30DaysProgress,
  commitTodaysAffirmation,
  createInitialSelfImprovementState,
  createNote,
  cycleAffirmation,
  deleteAffirmation,
  deleteTask,
  filterNotes,
  filterTasks,
  formatCountdown,
  getDailyHabitProgress,
  getGoalProgressPercent,
  getHabitStreak,
  getTodayFocusSummary,
  getTodaysAffirmation,
  logCleanDay,
  logUrgeVictory,
  recordFocusSession,
  resetCleanStreak,
  toggleGoalMilestone,
  toggleHabitDate,
  toggleTask,
  updateNote,
} from './selfImprovementEngine';

test('Clean streak increments once per day, tracks longest, and resets cleanly', () => {
  let state = createInitialSelfImprovementState('2026-11-19');
  const startStreak = state.cleanStreakDays;

  state = logCleanDay(state, '2026-11-19');
  assert.equal(state.cleanStreakDays, startStreak + 1);

  // Idempotent on same date
  state = logCleanDay(state, '2026-11-19');
  assert.equal(state.cleanStreakDays, startStreak + 1);

  state = logUrgeVictory(state);
  assert.equal(state.urgeVictories, 6);

  state = resetCleanStreak(state, '2026-11-19');
  assert.equal(state.cleanStreakDays, 0);
  assert.equal(state.longestCleanStreakDays, 14);
});

test('Habits compute daily completion percentage and consecutive streak', () => {
  const anchor = new Date(2026, 10, 19);
  let state = createInitialSelfImprovementState('2026-11-19');
  state = addHabit(state, 'Cold Shower', 'Discipline');
  const added = state.habits[state.habits.length - 1];

  state = toggleHabitDate(state, added.id, '2026-11-19');
  state = toggleHabitDate(state, added.id, '2026-11-18');
  state = toggleHabitDate(state, added.id, '2026-11-17');

  const updatedHabit = state.habits.find((h) => h.id === added.id)!;
  assert.equal(getHabitStreak(updatedHabit, anchor), 3);

  const progress = getDailyHabitProgress(state.habits, '2026-11-19');
  assert.equal(progress.completed, 1);
  assert.equal(progress.total, state.habits.length);
});

test('Tasks and Goals update progress accurately', () => {
  let state = createInitialSelfImprovementState('2026-11-19');
  const initialCount = state.tasks.length;
  state = addTask(state, 'Read 20 pages', 'High', 'Mindset', '20:00');
  assert.equal(state.tasks.length, initialCount + 1);
  const newTaskId = state.tasks[0].id;

  state = toggleTask(state, newTaskId);
  assert.equal(filterTasks(state.tasks, 'completed').length, 1);
  state = deleteTask(state, newTaskId);
  assert.equal(state.tasks.length, initialCount);

  state = addGoal(state, 'Run 5k', 'Fitness', '2026-12-30', 'Build endurance', ['Week 1', 'Week 2']);
  const goal = state.goals[0];
  assert.equal(getGoalProgressPercent(goal), 0);

  state = toggleGoalMilestone(state, goal.id, goal.milestones[0].id);
  assert.equal(getGoalProgressPercent(state.goals[0]), 50);
});

test('Rich notes support font family, font size, HTML tables, pinning, and filtering', () => {
  let state = createInitialSelfImprovementState('2026-11-19');
  const { nextState, createdNoteId } = createNote(
    state,
    'Urge Reflection',
    'Late Night Trigger Log',
    '<p><b>Bold</b> and <i>Italic</i></p><table><tr><th>Time</th><th>Action</th></tr><tr><td>23:00</td><td>Walk</td></tr></table>',
    '2026-11-19'
  );
  state = nextState;

  state = updateNote(state, createdNoteId, {
    fontFamily: 'mono',
    fontSize: 'lg',
    pinned: true,
  });

  const edited = state.notes.find((n) => n.id === createdNoteId)!;
  assert.equal(edited.fontFamily, 'mono');
  assert.equal(edited.fontSize, 'lg');
  assert.equal(edited.pinned, true);
  assert.ok(edited.htmlContent.includes('<table>'));

  const results = filterNotes(state.notes, 'Urge Reflection', 'Trigger');
  assert.equal(results.length, 1);
  assert.equal(results[0].id, createdNoteId);
});

test('buildLast30DaysProgress generates 30 days of clean streak and habit completion series', () => {
  const anchor = new Date(2026, 10, 19, 12, 0, 0);
  let state = createInitialSelfImprovementState('2026-11-19');
  const initialSeries = buildLast30DaysProgress(state, anchor);
  assert.equal(initialSeries.length, 30);
  assert.equal(initialSeries[29].date, '2026-11-19');
  assert.equal(initialSeries[29].cleanStreakDay, 7);

  state = logCleanDay(state, '2026-11-19');
  state = toggleHabitDate(state, state.habits[0].id, '2026-11-19');
  const updatedSeries = buildLast30DaysProgress(state, anchor);
  assert.equal(updatedSeries[29].cleanStreakDay, 8);
  assert.ok(updatedSeries[29].habitCompletionRate > 0);
});

test('Daily affirmations support cycling, daily commit, custom creation, and deletion', () => {
  let state = createInitialSelfImprovementState('2026-11-19');
  const first = getTodaysAffirmation(state);
  state = cycleAffirmation(state, 1);
  const second = getTodaysAffirmation(state);
  assert.notEqual(first.id, second.id);

  state = commitTodaysAffirmation(state, '2026-11-19');
  assert.equal(state.lastAffirmationCommittedDate, '2026-11-19');

  const initialLen = state.affirmations.length;
  state = addCustomAffirmation(state, 'I build discipline one focused hour at a time.', 'Focus');
  assert.equal(state.affirmations.length, initialLen + 1);
  assert.equal(getTodaysAffirmation(state).text, 'I build discipline one focused hour at a time.');

  const customId = state.affirmations[0].id;
  state = deleteAffirmation(state, customId);
  assert.equal(state.affirmations.length, initialLen);
});

test('Focus mode timer formats countdown and aggregates daily focus sessions', () => {
  let state = createInitialSelfImprovementState('2026-11-19');
  assert.equal(formatCountdown(1500), '25:00');
  assert.equal(formatCountdown(65), '01:05');

  const before = getTodayFocusSummary(state, '2026-11-19');
  assert.equal(before.sessions, 0);

  state = recordFocusSession(state, 25, 'Kotlin Study Block', '2026-11-19', '09:30');
  state = recordFocusSession(state, 15, 'Reading Pages', '2026-11-19', '10:00');
  const after = getTodayFocusSummary(state, '2026-11-19');
  assert.equal(after.sessions, 2);
  assert.equal(after.minutes, 40);
});
