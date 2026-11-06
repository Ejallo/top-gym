import { num, t } from '../i18n';
import type { Workout } from '../lib/db';
import { fmt } from '../lib/dates';
import { minutes, totals } from '../lib/workouts';

/** One finished workout in a list: date, duration, title, counts. */
export function WorkoutRow({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const tt = totals(w);
  return (
    <button className="hist-row" onClick={onOpen}>
      <div className="row m">
        <span className="lime">{fmt(new Date(w.startedAt), { weekday: 'short', day: '2-digit', month: 'short' })}</span>
        <span className="muted">
          {minutes(tt.durationMs)} {t('unit.min')}
        </span>
      </div>
      <b className="h h-s" style={{ marginTop: 6, display: 'block' }}>
        {w.title}
      </b>
      <div className="m muted" style={{ marginTop: 6 }}>
        {t('hist.line', { ex: tt.exercises, sets: tt.sets })}
        {tt.volume > 0 && ` · ${num(tt.volume)} ${t('unit.kg')}`}
        {w.note && ' · ✎'}
      </div>
    </button>
  );
}
