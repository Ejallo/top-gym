import { useState } from 'react';
import { t } from '../i18n';
import { db } from '../lib/db';
import { exercisesChanged, fetchFull, fullMediaUrl, searchFull, type Exercise, type FullHit } from '../lib/exercises';
import { guessType, mapEquipment, mapMuscles } from '../lib/edbMap';
import { Sheet } from './Sheet';

/** Adds an exercise from the full online base to the local list (gif gets cached by the service worker). */
export async function addFromFull(id: string): Promise<string> {
  const h = await fetchFull(id);
  const equipment = mapEquipment(h.equipments);
  const { muscles, secondary } = mapMuscles(h.targetMuscles, h.secondaryMuscles, h.bodyParts);
  const gif = fullMediaUrl(h.exerciseId);
  await db.customExercises.put({
    id: h.exerciseId,
    name: h.name.charAt(0).toUpperCase() + h.name.slice(1),
    en: h.name,
    muscles,
    secondary,
    equipment,
    type: guessType(h.name, h.bodyParts, equipment),
    steps: h.instructions.map((s) => s.replace(/^Step:\s*\d+\s*/i, '')),
    gif,
    source: 'full',
    createdAt: Date.now(),
  });
  // Warm the cache so the gif is there offline (opaque response, stored by the service worker)
  void fetch(gif, { mode: 'no-cors' }).catch(() => undefined);
  exercisesChanged();
  return h.exerciseId;
}

export function FullSearch({ initial, known, onClose }: { initial: string; known: Exercise[]; onClose: () => void }) {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<FullHit[] | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [addError, setAddError] = useState(false);
  const knownIds = new Set(known.map((e) => e.id));
  // The full base has duplicates under other ids: compare by English name too
  const knownNames = new Set(known.map((e) => e.en.toLowerCase()));

  const run = async () => {
    if (!q.trim()) return;
    setState('loading');
    try {
      setHits(await searchFull(q.trim()));
      setState('idle');
    } catch {
      setState('error');
    }
  };

  const add = async (h: FullHit) => {
    setAdding(h.exerciseId);
    setAddError(false);
    try {
      await addFromFull(h.exerciseId);
      setAdded((s) => new Set(s).add(h.exerciseId));
    } catch {
      setAddError(true);
    }
    setAdding(null);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">{t('full.title')}</div>
      <p className="body" style={{ marginTop: 8 }}>
        {t('full.hint')}
      </p>
      <form
        className="search-row"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <input value={q} placeholder={t('full.ph')} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn lime small" type="submit" style={{ width: 'auto' }}>
          {state === 'loading' ? t('full.searching') : t('full.search')}
        </button>
      </form>

      {(state === 'error' || addError) && <p className="m pink" style={{ marginTop: 10 }}>{t('full.error')}</p>}
      {hits && hits.length === 0 && <p className="m muted" style={{ marginTop: 10 }}>{t('full.empty')}</p>}

      <div style={{ marginTop: 10 }}>
        {hits?.map((h) => {
          const inBase = knownIds.has(h.exerciseId) || knownNames.has(h.name.toLowerCase());
          const isAdded = added.has(h.exerciseId);
          return (
            <div key={h.exerciseId} className="ex-row">
              <div className="media-thumb">
                <img src={h.gifUrl} alt="" loading="lazy" />
              </div>
              <div className="ex-row-text">
                <b>{h.name}</b>
              </div>
              {inBase || isAdded ? (
                <span className="m lime">{isAdded ? t('full.added') : t('full.inBase')}</span>
              ) : (
                <button className="m lime add-btn" disabled={adding !== null} onClick={() => void add(h)}>
                  {adding === h.exerciseId ? '…' : t('full.add')}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
