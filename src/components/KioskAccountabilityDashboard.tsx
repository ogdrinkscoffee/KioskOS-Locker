import React, { useState } from 'react';
import { ArrowUpRight, Check, Flame } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_SETTLE, SPRING_SNAPPY } from './MotionPrimitives';
import {
  SelfImprovementState,
  formatIsoDate,
  getDailyHabitProgress,
  getHabitStreak,
} from '../utils/selfImprovementEngine';
import { useI18n } from '../i18n/LocaleProvider';

interface KioskAccountabilityDashboardProps {
  selfImprovement: SelfImprovementState;
  isLandscape?: boolean;
  onLogCleanDay: () => void;
  onToggleHabitToday: (habitId: string) => void;
  onOpenFocusGrowth: () => void;
}

export const KioskAccountabilityDashboard: React.FC<KioskAccountabilityDashboardProps> = ({
  selfImprovement,
  isLandscape = false,
  onLogCleanDay,
  onToggleHabitToday,
  onOpenFocusGrowth,
}) => {
  const { tr, pluralDays } = useI18n();
  const [showAllHabits, setShowAllHabits] = useState(false);
  const today = formatIsoDate();
  const checkedCleanToday = selfImprovement.lastCleanCheckInDate === today;
  const progress = getDailyHabitProgress(selfImprovement.habits, today);
  const visibleHabits = showAllHabits
    ? selfImprovement.habits
    : selfImprovement.habits.slice(0, 3);

  return (
    <section
      aria-label={tr("Kiosk Accountability Dashboard")}
      className="mt-3 surface p-3.5 space-y-3"
      data-testid="kiosk-accountability-dashboard"
    >
      {/* Current Streak Summary */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            <Flame className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>{tr("Current Streak")}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {selfImprovement.cleanStreakDays}{' '}
              {pluralDays(selfImprovement.cleanStreakDays)}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              {tr("Best")} {selfImprovement.longestCleanStreakDays} {pluralDays(selfImprovement.longestCleanStreakDays)}
              <span aria-hidden="true"> · </span>
              {selfImprovement.urgeVictories} {tr("urges resisted")}
            </span>
          </div>
        </div>

        <motion.button
          type="button"
          onClick={onLogCleanDay}
          disabled={checkedCleanToday}
          whileHover={checkedCleanToday ? undefined : { y: -1 }}
          whileTap={checkedCleanToday ? undefined : { scale: 0.96 }}
          transition={{ duration: 0.14, ease: EASE_SETTLE }}
          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-colors ${
            checkedCleanToday
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white'
          }`}
        >
          {checkedCleanToday && (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_SNAPPY}
              className="inline-flex"
            >
              <Check className="w-3 h-3" aria-hidden="true" />
            </motion.span>
          )}
          <span>{checkedCleanToday ? tr("Logged Today") : tr("+1 Clean Day")}</span>
        </motion.button>
      </div>

      {/* Hairline Divider & Daily Habits Accountability */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 shrink-0">{tr("Daily Habits")}</h3>
            <span dir="ltr" className="text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums truncate">
              {progress.completed} / {progress.total} ({progress.percent}%)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {selfImprovement.habits.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllHabits((prev) => !prev)}
                className="text-[11px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0"
              >
                {showAllHabits ? tr("Top 3") : `${tr('All')} (${selfImprovement.habits.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenFocusGrowth}
              className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
            >
              <span>{tr("Focus Hub")}</span>
              <ArrowUpRight className="w-3 h-3 rtl:-scale-x-100" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Completion Progress Bar (GPU-composited scaleX) */}
        <div
          role="progressbar"
          aria-label={tr("Daily habits completion")}
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        >
          <motion.div
            className="h-full w-full origin-left rtl:origin-right rounded-full bg-emerald-600 dark:bg-emerald-500"
            initial={false}
            animate={{ scaleX: Math.max(0, Math.min(1, progress.percent / 100)) }}
            transition={{ duration: 0.25, ease: EASE_SETTLE }}
          />
        </div>

        {/* Interactive Habit Checklist */}
        {selfImprovement.habits.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 py-1">
            {tr("No daily habits configured yet. Open Focus Hub to add accountability habits.")}
          </p>
        ) : (
          <div
            className={
              isLandscape
                ? 'grid grid-cols-2 gap-x-3 divide-y divide-slate-100 dark:divide-slate-800'
                : 'divide-y divide-slate-100 dark:divide-slate-800'
            }
          >
            {visibleHabits.map((habit) => {
              const done = habit.completedDates.includes(today);
              const streak = getHabitStreak(habit);
              return (
                <motion.button
                  key={habit.id}
                  type="button"
                  aria-pressed={done}
                  whileTap={{ scale: 0.985 }}
                  transition={{ duration: 0.12, ease: EASE_SETTLE }}
                  onClick={() => onToggleHabitToday(habit.id)}
                  className="w-full min-h-[38px] py-1.5 flex items-center justify-between gap-2 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 rounded"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <motion.span
                      animate={{ scale: done ? [1, 1.15, 1] : 1 }}
                      transition={{ duration: 0.18, ease: EASE_SETTLE }}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        done
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {done && <Check className="w-2.5 h-2.5" aria-hidden="true" />}
                    </motion.span>
                    <span
                      className={`text-xs truncate transition-colors ${
                        done ? 'text-slate-500 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200 font-medium'
                      }`}
                    >
                      {tr(habit.title)}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {streak} {pluralDays(streak)}
                  </span>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
