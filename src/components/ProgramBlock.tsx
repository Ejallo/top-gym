import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db, type Program, type Template, type Workout } from '../lib/db';
import { fmt, weekday, weekdayNames } from '../lib/dates';
import { addDays, weekStartOf } from '../lib/stats';
import { deleteProgram, renameProgram, setActiveProgram } from '../lib/programs';
import { useExercises, type Exercise } from '../lib/exercises';
import { entryFromPlan, planText } from '../lib/workouts';
import { Sheet } from './Sheet';
import { TemplateEditor } from './TemplateEditor';
import { ExerciseMedia } from './ExerciseMedia';
import { ExerciseDetail } from './ExerciseDetail';

const weekStart = () => weekStartOf(Date.now());

/**
 * Home block of the active weekly program: today's planned day (or rest + next day),
 * the Mon–Sun strip with done/planned days, and a sheet to view and edit the days.
 */
export function ProgramBlock({
  program,
  programs,
  workouts,
  canStart,
  onStart,
}: {
  program: Program;
  programs: Program[];
  workouts: Workout[];
  canStart: boolean;
  onStart: (tpl: Template) => void;
}) {
  const templates = useLiveQuery(() => db.templates.where('id').anyOf(program.days.map((d) => d.templateId)).toArray(), [program.id]);
  const [open, setOpen] = useState(false);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const byId = new Map((templates ?? []).map((x) => [x.id, x]));
  const names = weekdayNames();
  const today = weekday(new Date());
  const plannedOn = (wd: number) => program.days.filter((d) => d.weekday === wd);
  const todayDay = plannedOn(today)[0];
  const todayTpl = todayDay && byId.get(todayDay.templateId);
  const next = [...program.days].sort((a, b) => ((a.weekday - today + 7) % 7 || 7) - ((b.weekday - today + 7) % 7 || 7))[0];
  const nextTpl = next && byId.get(next.templateId);

  // Days of this week with a finished workout
  const ws = weekStart();
  const doneDays = new Set(
    workouts.filter((w) => w.endedAt && w.kind !== 'mobility' && w.startedAt >= ws && w.startedAt < addDays(ws, 7)).map((w) => weekday(new Date(w.startedAt))),
  );
  // Today's plan counts as done only when its own template was trained today
  const dayStart = addDays(ws, today - 1);
  const trainedToday = (templateId?: string) => workouts.some((w) => w.endedAt && w.templateId === templateId && w.startedAt >= dayStart);
  const doneToday = trainedToday(todayDay?.templateId);
  // Starting a day already trained today is almost always a misclick: ask first
  const startChecked = (tpl: Template) => {
    if (trainedToday(tpl.id) && !confirm(t('prog.againConfirm'))) return;
    onStart(tpl);
  };

  if (!templates) return null;

  return (
    <>
      {!canStart ? null : todayTpl ? (
        <div className={'slab ' + (doneToday ? 'cyan' : 'lime')}>
          <div className="row m">
            <span>{doneToday ? '✓ ' : ''}{t('prog.today')}</span>
            <span>{names[today - 1]}</span>
          </div>
          <div className="h h-l" style={{ marginTop: 8 }}>
            {todayTpl.name}
          </div>
          <div className="m" style={{ marginTop: 8 }}>
            {t('home.tplCount', { n: todayTpl.items.length, sets: todayTpl.items.reduce((a, x) => a + (x.sets || 0), 0) })}
          </div>
          {!doneToday && (
            <button className="btn ink" style={{ marginTop: 12, height: 44 }} onClick={() => onStart(todayTpl)}>
              {t('prog.start')} →
            </button>
          )}
        </div>
      ) : (
        <div className="dash">
          <div className="h h-m">{t('prog.rest')}</div>
          {nextTpl && (
            <p className="m muted" style={{ marginTop: 8 }}>
              {t('prog.next', { day: names[next.weekday - 1], title: nextTpl.name })}
            </p>
          )}
        </div>
      )}

      <button className="m muted sec row" style={{ width: '100%' }} onClick={() => setOpen(true)}>
        <span>// {t('prog.week', { name: program.name })}</span>
        <span className="lime">→</span>
      </button>
      <div className="week-strip">
        {names.map((n, i) => {
          const wd = i + 1;
          const planned = plannedOn(wd).length > 0;
          const done = doneDays.has(wd);
          const cls = done ? 'done' : planned ? 'planned' : '';
          const className = 'wd ' + cls + (wd === today ? ' today' : '');
          const label = (
            <>
              <span>{n.toUpperCase()}</span>
              <b>{done ? '✓' : wd === today ? '●' : planned ? '·' : ''}</b>
            </>
          );
          return planned ? (
            <button key={wd} className={className} onClick={() => setOpenDay(wd)}>
              {label}
            </button>
          ) : (
            <div key={wd} className={className}>
              {label}
            </div>
          );
        })}
      </div>

      {openDay !== null && (
        <DayPlanSheet
          date={new Date(addDays(ws, openDay - 1))}
          templates={plannedOn(openDay).flatMap((d) => byId.get(d.templateId) ?? [])}
          canStart={canStart && openDay === today}
          onStart={(tpl) => {
            setOpenDay(null);
            startChecked(tpl);
          }}
          onClose={() => setOpenDay(null)}
        />
      )}
      {open && <ProgramSheet program={program} programs={programs} templates={byId} onClose={() => setOpen(false)} onStart={startChecked} canStart={canStart} />}
    </>
  );
}

/** Plan of one weekday: exercises with sets and reps. Starting is offered only for today. */
function DayPlanSheet({
  date,
  templates,
  canStart,
  onStart,
  onClose,
}: {
  date: Date;
  templates: Template[];
  canStart: boolean;
  onStart: (tpl: Template) => void;
  onClose: () => void;
}) {
  const list = useExercises();
  const [info, setInfo] = useState<Exercise | null>(null);
  const exById = new Map((list ?? []).map((e) => [e.id, e]));
  const units = { kg: t('unit.kg'), min: t('unit.min'), km: t('unit.km'), sec: t('unit.sec') };
  return (
    <Sheet onClose={onClose}>
      <div className="m lime">{fmt(date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      {templates.map((tpl) => (
        <div key={tpl.id} className="dash" style={{ marginTop: 12 }}>
          <div className="h h-m">{tpl.name}</div>
          {tpl.items.map((it, i) => {
            const ex = exById.get(it.exerciseId);
            return (
              <button key={i} className="ex-row" onClick={() => ex && setInfo(ex)}>
                {ex && <ExerciseMedia ex={ex} size="thumb" />}
                <span className="ex-row-text">
                  <b>{ex?.name ?? it.exerciseId}</b>
                  <span className="m muted">{planText(entryFromPlan(it), ex, units)}</span>
                </span>
              </button>
            );
          })}
          {canStart && (
            <button className="btn lime small" style={{ marginTop: 12 }} onClick={() => onStart(tpl)}>
              {t('prog.start')} →
            </button>
          )}
        </div>
      ))}
      {info && <ExerciseDetail ex={info} onClose={() => setInfo(null)} />}
    </Sheet>
  );
}

/** Chips to pick which stored program is active (calendar, program sheet). */
export function ProgramSwitcher({ programs, active }: { programs: Program[]; active?: Program }) {
  if (programs.length < 2) return null;
  return (
    <div className="chips prog-switch">
      {programs.map((p) => (
        <button key={p.id} className={'chip' + (p.id === active?.id ? ' on' : '')} onClick={() => void setActiveProgram(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}

function ProgramSheet({
  program,
  programs,
  templates,
  canStart,
  onStart,
  onClose,
}: {
  program: Program;
  programs: Program[];
  templates: Map<string, Template>;
  canStart: boolean;
  onStart: (tpl: Template) => void;
  onClose: () => void;
}) {
  const [edit, setEdit] = useState<Template | null>(null);
  const names = weekdayNames();

  const remove = async () => {
    if (!confirm(t('prog.disableConfirm', { name: program.name }))) return;
    await deleteProgram(program);
    // Hand the active flag to the newest remaining one
    const next = programs.find((p) => p.id !== program.id);
    if (next) await setActiveProgram(next.id);
    onClose();
  };
  const rename = async () => {
    const name = prompt(t('prog.rename'), program.name)?.trim();
    if (name) await renameProgram(program.id, name);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="m muted">// {t('prog.title')}</div>
      <button className="h h-l prog-name" style={{ marginTop: 6 }} onClick={() => void rename()}>
        {program.name} <span className="m muted">✎</span>
      </button>
      <div className="m muted" style={{ marginTop: 8 }}>
        {t('prog.imported', { date: fmt(new Date(program.importedAt), { day: 'numeric', month: 'long' }) })}
      </div>
      {programs.length > 1 && (
        <>
          <div className="m muted sec">// {t('prog.all', { n: programs.length })}</div>
          <ProgramSwitcher programs={programs} active={program} />
        </>
      )}

      <div className="m muted sec">// {t('prog.days')}</div>
      {[...program.days]
        .sort((a, b) => a.weekday - b.weekday)
        .map((d) => {
          const tpl = templates.get(d.templateId);
          if (!tpl) return null;
          return (
            <div key={d.templateId} className="view-entry">
              <div className="row">
                <span className="m lime">{names[d.weekday - 1].toUpperCase()}</span>
                <span className="m muted">{t('home.tplCount', { n: tpl.items.length, sets: tpl.items.reduce((a, x) => a + (x.sets || 0), 0) })}</span>
              </div>
              <b className="h h-m" style={{ display: 'block', marginTop: 6 }}>
                {tpl.name}
              </b>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn ghost small" onClick={() => setEdit(tpl)}>
                  {t('ex.edit')}
                </button>
                {canStart && (
                  <button
                    className="btn outline small"
                    onClick={() => {
                      onClose();
                      onStart(tpl);
                    }}
                  >
                    {t('prog.start')} →
                  </button>
                )}
              </div>
            </div>
          );
        })}

      <button className="btn ghost small pink-text" style={{ marginTop: 20 }} onClick={() => void remove()}>
        {t('prog.disable')}
      </button>
      {edit && <TemplateEditor edit={edit} onClose={() => setEdit(null)} />}
    </Sheet>
  );
}
