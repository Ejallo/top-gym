import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db, type Workout } from '../lib/db';
import { fmt, monthCells, sameDay, weekday, weekdayNames } from '../lib/dates';
import { useExercises } from '../lib/exercises';
import { dominantGroup, useFinishedWorkouts, useWeeklyGoal, weekStreak, weeklyCounts } from '../lib/stats';
import type { Group } from '../lib/muscles';
import { Header } from '../components/Header';
import { Sheet } from '../components/Sheet';
import { WorkoutRow } from '../components/WorkoutRow';
import { WorkoutView } from './History';

/** Day colour by the main muscle group of the workout. */
const COLOR: Partial<Record<Group, string>> = { legs: 'b', back: 'c', cardio: 'c' };

export function Calendar({ onSettings, onOpenWorkout }: { onSettings: () => void; onOpenWorkout: (w: Workout) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<Date | null>(null);
  const [view, setView] = useState<Workout | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const workouts = useFinishedWorkouts();
  const list = useExercises();
  const program = useLiveQuery(() => db.programs.toArray(), [])?.[0];
  const programTemplates = useLiveQuery(
    () => (program ? db.templates.where('id').anyOf(program.days.map((d) => d.templateId)).toArray() : []),
    [program?.id],
  );
  const [goal, setGoal] = useWeeklyGoal();

  const byId = new Map((list ?? []).map((e) => [e.id, e]));
  const tplName = new Map((programTemplates ?? []).map((x) => [x.id, x.name]));
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const onDay = (d: Date) => (workouts ?? []).filter((w) => sameDay(new Date(w.startedAt), d));
  const plannedOn = (d: Date) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!program || d < start) return [];
    return program.days.filter((x) => x.weekday === weekday(d)).map((x) => tplName.get(x.templateId) ?? '');
  };

  const monthCount = (workouts ?? []).filter(
    (w) => new Date(w.startedAt).getMonth() === cursor.getMonth() && new Date(w.startedAt).getFullYear() === cursor.getFullYear(),
  ).length;
  const streak = workouts ? weekStreak(workouts, goal) : 0;
  const thisWeek = workouts ? weeklyCounts(workouts, 1)[0].count : 0;

  return (
    <div className="screen">
      <Header
        title={
          <>
            {fmt(cursor, { month: 'long' })}
            <br />
            <span className="lime">{cursor.getFullYear()}.</span>
          </>
        }
        sub={`// ${t('cal.month', { n: monthCount })}`}
        onSettings={onSettings}
      />

      <div className="stats-grid" style={{ marginTop: 0, marginBottom: 12 }}>
        <div>
          <b>
            {thisWeek}/{goal}
          </b>
          <span className="m">{t('cal.week')}</span>
        </div>
        <div>
          <b>{streak}</b>
          <span className="m">{t('cal.streak', { n: streak })}</span>
        </div>
        <button onClick={() => setGoalOpen(true)}>
          <b>{goal}</b>
          <span className="m">{t('cal.goal')} ✎</span>
        </button>
      </div>

      <div className="btn-row" style={{ marginBottom: 10 }}>
        <button className="btn ghost small" onClick={() => shift(-1)} aria-label={t('cal.prev')}>
          ←
        </button>
        <button className="btn ghost small" onClick={() => shift(1)} aria-label={t('cal.next')}>
          →
        </button>
      </div>

      <div className="cal">
        {weekdayNames().map((n) => (
          <div key={n} className="dow">
            {n.toUpperCase()}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="day blank" />;
          const ws = onDay(d);
          const planned = ws.length ? [] : plannedOn(d);
          const g = ws[0] && dominantGroup(ws[0], byId);
          const cls = ws.length ? 'done ' + (g ? (COLOR[g] ?? 'a') : 'a') : planned.length ? 'planned' : '';
          return (
            <button key={i} className={'day ' + cls + (sameDay(d, today) ? ' today' : '')} onClick={() => setDay(d)}>
              {String(d.getDate()).padStart(2, '0')}
              {ws.length > 1 && <i>×{ws.length}</i>}
            </button>
          );
        })}
      </div>

      <p className="m muted cal-legend">
        <span className="lime">■</span> {t('cal.legend.upper')} <span className="pink">■</span> {t('cal.legend.legs')}{' '}
        <span className="cyan">■</span> {t('cal.legend.back')} <span className="lime">┅</span> {t('cal.legend.planned')}
      </p>

      {day && (
        <Sheet onClose={() => setDay(null)}>
          <div className="m lime">{fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {onDay(day).length === 0 && plannedOn(day).length === 0 && (
            <p className="m muted" style={{ marginTop: 16 }}>
              {t('cal.dayEmpty')}
            </p>
          )}
          {plannedOn(day).map((name, i) =>
            onDay(day).length ? null : (
              <div key={i} className="dash" style={{ marginTop: 12 }}>
                <div className="m muted">{t('cal.planned')}</div>
                <div className="h h-m" style={{ marginTop: 6 }}>
                  {name}
                </div>
              </div>
            ),
          )}
          {onDay(day).map((w) => (
            <WorkoutRow key={w.id} w={w} onOpen={() => setView(w)} />
          ))}
          {view && (
            <WorkoutView
              w={view}
              onEdit={() => {
                const w = view;
                setView(null);
                setDay(null);
                onOpenWorkout(w);
              }}
              onClose={() => setView(null)}
            />
          )}
        </Sheet>
      )}

      {goalOpen && (
        <Sheet onClose={() => setGoalOpen(false)}>
          <div className="h h-l">{t('cal.goalTitle')}</div>
          <p className="body" style={{ marginTop: 8 }}>
            {t('cal.goalText')}
          </p>
          <div className="chips" style={{ marginTop: 14 }}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button
                key={n}
                className={'chip goal-chip' + (n === goal ? ' on' : '')}
                onClick={() => {
                  setGoal(n);
                  setGoalOpen(false);
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}
