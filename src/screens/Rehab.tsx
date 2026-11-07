import { useRef, useState } from 'react';
import { t } from '../i18n';
import type { Workout } from '../lib/db';
import { fmt } from '../lib/dates';
import { Header } from '../components/Header';
import { Sheet } from '../components/Sheet';
import {
  allDays,
  dayFor,
  importRehab,
  isoDate,
  parseDate,
  removeRehab,
  startRehabDay,
  toggleTick,
  useRehab,
  useRehabDone,
  useRehabTicks,
  type RehabDay,
  type RehabExercise,
  type RehabProgram,
  type RehabWeek,
} from '../lib/rehab';

const svgSrc = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Rehab screen (opened from a Home tile): the imported program — today, pain rule, day plan, exercises. */
export function RehabScreen({ active, onOpen, onBack }: { active?: Workout; onOpen: (w: Workout) => void; onBack: () => void }) {
  const p = useRehab();
  return (
    <div className="screen">
      <button className="m muted" onClick={onBack} style={{ marginBottom: 12 }}>
        {t('settings.back')}
      </button>
      {p === undefined ? null : p ? <Program p={p} active={active} onOpen={onOpen} /> : <Empty />}
    </div>
  );
}

function Empty() {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  return (
    <>
      <Header title={t('rehab.title')} />
      <div className="card" style={{ marginTop: 14 }}>
        <p className="body">{t('rehab.importText')}</p>
        <button className="btn cyan" style={{ marginTop: 12 }} onClick={() => input.current?.click()}>
          {t('rehab.import')}
        </button>
        {error && <p className="status pink">{error}</p>}
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              await importRehab(await file.text());
              setError('');
            } catch {
              setError(t('rehab.importFailed'));
            }
          }}
        />
      </div>
    </>
  );
}

function Program({ p, active, onOpen }: { p: RehabProgram; active?: Workout; onOpen: (w: Workout) => void }) {
  const today = isoDate(new Date());
  const ticks = useRehabTicks();
  const done = useRehabDone();
  const isDone = (d: string) => done.has(d) || ticks.includes(d);
  const days = allDays(p);
  const doneCount = days.filter((d) => isDone(d.d)).length;
  const current = dayFor(p, today);
  const [ex, setEx] = useState<RehabExercise | null>(null);
  const byKey = new Map(p.exercises.map((e) => [e.key, e]));

  const start = async (day: RehabDay, week: RehabWeek) => {
    if (active) return onOpen(active);
    onOpen(await startRehabDay(day, `${t('rehab.title')} · ${week.title}`));
  };

  return (
    <>
      <Header title={t('rehab.title')} sub={`// ${p.title}`} />

      <div className="prog-line">
        <div className="prog-bar">
          <span style={{ width: `${(doneCount / days.length) * 100}%` }} />
        </div>
        <span className="m">{t('rehab.progress', { n: doneCount, total: days.length })}</span>
      </div>

      {current ? (
        <TodayCard
          day={current.day}
          week={current.week}
          isToday={current.day.d === today}
          done={isDone(current.day.d)}
          running={!!active}
          onStart={() => void start(current.day, current.week)}
          onEx={(k) => setEx(byKey.get(k) ?? null)}
        />
      ) : (
        <div className="card" style={{ marginTop: 14 }}>
          <p className="body">{t('rehab.finished')}</p>
        </div>
      )}

      <div className="m muted sec">// {t('rehab.painTitle')}</div>
      <div className="pain-rules">
        {p.pain.map((r) => (
          <div key={r.tone} className={'pain-rule ' + r.tone}>
            <b className="m">{r.title}</b>
            <span className="body">{r.text}</span>
          </div>
        ))}
      </div>
      <p className="body rehab-rule">{p.rule}</p>

      <div className="m muted sec">// {t('rehab.plan')}</div>
      {p.weeks.map((w) => (
        <WeekBlock
          key={w.a}
          w={w}
          today={today}
          isDone={isDone}
          defaultOpen={today >= w.a && today <= w.b}
          onEx={(k) => setEx(byKey.get(k) ?? null)}
        />
      ))}

      <div className="m muted sec">// {t('rehab.exercises')}</div>
      {p.stages.map((s) => {
        const list = p.exercises.filter((e) => e.stage === s.n);
        return (
          <div key={s.n} className={'stage-block st' + s.n}>
            <div className="m stage-tag">{t('rehab.stage', { n: s.n })}</div>
            <b className="h h-s">{s.title}</b>
            <p className="body" style={{ marginTop: 4 }}>
              {s.text}
            </p>
            {list.map((e) => (
              <button key={e.key} className="ex-row" onClick={() => setEx(e)}>
                {e.svg ? <img className="rehab-thumb" src={svgSrc(e.svg)} alt="" /> : <span className="rehab-thumb media-empty" />}
                <span className="ex-row-text">
                  <b>
                    {e.num}. {e.name}
                  </b>
                  <span className="m muted" style={{ textTransform: 'none' }}>
                    {e.dose}
                  </span>
                </span>
              </button>
            ))}
          </div>
        );
      })}
      <p className="body" style={{ marginTop: 10 }}>
        {p.readiness}
      </p>

      <div className="m muted sec">// {t('rehab.avoid')}</div>
      <ul className="rehab-list pink-dots">
        {p.avoid.map((a) => (
          <li key={a} className="body">
            {a}
          </li>
        ))}
      </ul>
      <p className="m muted" style={{ marginTop: 14, textTransform: 'none', lineHeight: 1.5 }}>
        {p.foot}
      </p>

      <button
        className="btn ghost small pink-text"
        style={{ marginTop: 18 }}
        onClick={() => {
          if (confirm(t('rehab.removeConfirm'))) void removeRehab(p);
        }}
      >
        {t('rehab.remove')}
      </button>

      {ex && <ExerciseSheet e={ex} onClose={() => setEx(null)} />}
    </>
  );
}

const dayDate = (d: string) => fmt(parseDate(d), { day: 'numeric', month: 'short' });
const dayName = (d: string) => fmt(parseDate(d), { weekday: 'short' });

function TodayCard(props: {
  day: RehabDay;
  week: RehabWeek;
  isToday: boolean;
  done: boolean;
  running: boolean;
  onStart: () => void;
  onEx: (key: string) => void;
}) {
  const { day, week, isToday, done } = props;
  const canStart = day.items.length > 0;
  return (
    <div className={'rehab-today kind-' + day.kind}>
      <div className="m">
        {isToday ? t('rehab.today') : t('rehab.startsOn', { date: dayDate(day.d) })} · {week.title}
      </div>
      <div className="h h-m" style={{ marginTop: 6 }}>
        {day.label}
        {done && ' ✓'}
      </div>
      {week.note && (
        <p className="body" style={{ marginTop: 6 }}>
          {week.note}
        </p>
      )}
      <DayItems day={day} onEx={props.onEx} />
      {canStart && (
        <button className="btn cyan" style={{ marginTop: 12 }} onClick={props.onStart}>
          {props.running ? t('home.continueActive') : done ? t('rehab.again') : t('rehab.start')} →
        </button>
      )}
    </div>
  );
}

export function DayItems({ day, onEx }: { day: RehabDay; onEx: (key: string) => void }) {
  return (
    <ul className="rehab-list">
      {day.items.map((x, i) => (
        <li key={i}>
          <button className="rehab-link" onClick={() => onEx(x.ex)}>
            {x.text}
          </button>
        </li>
      ))}
      {day.notes.map((n, i) => (
        <li key={'n' + i} className={n.bold ? 'rehab-note-b' : undefined}>
          {n.text}
        </li>
      ))}
    </ul>
  );
}

function WeekBlock({ w, today, isDone, defaultOpen, onEx }: { w: RehabWeek; today: string; isDone: (d: string) => boolean; defaultOpen: boolean; onEx: (k: string) => void }) {
  const [open, setOpen] = useState(defaultOpen);
  const n = w.days.filter((d) => isDone(d.d)).length;
  return (
    <div className={'rehab-week st' + w.stage}>
      <button className="rehab-week-head" onClick={() => setOpen(!open)}>
        <span className="m stage-tag">{open ? '▾' : '▸'}</span>
        <b className="h h-s">{w.title}</b>
        <span className="m muted">
          {dayDate(w.a)} – {dayDate(w.b)}
        </span>
        <span className="m stage-tag" style={{ marginLeft: 'auto' }}>
          {n}/{w.days.length}
        </span>
      </button>
      {open && (
        <div>
          {w.note && <p className="body rehab-week-note">{w.note}</p>}
          {w.days.map((d) => (
            <div key={d.d} className={'rehab-day' + (d.d === today ? ' today' : '') + (isDone(d.d) ? ' done' : '')}>
              <button className={'rehab-check' + (isDone(d.d) ? ' on' : '')} onClick={() => void toggleTick(d.d)} aria-label="done">
                {isDone(d.d) ? '✓' : ''}
              </button>
              <div className="rehab-day-date">
                <b className="m">{dayDate(d.d)}</b>
                <span className="m muted">{dayName(d.d)}</span>
              </div>
              <div className="rehab-day-body">
                <span className={'kind-tag kind-' + d.kind}>{d.label}</span>
                <DayItems day={d} onEx={onEx} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ExerciseSheet({ e, onClose }: { e: RehabExercise; onClose: () => void }) {
  return (
    <Sheet onClose={onClose}>
      <div className="m cyan">
        // {t('rehab.stage', { n: e.stage })} · {e.num}
      </div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {e.name}
      </div>
      <p className="m cyan" style={{ marginTop: 8, textTransform: 'none' }}>
        {e.dose}
      </p>
      {e.svg && <img className="rehab-fig" src={svgSrc(e.svg)} alt="" />}
      {e.start && (
        <p className="body" style={{ marginTop: 12 }}>
          <b className="lime">{t('rehab.startPos')}</b> {e.start}
        </p>
      )}
      {e.steps.length > 0 && (
        <ol className="steps">
          {e.steps.map((s, i) => (
            <li key={i}>
              <span className="m lime">{i + 1}</span>
              <span className="body">{s}</span>
            </li>
          ))}
        </ol>
      )}
      {e.feel && (
        <div className="rehab-feel">
          <b className="m">{e.feelLabel}</b>
          <span className="body">{e.feel}</span>
        </div>
      )}
      {e.bad.length > 0 && (
        <>
          <div className="m pink sec">// {t('rehab.bad')}</div>
          <ul className="rehab-list pink-dots">
            {e.bad.map((b) => (
              <li key={b} className="body">
                {b}
              </li>
            ))}
          </ul>
        </>
      )}
      {(e.easier || e.harder) && (
        <div className="rehab-var">
          {e.easier && (
            <div className="card">
              <b className="m lime">{t('rehab.easier')}</b>
              <p className="body">{e.easier}</p>
            </div>
          )}
          {e.harder && (
            <div className="card">
              <b className="m pink">{t('rehab.harder')}</b>
              <p className="body">{e.harder}</p>
            </div>
          )}
        </div>
      )}
      <button className="btn ghost" style={{ marginTop: 16 }} onClick={onClose}>
        {t('wk.back')}
      </button>
    </Sheet>
  );
}
