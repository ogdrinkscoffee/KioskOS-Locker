import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Shield,
  Target,
  Timer,
  Trash2,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RichNotesEditor } from './RichNotesEditor';
import {
  AffirmationFocus,
  GoalItem,
  HabitItem,
  NoteNotebook,
  RichNote,
  SelfImprovementState,
  TaskFilter,
  TaskPriority,
  buildLast30DaysProgress,
  formatCountdown,
  formatIsoDate,
  getDailyHabitProgress,
  getGoalProgressPercent,
  getHabitStreak,
  getRecentDates,
  getTodayFocusSummary,
  getTodaysAffirmation,
  filterTasks,
} from '../utils/selfImprovementEngine';

interface SelfImprovementWorkspaceProps {
  state: SelfImprovementState;
  isDark?: boolean;
  onLogCleanDay: () => void;
  onResetCleanStreak: () => void;
  onLogUrgeVictory: () => void;
  onUpdateWhyIStarted: (text: string) => void;
  onCycleAffirmation: (delta: number) => void;
  onCommitAffirmation: () => void;
  onAddCustomAffirmation: (text: string, focusArea: AffirmationFocus) => void;
  onDeleteAffirmation: (id: string) => void;
  onRecordFocusSession: (minutes: number, label: string) => void;
  onAddHabit: (title: string, category: HabitItem['category']) => void;
  onToggleHabitDate: (habitId: string, dateStr: string) => void;
  onDeleteHabit: (habitId: string) => void;
  onAddTask: (title: string, priority: TaskPriority, category: string, dueTime: string) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAddGoal: (
    title: string,
    category: GoalItem['category'],
    targetDate: string,
    whyItMatters: string,
    milestones: string[]
  ) => void;
  onToggleGoalMilestone: (goalId: string, milestoneId: string) => void;
  onAddGoalMilestone: (goalId: string, title: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onCreateNote: (notebook: NoteNotebook, title?: string, htmlContent?: string) => string;
  onUpdateNote: (
    noteId: string,
    patch: Partial<Pick<RichNote, 'title' | 'notebook' | 'fontFamily' | 'fontSize' | 'htmlContent' | 'pinned'>>
  ) => void;
  onDeleteNote: (noteId: string) => void;
}

type SubTab = 'habits' | 'tasks' | 'goals' | 'notes';

export const SelfImprovementWorkspace: React.FC<SelfImprovementWorkspaceProps> = ({
  state,
  isDark = false,
  onLogCleanDay,
  onResetCleanStreak,
  onLogUrgeVictory,
  onUpdateWhyIStarted,
  onCycleAffirmation,
  onCommitAffirmation,
  onAddCustomAffirmation,
  onDeleteAffirmation,
  onRecordFocusSession,
  onAddHabit,
  onToggleHabitDate,
  onDeleteHabit,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddGoal,
  onToggleGoalMilestone,
  onAddGoalMilestone,
  onDeleteGoal,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}) => {
  const [subTab, setSubTab] = useState<SubTab>('habits');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(state.notes[0]?.id ?? null);

  // Urge grounding pause state
  const [showUrgePause, setShowUrgePause] = useState(false);
  const [pauseSeconds, setPauseSeconds] = useState(60);
  const [confirmReset, setConfirmReset] = useState(false);

  // Focus Mode Timer state
  const [focusDurationMins, setFocusDurationMins] = useState(25);
  const [focusSecondsLeft, setFocusSecondsLeft] = useState(25 * 60);
  const [focusRunning, setFocusRunning] = useState(false);
  const [focusFullscreen, setFocusFullscreen] = useState(false);
  const [focusIntention, setFocusIntention] = useState('Deep work block (Zero distractions)');
  const [focusFeedback, setFocusFeedback] = useState<string | null>(null);

  // Daily affirmations local form state
  const [showAffirmationManager, setShowAffirmationManager] = useState(false);
  const [newAffirmationText, setNewAffirmationText] = useState('');
  const [newAffirmationFocus, setNewAffirmationFocus] = useState<AffirmationFocus>('Recovery');

  // Habit form
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitCat, setNewHabitCat] = useState<HabitItem['category']>('Recovery');

  // Task form & filter
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('High');
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');

  // Goal form & inline milestone inputs
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalCat, setNewGoalCat] = useState<GoalItem['category']>('Recovery');
  const [newGoalTarget, setNewGoalTarget] = useState('2026-12-31');
  const [newGoalWhy, setNewGoalWhy] = useState('');
  const [newGoalMilestones, setNewGoalMilestones] = useState('');
  const [milestoneInputs, setMilestoneInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!showUrgePause || pauseSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setPauseSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showUrgePause, pauseSeconds]);

  useEffect(() => {
    if (!focusRunning) return;
    const timer = window.setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          onRecordFocusSession(focusDurationMins, focusIntention);
          setFocusFeedback(`Completed ${focusDurationMins}m focus session.`);
          return focusDurationMins * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning, focusDurationMins, focusIntention, onRecordFocusSession]);

  const today = formatIsoDate();
  const recentDates = getRecentDates(7);
  const dailyProgress = getDailyHabitProgress(state.habits, today);
  const checkedInToday = state.lastCleanCheckInDate === today;
  const visibleTasks = filterTasks(state.tasks, taskFilter);
  const activeAffirmation = getTodaysAffirmation(state);
  const affirmedToday = state.lastAffirmationCommittedDate === today;
  const todayFocus = getTodayFocusSummary(state, today);
  const focusTotalSeconds = Math.max(60, focusDurationMins * 60);
  const focusProgressPct = Math.min(
    100,
    Math.max(0, Math.round(((focusTotalSeconds - focusSecondsLeft) / focusTotalSeconds) * 100))
  );
  const progress30Days = useMemo(() => buildLast30DaysProgress(state), [state]);
  const average30DayHabitRate = useMemo(() => {
    if (progress30Days.length === 0) return 0;
    const sum = progress30Days.reduce((acc, p) => acc + p.habitCompletionRate, 0);
    return Math.round(sum / progress30Days.length);
  }, [progress30Days]);

  const handleSelectFocusPreset = (mins: number) => {
    setFocusRunning(false);
    setFocusDurationMins(mins);
    setFocusSecondsLeft(mins * 60);
    setFocusFeedback(null);
  };

  const handleCompleteFocusEarly = () => {
    const elapsedSeconds = Math.max(60, focusTotalSeconds - focusSecondsLeft);
    const loggedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setFocusRunning(false);
    setFocusSecondsLeft(focusDurationMins * 60);
    onRecordFocusSession(loggedMinutes, focusIntention);
    setFocusFeedback(`Logged ${loggedMinutes}m focus block.`);
  };

  const promptContext = useMemo(
    () => ({
      cleanStreakDays: state.cleanStreakDays,
      longestCleanStreakDays: state.longestCleanStreakDays,
      urgeVictories: state.urgeVictories,
      todayHabitPercent: dailyProgress.percent,
      habitsCompletedToday: dailyProgress.completed,
      habitsTotal: dailyProgress.total,
      focusSessionsToday: todayFocus.sessions,
      focusMinutesToday: todayFocus.minutes,
      whyIStarted: state.whyIStarted,
      goals: state.goals.map((g) => ({
        title: g.title,
        category: g.category,
        progressPercent: getGoalProgressPercent(g),
        targetDate: g.targetDate,
      })),
    }),
    [state, dailyProgress, todayFocus]
  );

  const handleOpenGoalInNotes = (goal: GoalItem) => {
    const html =
      `<h2>${goal.title}</h2>` +
      `<p><strong>Why It Matters:</strong> ${goal.whyItMatters || 'Personal growth and discipline.'}</p>` +
      `<p><strong>Target Date:</strong> ${goal.targetDate}</p>` +
      `<table><thead><tr><th>Milestone</th><th>Status</th></tr></thead><tbody>` +
      goal.milestones
        .map((m) => `<tr><td>${m.title}</td><td>${m.done ? 'Completed' : 'In Progress'}</td></tr>`)
        .join('') +
      `</tbody></table>`;
    const createdId = onCreateNote('Goals & Vision', `Goal Plan: ${goal.title}`, html);
    setSelectedNoteId(createdId);
    setSubTab('notes');
  };

  return (
    <div className="space-y-6">
      {/* Recovery & Clean Streak Anchor */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Shield className="w-4 h-4" aria-hidden="true" />
              <span>Recovery &amp; Clean Focus Anchor (No Porn · No Social Media)</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-6 pt-1">
              <div>
                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {state.cleanStreakDays}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 ml-1.5">clean days</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Best streak:{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                  {state.longestCleanStreakDays} days
                </strong>
                <span className="mx-2" aria-hidden="true">·</span>
                Urges resisted:{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{state.urgeVictories}</strong>
                <span className="mx-2" aria-hidden="true">·</span>
                Today&apos;s habits:{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                  {dailyProgress.completed}/{dailyProgress.total} ({dailyProgress.percent}%)
                </strong>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onLogCleanDay}
              disabled={checkedInToday}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:bg-emerald-700 dark:disabled:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{checkedInToday ? 'Clean Day Logged' : 'Log Clean Day'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPauseSeconds(60);
                setShowUrgePause((prev) => !prev);
              }}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-900 dark:text-sky-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Urge Grounding Pause</span>
            </button>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
              >
                Reset Streak
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetCleanStreak();
                    setConfirmReset(false);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Emergency Urge Grounding Drawer */}
        {showUrgePause && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-center">
            <div className="p-4 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white text-center">
              <div className="text-xs text-slate-300">60-Second Urge Reset</div>
              <div className="text-3xl font-mono font-bold tabular-nums mt-1">
                00:{String(pauseSeconds).padStart(2, '0')}
              </div>
              <p className="text-[11px] text-slate-300 mt-1">
                Breathe slowly for 60s before touching any app.
              </p>
              <button
                type="button"
                onClick={() => {
                  onLogUrgeVictory();
                  setShowUrgePause(false);
                }}
                className="mt-3 w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold"
              >
                I Resisted — Log Victory
              </button>
            </div>

            <div className="space-y-2">
              <label htmlFor="why-i-started-input" className="block text-xs font-semibold text-slate-900 dark:text-slate-100">
                Why I Locked This Device (Editable Reminder)
              </label>
              <textarea
                id="why-i-started-input"
                rows={3}
                value={state.whyIStarted}
                onChange={(e) => onUpdateWhyIStarted(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:outline-2 focus:outline-sky-600"
              />
            </div>
          </div>
        )}
      </section>

      {/* Daily Affirmation Anchor */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl min-w-0">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Daily Affirmation · {activeAffirmation.focusArea} ·{' '}
              <span className="font-mono tabular-nums">
                {((state.activeAffirmationIndex % Math.max(1, state.affirmations.length)) + 1)}/
                {state.affirmations.length}
              </span>
            </div>
            <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
              &ldquo;{activeAffirmation.text}&rdquo;
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onCycleAffirmation(-1)}
              aria-label="Previous affirmation"
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onCycleAffirmation(1)}
              aria-label="Next affirmation"
              className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 inline-flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCommitAffirmation}
              disabled={affirmedToday}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 disabled:bg-emerald-700 dark:disabled:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{affirmedToday ? 'Affirmed Today' : 'Commit Today'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAffirmationManager((prev) => !prev)}
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              {showAffirmationManager ? 'Hide Custom List' : 'Add Custom'}
            </button>
          </div>
        </div>

        {showAffirmationManager && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newAffirmationText.trim()) return;
                onAddCustomAffirmation(newAffirmationText, newAffirmationFocus);
                setNewAffirmationText('');
              }}
              className="flex flex-wrap items-end gap-3"
            >
              <div className="flex-1 min-w-[200px]">
                <label
                  htmlFor="new-affirmation-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Write Your Personal Affirmation
                </label>
                <input
                  id="new-affirmation-input"
                  type="text"
                  value={newAffirmationText}
                  onChange={(e) => setNewAffirmationText(e.target.value)}
                  placeholder="e.g., I close every trigger fast and keep my word to myself."
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
                />
              </div>
              <div>
                <label
                  htmlFor="new-affirmation-focus"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Focus Area
                </label>
                <select
                  id="new-affirmation-focus"
                  value={newAffirmationFocus}
                  onChange={(e) => setNewAffirmationFocus(e.target.value as AffirmationFocus)}
                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Recovery">Recovery</option>
                  <option value="Focus">Focus</option>
                  <option value="Self-Respect">Self-Respect</option>
                  <option value="Resilience">Resilience</option>
                </select>
              </div>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Save Affirmation</span>
              </button>
            </form>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {state.affirmations.map((aff) => (
                <div key={aff.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-slate-800 dark:text-slate-200">{aff.text}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {aff.focusArea} · {aff.isCustom ? 'Custom' : 'Core'}
                    </p>
                  </div>
                  {aff.isCustom && (
                    <button
                      type="button"
                      aria-label={`Delete affirmation ${aff.text}`}
                      onClick={() => onDeleteAffirmation(aff.id)}
                      className="p-1.5 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Focus Mode Timer */}
      <section
        aria-label="Focus Mode Timer"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Focus Mode Timer</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-4">
              <div
                data-testid="focus-timer-display"
                className="text-3xl sm:text-4xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums"
              >
                {formatCountdown(focusSecondsLeft)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Today:{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{todayFocus.sessions}</strong>{' '}
                sessions ·{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{todayFocus.minutes}m</strong>{' '}
                deep focus
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[15, 25, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => handleSelectFocusPreset(mins)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                  focusDurationMins === mins
                    ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {mins}m
              </button>
            ))}

            <button
              type="button"
              onClick={() => setFocusFullscreen(true)}
              aria-label="Open full-screen focus mode"
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Distraction-Free View</span>
            </button>
          </div>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-sky-600 dark:bg-sky-500 transition-all duration-300"
            style={{ width: `${focusProgressPct}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="focus-intention-input" className="sr-only">
              Focus session intention
            </label>
            <input
              id="focus-intention-input"
              type="text"
              value={focusIntention}
              onChange={(e) => setFocusIntention(e.target.value)}
              placeholder="What single goal or task are you focusing on?"
              className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setFocusFeedback(null);
              setFocusRunning((prev) => !prev);
            }}
            className="min-h-[38px] px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            {focusRunning ? (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause Focus</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Start Focus</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setFocusRunning(false);
              setFocusSecondsLeft(focusDurationMins * 60);
              setFocusFeedback(null);
            }}
            className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleCompleteFocusEarly}
            className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >
            Complete &amp; Log
          </button>
        </div>

        {focusFeedback && (
          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {focusFeedback}
          </p>
        )}
      </section>

      {focusFullscreen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Distraction-Free Focus Mode"
          className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-center p-6"
        >
          <div className="max-w-lg w-full text-center space-y-6">
            <div className="text-xs font-semibold text-sky-400">
              Focus Mode · {focusIntention || 'Deep Work'}
            </div>
            <div className="text-6xl sm:text-7xl font-mono font-bold tabular-nums tracking-tight">
              {formatCountdown(focusSecondsLeft)}
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              &ldquo;{activeAffirmation.text}&rdquo;
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setFocusRunning((prev) => !prev)}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                {focusRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{focusRunning ? 'Pause' : 'Resume Focus'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCompleteFocusEarly();
                  setFocusFullscreen(false);
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >
                Complete &amp; Log
              </button>
              <button
                type="button"
                onClick={() => setFocusFullscreen(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
                <span>Exit View</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 30-Day Progress Charts (Recharts) */}
      <section
        aria-label="30-Day Recovery and Habit Progress Charts"
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Clean Streak Progress (Last 30 Days)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consecutive porn-free &amp; social-media-free days logged
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
              Current: {state.cleanStreakDays}d
            </span>
          </div>
          <div className="w-full h-[220px]" data-testid="clean-streak-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={progress30Days} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="cleanStreakGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={isDark ? '#38bdf8' : '#0284c7'} stopOpacity={0.32} />
                    <stop offset="95%" stopColor={isDark ? '#38bdf8' : '#0284c7'} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: isDark ? '#1e293b' : '#e2e8f0' }}
                  minTickGap={20}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  unit="d"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#cbd5e1',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: isDark ? '#38bdf8' : '#0284c7' }}
                  labelStyle={{ color: isDark ? '#cbd5e1' : '#334155' }}
                  formatter={(value) => [`${String(value ?? 0)} days`, 'Clean Streak']}
                  labelFormatter={(label) => `Date: ${String(label)}`}
                />
                <Area
                  type="monotone"
                  dataKey="cleanStreakDay"
                  stroke={isDark ? '#38bdf8' : '#0284c7'}
                  strokeWidth={2}
                  fill="url(#cleanStreakGradient)"
                  activeDot={{ r: 4, fill: isDark ? '#38bdf8' : '#0284c7' }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Habit Completion Rate (Last 30 Days)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Daily percentage of habits completed across all routines
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              30d Avg: {average30DayHabitRate}%
            </span>
          </div>
          <div className="w-full h-[220px]" data-testid="habit-completion-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={progress30Days} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1e293b' : '#e2e8f0'} vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickLine={false}
                  axisLine={{ stroke: isDark ? '#1e293b' : '#e2e8f0' }}
                  minTickGap={20}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }}
                  tickLine={false}
                  axisLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#ffffff',
                    borderColor: isDark ? '#334155' : '#cbd5e1',
                    color: isDark ? '#f8fafc' : '#0f172a',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  itemStyle={{ color: isDark ? '#34d399' : '#059669' }}
                  labelStyle={{ color: isDark ? '#cbd5e1' : '#334155' }}
                  formatter={(value, _name, item) => {
                    const p = item?.payload as { completedHabits?: number; totalHabits?: number } | undefined;
                    const detail = p ? ` (${p.completedHabits ?? 0}/${p.totalHabits ?? 0})` : '';
                    return [`${String(value ?? 0)}%${detail}`, 'Habit Rate'];
                  }}
                  labelFormatter={(label) => `Date: ${String(label)}`}
                />
                <ReferenceLine y={80} stroke={isDark ? '#e2e8f0' : '#0f172a'} strokeDasharray="3 3" strokeOpacity={0.35} />
                <Bar
                  dataKey="habitCompletionRate"
                  fill={isDark ? '#10b981' : '#059669'}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={14}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Segmented Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Self-improvement sections"
          className="inline-flex max-w-full overflow-x-auto items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-lg"
        >
          {(
            [
              { id: 'habits', label: 'Habit Tracker' },
              { id: 'tasks', label: 'Task Tracker' },
              { id: 'goals', label: 'Goal Setter' },
              { id: 'notes', label: 'Notes & Diary' },
            ] as const
          ).map((tab) => {
            const active = subTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSubTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 1. HABIT TRACKER */}
      {subTab === 'habits' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newHabitTitle.trim()) return;
              onAddHabit(newHabitTitle, newHabitCat);
              setNewHabitTitle('');
            }}
            className="flex flex-wrap items-end gap-3 pb-4 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="new-habit-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Daily Habit
              </label>
              <input
                id="new-habit-title"
                type="text"
                value={newHabitTitle}
                onChange={(e) => setNewHabitTitle(e.target.value)}
                placeholder="e.g., Cold shower, 10 pages reading, No screens after 22:00"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
              />
            </div>
            <div>
              <label htmlFor="new-habit-cat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Category
              </label>
              <select
                id="new-habit-cat"
                value={newHabitCat}
                onChange={(e) => setNewHabitCat(e.target.value as HabitItem['category'])}
                className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="Recovery">Recovery</option>
                <option value="Discipline">Discipline</option>
                <option value="Focus">Focus</option>
                <option value="Health">Health</option>
              </select>
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Habit</span>
            </button>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4">Habit</th>
                  <th className="py-2 px-2 text-right">Streak</th>
                  {recentDates.map((d) => (
                    <th key={d} className="py-2 px-1.5 text-center font-mono tabular-nums">
                      {d.slice(5)}
                    </th>
                  ))}
                  <th className="py-2 pl-2 text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {state.habits.map((habit) => {
                  const streak = getHabitStreak(habit);
                  return (
                    <tr key={habit.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="py-3 pr-4">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{habit.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{habit.category}</div>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                          {streak}d
                        </span>
                      </td>
                      {recentDates.map((dateStr) => {
                        const done = habit.completedDates.includes(dateStr);
                        return (
                          <td key={dateStr} className="py-3 px-1.5 text-center">
                            <button
                              type="button"
                              aria-label={`Mark ${habit.title} for ${dateStr}`}
                              aria-pressed={done}
                              onClick={() => onToggleHabitDate(habit.id, dateStr)}
                              className={`w-8 h-8 rounded-lg border inline-flex items-center justify-center transition-colors ${
                                done
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-transparent hover:border-sky-500'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        );
                      })}
                      <td className="py-3 pl-2 text-right">
                        <button
                          type="button"
                          aria-label={`Delete habit ${habit.title}`}
                          onClick={() => onDeleteHabit(habit.id)}
                          className="p-1.5 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* 2. TASK TRACKER */}
      {subTab === 'tasks' && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newTaskTitle.trim()) return;
              onAddTask(newTaskTitle, newTaskPriority, 'Focus', newTaskTime);
              setNewTaskTitle('');
            }}
            className="flex flex-wrap items-end gap-3 pb-4 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="new-task-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                New Action Task
              </label>
              <input
                id="new-task-title"
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="e.g., Study Kotlin coroutines for 45 mins"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
              />
            </div>
            <div>
              <label htmlFor="new-task-priority" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Priority
              </label>
              <select
                id="new-task-priority"
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label htmlFor="new-task-time" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Target Time
              </label>
              <input
                id="new-task-time"
                type="time"
                value={newTaskTime}
                onChange={(e) => setNewTaskTime(e.target.value)}
                className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Task</span>
            </button>
          </form>

          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'active', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setTaskFilter(f)}
                  className={`px-3 py-1 rounded text-xs font-medium capitalize ${
                    taskFilter === f
                      ? 'bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {state.tasks.filter((t) => t.completed).length} / {state.tasks.length} completed
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleTasks.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No tasks in this filter. Add a focused action above.
              </p>
            ) : (
              visibleTasks.map((task) => (
                <div key={task.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label={`Toggle task ${task.title}`}
                      aria-pressed={task.completed}
                      onClick={() => onToggleTask(task.id)}
                      className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 ${
                        task.completed
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700 text-transparent hover:border-sky-500'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <div className="min-w-0">
                      <div
                        className={`text-xs font-semibold ${
                          task.completed ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {task.priority} priority · {task.category}
                        {task.dueTime ? ` · ${task.dueTime}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete task ${task.title}`}
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 3. GOAL SETTER */}
      {subTab === 'goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newGoalTitle.trim()) return;
              onAddGoal(
                newGoalTitle,
                newGoalCat,
                newGoalTarget,
                newGoalWhy,
                newGoalMilestones.split('\n')
              );
              setNewGoalTitle('');
              setNewGoalWhy('');
              setNewGoalMilestones('');
            }}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Create New Goal</h3>
            <div>
              <label htmlFor="goal-title-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Goal Title
              </label>
              <input
                id="goal-title-input"
                type="text"
                value={newGoalTitle}
                onChange={(e) => setNewGoalTitle(e.target.value)}
                placeholder="e.g., 90 Days Clean + Launch Side Project"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="goal-cat-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Category
                </label>
                <select
                  id="goal-cat-select"
                  value={newGoalCat}
                  onChange={(e) => setNewGoalCat(e.target.value as GoalItem['category'])}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Recovery">Recovery</option>
                  <option value="Fitness">Fitness</option>
                  <option value="Career & Study">Career &amp; Study</option>
                  <option value="Mindset">Mindset</option>
                </select>
              </div>
              <div>
                <label htmlFor="goal-date-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Date
                </label>
                <input
                  id="goal-date-input"
                  type="date"
                  value={newGoalTarget}
                  onChange={(e) => setNewGoalTarget(e.target.value)}
                  className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="goal-why-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Why This Matters
              </label>
              <input
                id="goal-why-input"
                type="text"
                value={newGoalWhy}
                onChange={(e) => setNewGoalWhy(e.target.value)}
                placeholder="Personal reason that keeps you grounded"
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="goal-milestones-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Milestones (one per line)
              </label>
              <textarea
                id="goal-milestones-input"
                rows={3}
                value={newGoalMilestones}
                onChange={(e) => setNewGoalMilestones(e.target.value)}
                placeholder={'Week 1 clean\nFinish module 1\nComplete 30-day review'}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <button
              type="submit"
              className="w-full h-9 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Save Goal</span>
            </button>
          </form>

          <div className="space-y-4">
            {state.goals.map((goal) => {
              const pct = getGoalProgressPercent(goal);
              const draftMilestone = milestoneInputs[goal.id] ?? '';
              return (
                <div key={goal.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {goal.category} · Target{' '}
                        <span className="font-mono tabular-nums">{goal.targetDate}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">{goal.title}</h4>
                      {goal.whyItMatters && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{goal.whyItMatters}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenGoalInNotes(goal)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        <span>Open in Notes</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete goal ${goal.title}`}
                        onClick={() => onDeleteGoal(goal.id)}
                        className="p-1.5 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400">Milestone progress</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        {pct}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-sky-600 dark:bg-sky-500 transition-all duration-200"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {goal.milestones.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => onToggleGoalMilestone(goal.id, m.id)}
                        className="w-full py-2 flex items-center gap-2.5 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/60 rounded px-1"
                      >
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            m.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-300 dark:text-slate-600'
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          className={`text-xs ${
                            m.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {m.title}
                        </span>
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!draftMilestone.trim()) return;
                      onAddGoalMilestone(goal.id, draftMilestone);
                      setMilestoneInputs((prev) => ({ ...prev, [goal.id]: '' }));
                    }}
                    className="flex items-center gap-2 pt-1"
                  >
                    <input
                      type="text"
                      aria-label={`Add milestone to ${goal.title}`}
                      value={draftMilestone}
                      onChange={(e) =>
                        setMilestoneInputs((prev) => ({ ...prev, [goal.id]: e.target.value }))
                      }
                      placeholder="Add another milestone..."
                      className="flex-1 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                    />
                    <button
                      type="submit"
                      className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200"
                    >
                      Add
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. NOTION-STYLE NOTES & DIARY */}
      {subTab === 'notes' && (
        <RichNotesEditor
          notes={state.notes}
          selectedNoteId={selectedNoteId}
          promptContext={promptContext}
          onSelectNote={setSelectedNoteId}
          onCreateNote={(nb, title, html) => {
            const id = onCreateNote(nb, title, html);
            setSelectedNoteId(id);
          }}
          onUpdateNote={onUpdateNote}
          onDeleteNote={(id) => {
            onDeleteNote(id);
            if (selectedNoteId === id) {
              setSelectedNoteId(null);
            }
          }}
        />
      )}
    </div>
  );
};
