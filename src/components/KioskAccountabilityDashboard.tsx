import React, { useState } from 'react';
import { ArrowUpRight, Check, Flame } from 'lucide-react';
import {
  SelfImprovementState,
  formatIsoDate,
  getDailyHabitProgress,
  getHabitStreak,
} from '../utils/selfImprovementEngine';

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
  const [showAllHabits, setShowAllHabits] = useState(false);
  const today = formatIsoDate();
  const checkedCleanToday = selfImprovement.lastCleanCheckInDate === today;
  const progress = getDailyHabitProgress(selfImprovement.habits, today);
  const visibleHabits = showAllHabits
    ? selfImprovement.habits
    : selfImprovement.habits.slice(0, 3);

  return (
    <section
      aria-label="Kiosk Accountability Dashboard"
      className="mt-3 surface p-3.5 space-y-3"
      data-testid="kiosk-accountability-dashboard"
    >
      {/* Current Streak Summary */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400">
            <Flame className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
            <span>Current Streak</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2 flex-wrap">
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {selfImprovement.cleanStreakDays}{' '}
              {selfImprovement.cleanStreakDays === 1 ? 'Day' : 'Days'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              Best {selfImprovement.longestCleanStreakDays}d
              <span aria-hidden="true"> · </span>
              {selfImprovement.urgeVictories} urges resisted
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onLogCleanDay}
          disabled={checkedCleanToday}
          className={`min-h-[36px] px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 inline-flex items-center gap-1 transition-colors ${
            checkedCleanToday
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-slate-900 hover:bg-slate-800 dark:bg-sky-600 dark:hover:bg-sky-500 text-white'
          }`}
        >
          {checkedCleanToday && <Check className="w-3 h-3" aria-hidden="true" />}
          <span>{checkedCleanToday ? 'Logged Today' : '+1 Clean Day'}</span>
        </button>
      </div>

      {/* Hairline Divider & Daily Habits Accountability */}
      <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 shrink-0">Daily Habits</h3>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 tabular-nums truncate">
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
                {showAllHabits ? 'Top 3' : `All (${selfImprovement.habits.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenFocusGrowth}
              className="text-[11px] font-semibold text-sky-700 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-300 inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
            >
              <span>Focus Hub</span>
              <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Completion Progress Bar */}
        <div
          role="progressbar"
          aria-label="Daily habits completion"
          aria-valuenow={progress.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
        >
          <div
            className="h-full bg-emerald-600 dark:bg-emerald-500 transition-all duration-200"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        {/* Interactive Habit Checklist */}
        {selfImprovement.habits.length === 0 ? (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 py-1">
            No daily habits configured yet. Open Focus Hub to add accountability habits.
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
                <button
                  key={habit.id}
                  type="button"
                  aria-pressed={done}
                  onClick={() => onToggleHabitToday(habit.id)}
                  className="w-full min-h-[38px] py-1.5 flex items-center justify-between gap-2 text-left hover:bg-slate-50/70 dark:hover:bg-slate-800/60 transition-colors focus-visible:outline-2 focus-visible:outline-sky-600 rounded"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        done
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white dark:bg-slate-950 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {done && <Check className="w-2.5 h-2.5" aria-hidden="true" />}
                    </span>
                    <span
                      className={`text-xs truncate ${
                        done ? 'text-slate-500 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200 font-medium'
                      }`}
                    >
                      {habit.title}
                    </span>
                  </span>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    {streak}d
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
