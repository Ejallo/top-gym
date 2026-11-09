import { useEffect, useRef, useState } from 'react';
import { num, t, tk } from '../i18n';
import { db, type SetEntry, type Workout, type WorkoutEntry } from '../lib/db';
import { matches, useExercises, type Exercise } from '../lib/exercises';
import { clock, entryFor, fillFromPlan, minutes, planText, totals, useNow } from '../lib/workouts';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumInput } from '../components/NumInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { applyHint, lastSession, progressionHint, type Hint } from '../lib/progression';
import { fmt } from '../lib/dates';
import { cue, mmss, unlockAudio, useCountdown, useWakeLock } from '../lib/hold';
import { DEFAULT_HOLD, PREP, cooldownFor, startMobility } from '../lib/mobility';
import { setPin, usePins } from '../lib/pins';
import { alternatives, swapEntry } from '../lib/swap';
import { Sheet } from '../components/Sheet';
import { Technique, hasTechnique } from '../components/Technique';
import { tonnageText } from '../lib/tonnage';

const UNITS = () => ({ kg: t('unit.kg'), min: t('unit.min'), km: t('unit.km'), sec: t('unit.sec') });

/**
 * Running workout (or editing a finished one). Every change is saved to IndexedDB right away,
 * so closing the app mid-workout loses nothing.
 */
export function WorkoutScreen({
  initial,
  onClose,
  onOpenWorkout,
}: {
  initial: Workout;
  onClose: () => void;
  onOpenWorkout: (w: Workout) => void;
}) {
  const list = useExercises();
  const byId = new Map((list ?? []).map((e) => [e.id, e]));
  const [w, setW] = useState(initial);
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState<Exercise | null>(null);
  const [techOpen, setTechOpen] = useState<Set<string>>(new Set());
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [swapFor, setSwapFor] = useState<number | null>(null);
  const pins = usePins();
  const [summary, setSummary] = useState(false);
  const [hold, setHold] = useState<{ i: number; k: number } | null>(null);
  const [effortFor, setEffortFor] = useState<{ i: number; k: number } | null>(null);
  const editingFinished = !!initial.endedAt;
  const now = useNow(1000);
  // Finished workouts, newest first: source of "last time" for the progression hint
  const history = useLiveQuery(() => db.workouts.orderBy('startedAt').reverse().toArray(), []);

  // Persist on every change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void db.workouts.put(w);
  }, [w]);

  // Keep the screen on top: lock page scroll behind
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const setEntry = (i: number, fn: (e: WorkoutEntry) => WorkoutEntry) =>
    setW((x) => ({ ...x, entries: x.entries.map((e, j) => (j === i ? fn(e) : e)) }));
  const setSet = (i: number, k: number, p: Partial<SetEntry>) =>
    setEntry(i, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === k ? { ...s, ...p } : s)) }));

  const toggleDone = (i: number, k: number) =>
    setEntry(i, (e) => {
      const ex = byId.get(e.exerciseId);
      return {
        ...e,
        sets: e.sets.map((s, j) => {
          if (j !== k) return s;
          if (s.done) return { ...s, done: false };
          // A working set copies the previous working set (not the lighter warm-up before it)
          const prev = s.warmup ? e.sets[k - 1] : e.sets.slice(0, k).reverse().find((x) => !x.warmup);
          const workNo = e.sets.slice(0, k + 1).filter((x) => !x.warmup).length;
          const lastSet = lastSession(history ?? [], e.exerciseId, w.startedAt, w.id)?.sets[workNo - 1];
          const filled = s.warmup ? { ...s, weight: s.weight ?? prev?.weight, reps: s.reps ?? prev?.reps } : fillFromPlan(s, e, ex?.type ?? 'weight_reps', prev, lastSet);
          return { ...filled, done: true };
        }),
      };
    });

  const addSet = (i: number) =>
    setEntry(i, (e) => {
      const last = [...e.sets].reverse().find((x) => !x.warmup);
      return { ...e, sets: [...e.sets, { weight: last?.weight, reps: last?.reps, time: last?.time, distance: last?.distance, done: false }] };
    });
  /** Warm-up set goes in after the existing warm-ups, before the working sets. */
  const addWarmup = (i: number) =>
    setEntry(i, (e) => {
      const at = e.sets.findIndex((x) => !x.warmup);
      const n = at < 0 ? e.sets.length : at;
      return { ...e, sets: [...e.sets.slice(0, n), { done: false, warmup: true }, ...e.sets.slice(n)] };
    });
  const toggleWarmup = (i: number, k: number) =>
    setEntry(i, (e) => ({ ...e, sets: e.sets.map((s, j) => (j === k ? { ...s, warmup: !s.warmup || undefined, effort: undefined } : s)) }));
  const removeSet = (i: number) => setEntry(i, (e) => ({ ...e, sets: e.sets.length > 1 ? e.sets.slice(0, -1) : e.sets }));
  const moveEntry = (i: number, d: -1 | 1) =>
    setW((x) => {
      const j = i + d;
      if (j < 0 || j >= x.entries.length) return x;
      const c = [...x.entries];
      [c[i], c[j]] = [c[j], c[i]];
      return { ...x, entries: c };
    });
  const removeEntry = (i: number) => {
    if (!confirm(t('wk.removeExercise'))) return;
    setW((x) => ({ ...x, entries: x.entries.filter((_, j) => j !== i) }));
  };

  const finish = () => {
    const tt = totals(w);
    if (tt.sets === 0 && !confirm(t('wk.finishEmpty'))) return;
    setW((x) => ({ ...x, endedAt: Date.now() }));
    setSummary(true);
  };

  const discard = async () => {
    if (!confirm(t('wk.discardConfirm'))) return;
    await db.workouts.delete(w.id);
    onClose();
  };

  const tt = totals(w);

  if (summary) return <Summary w={w} byId={byId} onClose={onClose} onOpenWorkout={onOpenWorkout} />;

  return (
    <div className="workout">
      <div className="wk-top">
        <button className="m muted" onClick={onClose}>
          ← {editingFinished ? t('wk.back') : t('wk.minimize')}
        </button>
        {!editingFinished && <span className="m lime">● {clock(now - w.startedAt)}</span>}
      </div>
      <div className="wk-bar" />

      <input
        className="wk-title h"
        value={w.title}
        onChange={(e) => setW((x) => ({ ...x, title: e.target.value }))}
        aria-label={t('wk.title')}
      />
      <div className="m muted" style={{ marginTop: 6 }}>
        {t('wk.progress', { sets: tt.ticked, total: w.entries.reduce((a, e) => a + e.sets.length, 0) })}
        {tt.volume > 0 && ` · ${num(tt.volume)} ${t('unit.kg')}`}
      </div>

      {w.entries.length === 0 && (
        <div className="dash" style={{ marginTop: 16 }}>
          <p className="body">{t('wk.empty')}</p>
        </div>
      )}

      {w.entries.map((e, i) => {
        const ex = byId.get(e.exerciseId);
        const type = ex?.type ?? 'weight_reps';
        const plan = planText(e, ex, UNITS());
        const last = history ? lastSession(history, e.exerciseId, w.startedAt, w.id) : null;
        const hint = last ? progressionHint(e, ex, last.sets) : null;
        return (
          <section key={i} className="wk-entry">
            <div className="wk-entry-head">
              <button className="wk-ex" onClick={() => ex && setInfo(ex)}>
                {ex && <ExerciseMedia ex={ex} size="thumb" />}
                <span>
                  <span className="m muted">
                    {String(i + 1).padStart(2, '0')}/{String(w.entries.length).padStart(2, '0')}
                    {ex && ` · ${t(`muscle.${ex.muscles[0]}`)}`}
                    {ex?.side && ` · ${t(`side.${ex.side}`)}`}
                  </span>
                  <b className="h h-m">{ex?.name ?? e.exerciseId}</b>
                </span>
              </button>
            </div>
            {ex && hasTechnique(ex) && (
              <>
                <button
                  className="wk-tech-toggle m"
                  aria-expanded={techOpen.has(e.exerciseId)}
                  onClick={() =>
                    setTechOpen((o) => {
                      const n = new Set(o);
                      if (n.has(e.exerciseId)) n.delete(e.exerciseId);
                      else n.add(e.exerciseId);
                      return n;
                    })
                  }
                >
                  {t('ex.techShow')} {techOpen.has(e.exerciseId) ? '▴' : '▾'}
                </button>
                {techOpen.has(e.exerciseId) && (
                  <div className="wk-tech">
                    <Technique ex={ex} />
                  </div>
                )}
              </>
            )}
            {(e.rest || plan) && (
              <div className="m pink" style={{ marginTop: 8 }}>
                {plan && <span className="muted">{t('wk.plan')} {plan}</span>}
                {plan && e.rest && <span className="muted"> · </span>}
                {e.rest && <>// {t('wk.rest')} — {e.rest}</>}
              </div>
            )}
            {pins[e.exerciseId] && <p className="body wk-pin">📌 {pins[e.exerciseId]}</p>}
            {e.note && <p className="body wk-note">✎ {e.note}</p>}
            {last && (hint || w.kind !== 'mobility') && (
              <HintLine
                hint={hint}
                last={last}
                done={e.sets.some((s) => s.done)}
                onApply={(h) => setEntry(i, (x) => applyHint(x, h))}
              />
            )}

            <div className={'set-grid head ' + type}>
              <span>#</span>
              {type === 'weight_reps' && (
                <>
                  <span>{ex?.perHand ? t('unit.kgHand') : t('unit.kg')}</span>
                  <span>{t('wk.reps')}</span>
                </>
              )}
              {type === 'reps' && <span>{t('wk.reps')}</span>}
              {type === 'time' && <span>{t('unit.sec')}</span>}
              {type === 'cardio' && (
                <>
                  <span>{t('unit.min')}</span>
                  <span>{t('unit.km')}</span>
                </>
              )}
              <span />
            </div>
            {e.sets.map((s, k) => {
              const p = e.plan;
              const workNo = e.sets.slice(0, k + 1).filter((x) => !x.warmup).length;
              // Empty fields show what ticking the set fills in: previous set, plan, then this set last time
              const before = s.warmup ? undefined : e.sets.slice(0, k).reverse().find((x) => !x.warmup);
              const ls = s.warmup ? undefined : last?.sets[workNo - 1];
              const ph = (prev?: number, plan?: number, lastTime?: number) => {
                if (s.warmup) return '—';
                if (prev !== undefined) return num(prev);
                if (plan) return String(plan);
                return lastTime !== undefined ? num(lastTime) : '—';
              };
              const toMin = (sec?: number) => (sec === undefined ? undefined : Math.round(sec / 60));
              const repsPh = s.warmup ? '' : before?.reps !== undefined ? String(before.reps) : (p?.reps ?? (ls?.reps !== undefined ? String(ls.reps) : ''));
              const effortRow = s.done && !s.warmup && type !== 'cardio' && w.kind !== 'mobility';
              return (
                <div key={k}>
                <div className={'set-grid ' + type + (s.done ? ' done' : '') + (s.warmup ? ' warm' : '')}>
                  <button
                    className="set-n"
                    onClick={() => toggleWarmup(i, k)}
                    aria-label={s.warmup ? t('wk.warmupToggle') : t('wk.workToggle')}
                    title={s.warmup ? t('wk.warmupToggle') : t('wk.workToggle')}
                  >
                    {s.warmup ? t('wk.warmupShort') : workNo}
                  </button>
                  {type === 'weight_reps' && (
                    <>
                      <NumInput value={s.weight} decimal placeholder={ph(before?.weight, p?.weight, ls?.weight)} onChange={(v) => setSet(i, k, { weight: v })} />
                      <NumInput value={s.reps} placeholder={repsPh || '—'} onChange={(v) => setSet(i, k, { reps: v })} />
                    </>
                  )}
                  {type === 'reps' && <NumInput value={s.reps} placeholder={repsPh || '—'} onChange={(v) => setSet(i, k, { reps: v })} />}
                  {type === 'time' && (
                    <span className="time-cell">
                      <NumInput value={s.time} placeholder={ph(before?.time, p?.time, ls?.time)} onChange={(v) => setSet(i, k, { time: v })} />
                      {!s.done && (
                        <button
                          className="hold-btn"
                          aria-label={t('hold.start')}
                          onClick={() => {
                            unlockAudio();
                            setHold({ i, k });
                          }}
                        >
                          ▶
                        </button>
                      )}
                    </span>
                  )}
                  {type === 'cardio' && (
                    <>
                      <NumInput
                        value={s.time === undefined ? undefined : Math.round(s.time / 60)}
                        placeholder={ph(toMin(before?.time), toMin(p?.time), toMin(ls?.time))}
                        onChange={(v) => setSet(i, k, { time: v === undefined ? undefined : v * 60 })}
                      />
                      <NumInput value={s.distance} decimal placeholder={ph(before?.distance, p?.distance, ls?.distance)} onChange={(v) => setSet(i, k, { distance: v })} />
                    </>
                  )}
                  <button className="set-check" onClick={() => toggleDone(i, k)} aria-label={t('wk.done')}>
                    ✓
                  </button>
                </div>
                {effortRow && (
                  <button className={'set-effort m' + (s.effort ? ' on' : '')} onClick={() => setEffortFor({ i, k })}>
                    {s.effort ? (
                      <>
                        {t('wk.effort')} <b>{s.effort}/10</b>
                        {s.comment && <span className="muted"> · {s.comment}</span>}
                      </>
                    ) : (
                      <span className="muted">+ {t('wk.effort')}{s.comment ? ` · ${s.comment}` : ''}</span>
                    )}
                  </button>
                )}
                </div>
              );
            })}
            <div className="wk-entry-tools m">
              <button onClick={() => addSet(i)}>+ {t('wk.addSet')}</button>
              {w.kind !== 'mobility' && type !== 'cardio' && <button onClick={() => addWarmup(i)}>+ {t('wk.warmup')}</button>}
              {e.sets.length > 1 && (
                <button onClick={() => removeSet(i)} aria-label={t('wk.removeSet')}>
                  −
                </button>
              )}
              <span className="tools-break" />
              <button onClick={() => setNoteFor(i)}>✎ {t('wk.note')}</button>
              {ex && <button onClick={() => setSwapFor(i)}>⇄ {t('wk.swap')}</button>}
              <span style={{ flex: 1 }} />
              <button onClick={() => moveEntry(i, -1)} aria-label="up">↑</button>
              <button onClick={() => moveEntry(i, 1)} aria-label="down">↓</button>
              <button className="pink" onClick={() => removeEntry(i)} aria-label="delete">×</button>
            </div>
          </section>
        );
      })}

      <button className="btn outline" style={{ marginTop: 16 }} onClick={() => setPicking(true)}>
        + {t('wk.addExercise')}
      </button>

      <label className="field">
        <span className="m muted">// {t('wk.workoutNote')}</span>
        <textarea rows={3} value={w.note ?? ''} placeholder={t('wk.workoutNotePh')} onChange={(e) => setW((x) => ({ ...x, note: e.target.value || undefined }))} />
      </label>

      {editingFinished ? (
        <button className="btn lime" style={{ marginTop: 18 }} onClick={onClose}>
          {t('custom.save')}
        </button>
      ) : (
        <>
          <button className="btn pink" style={{ marginTop: 18 }} onClick={finish}>
            {t('wk.finish')}
          </button>
          <button className="link" style={{ display: 'block', margin: '16px auto 0' }} onClick={() => void discard()}>
            {t('wk.discard')}
          </button>
        </>
      )}

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={(ids) => {
            setW((x) => ({ ...x, entries: [...x.entries, ...ids.map((id) => entryFor(id))] }));
            setPicking(false);
          }}
        />
      )}
      {info && <ExerciseDetail ex={info} onClose={() => setInfo(null)} />}
      {hold && w.entries[hold.i] && (
        <HoldSheet
          ex={byId.get(w.entries[hold.i].exerciseId)}
          sec={w.entries[hold.i].sets[hold.k]?.time ?? w.entries[hold.i].plan?.time ?? DEFAULT_HOLD}
          onDone={(sec) => {
            setSet(hold.i, hold.k, { time: sec, done: true });
            setHold(null);
          }}
          onClose={() => setHold(null)}
        />
      )}
      {effortFor && w.entries[effortFor.i]?.sets[effortFor.k] && (
        <EffortSheet
          title={byId.get(w.entries[effortFor.i].exerciseId)?.name ?? ''}
          set={w.entries[effortFor.i].sets[effortFor.k]}
          onSave={(effort, comment) => {
            setSet(effortFor.i, effortFor.k, { effort, comment });
            setEffortFor(null);
          }}
          onClose={() => setEffortFor(null)}
        />
      )}
      {swapFor !== null && byId.get(w.entries[swapFor]?.exerciseId) && (
        <SwapSheet
          ex={byId.get(w.entries[swapFor].exerciseId)!}
          all={list ?? []}
          history={history ?? []}
          onPick={(id) => {
            setW((x) => ({ ...x, entries: swapEntry(x.entries, swapFor, id) }));
            setSwapFor(null);
          }}
          onClose={() => setSwapFor(null)}
        />
      )}
      {noteFor !== null && (
        <NoteSheet
          title={byId.get(w.entries[noteFor]?.exerciseId)?.name ?? ''}
          value={w.entries[noteFor]?.note ?? ''}
          pin={pins[w.entries[noteFor]?.exerciseId] ?? ''}
          onSave={(v, pin) => {
            const exId = w.entries[noteFor]?.exerciseId;
            setEntry(noteFor, (e) => ({ ...e, note: v || undefined }));
            if (exId && pin !== (pins[exId] ?? '')) void setPin(exId, pin);
            setNoteFor(null);
          }}
          onClose={() => setNoteFor(null)}
        />
      )}
    </div>
  );
}

/** "Last time (5 Nov): 80×8 · 80×8" for every exercise, plus the progression hint when there is one. */
function HintLine({
  hint,
  last: session,
  done,
  onApply,
}: {
  hint: Hint | null;
  last: { at: number; sets: SetEntry[] };
  done: boolean;
  onApply: (h: Hint) => void;
}) {
  const sec = t('unit.sec');
  const fmtSet = (x: { weight?: number; reps?: number; time?: number; distance?: number }) =>
    x.weight !== undefined && x.reps !== undefined
      ? `${num(x.weight)}×${x.reps}`
      : x.reps !== undefined
        ? `${x.reps}`
        : x.distance !== undefined
          ? `${Math.round((x.time ?? 0) / 60)} ${t('unit.min')} · ${num(x.distance)} ${t('unit.km')}`
          : x.time !== undefined
            ? `${x.time} ${sec}`
            : '—';
  const sets = session.sets;
  const last = sets.slice(0, 5).map(fmtSet).join(' · ') + (sets.length > 5 ? ' …' : '');
  const head = (
    <span className="muted">
      {t('wk.hint.lastOn', { date: fmt(new Date(session.at), { day: 'numeric', month: 'short' }) })} {last}
    </span>
  );
  if (!hint) return <div className="wk-hint m">{head}</div>;
  return (
    <button className="wk-hint m" disabled={done} onClick={() => onApply(hint)}>
      {head}
      <span className="lime">
        → {t(hint.kind === 'up' ? 'wk.hint.up' : hint.kind === 'hold' ? 'wk.hint.hold' : 'wk.hint.reps')} {fmtSet(hint.next)}
        {!done && <span className="muted"> · {t('wk.hint.tap')}</span>}
      </span>
    </button>
  );
}

/** Effort 1–10 and an optional comment for one ticked set. */
function EffortSheet({
  title,
  set,
  onSave,
  onClose,
}: {
  title: string;
  set: SetEntry;
  onSave: (effort?: number, comment?: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(set.effort);
  const [c, setC] = useState(set.comment ?? '');
  return (
    <div className="sheet">
      <div className="sheet-in">
        <button className="m muted" onClick={onClose} style={{ marginBottom: 12 }}>
          ← {t('ex.close')}
        </button>
        <div className="m muted">// {t('wk.effortTitle')}</div>
        <div className="h h-m" style={{ marginTop: 6 }}>
          {title}
        </div>
        <div className="effort-grid">
          {Array.from({ length: 10 }, (_, n) => n + 1).map((n) => (
            <button key={n} className={'effort-chip' + (v === n ? ' on' : '') + (n >= 9 ? ' hard' : '')} onClick={() => setV(v === n ? undefined : n)}>
              {n}
            </button>
          ))}
        </div>
        <div className="m muted" style={{ marginTop: 8 }}>
          {t('wk.effortScale')}
        </div>
        <label className="field">
          <span className="m muted">// {t('wk.effortComment')}</span>
          <textarea rows={3} value={c} placeholder={t('wk.effortCommentPh')} onChange={(e) => setC(e.target.value)} />
        </label>
        <button className="btn lime" style={{ marginTop: 12 }} onClick={() => onSave(v, c.trim() || undefined)}>
          {t('custom.save')}
        </button>
        {(set.effort || set.comment) && (
          <button className="link" style={{ display: 'block', margin: '14px auto 0' }} onClick={() => onSave(undefined, undefined)}>
            {t('wk.effortClear')}
          </button>
        )}
      </div>
    </div>
  );
}

/** Same-muscle stand-ins for one exercise; tap one to swap it in. Typing searches the whole base. */
function SwapSheet({
  ex,
  all,
  history,
  onPick,
  onClose,
}: {
  ex: Exercise;
  all: Exercise[];
  history: Workout[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const alts = alternatives(ex, all, history);
  const done = new Set(history.flatMap((w) => (w.endedAt ? w.entries.map((e) => e.exerciseId) : [])));
  const shown = q.trim() ? all.filter((x) => x.id !== ex.id && matches(x, q)) : alts;
  return (
    <Sheet onClose={onClose}>
      <div className="m muted">// {t('wk.swapTitle')}</div>
      <div className="h h-m" style={{ marginTop: 6 }}>
        {ex.name}
      </div>
      <div className="m muted" style={{ marginTop: 6, textTransform: 'none' }}>
        {t('wk.swapHint')}
      </div>
      <input className="search" style={{ marginTop: 12 }} value={q} placeholder={'⌕ ' + t('exercises.search', { n: all.length })} onChange={(e) => setQ(e.target.value)} />
      <div style={{ marginTop: 10, paddingBottom: 30 }}>
        {shown.length === 0 && <p className="body muted">{t('wk.swapNone')}</p>}
        {shown.slice(0, 80).map((x) => (
          <button key={x.id} className="ex-row" onClick={() => onPick(x.id)}>
            <ExerciseMedia ex={x} size="thumb" />
            <div className="ex-row-text">
              <b>{x.name}</b>
              <span className="m muted">
                {t(`muscle.${x.muscles[0]}`)} · {tk(`eq.${x.equipment}`, x.equipment)}
                {done.has(x.id) && <span className="lime"> · {t('wk.swapDone')}</span>}
              </span>
            </div>
            <span className="pick-mark">⇄</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function NoteSheet({
  title,
  value,
  pin,
  onSave,
  onClose,
}: {
  title: string;
  value: string;
  pin: string;
  onSave: (v: string, pin: string) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState(value);
  const [p, setP] = useState(pin);
  return (
    <div className="sheet">
      <div className="sheet-in">
        <button className="m muted" onClick={onClose} style={{ marginBottom: 12 }}>
          ← {t('ex.close')}
        </button>
        <div className="m muted">// {t('wk.note')}</div>
        <div className="h h-m" style={{ marginTop: 6 }}>
          {title}
        </div>
        <label className="field">
          <span className="m lime">// {t('wk.pin')}</span>
          <textarea rows={2} value={p} placeholder={t('wk.pinPh')} onChange={(e) => setP(e.target.value)} />
        </label>
        <label className="field">
          <span className="m muted">// {t('wk.noteToday')}</span>
          <textarea rows={4} value={v} placeholder={t('wk.notePh')} onChange={(e) => setV(e.target.value)} />
        </label>
        <button className="btn lime" style={{ marginTop: 12 }} onClick={() => onSave(v.trim(), p.trim())}>
          {t('custom.save')}
        </button>
      </div>
    </div>
  );
}

/** Hold countdown for one time-based set: get ready, hold (both sides for one-sided holds), sound at the end. */
function HoldSheet({ ex, sec, onDone, onClose }: { ex?: Exercise; sec: number; onDone: (sec: number) => void; onClose: () => void }) {
  const sides = ex?.perSide ? 2 : 1;
  const [round, setRound] = useState(0); // 0..sides-1
  const [phase, setPhase] = useState<'prep' | 'hold'>('prep');
  useWakeLock();
  const timer = useCountdown(() => {
    if (phase === 'prep') {
      cue();
      setPhase('hold');
      timer.start(sec);
    } else if (round + 1 < sides) {
      cue(true);
      setRound(round + 1);
      setPhase('prep');
      timer.start(PREP);
    } else {
      cue(true);
      onDone(sec);
    }
  });
  useEffect(() => {
    timer.start(PREP);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const total = phase === 'prep' ? PREP : sec;
  return (
    <div className="sheet">
      <div className="sheet-in" style={{ textAlign: 'center' }}>
        <button className="m muted" onClick={onClose} style={{ display: 'block', marginBottom: 12 }}>
          ← {t('ex.close')}
        </button>
        <div className="m muted">// {t('hold.title')}</div>
        <div className="h h-m" style={{ marginTop: 6 }}>
          {ex?.name}
          {sides === 2 && <span className="lime"> · {t(round === 0 ? 'side.left' : 'side.right')}</span>}
        </div>
        <div className="pl-timer">
          <div className="pl-ring" style={{ ['--p' as string]: 1 - timer.left / Math.max(1, total) }}>
            <span className="h">{mmss(timer.left)}</span>
            <span className="m">{phase === 'prep' ? t('player.ready') : t('player.hold')}</span>
          </div>
        </div>
        <button className="btn outline" onClick={() => (timer.paused ? timer.resume() : timer.pause())}>
          {timer.paused ? t('player.resume') : t('player.pause')}
        </button>
      </div>
    </div>
  );
}

function Summary({
  w,
  byId,
  onClose,
  onOpenWorkout,
}: {
  w: Workout;
  byId: Map<string, Exercise>;
  onClose: () => void;
  onOpenWorkout: (w: Workout) => void;
}) {
  const tt = totals(w);
  const cool = w.kind === 'mobility' ? null : cooldownFor(w, byId);
  return (
    <div className="workout">
      <div className="m lime" style={{ marginTop: 30 }}>// {t('wk.summary.done')}</div>
      <div className="h h-xl" style={{ marginTop: 10 }}>
        {w.title}
      </div>
      <div className="stats-grid">
        <div>
          <b>{minutes(tt.durationMs)}</b>
          <span className="m">{t('unit.min')}</span>
        </div>
        <div>
          <b>{tt.exercises}</b>
          <span className="m">{t('wk.summary.exercises')}</span>
        </div>
        <div>
          <b>{tt.sets}</b>
          <span className="m">{t('wk.summary.sets')}</span>
        </div>
      </div>
      {tt.volume > 0 && (
        <div className="slab lime" style={{ marginTop: 12 }}>
          <div className="m">{t('wk.summary.volume')}</div>
          <div className="h h-l" style={{ marginTop: 6 }}>
            {num(tt.volume)} {t('unit.kg')}
          </div>
          {tonnageText(tt.volume, w.id) && <div className="m" style={{ marginTop: 6 }}>{tonnageText(tt.volume, w.id)}</div>}
        </div>
      )}
      {cool && cool.items.length > 0 && (
        <div className="slab orange-bg cooldown">
          <div className="m">
            {t('cool.label', { n: Math.max(2, Math.round(cool.items.reduce((a, x) => a + (x.time ?? 30) * x.sets + PREP * x.sets, 0) / 60)) })}
          </div>
          <div className="h h-m" style={{ marginTop: 6 }}>
            {t('cool.title')}
          </div>
          <div className="body" style={{ marginTop: 6 }}>
            {cool.items.map((x) => byId.get(x.exerciseId)?.name).join(' · ')}
          </div>
          <button
            className="btn ink"
            style={{ marginTop: 12, height: 44 }}
            onClick={async () => {
              unlockAudio();
              onOpenWorkout(await startMobility(t('cool.workoutTitle'), cool.items));
            }}
          >
            {t('cool.start')} →
          </button>
        </div>
      )}
      <button className={'btn ' + (cool?.items.length ? 'outline' : 'lime')} style={{ marginTop: 16 }} onClick={onClose}>
        {t('wk.summary.close')}
      </button>
    </div>
  );
}
