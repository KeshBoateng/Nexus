import { Check, Flame } from 'lucide-react';
import { countThisWeek, currentStreak, recentDays } from '../../lib/habits';
import type { Run } from '../../lib/useRunner';
import { setCheckin, type Habit } from './api';

const DAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** One habit: today's check button, streak, and the last 7 days. */
export function HabitRow({ habit, dates, today, run, compact }: { habit: Habit; dates: Set<string>; today: string; run: Run; compact?: boolean }) {
  const done = dates.has(today);
  const streak = currentStreak(dates, today, habit.target_per_week);
  const week = countThisWeek(dates, today);
  const days = recentDays(dates, today);
  const weekly = habit.target_per_week < 7;

  return (
    <div className="flex items-center gap-3 py-3">
      <button
        onClick={() => run(() => setCheckin(habit.id, today, !done))}
        aria-pressed={done}
        aria-label={done ? `Undo ${habit.name} for today` : `Mark ${habit.name} done today`}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
          done ? 'border-accent bg-accent text-on-accent' : 'border-border text-transparent hover:border-accent'
        }`}
      >
        <Check className="size-5" strokeWidth={2.5} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{habit.name}</p>
        <p className="text-xs text-text-faint">
          {weekly ? `${week}/${habit.target_per_week} this week` : 'Every day'}
          {streak.value > 0 && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-accent">
              <Flame className="size-3" aria-hidden />
              {streak.value} {streak.unit}
              {streak.value === 1 ? '' : 's'}
            </span>
          )}
        </p>
      </div>
      {!compact && (
        <div className="flex gap-1" aria-label="Last 7 days">
          {days.map((d) => {
            const dow = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
            return (
              <span
                key={d.date}
                title={d.date}
                className={`flex size-6 items-center justify-center rounded-md text-[10px] ${
                  d.done ? 'bg-accent/80 text-on-accent' : 'bg-surface-raised text-text-faint'
                } ${d.date === today ? 'ring-1 ring-text-faint' : ''}`}
              >
                {DAY_LETTER[dow]}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
