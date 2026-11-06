import { useState } from 'react';
import { num, t } from '../i18n';
import { fmt } from '../lib/dates';
import type { Exercise } from '../lib/exercises';
import { metricsFor, sessionsFor, useFinishedWorkouts, type Metric, type Session } from '../lib/stats';
import { Sheet } from './Sheet';
import { BarChart } from './BarChart';

const DAY = 86400000;
const UNIT: Record<Metric, string> = { weight: 'unit.kg', e1rm: 'unit.kg', volume: 'unit.kg', reps: 'wk.reps', time: 'unit.sec', distance: 'unit.km' };

const valueOf = (s: Session, m: Metric) => s[m];

/** Per-exercise progress: big current number, change over 6 weeks, chart, full history. */
export function ExerciseProgress({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const workouts = useFinishedWorkouts();
  const metrics = metricsFor(ex.type);
  const [metric, setMetric] = useState<Metric>(metrics[0]);
  const sessions = workouts ? sessionsFor(ex.id, workouts) : [];
  const last = sessions[sessions.length - 1];
  const recent = sessions.slice(-12);

  // Change vs. the best value from 6+ weeks ago (or the first session)
  const cutoff = Date.now() - 42 * DAY;
  const base = [...sessions].reverse().find((s) => s.date <= cutoff) ?? sessions[0];
  const delta = last && base && last !== base ? Math.round((valueOf(last, metric) - valueOf(base, metric)) * 10) / 10 : 0;

  return (
    <Sheet onClose={onClose}>
      <div className="m muted">// {t('progress.title')}</div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {ex.name}
      </div>

      {metrics.length > 1 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {metrics.map((m) => (
            <button key={m} className={'chip' + (m === metric ? ' on' : '')} onClick={() => setMetric(m)}>
              {t(`metric.${m}`)}
            </button>
          ))}
        </div>
      )}

      {!last ? (
        <div className="dash" style={{ marginTop: 16 }}>
          <p className="body">{t('progress.noSessions')}</p>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 16, alignItems: 'flex-end' }}>
            <div className="h lime big-num">{num(valueOf(last, metric))}</div>
            <div className="m" style={{ textAlign: 'right' }}>
              <span className="muted">{t(UNIT[metric] as 'unit.kg')}</span>
              <br />
              {delta !== 0 && (
                <span className={delta > 0 ? 'lime' : 'pink'}>
                  {delta > 0 ? '+' : ''}
                  {num(delta)} / {t('progress.since', { date: fmt(new Date(base.date), { day: 'numeric', month: 'short' }) })}
                </span>
              )}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <BarChart
              values={recent.map((s) => valueOf(s, metric))}
              labels={recent.length > 1 ? [fmt(new Date(recent[0].date), { day: 'numeric', month: 'short' }), fmt(new Date(last.date), { day: 'numeric', month: 'short' })] : undefined}
            />
          </div>

          <div className="m muted sec">// {t('progress.history', { n: sessions.length })}</div>
          {[...sessions].reverse().map((s) => (
            <div key={s.workoutId} className="hist-line row m">
              <span>{fmt(new Date(s.date), { day: '2-digit', month: 'short' })}</span>
              <span className="hist-sets">{s.sets.map((x) => setLabel(x, ex.type)).join(' · ')}</span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

export function setLabel(s: Session['sets'][number], type: Exercise['type']): string {
  if (type === 'weight_reps') return `${num(s.weight ?? 0)}×${s.reps ?? 0}`;
  if (type === 'reps') return `${s.reps ?? 0}`;
  if (type === 'time') return `${s.time ?? 0}${t('unit.sec')}`;
  return [s.time ? `${Math.round(s.time / 60)}${t('unit.min')}` : '', s.distance ? `${num(s.distance)}${t('unit.km')}` : ''].filter(Boolean).join(' ');
}
