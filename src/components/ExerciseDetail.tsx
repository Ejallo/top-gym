import { useState } from 'react';
import { t, tk } from '../i18n';
import { db } from '../lib/db';
import { exercisesChanged, type Exercise } from '../lib/exercises';
import { Sheet } from './Sheet';
import { ExerciseMedia } from './ExerciseMedia';
import { CustomExerciseForm } from './CustomExerciseForm';

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
        {ex.category === 'rehab' && <span className="cyan"> · {t('ex.rehab')}</span>}
        {ex.source !== 'base' && <span className="pink"> · {t(ex.source === 'own' ? 'ex.source.own' : 'ex.source.full')}</span>}
      </div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {ex.name}
      </div>
      {ex.en.toLowerCase() !== ex.name.toLowerCase() &&<div className="m muted" style={{ marginTop: 6, textTransform: 'none' }}>{ex.en}</div>}

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
      <div className="m">{t(`type.${ex.type}`)}</div>

      {ex.side && (
        <>
          <div className="m muted sec">// {t('ex.side')}</div>
          <div className="m">{t(`side.${ex.side}`)}</div>
        </>
      )}

      {ex.steps.length > 0 && (
        <>
          <div className="m muted sec">// {t('ex.technique')}</div>
          <ol className="steps">
            {ex.steps.map((s, i) => (
              <li key={i}>
                <span className="lime m">{String(i + 1).padStart(2, '0')}</span>
                <span className="body">{s}</span>
              </li>
            ))}
          </ol>
        </>
      )}

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
