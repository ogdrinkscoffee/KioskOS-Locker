import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  CheckCircle2,
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
import { AnimatePresence, motion } from 'motion/react';
import { EASE_SETTLE, SPRING_MODAL, SPRING_SNAPPY, SvgProgressRing } from './MotionPrimitives';
import { RichNotesEditor } from './RichNotesEditor';
import {
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
  filterTasks,
} from '../utils/selfImprovementEngine';
import { useI18n } from '../i18n/LocaleProvider';
import {
  escapeHtml,
  goalFormSchema,
  habitFormSchema,
  milestoneFormSchema,
  taskFormSchema,
} from '../utils/validation';
import { DEFAULT_PAGE_SIZE, paginateItems } from '../utils/pagination';

interface SelfImprovementWorkspaceProps {
  state: SelfImprovementState;
  isDark?: boolean;
  onLogCleanDay: () => void;
  onResetCleanStreak: () => void;
  onLogUrgeVictory: () => void;
  onUpdateWhyIStarted: (text: string) => void;
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

type SubTab = 'overview' | 'habits' | 'tasks' | 'goals' | 'notes';

export const SelfImprovementWorkspace: React.FC<SelfImprovementWorkspaceProps> = ({
  state,
  isDark = false,
  onLogCleanDay,
  onResetCleanStreak,
  onLogUrgeVictory,
  onUpdateWhyIStarted,
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
  const { tr, pluralDays } = useI18n();
  const [subTab, setSubTab] = useState<SubTab>('overview');
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
  const [focusIntention, setFocusIntention] = useState(() => tr('Deep work block (Zero distractions)'));
  const [focusFeedback, setFocusFeedback] = useState<string | null>(null);

  // Habit form
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitCat, setNewHabitCat] = useState<HabitItem['category']>('Recovery');
  const [habitFormError, setHabitFormError] = useState<string | null>(null);

  // Task form & filter
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('High');
  const [newTaskTime, setNewTaskTime] = useState('09:00');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  // Goal form & inline milestone inputs
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalCat, setNewGoalCat] = useState<GoalItem['category']>('Recovery');
  const [newGoalTarget, setNewGoalTarget] = useState('2026-12-31');
  const [newGoalWhy, setNewGoalWhy] = useState('');
  const [newGoalMilestones, setNewGoalMilestones] = useState('');
  const [goalFormError, setGoalFormError] = useState<string | null>(null);
  const [milestoneInputs, setMilestoneInputs] = useState<Record<string, string>>({});
  const [milestoneErrors, setMilestoneErrors] = useState<Record<string, string | null>>({});
  const [habitsPage, setHabitsPage] = useState(1);
  const [tasksPage, setTasksPage] = useState(1);
  const [goalsPage, setGoalsPage] = useState(1);
  const submitCooldownRef = useRef<Record<string, number>>({});

  const canRunSubmit = (key: string, cooldownMs = 350): boolean => {
    const now = Date.now();
    const last = submitCooldownRef.current[key] ?? 0;
    if (now - last < cooldownMs) return false;
    submitCooldownRef.current[key] = now;
    return true;
  };

  useEffect(() => {
    if (!showUrgePause) return;
    const timer = window.setInterval(() => {
      setPauseSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [showUrgePause]);

  useEffect(() => {
    if (!focusFullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusFullscreen]);

  useEffect(() => {
    if (!focusRunning) return;
    const timer = window.setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev <= 1) {
          setFocusRunning(false);
          onRecordFocusSession(focusDurationMins, focusIntention);
          setFocusFeedback(tr('Completed {m}m focus session.', { m: focusDurationMins }));
          return focusDurationMins * 60;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [focusRunning, focusDurationMins, focusIntention, onRecordFocusSession, tr]);

  const today = formatIsoDate();
  const recentDates = getRecentDates(7);
  const dailyProgress = getDailyHabitProgress(state.habits, today);
  const checkedInToday = state.lastCleanCheckInDate === today;
  const visibleTasks = useMemo(() => filterTasks(state.tasks, taskFilter), [state.tasks, taskFilter]);
  const habitsPagination = useMemo(
    () => paginateItems(state.habits, habitsPage, DEFAULT_PAGE_SIZE),
    [state.habits, habitsPage]
  );
  const tasksPagination = useMemo(
    () => paginateItems(visibleTasks, tasksPage, DEFAULT_PAGE_SIZE),
    [visibleTasks, tasksPage]
  );
  const goalsPagination = useMemo(
    () => paginateItems(state.goals, goalsPage, DEFAULT_PAGE_SIZE),
    [state.goals, goalsPage]
  );
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
    if (!canRunSubmit('completeFocus', 500)) return;
    const elapsedSeconds = Math.max(60, focusTotalSeconds - focusSecondsLeft);
    const loggedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    setFocusRunning(false);
    setFocusSecondsLeft(focusDurationMins * 60);
    onRecordFocusSession(loggedMinutes, focusIntention);
    setFocusFeedback(tr('Logged {m}m focus block.', { m: loggedMinutes }));
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
      `<h2>${escapeHtml(goal.title)}</h2>` +
      `<p><strong>${tr('Why It Matters')}:</strong> ${escapeHtml(goal.whyItMatters || tr("Personal growth and discipline."))}</p>` +
      `<p><strong>${tr('Target Date')}:</strong> ${escapeHtml(goal.targetDate)}</p>` +
      `<table><thead><tr><th>${tr('Milestone')}</th><th>${tr('Status')}</th></tr></thead><tbody>` +
      goal.milestones
        .map((m) => `<tr><td>${escapeHtml(m.title)}</td><td>${m.done ? tr("Completed") : tr("In Progress")}</td></tr>`)
        .join('') +
      `</tbody></table>`;
    const createdId = onCreateNote('Goals & Vision', `${tr('Goal Plan')}: ${goal.title}`, html);
    setSelectedNoteId(createdId);
    setSubTab('notes');
  };

  return (
    <div className="space-y-5">
      {/* Segmented Sub-Navigation */}
      <div
        role="tablist"
        aria-label={tr("Self-improvement sections")}
        className="relative flex max-w-full flex-wrap items-center gap-0.5 rounded-xl border border-slate-200/80 bg-slate-100/70 p-1 dark:border-white/10 dark:bg-white/[0.04]"
      >
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'habits', label: 'Habits' },
            { id: 'tasks', label: 'Tasks' },
            { id: 'goals', label: 'Goals' },
            { id: 'notes', label: 'Notes' },
          ] as const
        ).map((tab) => {
          const active = subTab === tab.id;
          return (
            <motion.button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              whileTap={{ scale: 0.96 }}
              transition={{ duration: 0.12, ease: EASE_SETTLE }}
              onClick={() => setSubTab(tab.id)}
              className={`relative rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'text-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="si-subtab-pill"
                  transition={SPRING_SNAPPY}
                  className="absolute inset-0 rounded-lg bg-white shadow-sm dark:bg-slate-800"
                  aria-hidden="true"
                />
              )}
              <span className="relative z-10">{tr(tab.label)}</span>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={subTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: EASE_SETTLE }}
          className="space-y-5"
        >
      {/* Overview: streak, focus timer and analytics */}
      {subTab === 'overview' && (<>
      {/* Recovery & Clean Streak Anchor */}
      <section className="surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Shield className="w-4 h-4" aria-hidden="true" />
              <span>{tr("Recovery & Clean Focus Anchor (No Porn · No Social Media)")}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-6 pt-1">
              <div>
                <span className="text-3xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                  {state.cleanStreakDays}
                </span>
                <span className="text-sm text-slate-600 dark:text-slate-400 ms-1.5">{tr("clean days")}</span>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {tr("Best streak:")}{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                  {state.longestCleanStreakDays} {pluralDays(state.longestCleanStreakDays)}
                </strong>
                <span className="mx-2" aria-hidden="true">·</span>
                {tr("Urges resisted:")}{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{state.urgeVictories}</strong>
                <span className="mx-2" aria-hidden="true">·</span>
                {tr("Today's habits:")}{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
                  {dailyProgress.completed}/{dailyProgress.total} (<span dir="ltr" className="tabular-nums">{dailyProgress.percent}%</span>)
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
              <span>{checkedInToday ? tr("Clean Day Logged") : tr("Log Clean Day")}</span>
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
              <span>{tr("Urge Grounding Pause")}</span>
            </button>

            {!confirmReset ? (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
              >{"\n                "}{tr("Reset Streak")}{"\n              "}</button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetCleanStreak();
                    setConfirmReset(false);
                  }}
                  className="min-h-[38px] px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold whitespace-nowrap"
                >{"\n                  "}{tr("Confirm Reset")}{"\n                "}</button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                >{"\n                  "}{tr("Cancel")}{"\n                "}</button>
              </div>
            )}
          </div>
        </div>

        {/* Emergency Urge Grounding Drawer */}
        <AnimatePresence initial={false}>
        {showUrgePause && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.2, ease: EASE_SETTLE }}
            className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4 items-center"
          >
            <div className="p-4 rounded-xl bg-slate-900 dark:bg-slate-950 border border-slate-800 text-white text-center flex flex-col items-center">
              <div className="text-xs text-slate-300">{tr("60-Second Urge Reset")}</div>
              <div className="mt-2 flex justify-center">
                <SvgProgressRing
                  progress={pauseSeconds / 60}
                  size={84}
                  strokeWidth={4}
                  trackClassName="stroke-slate-800"
                  progressClassName="stroke-sky-400"
                >
                  <span className="text-xl font-mono font-bold tabular-nums">
                    00:{String(pauseSeconds).padStart(2, '0')}
                  </span>
                </SvgProgressRing>
              </div>
              <p className="text-[11px] text-slate-300 mt-2">{"\n                "}{tr("Breathe slowly for 60s before touching any app.")}{"\n              "}</p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12, ease: EASE_SETTLE }}
                onClick={() => {
                  if (!canRunSubmit('urgeVictory', 600)) return;
                  onLogUrgeVictory();
                  setShowUrgePause(false);
                }}
                className="mt-3 w-full py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold"
              >
                {tr("I Resisted — Log Victory")}
              </motion.button>
            </div>

            <div className="space-y-2">
              <label htmlFor="why-i-started-input" className="block text-xs font-semibold text-slate-900 dark:text-slate-100">{"\n                "}{tr("Why I Locked This Device (Editable Reminder)")}{"\n              "}</label>
              <textarea
                id="why-i-started-input"
                rows={3}
                value={state.whyIStarted}
                onChange={(e) => onUpdateWhyIStarted(e.target.value)}
                className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-100 focus:outline-2 focus:outline-sky-600"
              />
            </div>
          </motion.div>
        )}
        </AnimatePresence>
      </section>

      {/* Focus Mode Timer */}
      <section
        aria-label={tr("Focus Mode Timer")}
        className="surface p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 dark:text-sky-400">
              <Timer className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tr("Focus Mode Timer")}</span>
            </div>
            <div className="flex flex-wrap items-baseline gap-4">
              <div
                data-testid="focus-timer-display"
                className="text-3xl sm:text-4xl font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums"
              >
                {formatCountdown(focusSecondsLeft)}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                {tr("Today:")}{' '}
                <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{todayFocus.sessions}</strong>{' '}
                {tr('sessions')} ·{' '}
                <strong dir="ltr" className="text-slate-900 dark:text-slate-100 tabular-nums">{todayFocus.minutes}m</strong>{' '}
                {tr("deep focus")}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {[15, 25, 45, 60].map((mins) => (
              <button
                key={mins}
                type="button"
                aria-pressed={focusDurationMins === mins}
                onClick={() => handleSelectFocusPreset(mins)}
                className={`min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                  focusDurationMins === mins
                    ? 'bg-slate-900 dark:bg-sky-600 border-slate-900 dark:border-sky-500 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {tr('{m}m', { m: mins })}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setFocusFullscreen(true)}
              aria-label={tr("Open full-screen focus mode")}
              className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tr("Distraction-Free View")}</span>
            </button>
          </div>
        </div>

        <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <motion.div
            className="h-full w-full origin-left rtl:origin-right rounded-full bg-sky-600 dark:bg-sky-500"
            initial={false}
            animate={{ scaleX: Math.max(0, Math.min(1, focusProgressPct / 100)) }}
            transition={{ duration: 0.28, ease: EASE_SETTLE }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="focus-intention-input" className="sr-only">{"\n              "}{tr("Focus session intention")}{"\n            "}</label>
            <input
              id="focus-intention-input"
              type="text"
              value={focusIntention}
              onChange={(e) => setFocusIntention(e.target.value)}
              placeholder={tr("What single goal or task are you focusing on?")}
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
                <span>{tr("Pause Focus")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tr("Start Focus")}</span>
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
            <span>{tr("Reset")}</span>
          </button>

          <button
            type="button"
            onClick={handleCompleteFocusEarly}
            className="min-h-[38px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap"
          >{"\n            "}{tr("Complete & Log")}{"\n          "}</button>
        </div>

        {focusFeedback && (
          <p role="status" className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            {focusFeedback}
          </p>
        )}
      </section>

      <AnimatePresence>
      {focusFullscreen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={tr("Distraction-Free Focus Mode")}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_SETTLE }}
          className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md text-white flex flex-col items-center justify-center p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={SPRING_MODAL}
            className="max-w-lg w-full text-center space-y-6 flex flex-col items-center"
          >
            <div className="text-xs font-semibold text-sky-400">{"\n              "}{tr("Focus Mode ·")}{" "}{focusIntention || tr("Deep Work")}
            </div>
            <SvgProgressRing
              progress={focusProgressPct / 100}
              size={210}
              strokeWidth={5}
              trackClassName="stroke-slate-800"
              progressClassName="stroke-sky-400"
            >
              <div className="text-5xl sm:text-6xl font-mono font-bold tabular-nums tracking-tight">
                {formatCountdown(focusSecondsLeft)}
              </div>
            </SvgProgressRing>
            <p className="text-sm text-slate-300 leading-relaxed">
              {tr("Stay present. Complete one focused block at a time.")}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12, ease: EASE_SETTLE }}
                onClick={() => setFocusRunning((prev) => !prev)}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold inline-flex items-center gap-2"
              >
                {focusRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{focusRunning ? tr("Pause") : tr("Resume Focus")}</span>
              </motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12, ease: EASE_SETTLE }}
                onClick={() => {
                  handleCompleteFocusEarly();
                  setFocusFullscreen(false);
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold"
              >{"\n                "}{tr("Complete & Log")}{"\n              "}</motion.button>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12, ease: EASE_SETTLE }}
                onClick={() => setFocusFullscreen(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 text-sm font-medium inline-flex items-center gap-1.5"
              >
                <Minimize2 className="w-4 h-4" aria-hidden="true" />
                <span>{tr("Exit View")}</span>
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
      </AnimatePresence>

      {/* 30-Day Progress Charts (Recharts) */}
      <section
        aria-label={tr("30-Day Recovery and Habit Progress Charts")}
        className="grid grid-cols-1 lg:grid-cols-2 gap-5"
      >
        <div className="surface p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Clean Streak Progress (Last 30 Days)")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr("Consecutive porn-free & social-media-free days logged")}
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-sky-700 dark:text-sky-400 tabular-nums">
              {tr("Current:")} {state.cleanStreakDays} {pluralDays(state.cleanStreakDays)}
            </span>
          </div>
          <div dir="ltr" className="w-full h-[220px]" data-testid="clean-streak-chart">
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
                  formatter={(value) => {
                    const count = Number(value ?? 0);
                    return [`${count} ${pluralDays(count)}`, tr('Clean Streak')];
                  }}
                  labelFormatter={(label) => `${tr('Date:')} ${String(label)}`}
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

        <div className="surface p-5 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Habit Completion Rate (Last 30 Days)")}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {tr("Daily percentage of habits completed across all routines")}
              </p>
            </div>
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {tr("30d Avg:")} <span dir="ltr" className="tabular-nums">{average30DayHabitRate}%</span>
            </span>
          </div>
          <div dir="ltr" className="w-full h-[220px]" data-testid="habit-completion-chart">
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
                    return [`${String(value ?? 0)}%${detail}`, tr('Habit Rate')];
                  }}
                  labelFormatter={(label) => `${tr('Date:')} ${String(label)}`}
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

      </>)}

      {/* 1. HABIT TRACKER */}
      {subTab === 'habits' && (
        <section className="surface p-5 space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canRunSubmit('addHabit')) return;
              const parsed = habitFormSchema.safeParse({
                title: newHabitTitle,
                category: newHabitCat,
              });
              if (!parsed.success) {
                setHabitFormError(tr(parsed.error.issues[0]?.message ?? 'Enter a valid habit title.'));
                return;
              }
              setHabitFormError(null);
              onAddHabit(parsed.data.title, parsed.data.category);
              setNewHabitTitle('');
            }}
            className="space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <label htmlFor="new-habit-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr("New Daily Habit")}
                </label>
                <input
                  id="new-habit-title"
                  type="text"
                  maxLength={100}
                  value={newHabitTitle}
                  onChange={(e) => {
                    setHabitFormError(null);
                    setNewHabitTitle(e.target.value);
                  }}
                  placeholder={tr("e.g., Cold shower, 10 pages reading, No screens after 22:00")}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
                />
              </div>
              <div>
                <label htmlFor="new-habit-cat" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr("Category")}
                </label>
                <select
                  id="new-habit-cat"
                  value={newHabitCat}
                  onChange={(e) => setNewHabitCat(e.target.value as HabitItem['category'])}
                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Recovery">{tr("Recovery")}</option>
                  <option value="Discipline">{tr("Discipline")}</option>
                  <option value="Focus">{tr("Focus")}</option>
                  <option value="Health">{tr("Health")}</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={!newHabitTitle.trim()}
                className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tr("Add Habit")}</span>
              </button>
            </div>
            {habitFormError && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {habitFormError}
              </p>
            )}
          </form>

          {habitsPagination.totalItems === 0 ? (
            <div className="py-8 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 space-y-1">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {tr("No daily habits yet")}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {tr("Add your first daily routine above to start tracking streaks.")}
              </p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <caption className="sr-only">{tr("Daily habits and 7-day completion tracker")}</caption>
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  <th className="py-2 pe-4 text-start min-w-[9rem]">{tr("Habit")}</th>
                  <th className="py-2 px-2 text-end">{tr("Streak")}</th>
                  {recentDates.map((d) => (
                    <th key={d} className="py-2 px-1.5 text-center font-mono tabular-nums">
                      {d.slice(5)}
                    </th>
                  ))}
                  <th className="py-2 ps-2 text-end">{tr("Remove")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {habitsPagination.items.map((habit) => {
                  const streak = getHabitStreak(habit);
                  return (
                    <tr key={habit.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/50">
                      <td className="py-3 pe-4 min-w-[9rem]">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">{tr(habit.title)}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{tr(habit.category)}</div>
                      </td>
                      <td className="py-3 px-2 text-end font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Flame className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                          {streak} {pluralDays(streak)}
                        </span>
                      </td>
                      {recentDates.map((dateStr) => {
                        const done = habit.completedDates.includes(dateStr);
                        return (
                          <td key={dateStr} className="py-3 px-1.5 text-center">
                            <button
                              type="button"
                              aria-label={tr('Mark {title} for {date}', { title: habit.title, date: dateStr })}
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
                      <td className="py-3 ps-2 text-end">
                        <button
                          type="button"
                          aria-label={tr('Delete habit {title}', { title: habit.title })}
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
          )}
          {habitsPagination.totalPages > 1 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={!habitsPagination.hasPrev}
                onClick={() => setHabitsPage(habitsPagination.page - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                {tr("Previous")}
              </button>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {tr('Page {p} of {total}', { p: habitsPagination.page, total: habitsPagination.totalPages })}
              </span>
              <button
                type="button"
                disabled={!habitsPagination.hasNext}
                onClick={() => setHabitsPage(habitsPagination.page + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                {tr("Next")}
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. TASK TRACKER */}
      {subTab === 'tasks' && (
        <section className="surface p-5 space-y-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canRunSubmit('addTask')) return;
              const parsed = taskFormSchema.safeParse({
                title: newTaskTitle,
                priority: newTaskPriority,
                dueTime: newTaskTime,
              });
              if (!parsed.success) {
                setTaskFormError(tr(parsed.error.issues[0]?.message ?? 'Enter a valid task.'));
                return;
              }
              setTaskFormError(null);
              onAddTask(parsed.data.title, parsed.data.priority, 'Focus', parsed.data.dueTime);
              setNewTaskTitle('');
            }}
            className="space-y-2 pb-4 border-b border-slate-200 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-0 sm:min-w-[200px]">
                <label htmlFor="new-task-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr("New Action Task")}
                </label>
                <input
                  id="new-task-title"
                  type="text"
                  maxLength={140}
                  value={newTaskTitle}
                  onChange={(e) => {
                    setTaskFormError(null);
                    setNewTaskTitle(e.target.value);
                  }}
                  placeholder={tr("e.g., Study Kotlin coroutines for 45 mins")}
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
                />
              </div>
              <div>
                <label htmlFor="new-task-priority" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr("Priority")}
                </label>
                <select
                  id="new-task-priority"
                  value={newTaskPriority}
                  onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                  className="h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="High">{tr("High")}</option>
                  <option value="Medium">{tr("Medium")}</option>
                  <option value="Low">{tr("Low")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-task-time" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {tr("Target Time")}
                </label>
                <input
                  id="new-task-time"
                  type="time"
                  value={newTaskTime}
                  onChange={(e) => {
                    setTaskFormError(null);
                    setNewTaskTime(e.target.value);
                  }}
                  className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={!newTaskTitle.trim()}
                className="h-9 px-4 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{tr("Add Task")}</span>
              </button>
            </div>
            {taskFormError && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {taskFormError}
              </p>
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'active', 'completed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={taskFilter === f}
                  onClick={() => {
                    setTaskFilter(f);
                    setTasksPage(1);
                  }}
                  className={`px-3 py-1 rounded text-xs font-medium capitalize ${
                    taskFilter === f
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tr(f)}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {state.tasks.filter((t) => t.completed).length}/{state.tasks.length} {tr("completed")}
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {tasksPagination.totalItems === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                {tr("No tasks in this filter. Add a focused action above.")}
              </p>
            ) : (
              tasksPagination.items.map((task) => (
                <div key={task.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-label={tr('Toggle task {title}', { title: task.title })}
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
                        {tr(task.title)}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {tr(task.priority)} {tr('priority')} · {tr(task.category)}
                        {task.dueTime ? ` · ${task.dueTime}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={tr('Delete task {title}', { title: task.title })}
                    onClick={() => onDeleteTask(task.id)}
                    className="p-1.5 rounded text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
          {tasksPagination.totalPages > 1 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={!tasksPagination.hasPrev}
                onClick={() => setTasksPage(tasksPagination.page - 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                {tr("Previous")}
              </button>
              <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                {tr('Page {p} of {total}', { p: tasksPagination.page, total: tasksPagination.totalPages })}
              </span>
              <button
                type="button"
                disabled={!tasksPagination.hasNext}
                onClick={() => setTasksPage(tasksPagination.page + 1)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
              >
                {tr("Next")}
              </button>
            </div>
          )}
        </section>
      )}

      {/* 3. GOAL SETTER */}
      {subTab === 'goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6 items-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canRunSubmit('addGoal')) return;
              const parsed = goalFormSchema.safeParse({
                title: newGoalTitle,
                category: newGoalCat,
                targetDate: newGoalTarget,
                whyItMatters: newGoalWhy,
                milestones: newGoalMilestones
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              });
              if (!parsed.success) {
                setGoalFormError(tr(parsed.error.issues[0]?.message ?? 'Enter a valid goal.'));
                return;
              }
              setGoalFormError(null);
              onAddGoal(
                parsed.data.title,
                parsed.data.category,
                parsed.data.targetDate || 'Ongoing',
                parsed.data.whyItMatters,
                parsed.data.milestones
              );
              setNewGoalTitle('');
              setNewGoalWhy('');
              setNewGoalMilestones('');
            }}
            className="surface p-5 space-y-3 min-w-0"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{tr("Create New Goal")}</h3>
            <div>
              <label htmlFor="goal-title-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{"\n                "}{tr("Goal Title")}{"\n              "}</label>
              <input
                id="goal-title-input"
                type="text"
                maxLength={140}
                value={newGoalTitle}
                onChange={(e) => {
                  setGoalFormError(null);
                  setNewGoalTitle(e.target.value);
                }}
                placeholder={tr("e.g., 90 Days Clean + Launch Side Project")}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-2 focus:outline-sky-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="goal-cat-select" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{"\n                  "}{tr("Category")}{"\n                "}</label>
                <select
                  id="goal-cat-select"
                  value={newGoalCat}
                  onChange={(e) => setNewGoalCat(e.target.value as GoalItem['category'])}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Recovery">{tr("Recovery")}</option>
                  <option value="Fitness">{tr("Fitness")}</option>
                  <option value="Career & Study">{tr("Career & Study")}</option>
                  <option value="Mindset">{tr("Mindset")}</option>
                </select>
              </div>
              <div>
                <label htmlFor="goal-date-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{"\n                  "}{tr("Target Date")}{"\n                "}</label>
                <input
                  id="goal-date-input"
                  type="date"
                  value={newGoalTarget}
                  onChange={(e) => {
                    setGoalFormError(null);
                    setNewGoalTarget(e.target.value);
                  }}
                  className="w-full h-9 px-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="goal-why-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{"\n                "}{tr("Why This Matters")}{"\n              "}</label>
              <input
                id="goal-why-input"
                type="text"
                maxLength={500}
                value={newGoalWhy}
                onChange={(e) => setNewGoalWhy(e.target.value)}
                placeholder={tr("Personal reason that keeps you grounded")}
                className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            <div>
              <label htmlFor="goal-milestones-input" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">{"\n                "}{tr("Milestones (one per line)")}{"\n              "}</label>
              <textarea
                id="goal-milestones-input"
                rows={3}
                maxLength={3000}
                value={newGoalMilestones}
                onChange={(e) => setNewGoalMilestones(e.target.value)}
                placeholder={tr('Week 1 clean\nFinish module 1\nComplete 30-day review')}
                className="w-full p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
            </div>

            {goalFormError && (
              <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                {goalFormError}
              </p>
            )}

            <button
              type="submit"
              disabled={!newGoalTitle.trim()}
              className="w-full h-9 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tr("Save Goal")}</span>
            </button>
          </form>

          <div className="space-y-4 min-w-0">
            {goalsPagination.totalItems === 0 ? (
              <div className="surface p-8 text-center space-y-1.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {tr("No goals added yet")}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {tr("Define a measurable target and milestones on the left to start tracking progress.")}
                </p>
              </div>
            ) : (
            goalsPagination.items.map((goal) => {
              const pct = getGoalProgressPercent(goal);
              const draftMilestone = milestoneInputs[goal.id] ?? '';
              return (
                <div key={goal.id} className="surface p-5 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {tr(goal.category)} {tr("· Target")}{' '}
                        <span className="font-mono tabular-nums">{goal.targetDate}</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5">{tr(goal.title)}</h4>
                      {goal.whyItMatters && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{tr(goal.whyItMatters)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenGoalInNotes(goal)}
                        className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                      >
                        <BookOpen className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                        <span>{tr("Open in Notes")}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={tr('Delete goal {title}', { title: goal.title })}
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
                      <span className="text-slate-600 dark:text-slate-400">{tr("Milestone progress")}</span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                        <span dir="ltr">{pct}%</span>
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <motion.div
                        className="h-full w-full origin-left rtl:origin-right rounded-full bg-sky-600 dark:bg-sky-500"
                        initial={false}
                        animate={{ scaleX: Math.max(0, Math.min(1, pct / 100)) }}
                        transition={{ duration: 0.25, ease: EASE_SETTLE }}
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
                        className="w-full py-2 flex items-center gap-2.5 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/60 rounded px-1"
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
                          {tr(m.title)}
                        </span>
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!canRunSubmit(`milestone-${goal.id}`)) return;
                      const parsed = milestoneFormSchema.safeParse({ title: draftMilestone });
                      if (!parsed.success) {
                        setMilestoneErrors((prev) => ({
                          ...prev,
                          [goal.id]: tr(parsed.error.issues[0]?.message ?? 'Enter a milestone.'),
                        }));
                        return;
                      }
                      setMilestoneErrors((prev) => ({ ...prev, [goal.id]: null }));
                      onAddGoalMilestone(goal.id, parsed.data.title);
                      setMilestoneInputs((prev) => ({ ...prev, [goal.id]: '' }));
                    }}
                    className="space-y-1.5 pt-1"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        maxLength={140}
                        aria-label={tr('Add milestone to {title}', { title: goal.title })}
                        value={draftMilestone}
                        onChange={(e) => {
                          setMilestoneErrors((prev) => ({ ...prev, [goal.id]: null }));
                          setMilestoneInputs((prev) => ({ ...prev, [goal.id]: e.target.value }));
                        }}
                        placeholder={tr("Add another milestone...")}
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      />
                      <button
                        type="submit"
                        disabled={!draftMilestone.trim()}
                        className="h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 text-xs font-medium text-slate-700 dark:text-slate-200 shrink-0"
                      >
                        {tr("Add")}
                      </button>
                    </div>
                    {milestoneErrors[goal.id] && (
                      <p role="alert" className="text-[11px] font-medium text-red-600 dark:text-red-400">
                        {milestoneErrors[goal.id]}
                      </p>
                    )}
                  </form>
                </div>
              );
            }))}
            {goalsPagination.totalPages > 1 && (
              <div className="surface p-3 flex items-center justify-between gap-2 text-xs">
                <button
                  type="button"
                  disabled={!goalsPagination.hasPrev}
                  onClick={() => setGoalsPage(goalsPagination.page - 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                >
                  {tr("Previous")}
                </button>
                <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {tr('Page {p} of {total}', { p: goalsPagination.page, total: goalsPagination.totalPages })}
                </span>
                <button
                  type="button"
                  disabled={!goalsPagination.hasNext}
                  onClick={() => setGoalsPage(goalsPagination.page + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                >
                  {tr("Next")}
                </button>
              </div>
            )}
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
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
