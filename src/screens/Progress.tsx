import { useMemo, useState } from 'react';
import { num, t } from '../i18n';
import { fmt } from '../lib/dates';
import { useExercises, type Exercise } from '../lib/exercises';
import { MUSCLES } from '../lib/muscles';
import { metricsFor, muscleLoad, sessionsFor, useFinishedWorkouts, weeklyCounts } from '../lib/stats';
import { Header } from '../components/Header';
import { Body3D } from '../components/Body3D';
import { BarChart } from '../components/BarChart';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseProgress } from '../components/ExerciseProgress';

export function Progress({ onSettings }: { onSettings: () => void }) {
  const workouts = useFinishedWorkouts();
  const list = useExercises();
  const [open, setOpen] = useState<Exercise | null>(null);
  const byId = useMemo(() => new Map((list ?? []).map((e) => [e.id, e])), [list]);

  const load = useMemo(() => (workouts ? muscleLoad(workouts, byId, 7) : null), [workouts, byId]);
  const top = load
    ? MUSCLES.filter((m) => load[m] > 0)
        .sort((a, b) => load[b] - load[a])
        .slice(0, 4)
    : [];
  const weeks = workouts ? weeklyCounts(workouts, 8) : [];

  // Exercises you trained, most recent first
  const trained = useMemo(() => {
    if (!workouts) return [];
    const last = new Map<string, number>();
    for (const w of workouts) for (const e of w.entries) if (e.sets.some((s) => s.done)) last.set(e.exerciseId, Math.max(last.get(e.exerciseId) ?? 0, w.startedAt));
    return [...last.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((e): e is Exercise => !!e);
  }, [workouts, byId]);

  return (
    <div className="screen">
      <Header title={t('progress.title')} onSettings={onSettings} />

      <div className="body-card">
        <div className="row m body-card-head">
          <span className="muted">{t('progress.load7')}</span>
          <span>
            <span className="pink">■</span> {t('progress.high')} <span className="lime">■</span> {t('progress.mid')}
          </span>
        </div>
        {load && <Body3D load={load} />}
        {top.length > 0 ? (
          <div className="chips" style={{ padding: '0 10px 10px' }}>
            {top.map((m) => (
              <span key={m} className={'chip ' + (load![m] >= 0.67 ? 'chip-pink' : 'on')}>
                {t(`muscle.${m}`)}
              </span>
            ))}
          </div>
        ) : (
          <p className="m muted" style={{ padding: '0 10px 12px' }}>
            {t('progress.noLoad')}
          </p>
        )}
      </div>

      <div className="m muted sec">// {t('progress.perWeek')}</div>
      <BarChart
        values={weeks.map((w) => w.count)}
        labels={weeks.length ? [fmt(new Date(weeks[0].start), { day: 'numeric', month: 'short' }), t('progress.thisWeek')] : undefined}
        height={90}
        zero
      />

      <div className="m muted sec">// {t('progress.exercises')}</div>
      {workouts && trained.length === 0 && (
        <div className="dash">
          <p className="body">{t('progress.empty')}</p>
        </div>
      )}
      {trained.map((e) => {
        const ss = sessionsFor(e.id, workouts ?? []);
        const lastS = ss[ss.length - 1];
        const m = metricsFor(e.type)[0];
        return (
          <button key={e.id} className="ex-row" onClick={() => setOpen(e)}>
            <ExerciseMedia ex={e} size="thumb" />
            <div className="ex-row-text">
              <b>{e.name}</b>
              <span className="m muted">{t('progress.sessions', { n: ss.length })}</span>
            </div>
            <span className="h h-m lime" style={{ whiteSpace: 'nowrap' }}>
              {lastS ? num(lastS[m]) : '—'}
            </span>
          </button>
        );
      })}

      {open && <ExerciseProgress ex={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
