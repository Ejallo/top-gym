import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { matches, useExercises } from '../lib/exercises';
import { GROUPS, type Group } from '../lib/muscles';
import { Sheet } from './Sheet';
import { ExerciseMedia } from './ExerciseMedia';

type Filter = 'all' | 'rehab' | Group;
const PAGE = 60;

/** Pick one or more exercises; returns ids in the order they were tapped. */
export function ExercisePicker({ onPick, onClose }: { onPick: (ids: string[]) => void; onClose: () => void }) {
  const list = useExercises();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [limit, setLimit] = useState(PAGE);

  const shown = useMemo(
    () =>
      (list ?? []).filter(
        (e) => (filter === 'all' || (filter === 'rehab' ? e.category === 'rehab' : e.group === filter)) && matches(e, q),
      ),
    [list, q, filter],
  );

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">{t('picker.title')}</div>
      <input
        className="search"
        style={{ marginTop: 12 }}
        value={q}
        placeholder={'⌕ ' + t('exercises.search', { n: list?.length ?? 400 })}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE);
        }}
      />
      <div className="chips" style={{ marginTop: 10 }}>
        {(['all', 'rehab', ...GROUPS] as Filter[]).map((f) => (
          <button
            key={f}
            className={'chip' + (f === filter ? ' on' : '') + (f === 'rehab' ? ' chip-cyan' : '')}
            onClick={() => {
              setFilter(f);
              setLimit(PAGE);
            }}
          >
            {f === 'all' ? t('exercises.all') : f === 'rehab' ? t('exercises.rehab') : t(`group.${f}`)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 10, paddingBottom: 70 }}>
        {shown.slice(0, limit).map((e) => {
          const n = picked.indexOf(e.id);
          return (
            <button key={e.id} className={'ex-row' + (n >= 0 ? ' picked' : '')} onClick={() => toggle(e.id)}>
              <ExerciseMedia ex={e} size="thumb" />
              <div className="ex-row-text">
                <b>{e.name}</b>
                <span className="m muted">{t(`muscle.${e.muscles[0]}`)}</span>
              </div>
              <span className="pick-mark">{n >= 0 ? n + 1 : '+'}</span>
            </button>
          );
        })}
        {shown.length > limit && (
          <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setLimit(limit + PAGE)}>
            ↓ {shown.length - limit}
          </button>
        )}
      </div>

      {picked.length > 0 && (
        <div className="sheet-footer">
          <button className="btn lime" onClick={() => onPick(picked)}>
            {t('picker.add', { n: picked.length })}
          </button>
        </div>
      )}
    </Sheet>
  );
}
