import { useState } from 'react';
import { t } from '../i18n';
import { db, type PlanItem, type Template, type Workout } from '../lib/db';
import { useExercises } from '../lib/exercises';
import { unlockAudio } from '../lib/hold';
import { ROUTINES, mobilityThisWeek, planMinutes, routineItems, startMobility, useMobilityTemplates } from '../lib/mobility';
import { Sheet } from '../components/Sheet';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { TemplateEditor } from '../components/TemplateEditor';
import { Header } from '../components/Header';

/** What a card opens: a built-in routine or an own one (template). */
interface Card {
  key: string;
  title: string;
  cat: 'stretch' | 'yoga';
  items: PlanItem[];
  template?: Template;
}

/** Yoga screen (opened from a Home tile): yoga and stretching routines, own routines, this week's count. */
export function YogaScreen({ workouts, canStart, onOpen, onBack }: { workouts: Workout[]; canStart: boolean; onOpen: (w: Workout) => void; onBack: () => void }) {
  const list = useExercises();
  const own = useMobilityTemplates();
  const [open, setOpen] = useState<Card | null>(null);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  if (!list) return null;
  const byId = new Map(list.map((e) => [e.id, e]));

  const cards: Card[] = [
    ...ROUTINES.map((r) => ({ key: r.id, title: t(`routine.${r.id}` as 'routine.morning'), cat: r.cat, items: routineItems(r.items, byId) })),
    ...(own ?? []).map((tpl) => ({
      key: tpl.id,
      title: tpl.name,
      // An own routine is "yoga" when most of its poses are yoga
      cat: (tpl.items.filter((x) => byId.get(x.exerciseId)?.category === 'yoga').length * 2 > tpl.items.length ? 'yoga' : 'stretch') as Card['cat'],
      items: tpl.items,
      template: tpl,
    })),
  ];
  const count = mobilityThisWeek(workouts);

  const start = async (c: Card) => {
    unlockAudio();
    setOpen(null);
    onOpen(await startMobility(c.title, c.items, c.template?.id));
  };

  const section = (cat: Card['cat']) => (
    <>
      <div className="m muted sec">// {t(`cat.${cat}`)}</div>
      <div className="mob-grid">
        {cards
          .filter((c) => c.cat === cat)
          .map((c) => (
            <button key={c.key} className={'mob-card ' + c.cat} onClick={() => setOpen(c)}>
              <span className="m">{t('mob.min', { n: planMinutes(c.items) })}</span>
              <b className="h h-s">{c.title}</b>
              <span className="m muted">{t('mob.count', { n: c.items.length })}</span>
            </button>
          ))}
      </div>
    </>
  );

  return (
    <div className="screen">
      <button className="m muted" onClick={onBack} style={{ marginBottom: 12 }}>
        {t('settings.back')}
      </button>
      <Header title={t('yoga.title')} sub={`// ${t('yoga.week', { n: count })}`} />
      {section('yoga')}
      {section('stretch')}
      <button className="dash-btn m" onClick={() => setEditing('new')}>
        + {t('mob.newTitle')}
      </button>

      {open && (
        <Sheet onClose={() => setOpen(null)}>
          <div className={'m ' + (open.cat === 'yoga' ? 'violet' : 'orange')}>
            // {t(`cat.${open.cat}`)} · {t('mob.min', { n: planMinutes(open.items) })}
          </div>
          <div className="h h-l" style={{ marginTop: 6 }}>
            {open.title}
          </div>
          {!open.template && <p className="body" style={{ marginTop: 8 }}>{t(`routine.${open.key}.text` as 'routine.morning.text')}</p>}
          <button
            className={'btn ' + (open.cat === 'yoga' ? 'violet-bg' : 'orange-bg')}
            style={{ marginTop: 16 }}
            onClick={() => (canStart ? void start(open) : setOpen(null))}
          >
            {canStart ? t('player.start') : t('home.continueActive')} →
          </button>
          <div style={{ marginTop: 12 }}>
            {open.items.map((x, i) => {
              const ex = byId.get(x.exerciseId);
              return (
                <div key={i} className="ex-row">
                  {ex && <ExerciseMedia ex={ex} size="thumb" />}
                  <div className="ex-row-text">
                    <b>{ex?.name ?? x.exerciseId}</b>
                    <span className="m muted">
                      {x.time ?? 30} {t('unit.sec')}
                      {ex?.perSide && ` · ${t('ex.perSide')}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          {open.template && (
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button
                className="btn ghost small"
                onClick={() => {
                  setEditing(open.template!);
                  setOpen(null);
                }}
              >
                {t('ex.edit')}
              </button>
              <button
                className="btn ghost small pink-text"
                onClick={async () => {
                  if (!confirm(t('home.deleteTemplate', { name: open.title }))) return;
                  await db.templates.delete(open.template!.id);
                  setOpen(null);
                }}
              >
                {t('home.delete')}
              </button>
            </div>
          )}
        </Sheet>
      )}
      {editing && <TemplateEditor kind="mobility" edit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
