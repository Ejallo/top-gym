import { useMemo, useState } from 'react';
import { t } from '../i18n';
import { matches, useExercises, type Exercise } from '../lib/exercises';
import { GROUPS, type Group } from '../lib/muscles';
import { Header } from '../components/Header';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { CustomExerciseForm } from '../components/CustomExerciseForm';
import { FullSearch } from '../components/FullSearch';

type Filter = 'all' | 'mine' | 'rehab' | Group;
const PAGE = 60;

export function Exercises({ onSettings }: { onSettings: () => void }) {
  const list = useExercises();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Exercise | null>(null);
  // ?ex=<id> opens an exercise card directly (handy for screenshots)
  const [deepLink, setDeepLink] = useState(() => new URLSearchParams(location.search).get('ex'));
  if (deepLink && list) {
    const e = list.find((x) => x.id === deepLink);
    setDeepLink(null);
    if (e) setOpen(e);
  }
  const [adding, setAdding] = useState(false);
  const [full, setFull] = useState(false);

  const shown = useMemo(() => {
    if (!list) return [];
    return list.filter(
      (e) =>
        (filter === 'all' ||
          (filter === 'mine' ? e.source !== 'base' : filter === 'rehab' ? e.category === 'rehab' : e.group === filter)) &&
        matches(e, q),
    );
  }, [list, q, filter]);

  const hasMine = list?.some((e) => e.source !== 'base');
  const filters: Filter[] = ['all', ...(hasMine ? (['mine'] as const) : []), 'rehab', ...GROUPS];

  return (
    <div className="screen">
      <Header title={t('exercises.title')} sub={list ? `// ${t('exercises.count', { n: list.length })}` : undefined} onSettings={onSettings} />

      <input
        className="search"
        value={q}
        placeholder={'⌕ ' + t('exercises.search', { n: list?.length ?? 400 })}
        onChange={(e) => {
          setQ(e.target.value);
          setLimit(PAGE);
        }}
      />

      <div className="chips" style={{ marginTop: 10 }}>
        {filters.map((f) => (
          <button
            key={f}
            className={'chip' + (f === filter ? ' on' : '') + (f === 'rehab' ? ' chip-cyan' : '')}
            onClick={() => {
              setFilter(f);
              setLimit(PAGE);
            }}
          >
            {f === 'all' ? t('exercises.all') : f === 'mine' ? t('exercises.mine') : f === 'rehab' ? t('exercises.rehab') : t(`group.${f}`)}
          </button>
        ))}
      </div>

      <button className="btn outline small" style={{ marginTop: 10 }} onClick={() => setAdding(true)}>
        + {filter === 'rehab' ? t('exercises.addRehab') : t('exercises.add')}
      </button>

      {!list && <p className="m muted" style={{ marginTop: 16 }}>{t('exercises.loading')}</p>}
      {list && shown.length === 0 &&
        (filter === 'rehab' && !q ? (
          <div className="dash" style={{ marginTop: 12 }}>
            <p className="body">{t('rehab.empty')}</p>
          </div>
        ) : (
          <p className="m muted" style={{ marginTop: 16 }}>{t('exercises.nothing')}</p>
        ))}

      <div style={{ marginTop: 10 }}>
        {shown.slice(0, limit).map((e) => (
          <button key={e.id} className="ex-row" onClick={() => setOpen(e)}>
            <ExerciseMedia ex={e} size="thumb" />
            <div className="ex-row-text">
              <b>{e.name}</b>
              <span className="m muted">
                {t(`muscle.${e.muscles[0]}`)}
                {e.category === 'rehab' && <span className="cyan"> · {t('ex.rehab')}</span>}
                {e.side && <span> · {t(`side.${e.side}`)}</span>}
                {e.source !== 'base' && e.category !== 'rehab' && (
                  <span className="pink"> · {t(e.source === 'own' ? 'ex.source.own' : 'ex.source.full')}</span>
                )}
              </span>
            </div>
          </button>
        ))}
      </div>

      {shown.length > limit && (
        <button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => setLimit(limit + PAGE)}>
          ↓ {shown.length - limit}
        </button>
      )}

      {list && (
        <button className="dash-btn m" onClick={() => setFull(true)}>
          {t('exercises.full')}
        </button>
      )}

      {open && <ExerciseDetail ex={open} onClose={() => setOpen(null)} />}
      {adding && <CustomExerciseForm category={filter === 'rehab' ? 'rehab' : undefined} onClose={() => setAdding(false)} />}
      {full && list && <FullSearch initial={q} known={list} onClose={() => setFull(false)} />}
    </div>
  );
}
