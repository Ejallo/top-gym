import { useState } from 'react';
import { t } from '../i18n';
import { db, uid, type Folder, type PlanItem, type Template } from '../lib/db';
import { useExercises, type Exercise } from '../lib/exercises';
import { Sheet } from './Sheet';
import { ExercisePicker } from './ExercisePicker';
import { ExerciseMedia } from './ExerciseMedia';
import { NumInput } from './NumInput';
import { ExerciseDetail } from './ExerciseDetail';

/** Create or edit a workout template, or (kind = mobility) an own stretching/yoga routine of timed holds. */
export function TemplateEditor({ edit, kind, folder, onClose }: { edit?: Template; kind?: 'mobility'; folder?: Folder; onClose: () => void }) {
  const mobility = (kind ?? edit?.kind) === 'mobility';
  const list = useExercises();
  const [name, setName] = useState(edit?.name ?? '');
  const [items, setItems] = useState<PlanItem[]>(edit?.items ?? []);
  const [picking, setPicking] = useState(false);
  // Index of the item being swapped for another exercise (sets, reps and weight stay)
  const [replacing, setReplacing] = useState<number | null>(null);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [error, setError] = useState('');
  const byId = new Map((list ?? []).map((e) => [e.id, e]));

  const patch = (i: number, p: Partial<PlanItem>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const save = async () => {
    if (!name.trim()) return setError(t('tpl.nameRequired'));
    if (!items.length) return setError(t('tpl.itemsRequired'));
    // Mobility holds: one set, or one per side for one-sided poses
    const saved = mobility ? items.map((x) => ({ ...x, sets: byId.get(x.exerciseId)?.perSide ? 2 : 1, time: x.time ?? 30 })) : items;
    await db.templates.put({
      ...edit,
      id: edit?.id ?? uid('t_'),
      name: name.trim(),
      items: saved,
      createdAt: edit?.createdAt ?? Date.now(),
      ...(mobility && { kind: 'mobility' as const }),
      ...(folder && { folder }),
    });
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">{t(mobility ? (edit ? 'mob.editTitle' : 'mob.newTitle') : edit ? 'tpl.editTitle' : 'tpl.newTitle')}</div>
      <label className="field">
        <span className="m muted">{t('tpl.name')}</span>
        <input
          value={name}
          placeholder={t('tpl.namePh')}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
      </label>

      <div className="m muted sec">// {t('tpl.exercises', { n: items.length })}</div>
      {items.map((it, i) => {
        const ex = byId.get(it.exerciseId);
        const timed = ex?.type === 'time' || ex?.type === 'cardio';
        return (
          <div key={i} className="plan-item">
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <button
                className="row"
                style={{ justifyContent: 'flex-start', gap: 10, minWidth: 0, textAlign: 'left' }}
                onClick={() => ex && setInfo(ex)}
              >
                {ex && <ExerciseMedia ex={ex} size="thumb" />}
                <b className="h h-s" style={{ lineHeight: 1.1 }}>
                  {ex?.name ?? it.exerciseId}
                </b>
              </button>
              <div className="plan-tools">
                <button onClick={() => setReplacing(i)} aria-label="replace">⇄</button>
                <button onClick={() => move(i, -1)} aria-label="up">↑</button>
                <button onClick={() => move(i, 1)} aria-label="down">↓</button>
                <button className="pink" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} aria-label="delete">
                  ×
                </button>
              </div>
            </div>
            {mobility ? (
              <div className="plan-grid two">
                <label>
                  <span className="m muted">
                    {t('unit.sec')}
                    {ex?.perSide && ` · ${t('ex.perSide')}`}
                  </span>
                  <NumInput value={it.time ?? 30} onChange={(v) => patch(i, { time: v })} />
                </label>
              </div>
            ) : (
            <>
            <div className="plan-grid">
              <label>
                <span className="m muted">{t('tpl.sets')}</span>
                <NumInput value={it.sets} onChange={(v) => patch(i, { sets: v ?? 1 })} />
              </label>
              {timed ? (
                <label>
                  <span className="m muted">{ex?.type === 'cardio' ? t('unit.min') : t('unit.sec')}</span>
                  <NumInput
                    value={it.time === undefined ? undefined : ex?.type === 'cardio' ? Math.round(it.time / 60) : it.time}
                    onChange={(v) => patch(i, { time: v === undefined ? undefined : ex?.type === 'cardio' ? v * 60 : v })}
                  />
                </label>
              ) : (
                <label>
                  <span className="m muted">{t('tpl.reps')}</span>
                  <input value={it.reps ?? ''} placeholder="8-12" inputMode="text" onChange={(e) => patch(i, { reps: e.target.value || undefined })} />
                </label>
              )}
              {ex?.type === 'cardio' ? (
                <label>
                  <span className="m muted">{t('unit.km')}</span>
                  <NumInput value={it.distance} decimal onChange={(v) => patch(i, { distance: v })} />
                </label>
              ) : (
                <label>
                  <span className="m muted">{ex?.perHand ? t('unit.kgHand') : t('unit.kg')}</span>
                  <NumInput value={it.weight} decimal onChange={(v) => patch(i, { weight: v })} />
                </label>
              )}
            </div>
            <div className="plan-grid two">
              <label>
                <span className="m muted">{t('tpl.rest')}</span>
                <input value={it.rest ?? ''} placeholder={t('tpl.restPh')} onChange={(e) => patch(i, { rest: e.target.value || undefined })} />
              </label>
              <label>
                <span className="m muted">{t('tpl.note')}</span>
                <input value={it.note ?? ''} placeholder={t('tpl.notePh')} onChange={(e) => patch(i, { note: e.target.value || undefined })} />
              </label>
            </div>
            </>
            )}
          </div>
        );
      })}

      <button className="btn outline small" style={{ marginTop: 10 }} onClick={() => setPicking(true)}>
        + {t('tpl.addExercise')}
      </button>

      {error && <p className="m pink" style={{ marginTop: 12 }}>{error}</p>}
      <button className="btn lime" style={{ marginTop: 18 }} onClick={() => void save()}>
        {t('custom.save')}
      </button>

      {replacing !== null && (
        <ExercisePicker
          single
          // Start on the same muscle group (or section) as the exercise being replaced
          initialFilter={(() => {
            const cur = byId.get(items[replacing]?.exerciseId);
            return cur?.category ?? cur?.group ?? (mobility ? 'stretch' : undefined);
          })()}
          onClose={() => setReplacing(null)}
          onPick={(ids) => {
            if (ids[0]) patch(replacing, { exerciseId: ids[0] });
            setReplacing(null);
          }}
        />
      )}
      {info && <ExerciseDetail ex={info} onClose={() => setInfo(null)} />}
      {picking && (
        <ExercisePicker
          initialFilter={mobility ? 'stretch' : undefined}
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setItems((xs) => [...xs, ...ids.map((id) => (mobility ? { exerciseId: id, sets: 1, time: 30 } : { exerciseId: id, sets: 3 }))]);
            setError('');
            setPicking(false);
          }}
        />
      )}
    </Sheet>
  );
}
