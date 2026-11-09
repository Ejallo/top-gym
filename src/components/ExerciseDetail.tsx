import { useState } from 'react';
import { t, tk } from '../i18n';
import { db } from '../lib/db';
import { exercisesChanged, type Exercise } from '../lib/exercises';
import { Sheet } from './Sheet';
import { ExerciseMedia } from './ExerciseMedia';
import { CustomExerciseForm } from './CustomExerciseForm';
import { ExerciseProgress, setLabel } from './ExerciseProgress';
import { fmt } from '../lib/dates';
import { sessionsFor, useFinishedWorkouts } from '../lib/stats';
import { setPin, usePins } from '../lib/pins';
import { Technique } from './Technique';

/** Pinned note: shown in every workout with this exercise; edited here or from the workout note sheet. */
function PinNote({ ex }: { ex: Exercise }) {
  const pin = usePins()[ex.id] ?? '';
  const [edit, setEdit] = useState<string | null>(null);
  if (edit !== null)
    return (
      <label className="field">
        <span className="m lime">// {t('ex.pin')}</span>
        <textarea rows={2} autoFocus value={edit} placeholder={t('wk.pinPh')} onChange={(e) => setEdit(e.target.value)} />
        <button
          className="btn lime small"
          style={{ marginTop: 8 }}
          onClick={() => {
            void setPin(ex.id, edit);
            setEdit(null);
          }}
        >
          {t('custom.save')}
        </button>
      </label>
    );
  return pin ? (
    <button className="body wk-pin" style={{ display: 'block', textAlign: 'left', width: '100%' }} onClick={() => setEdit(pin)}>
      📌 {pin}
    </button>
  ) : (
    <button className="m muted" style={{ display: 'block', marginTop: 12 }} onClick={() => setEdit('')}>
      {t('ex.pinAdd')}
    </button>
  );
}

/** Last sessions of the exercise with a link to the full progress view. */
function ExerciseHistory({ ex }: { ex: Exercise }) {
  const workouts = useFinishedWorkouts();
  const [open, setOpen] = useState(false);
  const sessions = workouts ? sessionsFor(ex.id, workouts) : [];
  if (!sessions.length) return null;
  return (
    <>
      <div className="row sec">
        <span className="m muted">// {t('ex.history', { n: sessions.length })}</span>
        <button className="m lime" onClick={() => setOpen(true)}>
          {t('ex.progress')} →
        </button>
      </div>
      {[...sessions]
        .reverse()
        .slice(0, 4)
        .map((s) => (
          <div key={s.workoutId} className="hist-line row m">
            <span>{fmt(new Date(s.date), { day: '2-digit', month: 'short' })}</span>
            <span className="hist-sets">{s.sets.map((x) => setLabel(x, ex.type)).join(' · ')}</span>
          </div>
        ))}
      {open && <ExerciseProgress ex={ex} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ExerciseDetail({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <CustomExerciseForm edit={ex} onClose={onClose} />;

  const remove = async () => {
    if (!confirm(t('ex.deleteConfirm', { name: ex.name }))) return;
    await db.customExercises.delete(ex.id);
    exercisesChanged();
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <ExerciseMedia ex={ex} size="big" />
      <div className="m muted" style={{ marginTop: 12 }}>
        {t(`group.${ex.group}`)} · {tk(`eq.${ex.equipment}`, ex.equipment)}
        {ex.category && <span className={`cat-${ex.category}`}> · {t(`cat.${ex.category}`)}</span>}
        {ex.source !== 'base' && <span className="pink"> · {t(ex.source === 'own' ? 'ex.source.own' : 'ex.source.full')}</span>}
      </div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {ex.name}
      </div>
      {ex.en.toLowerCase() !== ex.name.toLowerCase() &&<div className="m muted" style={{ marginTop: 6, textTransform: 'none' }}>{ex.en}</div>}

      <PinNote ex={ex} />

      <div className="m muted sec">// {t('ex.muscles')}</div>
      <div className="chips">
        {ex.muscles.map((m) => (
          <span key={m} className="chip on">
            {t(`muscle.${m}`)}
          </span>
        ))}
        {ex.secondary.map((m) => (
          <span key={m} className="chip">
            {t(`muscle.${m}`)}
          </span>
        ))}
      </div>

      <div className="m muted sec">// {t('ex.type')}</div>
      <div className="m">{ex.perHand ? t('type.perHand') : t(`type.${ex.type}`)}</div>

      <ExerciseHistory ex={ex} />

      {ex.side && (
        <>
          <div className="m muted sec">// {t('ex.side')}</div>
          <div className="m">{t(`side.${ex.side}`)}</div>
        </>
      )}

      <Technique ex={ex} />

      {ex.videoUrl && (
        <a className="btn outline small" style={{ marginTop: 16, textDecoration: 'none' }} href={ex.videoUrl} target="_blank" rel="noreferrer">
          {t('ex.video')}
        </a>
      )}

      {ex.source !== 'base' && (
        <div className="btn-row" style={{ marginTop: 20 }}>
          <button className="btn ghost small" onClick={() => setEditing(true)}>
            {t('ex.edit')}
          </button>
          <button className="btn ghost small pink-text" onClick={() => void remove()}>
            {t('ex.delete')}
          </button>
        </div>
      )}
    </Sheet>
  );
}
