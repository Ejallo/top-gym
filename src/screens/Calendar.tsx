import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db, type Template, type Workout } from '../lib/db';
import { fmt, monthCells, sameDay, weekday, weekdayNames } from '../lib/dates';
import { useExercises } from '../lib/exercises';
import { dominantGroup, useFinishedWorkouts, useWeeklyGoal, weekStreak, weeklyCounts } from '../lib/stats';
import type { Group } from '../lib/muscles';
import { Header } from '../components/Header';
import { Sheet } from '../components/Sheet';
import { WorkoutRow } from '../components/WorkoutRow';
import { WorkoutView } from './History';
import { WeeklyReport } from './WeeklyReport';
import { weekStartOf } from '../lib/stats';
import { activeOf, usePrograms } from '../lib/programs';
import { ProgramSwitcher } from '../components/ProgramBlock';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { TemplateEditor } from '../components/TemplateEditor';
import type { Exercise } from '../lib/exercises';
import { activeWorkout, entryFromPlan, planText, startWorkout } from '../lib/workouts';
import { dayOn, isoDate, startRehabDay, useRehab, useRehabDone, useRehabTicks, type RehabExercise } from '../lib/rehab';
import { DayItems, ExerciseSheet } from './Rehab';

const UNITS = () => ({ kg: t('unit.kg'), min: t('unit.min'), km: t('unit.km'), sec: t('unit.sec') });

/** Day colour by the main muscle group of the workout. */
const COLOR: Partial<Record<Group, string>> = { legs: 'b', back: 'c', cardio: 'c' };

export function Calendar({ onSettings, onOpenWorkout }: { onSettings: () => void; onOpenWorkout: (w: Workout) => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<Date | null>(null);
  const [view, setView] = useState<Workout | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);
  const [report, setReport] = useState<number | null>(null);
  const workouts = useFinishedWorkouts();
  const list = useExercises();
  const programs = usePrograms();
  const program = activeOf(programs);
  const programTemplates = useLiveQuery(
    () => (program ? db.templates.where('id').anyOf(program.days.map((d) => d.templateId)).toArray() : []),
    [program?.id],
  );
  const [goal, setGoal] = useWeeklyGoal();

  const byId = new Map((list ?? []).map((e) => [e.id, e]));
  const tplById = new Map((programTemplates ?? []).map((x) => [x.id, x]));
  const rehab = useRehab();
  const rehabDone = useRehabDone();
  const rehabTicks = useRehabTicks();
  const [rehabEx, setRehabEx] = useState<RehabExercise | null>(null);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const onDay = (d: Date) => (workouts ?? []).filter((w) => sameDay(new Date(w.startedAt), d));
  const plannedOn = (d: Date) => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (!program || d < start) return [];
    return program.days.filter((x) => x.weekday === weekday(d)).flatMap((x) => tplById.get(x.templateId) ?? []);
  };
  const isToday = (d: Date) => sameDay(d, today);
  // Starting from the calendar: only for today; a running workout opens instead of a new one
  const startTpl = async (tpl: Template) => {
    const running = await activeWorkout();
    setDay(null);
    onOpenWorkout(running ?? (await startWorkout(tpl.name, tpl)));
  };

  const monthCount = (workouts ?? []).filter(
    (w) => w.kind !== 'mobility' && new Date(w.startedAt).getMonth() === cursor.getMonth() && new Date(w.startedAt).getFullYear() === cursor.getFullYear(),
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

      <button className="btn outline small" style={{ marginBottom: 10 }} onClick={() => setReport(weekStartOf(Date.now()))}>
        {t('report.open')} →
      </button>

      {programs && programs.length > 1 && (
        <>
          <div className="m muted" style={{ marginBottom: 6 }}>
            // {t('cal.program')}
          </div>
          <ProgramSwitcher programs={programs} active={program} />
        </>
      )}

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
          const all = onDay(d);
          // Stretching/yoga don't colour the day: they add a dot (orange stretch, violet yoga)
          const ws = all.filter((w) => w.kind !== 'mobility');
          const mob = all.filter((w) => w.kind === 'mobility');
          const yoga = mob.some((w) => w.entries.some((e) => byId.get(e.exerciseId)?.category === 'yoga'));
          const planned = ws.length ? [] : plannedOn(d);
          const g = ws[0] && dominantGroup(ws[0], byId);
          const cls = ws.length ? 'done ' + (g ? (COLOR[g] ?? 'a') : 'a') : planned.length ? 'planned' : '';
          return (
            <button key={i} className={'day ' + cls + (sameDay(d, today) ? ' today' : '')} onClick={() => setDay(d)}>
              {String(d.getDate()).padStart(2, '0')}
              {ws.length > 1 && <i>×{ws.length}</i>}
              {mob.length > 0 && <s className={'mob-dot ' + (yoga ? 'yoga' : 'stretch')} />}
            </button>
          );
        })}
      </div>

      <p className="m muted cal-legend">
        <span className="lime">■</span> {t('cal.legend.upper')} <span className="pink">■</span> {t('cal.legend.legs')}{' '}
        <span className="cyan">■</span> {t('cal.legend.back')} <span className="lime">┅</span> {t('cal.legend.planned')}{' '}
        <span className="orange">●</span> {t('cat.stretch')} <span className="violet">●</span> {t('cat.yoga')}
      </p>

      {day && (
        <Sheet onClose={() => setDay(null)}>
          <div className="m lime">{fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {(() => {
            const rd = rehab ? dayOn(rehab, isoDate(day)) : null;
            const planned = onDay(day).length ? [] : plannedOn(day);
            const rDone = rd && (rehabDone.has(rd.day.d) || rehabTicks.includes(rd.day.d));
            return (
              <>
                {onDay(day).length === 0 && planned.length === 0 && !rd && (
                  <p className="m muted" style={{ marginTop: 16 }}>
                    {t('cal.dayEmpty')}
                  </p>
                )}
                {planned.map((tpl) => (
                  <div key={tpl.id} className="dash" style={{ marginTop: 12 }}>
                    <div className="m muted">{t('cal.planned')}</div>
                    <div className="h h-m" style={{ marginTop: 6 }}>
                      {tpl.name}
                    </div>
                    {tpl.items.map((it, i) => {
                      const ex = byId.get(it.exerciseId);
                      return (
                        <button key={i} className="ex-row" onClick={() => ex && setInfo(ex)}>
                          {ex && <ExerciseMedia ex={ex} size="thumb" />}
                          <span className="ex-row-text">
                            <b>{ex?.name ?? it.exerciseId}</b>
                            <span className="m muted">{planText(entryFromPlan(it), ex, UNITS())}</span>
                          </span>
                        </button>
                      );
                    })}
                    <div className="btn-row" style={{ marginTop: 12 }}>
                      {isToday(day) && (
                        <button className="btn lime small" onClick={() => void startTpl(tpl)}>
                          {t('rehab.start')} →
                        </button>
                      )}
                      <button className="btn outline small" onClick={() => setEditTpl(tpl)}>
                        {t('ex.edit')}
                      </button>
                    </div>
                    <p className="m muted" style={{ marginTop: 8, textTransform: 'none' }}>
                      {t('cal.editHint')}
                    </p>
                  </div>
                ))}
                {rd && (
                  <div className="rehab-today" style={{ marginTop: 12 }}>
                    <div className="m">
                      {t('rehab.title')} · {rd.week.title}
                    </div>
                    <div className="h h-m" style={{ marginTop: 6 }}>
                      {rd.day.label}
                      {rDone && ' ✓'}
                    </div>
                    <DayItems day={rd.day} onEx={(k) => setRehabEx(rehab!.exercises.find((e) => e.key === k) ?? null)} />
                    {isToday(day) && rd.day.items.length > 0 && (
                      <button
                        className="btn cyan"
                        style={{ marginTop: 12 }}
                        onClick={async () => {
                          const running = await activeWorkout();
                          setDay(null);
                          onOpenWorkout(running ?? (await startRehabDay(rd.day, `${t('rehab.title')} · ${rd.week.title}`)));
                        }}
                      >
                        {t('rehab.start')} →
                      </button>
                    )}
                  </div>
                )}
              </>
            );
          })()}
          {onDay(day).map((w) => (
            <WorkoutRow key={w.id} w={w} onOpen={() => setView(w)} />
          ))}
          <button className="btn ghost small" style={{ marginTop: 14 }} onClick={() => setReport(weekStartOf(day.getTime()))}>
            {t('report.forThisWeek')} →
          </button>
          {rehabEx && <ExerciseSheet e={rehabEx} onClose={() => setRehabEx(null)} />}
          {info && <ExerciseDetail ex={info} onClose={() => setInfo(null)} />}
          {editTpl && <TemplateEditor edit={editTpl} onClose={() => setEditTpl(null)} />}
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

      {report !== null && <WeeklyReport start={report} onClose={() => setReport(null)} />}
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
