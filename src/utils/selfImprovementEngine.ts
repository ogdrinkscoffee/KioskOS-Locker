export type NoteFontFamily = 'sans' | 'serif' | 'mono';
export type NoteFontSize = 'sm' | 'base' | 'lg' | 'xl';
export type NoteNotebook = 'Diary' | 'Goals & Vision' | 'Urge Reflection' | 'Notes';
export type TaskPriority = 'High' | 'Medium' | 'Low';
export type TaskFilter = 'all' | 'active' | 'completed';

export interface HabitItem {
  id: string;
  title: string;
  category: 'Recovery' | 'Focus' | 'Health' | 'Discipline';
  completedDates: string[];
}

export interface TaskItem {
  id: string;
  title: string;
  priority: TaskPriority;
  category: string;
  dueTime: string;
  completed: boolean;
}

export interface GoalMilestone {
  id: string;
  title: string;
  done: boolean;
}

export interface GoalItem {
  id: string;
  title: string;
  category: 'Recovery' | 'Fitness' | 'Career & Study' | 'Mindset';
  targetDate: string;
  whyItMatters: string;
  milestones: GoalMilestone[];
}

export interface RichNote {
  id: string;
  title: string;
  notebook: NoteNotebook;
  fontFamily: NoteFontFamily;
  fontSize: NoteFontSize;
  htmlContent: string;
  pinned: boolean;
  updatedAt: string;
}

export type AffirmationFocus = 'Recovery' | 'Focus' | 'Self-Respect' | 'Resilience';

export interface AffirmationItem {
  id: string;
  text: string;
  focusArea: AffirmationFocus;
  isCustom: boolean;
}

export interface DailyProgressPoint {
  date: string;
  label: string;
  cleanStreakDay: number;
  habitCompletionRate: number;
  completedHabits: number;
  totalHabits: number;
}

export interface FocusSessionLog {
  id: string;
  date: string;
  minutes: number;
  label: string;
  completedAt: string;
}

export interface AiDailyPrompt {
  question: string;
  focusTheme: string;
  goalReferenced: string;
  writingStarter: string;
}

export interface SelfImprovementState {
  cleanStreakDays: number;
  longestCleanStreakDays: number;
  lastCleanCheckInDate: string | null;
  cleanCheckInDates: string[];
  urgeVictories: number;
  whyIStarted: string;
  affirmations: AffirmationItem[];
  activeAffirmationIndex: number;
  lastAffirmationCommittedDate: string | null;
  focusSessions: FocusSessionLog[];
  habits: HabitItem[];
  tasks: TaskItem[];
  goals: GoalItem[];
  notes: RichNote[];
}

export const DEFAULT_AFFIRMATIONS: AffirmationItem[] = [
  {
    id: 'aff-1',
    text: 'My attention belongs to my real-world goals, not to an algorithm or cheap dopamine.',
    focusArea: 'Focus',
    isCustom: false,
  },
  {
    id: 'aff-2',
    text: 'An urge is only a temporary wave. I pause for 60 seconds and choose who I want to become.',
    focusArea: 'Resilience',
    isCustom: false,
  },
  {
    id: 'aff-3',
    text: 'Every clean night builds deep self-respect that I will feel the moment I wake up.',
    focusArea: 'Recovery',
    isCustom: false,
  },
  {
    id: 'aff-4',
    text: 'Boredom is not an emergency. I turn quiet moments into reading, training, or building.',
    focusArea: 'Self-Respect',
    isCustom: false,
  },
  {
    id: 'aff-5',
    text: 'I locked distractions out of this device because my clarity and peace of mind come first.',
    focusArea: 'Recovery',
    isCustom: false,
  },
];

export function formatIsoDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getRecentDates(days = 7, anchorDate: Date = new Date()): string[] {
  const result: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() - i);
    result.push(formatIsoDate(d));
  }
  return result;
}

function buildSeededHabitDates(recent30: string[], pattern: number[]): string[] {
  // Recent30 has index 0 = 29 days ago, index 29 = today.
  // Skip index 29 (today) so initial today completion starts clean for user check-in.
  return recent30.filter((_, idx) => idx < recent30.length - 1 && pattern.includes(idx));
}

function parseAnchorDate(todayStr: string): Date {
  const parts = todayStr.split('-').map(Number);
  if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }
  return new Date();
}

export function createInitialSelfImprovementState(todayStr = formatIsoDate()): SelfImprovementState {
  const recent30 = getRecentDates(30, parseAnchorDate(todayStr));
  const yesterdayStr = recent30[recent30.length - 2];

  // Seed realistic 30-day recovery curve: earlier 12-day clean streak -> slip -> current 7-day clean streak
  const seededCleanDates = [
    ...recent30.slice(3, 15),
    ...recent30.slice(22, 29),
  ];

  return {
    cleanStreakDays: 7,
    longestCleanStreakDays: 14,
    lastCleanCheckInDate: yesterdayStr,
    cleanCheckInDates: seededCleanDates,
    urgeVictories: 5,
    whyIStarted:
      'I am reclaiming my attention, mental clarity, and self-respect by removing porn and endless social media feeds from my daily environment.',
    affirmations: DEFAULT_AFFIRMATIONS,
    activeAffirmationIndex: 0,
    lastAffirmationCommittedDate: null,
    focusSessions: [
      {
        id: 'focus-seed-1',
        date: yesterdayStr,
        minutes: 45,
        label: 'Deep study without phone distractions',
        completedAt: '10:15',
      },
    ],
    habits: [
      {
        id: 'hab-no-porn',
        title: 'Clean Day (No Porn)',
        category: 'Recovery',
        completedDates: buildSeededHabitDates(recent30, [
          3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 22, 23, 24, 25, 26, 27, 28,
        ]),
      },
      {
        id: 'hab-no-social',
        title: 'Zero Social Media Scrolling',
        category: 'Recovery',
        completedDates: buildSeededHabitDates(recent30, [
          3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 18, 20, 22, 23, 24, 25, 26, 27, 28,
        ]),
      },
      {
        id: 'hab-night-desk',
        title: 'Phone Charged Outside Bedroom',
        category: 'Discipline',
        completedDates: buildSeededHabitDates(recent30, [
          4, 5, 6, 8, 9, 11, 12, 13, 16, 18, 21, 22, 23, 24, 25, 27, 28,
        ]),
      },
      {
        id: 'hab-deep-work',
        title: '45m Deep Work / Study',
        category: 'Focus',
        completedDates: buildSeededHabitDates(recent30, [
          2, 3, 5, 6, 9, 10, 12, 15, 17, 19, 20, 23, 24, 26, 27,
        ]),
      },
      {
        id: 'hab-training',
        title: 'Physical Workout or Walk',
        category: 'Health',
        completedDates: buildSeededHabitDates(recent30, [
          1, 4, 6, 8, 10, 13, 15, 18, 21, 23, 25, 27,
        ]),
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Complete morning intention diary entry',
        priority: 'High',
        category: 'Recovery',
        dueTime: '09:00',
        completed: false,
      },
      {
        id: 'task-2',
        title: 'Finish 2 deep-work focus blocks without phone checks',
        priority: 'High',
        category: 'Focus',
        dueTime: '13:00',
        completed: false,
      },
      {
        id: 'task-3',
        title: 'Evening 30-minute strength or cardio session',
        priority: 'Medium',
        category: 'Health',
        dueTime: '18:30',
        completed: false,
      },
    ],
    goals: [
      {
        id: 'goal-1',
        title: '30 Days Completely Porn & Social-Media Free',
        category: 'Recovery',
        targetDate: '2026-12-19',
        whyItMatters:
          'Reset dopamine baseline, eliminate late-night triggers, and build reliable self-trust.',
        milestones: [
          { id: 'm-1', title: 'Lock browsers & social apps behind Admin PIN', done: true },
          { id: 'm-2', title: 'Reach 7 consecutive clean days', done: true },
          { id: 'm-3', title: 'Reach 14 consecutive clean days', done: false },
          { id: 'm-4', title: 'Complete full 30-day reset milestone', done: false },
        ],
      },
      {
        id: 'goal-2',
        title: 'Build Consistent Deep Work & Reading Routine',
        category: 'Career & Study',
        targetDate: '2026-12-31',
        whyItMatters: 'Channel freed time into measurable skill growth and daily reading.',
        milestones: [
          { id: 'm-5', title: 'Read 20 pages daily for 14 days', done: false },
          { id: 'm-6', title: 'Complete 25 focused work sessions', done: false },
        ],
      },
    ],
    notes: [
      {
        id: 'note-1',
        title: 'My Recovery Commitment & Trigger Plan',
        notebook: 'Goals & Vision',
        fontFamily: 'sans',
        fontSize: 'base',
        pinned: true,
        updatedAt: todayStr,
        htmlContent:
          '<p><strong>Core Rule:</strong> This device is locked down for growth. Whenever boredom, stress, or late-night fatigue triggers an urge, I pause for 60 seconds and choose a replacement action.</p>' +
          '<p><em>If I feel tempted to open social media or adult content, I log the trigger honestly below instead of acting on autopilot.</em></p>' +
          '<table><thead><tr><th>Trigger</th><th>Warning Sign</th><th>Replacement Action</th></tr></thead><tbody>' +
          '<tr><td>Late-night fatigue</td><td>Mindless scrolling urge</td><td>Plug phone outside bedroom, read 10 pages</td></tr>' +
          '<tr><td>Work stress</td><td>Seeking quick distraction</td><td>Stand up, 10 pushups, 2-minute cold water reset</td></tr>' +
          '</tbody></table>',
      },
      {
        id: 'note-2',
        title: `Daily Check-In — ${todayStr}`,
        notebook: 'Diary',
        fontFamily: 'serif',
        fontSize: 'base',
        pinned: false,
        updatedAt: todayStr,
        htmlContent:
          '<p><strong>Morning Intention:</strong> Stay present, complete high-priority tasks before noon, and keep distractions out of reach.</p>' +
          '<ul><li>Energy level: Steady</li><li>Top priority today: Deep work + physical training</li><li>Gratitude: Clear head waking up without late-night screen fatigue</li></ul>',
      },
    ],
  };
}

export function logCleanDay(
  state: SelfImprovementState,
  dateStr = formatIsoDate()
): SelfImprovementState {
  if (state.lastCleanCheckInDate === dateStr) {
    return state;
  }
  const nextStreak = state.cleanStreakDays + 1;
  const nextDates = state.cleanCheckInDates.includes(dateStr)
    ? state.cleanCheckInDates
    : [...state.cleanCheckInDates, dateStr];
  return {
    ...state,
    cleanStreakDays: nextStreak,
    longestCleanStreakDays: Math.max(state.longestCleanStreakDays, nextStreak),
    lastCleanCheckInDate: dateStr,
    cleanCheckInDates: nextDates,
  };
}

export function resetCleanStreak(state: SelfImprovementState, todayStr = formatIsoDate()): SelfImprovementState {
  return {
    ...state,
    cleanStreakDays: 0,
    lastCleanCheckInDate: null,
    cleanCheckInDates: state.cleanCheckInDates.filter((d) => d !== todayStr),
  };
}

export function logUrgeVictory(state: SelfImprovementState): SelfImprovementState {
  return {
    ...state,
    urgeVictories: state.urgeVictories + 1,
  };
}

export function updateWhyIStarted(
  state: SelfImprovementState,
  text: string
): SelfImprovementState {
  return {
    ...state,
    whyIStarted: text,
  };
}

export function addHabit(
  state: SelfImprovementState,
  title: string,
  category: HabitItem['category'] = 'Recovery'
): SelfImprovementState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  const newHabit: HabitItem = {
    id: `hab-${Date.now()}-${state.habits.length}`,
    title: trimmed,
    category,
    completedDates: [],
  };
  return {
    ...state,
    habits: [...state.habits, newHabit],
  };
}

export function toggleHabitDate(
  state: SelfImprovementState,
  habitId: string,
  dateStr = formatIsoDate()
): SelfImprovementState {
  return {
    ...state,
    habits: state.habits.map((habit) => {
      if (habit.id !== habitId) return habit;
      const exists = habit.completedDates.includes(dateStr);
      return {
        ...habit,
        completedDates: exists
          ? habit.completedDates.filter((d) => d !== dateStr)
          : [...habit.completedDates, dateStr],
      };
    }),
  };
}

export function deleteHabit(state: SelfImprovementState, habitId: string): SelfImprovementState {
  return {
    ...state,
    habits: state.habits.filter((h) => h.id !== habitId),
  };
}

export function getHabitStreak(habit: HabitItem, anchorDate: Date = new Date()): number {
  const set = new Set(habit.completedDates);
  let streak = 0;
  const cursor = new Date(anchorDate);
  // If today isn't checked yet, start counting consecutive days from yesterday
  if (!set.has(formatIsoDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(formatIsoDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getDailyHabitProgress(
  habits: HabitItem[],
  dateStr = formatIsoDate()
): { completed: number; total: number; percent: number } {
  if (habits.length === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = habits.filter((h) => h.completedDates.includes(dateStr)).length;
  return {
    completed,
    total: habits.length,
    percent: Math.round((completed / habits.length) * 100),
  };
}

export function addTask(
  state: SelfImprovementState,
  title: string,
  priority: TaskPriority = 'Medium',
  category = 'Focus',
  dueTime = ''
): SelfImprovementState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  const newTask: TaskItem = {
    id: `task-${Date.now()}-${state.tasks.length}`,
    title: trimmed,
    priority,
    category: category.trim() || 'Focus',
    dueTime: dueTime.trim(),
    completed: false,
  };
  return {
    ...state,
    tasks: [newTask, ...state.tasks],
  };
}

export function toggleTask(state: SelfImprovementState, taskId: string): SelfImprovementState {
  return {
    ...state,
    tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t)),
  };
}

export function deleteTask(state: SelfImprovementState, taskId: string): SelfImprovementState {
  return {
    ...state,
    tasks: state.tasks.filter((t) => t.id !== taskId),
  };
}

export function filterTasks(tasks: TaskItem[], filter: TaskFilter): TaskItem[] {
  if (filter === 'active') return tasks.filter((t) => !t.completed);
  if (filter === 'completed') return tasks.filter((t) => t.completed);
  return tasks;
}

export function addGoal(
  state: SelfImprovementState,
  title: string,
  category: GoalItem['category'],
  targetDate: string,
  whyItMatters: string,
  milestoneTitles: string[]
): SelfImprovementState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  const milestones: GoalMilestone[] = milestoneTitles
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m, idx) => ({
      id: `ms-${Date.now()}-${idx}`,
      title: m,
      done: false,
    }));

  const newGoal: GoalItem = {
    id: `goal-${Date.now()}-${state.goals.length}`,
    title: trimmed,
    category,
    targetDate: targetDate.trim() || 'Ongoing',
    whyItMatters: whyItMatters.trim(),
    milestones,
  };
  return {
    ...state,
    goals: [newGoal, ...state.goals],
  };
}

export function toggleGoalMilestone(
  state: SelfImprovementState,
  goalId: string,
  milestoneId: string
): SelfImprovementState {
  return {
    ...state,
    goals: state.goals.map((goal) => {
      if (goal.id !== goalId) return goal;
      return {
        ...goal,
        milestones: goal.milestones.map((m) =>
          m.id === milestoneId ? { ...m, done: !m.done } : m
        ),
      };
    }),
  };
}

export function addGoalMilestone(
  state: SelfImprovementState,
  goalId: string,
  title: string
): SelfImprovementState {
  const trimmed = title.trim();
  if (!trimmed) return state;
  return {
    ...state,
    goals: state.goals.map((goal) => {
      if (goal.id !== goalId) return goal;
      return {
        ...goal,
        milestones: [
          ...goal.milestones,
          { id: `ms-${Date.now()}-${goal.milestones.length}`, title: trimmed, done: false },
        ],
      };
    }),
  };
}

export function deleteGoal(state: SelfImprovementState, goalId: string): SelfImprovementState {
  return {
    ...state,
    goals: state.goals.filter((g) => g.id !== goalId),
  };
}

export function getGoalProgressPercent(goal: GoalItem): number {
  if (goal.milestones.length === 0) return 0;
  const doneCount = goal.milestones.filter((m) => m.done).length;
  return Math.round((doneCount / goal.milestones.length) * 100);
}

export function createNote(
  state: SelfImprovementState,
  notebook: NoteNotebook = 'Diary',
  title = 'Untitled Entry',
  htmlContent = '<p>Write your reflection, goal breakdown, or notes here…</p>',
  dateStr = formatIsoDate()
): { nextState: SelfImprovementState; createdNoteId: string } {
  const id = `note-${Date.now()}-${state.notes.length}`;
  const note: RichNote = {
    id,
    title: title.trim() || 'Untitled Entry',
    notebook,
    fontFamily: 'sans',
    fontSize: 'base',
    htmlContent,
    pinned: false,
    updatedAt: dateStr,
  };
  return {
    createdNoteId: id,
    nextState: {
      ...state,
      notes: [note, ...state.notes],
    },
  };
}

export function updateNote(
  state: SelfImprovementState,
  noteId: string,
  patch: Partial<Pick<RichNote, 'title' | 'notebook' | 'fontFamily' | 'fontSize' | 'htmlContent' | 'pinned'>>,
  dateStr = formatIsoDate()
): SelfImprovementState {
  return {
    ...state,
    notes: state.notes.map((note) =>
      note.id === noteId
        ? {
            ...note,
            ...patch,
            updatedAt: dateStr,
          }
        : note
    ),
  };
}

export function deleteNote(state: SelfImprovementState, noteId: string): SelfImprovementState {
  return {
    ...state,
    notes: state.notes.filter((n) => n.id !== noteId),
  };
}

export function filterNotes(
  notes: RichNote[],
  notebookFilter: NoteNotebook | 'All',
  query: string
): RichNote[] {
  const q = query.trim().toLowerCase();
  return [...notes]
    .filter((n) => (notebookFilter === 'All' ? true : n.notebook === notebookFilter))
    .filter((n) => {
      if (!q) return true;
      const plain = n.htmlContent.replace(/<[^>]+>/g, ' ').toLowerCase();
      return n.title.toLowerCase().includes(q) || plain.includes(q);
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

export function buildLast30DaysProgress(
  state: SelfImprovementState,
  anchorDate: Date = new Date()
): DailyProgressPoint[] {
  const dates = getRecentDates(30, anchorDate);
  const cleanSet = new Set(state.cleanCheckInDates);
  const todayStr = dates[dates.length - 1];
  let runningStreak = 0;

  return dates.map((dateStr) => {
    if (cleanSet.has(dateStr)) {
      runningStreak += 1;
    } else if (dateStr === todayStr && state.cleanStreakDays > 0 && state.lastCleanCheckInDate !== todayStr) {
      // Today not checked in yet: keep yesterday's active streak visible rather than dropping to 0 mid-day
      runningStreak = state.cleanStreakDays;
    } else {
      runningStreak = 0;
    }

    const dailyHabit = getDailyHabitProgress(state.habits, dateStr);
    return {
      date: dateStr,
      label: dateStr.slice(5),
      cleanStreakDay: dateStr === todayStr && state.cleanStreakDays === 0 ? 0 : runningStreak,
      habitCompletionRate: dailyHabit.percent,
      completedHabits: dailyHabit.completed,
      totalHabits: dailyHabit.total,
    };
  });
}

export function getTodaysAffirmation(state: SelfImprovementState): AffirmationItem {
  const list = state.affirmations.length > 0 ? state.affirmations : DEFAULT_AFFIRMATIONS;
  const idx = ((state.activeAffirmationIndex % list.length) + list.length) % list.length;
  return list[idx];
}

export function cycleAffirmation(
  state: SelfImprovementState,
  delta: number
): SelfImprovementState {
  const list = state.affirmations.length > 0 ? state.affirmations : DEFAULT_AFFIRMATIONS;
  const nextIndex = (((state.activeAffirmationIndex + delta) % list.length) + list.length) % list.length;
  return {
    ...state,
    activeAffirmationIndex: nextIndex,
  };
}

export function commitTodaysAffirmation(
  state: SelfImprovementState,
  dateStr = formatIsoDate()
): SelfImprovementState {
  return {
    ...state,
    lastAffirmationCommittedDate: dateStr,
  };
}

export function addCustomAffirmation(
  state: SelfImprovementState,
  text: string,
  focusArea: AffirmationFocus = 'Recovery'
): SelfImprovementState {
  const trimmed = text.trim();
  if (!trimmed) return state;
  const newItem: AffirmationItem = {
    id: `aff-${Date.now()}-${state.affirmations.length}`,
    text: trimmed,
    focusArea,
    isCustom: true,
  };
  const nextList = [newItem, ...state.affirmations];
  return {
    ...state,
    affirmations: nextList,
    activeAffirmationIndex: 0,
  };
}

export function deleteAffirmation(
  state: SelfImprovementState,
  affirmationId: string
): SelfImprovementState {
  const nextList = state.affirmations.filter((a) => a.id !== affirmationId);
  const safeList = nextList.length > 0 ? nextList : DEFAULT_AFFIRMATIONS;
  return {
    ...state,
    affirmations: safeList,
    activeAffirmationIndex: Math.min(state.activeAffirmationIndex, safeList.length - 1),
  };
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function recordFocusSession(
  state: SelfImprovementState,
  minutes: number,
  label: string,
  dateStr = formatIsoDate(),
  completedAt = new Date().toTimeString().slice(0, 5)
): SelfImprovementState {
  const safeMinutes = Math.max(1, Math.round(minutes));
  const session: FocusSessionLog = {
    id: `focus-${Date.now()}-${state.focusSessions.length}`,
    date: dateStr,
    minutes: safeMinutes,
    label: label.trim() || 'Deep Focus Session',
    completedAt,
  };
  return {
    ...state,
    focusSessions: [session, ...state.focusSessions],
  };
}

export function getTodayFocusSummary(
  state: SelfImprovementState,
  dateStr = formatIsoDate()
): { sessions: number; minutes: number } {
  const todays = state.focusSessions.filter((s) => s.date === dateStr);
  return {
    sessions: todays.length,
    minutes: todays.reduce((acc, s) => acc + s.minutes, 0),
  };
}
