import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { num, t } from '../i18n';
import { db, type Workout } from '../lib/db';
import { fmt } from '../lib/dates';
import { useExercises } from '../lib/exercises';
import { minutes, totals } from '../lib/workouts';
import { Sheet } from '../components/Sheet';
import { WorkoutRow } from '../components/WorkoutRow';

/** All finished workouts, newest first, grouped by month. */
export function History({ onOpen, onClose }: { onOpen: (w: Workout) => void; onClose: () => void }) {
  const all = useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray(), []);
  const [view, setView] = useState<Workout | null>(null);
  const done = (all ?? []).filter((w) => w.endedAt);

  const groups: { label: string; items: Workout[] }[] = [];
  for (const w of done) {
    const label = fmt(new Date(w.startedAt), { month: 'long', year: 'numeric' }).replace(/\s*г\.$/, '');
    const g = groups[groups.length - 1];
    if (g?.label === label) g.items.push(w);
    else groups.push({ label, items: [w] });
  }

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">{t('hist.title')}</div>
      <div className="m muted" style={{ marginTop: 6 }}>
        // {t('hist.count', { n: done.length })}
      </div>
      {all && done.length === 0 && <p className="m muted" style={{ marginTop: 16 }}>{t('home.noHistory')}</p>}
      {groups.map((g) => (
        <div key={g.label}>
          <div className="m muted sec">// {g.label}</div>
          {g.items.map((w) => (
            <WorkoutRow key={w.id} w={w} onOpen={() => setView(w)} />
          ))}
        </div>
      ))}
      {view && (
        <WorkoutView
          w={view}
          onEdit={() => {
            const w = view;
            setView(null);
            onClose();
            onOpen(w);
          }}
          onClose={() => setView(null)}
        />
      )}
    </Sheet>
  );
}

/** Read-only record of a finished workout. */
export function WorkoutView({ w, onEdit, onClose }: { w: Workout; onEdit: () => void; onClose: () => void }) {
  const list = useExercises();
  const byId = new Map((list ?? []).map((e) => [e.id, e]));
  const tt = totals(w);

  const remove = async () => {
    if (!confirm(t('hist.deleteConfirm'))) return;
    await db.workouts.delete(w.id);
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <div className="m lime">{fmt(new Date(w.startedAt), { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {w.title}
      </div>
      <div className="m muted" style={{ marginTop: 8 }}>
        {minutes(tt.durationMs)} {t('unit.min')} · {t('hist.line', { ex: tt.exercises, sets: tt.sets })}
        {tt.volume > 0 && ` · ${num(tt.volume)} ${t('unit.kg')}`}
      </div>

      {w.entries.map((e, i) => {
        const ex = byId.get(e.exerciseId);
        const done = e.sets.filter((s) => s.done);
        return (
          <div key={i} className="view-entry">
            <b className="h h-s">{ex?.name ?? e.exerciseId}</b>
            {e.rest && <div className="m muted" style={{ marginTop: 4 }}>// {t('wk.rest')} — {e.rest}</div>}
            <div className="view-sets m">
              {done.length === 0 && <span className="muted">{t('hist.noSets')}</span>}
              {done.map((s, k) => (
                <span key={k}>{setText(s, ex?.type)}</span>
              ))}
            </div>
            {e.note && <p className="body wk-note">✎ {e.note}</p>}
          </div>
        );
      })}

      {w.note && (
        <>
          <div className="m muted sec">// {t('wk.workoutNote')}</div>
          <p className="body">{w.note}</p>
        </>
      )}

      <div className="btn-row" style={{ marginTop: 20 }}>
        <button className="btn ghost small" onClick={onEdit}>
          {t('ex.edit')}
        </button>
        <button className="btn ghost small pink-text" onClick={() => void remove()}>
          {t('home.delete')}
        </button>
      </div>
    </Sheet>
  );
}

function setText(s: { weight?: number; reps?: number; time?: number; distance?: number }, type?: string): string {
  if (type === 'cardio') return [s.time ? `${Math.round(s.time / 60)} ${t('unit.min')}` : '', s.distance ? `${num(s.distance)} ${t('unit.km')}` : ''].filter(Boolean).join(' · ') || '✓';
  if (type === 'time') return s.time ? `${s.time} ${t('unit.sec')}` : '✓';
  if (type === 'reps') return s.reps ? `× ${s.reps}${s.weight ? ` +${s.weight}` : ''}` : '✓';
  return s.weight || s.reps ? `${num(s.weight ?? 0)}×${s.reps ?? 0}` : '✓';
}
