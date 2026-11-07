import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db, type Folder, type Template, type Workout } from '../lib/db';
import { fmt, isoWeek } from '../lib/dates';
import { clock, startWorkout, totals, useNow } from '../lib/workouts';
import { Header } from '../components/Header';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplateMenu } from '../components/TemplateMenu';
import { FolderScreen } from './Folder';
import { History, WorkoutView } from './History';
import { WorkoutRow } from '../components/WorkoutRow';
import { ProgramBlock } from '../components/ProgramBlock';
import { YogaScreen } from './Yoga';
import { RehabScreen } from './Rehab';
import { mobilityThisWeek } from '../lib/mobility';
import { dayFor, isoDate, useRehab } from '../lib/rehab';
import { activeOf, usePrograms } from '../lib/programs';
import { ImportPlan } from './ImportPlan';
import { WeeklyReport } from './WeeklyReport';
import { weekday } from '../lib/dates';
import { addDays, weekStartOf } from '../lib/stats';

export function Home({ onSettings, onOpenWorkout }: { onSettings: () => void; onOpenWorkout: (w: Workout) => void }) {
  const now = new Date();
  const sub = `// ${fmt(now, { weekday: 'short', day: '2-digit', month: 'short' })} · ${t('home.week', { n: isoWeek(now) })}`;
  // Program days are templates too, but they live under the program block
  const templates = useLiveQuery(async () => (await db.templates.orderBy('name').toArray()).filter((x) => !x.programId && x.kind !== 'mobility' && !x.folder), []);
  const folderCounts = useLiveQuery(async () => {
    const c = { x: 0, y: 0 };
    for (const tpl of await db.templates.toArray()) if (tpl.folder) c[tpl.folder]++;
    return c;
  }, []);
  const programs = usePrograms();
  const program = activeOf(programs);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<number | null>(null);
  // Sunday: report for this week. Monday: for the week that just ended.
  const wd = weekday(now);
  const reportWeek = wd === 7 ? weekStartOf(Date.now()) : wd === 1 ? addDays(weekStartOf(Date.now()), -7) : null;
  const workouts = useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().limit(30).toArray(), []);
  const reportHasData =
    reportWeek !== null && (workouts ?? []).some((w) => w.endedAt && w.startedAt >= reportWeek && w.startedAt < addDays(reportWeek, 7));
  const active = workouts?.find((w) => !w.endedAt);
  const recent = (workouts ?? []).filter((w) => w.endedAt).slice(0, 3);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [menu, setMenu] = useState<Template | null>(null);
  const [history, setHistory] = useState(false);
  const [view, setView] = useState<Workout | null>(null);
  const [section, setSection] = useState<'yoga' | 'rehab' | Folder | null>(null);
  const rehab = useRehab();
  const rehabToday = rehab ? dayFor(rehab, isoDate(now)) : null;

  const start = async (tpl?: Template) => {
    if (active) return onOpenWorkout(active);
    onOpenWorkout(await startWorkout(tpl?.name ?? t('home.freeTitle'), tpl));
  };

  if (section === 'yoga')
    return <YogaScreen workouts={workouts ?? []} canStart={!active} onOpen={onOpenWorkout} onBack={() => setSection(null)} />;
  if (section === 'x' || section === 'y')
    return <FolderScreen folder={section} hasActive={!!active} onStart={(tpl) => void start(tpl)} onBack={() => setSection(null)} />;
  if (section === 'rehab') return <RehabScreen active={active} onOpen={onOpenWorkout} onBack={() => setSection(null)} />;

  return (
    <div className="screen">
      <Header
        title={
          <>
            {t('app.name')}
            <span className="lime">.</span>
          </>
        }
        sub={sub}
        onSettings={onSettings}
      />

      {active && <ActiveCard w={active} onOpen={() => onOpenWorkout(active)} />}
      {program && workouts && (
        <div>
          <ProgramBlock program={program} programs={programs ?? []} workouts={workouts} canStart={!active} onStart={(tpl) => void start(tpl)} />
        </div>
      )}
      {!active && programs && !program && (
        <div className="dash">
          <div className="h h-m">{t('home.noProgram.title')}</div>
          <p className="body" style={{ marginTop: 8 }}>
            {t('home.noProgram.text')}
          </p>
        </div>
      )}

      {reportWeek !== null && reportHasData && (
        <button className="slab cyan report-card" onClick={() => setReport(reportWeek)}>
          <span className="m">
            {fmt(new Date(addDays(reportWeek, 6)), { weekday: 'short', day: '2-digit', month: 'short' })} · {t('report.ready')}
          </span>
          <b className="h h-m">{t('report.cardTitle')} →</b>
          <span className="m">{t('report.cardHint')}</span>
        </button>
      )}

      {!active && (
        <div className="btn-row" style={{ marginTop: program ? 14 : 10 }}>
          <button className="btn outline small" onClick={() => void start()}>
            {t('home.free')}
          </button>
          <button className="btn ghost small" onClick={() => setImporting(true)}>
            {t('home.import')}
          </button>
        </div>
      )}

      <div className="tiles">
        <button className="tile yoga" onClick={() => setSection('yoga')}>
          <span className="m">{t('yoga.week', { n: mobilityThisWeek(workouts ?? []) })}</span>
          <b className="h h-m">{t('yoga.title')} →</b>
        </button>
        <button className="tile rehab" onClick={() => setSection('rehab')}>
          <span className="m">{rehab ? (rehabToday ? rehabToday.day.label : t('rehab.done')) : t('rehab.tileEmpty')}</span>
          <b className="h h-m">{t('rehab.title')} →</b>
        </button>
        {(['x', 'y'] as const).map((f) => (
          <button key={f} className={'tile f' + f} onClick={() => setSection(f)}>
            <span className="m">{t('folder.count', { n: folderCounts?.[f] ?? 0 })}</span>
            <b className="h h-m">{t(`folder.${f}`)} →</b>
          </button>
        ))}
      </div>

      <div className="row sec">
        <span className="m muted">// {t('home.templates')}</span>
        <button className="m lime" onClick={() => setEditing('new')}>
          + {t('home.newTemplate')}
        </button>
      </div>
      {templates && templates.length === 0 && (
        <button className="dash-btn m" style={{ marginTop: 0 }} onClick={() => setEditing('new')}>
          {t('home.noTemplates')}
        </button>
      )}
      {templates?.map((tpl, i) => (
        <button key={tpl.id} className={'tpl-card' + (i === 0 ? ' first' : '')} onClick={() => setMenu(tpl)}>
          <span className="m">{t('home.tplCount', { n: tpl.items.length, sets: tpl.items.reduce((a, x) => a + (x.sets || 0), 0) })}</span>
          <b className="h h-m">{tpl.name}</b>
        </button>
      ))}

      <div className="row sec">
        <span className="m muted">// {t('home.recent')}</span>
        {recent.length > 0 && (
          <button className="m lime" onClick={() => setHistory(true)}>
            {t('home.allHistory')} →
          </button>
        )}
      </div>
      {recent.length === 0 && <p className="m muted">{t('home.noHistory')}</p>}
      {recent.map((w) => (
        <WorkoutRow key={w.id} w={w} onOpen={() => setView(w)} />
      ))}

      {menu && (
        <TemplateMenu
          tpl={menu}
          hasActive={!!active}
          onStart={() => {
            const tpl = menu;
            setMenu(null);
            void start(tpl);
          }}
          onEdit={() => {
            setEditing(menu);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {editing && <TemplateEditor edit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {report !== null && <WeeklyReport start={report} onClose={() => setReport(null)} />}
      {importing && <ImportPlan onClose={() => setImporting(false)} onDone={() => setImporting(false)} />}
      {history && <History onOpen={onOpenWorkout} onClose={() => setHistory(false)} />}
      {view && (
        <WorkoutView
          w={view}
          onEdit={() => {
            const w = view;
            setView(null);
            onOpenWorkout(w);
          }}
          onClose={() => setView(null)}
        />
      )}
    </div>
  );
}

function ActiveCard({ w, onOpen }: { w: Workout; onOpen: () => void }) {
  const now = useNow(1000);
  const tt = totals(w);
  return (
    <div className="slab lime">
      <div className="row m">
        <span>● {t('home.active')}</span>
        <span>{clock(now - w.startedAt)}</span>
      </div>
      <div className="h h-l" style={{ marginTop: 8 }}>
        {w.title}
      </div>
      <div className="m" style={{ marginTop: 8 }}>
        {t('wk.progress', { sets: tt.sets, total: w.entries.reduce((a, e) => a + e.sets.length, 0) })}
      </div>
      <button className="btn ink" style={{ marginTop: 12, height: 44 }} onClick={onOpen}>
        {t('home.continue')} →
      </button>
    </div>
  );
}
