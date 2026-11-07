import { useEffect, useRef, useState } from 'react';
import { num, t } from '../i18n';
import { db, type SetEntry, type Workout, type WorkoutEntry } from '../lib/db';
import { useExercises, type Exercise } from '../lib/exercises';
import { clock, entryFor, fillFromPlan, minutes, planText, totals, useNow } from '../lib/workouts';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseDetail } from '../components/ExerciseDetail';
import { ExercisePicker } from '../components/ExercisePicker';
import { NumInput } from '../components/NumInput';
import { useLiveQuery } from 'dexie-react-hooks';
import { applyHint, lastSets, progressionHint, type Hint } from '../lib/progression';
import { cue, mmss, unlockAudio, useCountdown, useWakeLock } from '../lib/hold';
import { DEFAULT_HOLD, PREP, cooldownFor, startMobility } from '../lib/mobility';

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
  const [noteFor, setNoteFor] = useState<number | null>(null);
  const [summary, setSummary] = useState(false);
  const [hold, setHold] = useState<{ i: number; k: number } | null>(null);
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
          return { ...fillFromPlan(s, e, ex?.type ?? 'weight_reps', e.sets[k - 1]), done: true };
        }),
      };
    });

  const addSet = (i: number) =>
    setEntry(i, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, { weight: last?.weight, reps: last?.reps, time: last?.time, distance: last?.distance, done: false }] };
    });
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
        {t('wk.progress', { sets: tt.sets, total: w.entries.reduce((a, e) => a + e.sets.length, 0) })}
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
            {(e.rest || plan) && (
              <div className="m pink" style={{ marginTop: 8 }}>
                {plan && <span className="muted">{t('wk.plan')} {plan}</span>}
                {plan && e.rest && <span className="muted"> · </span>}
                {e.rest && <>// {t('wk.rest')} — {e.rest}</>}
              </div>
            )}
            {e.note && <p className="body wk-note">✎ {e.note}</p>}
            {history && (
              <HintLine
                hint={progressionHint(e, ex, lastSets(history, e.exerciseId, w.startedAt, w.id))}
                done={e.sets.some((s) => s.done)}
                onApply={(h) => setEntry(i, (x) => applyHint(x, h))}
              />
            )}

            <div className={'set-grid head ' + type}>
              <span>#</span>
              {type === 'weight_reps' && (
                <>
                  <span>{t('unit.kg')}</span>
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
              const repsPh = p?.reps ?? '';
              return (
                <div key={k} className={'set-grid ' + type + (s.done ? ' done' : '')}>
                  <span className="set-n">{k + 1}</span>
                  {type === 'weight_reps' && (
                    <>
                      <NumInput value={s.weight} decimal placeholder={p?.weight ? String(p.weight) : '—'} onChange={(v) => setSet(i, k, { weight: v })} />
                      <NumInput value={s.reps} placeholder={repsPh || '—'} onChange={(v) => setSet(i, k, { reps: v })} />
                    </>
                  )}
                  {type === 'reps' && <NumInput value={s.reps} placeholder={repsPh || '—'} onChange={(v) => setSet(i, k, { reps: v })} />}
                  {type === 'time' && (
                    <span className="time-cell">
                      <NumInput value={s.time} placeholder={p?.time ? String(p.time) : '—'} onChange={(v) => setSet(i, k, { time: v })} />
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
                        placeholder={p?.time ? String(Math.round(p.time / 60)) : '—'}
                        onChange={(v) => setSet(i, k, { time: v === undefined ? undefined : v * 60 })}
                      />
                      <NumInput value={s.distance} decimal placeholder={p?.distance ? String(p.distance) : '—'} onChange={(v) => setSet(i, k, { distance: v })} />
                    </>
                  )}
                  <button className="set-check" onClick={() => toggleDone(i, k)} aria-label={t('wk.done')}>
                    ✓
                  </button>
                </div>
              );
            })}
            <div className="wk-entry-tools m">
              <button onClick={() => addSet(i)}>+ {t('wk.addSet')}</button>
              {e.sets.length > 1 && (
                <button onClick={() => removeSet(i)} aria-label={t('wk.removeSet')}>
                  −
                </button>
              )}
              <button onClick={() => setNoteFor(i)}>✎ {t('wk.note')}</button>
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
      {noteFor !== null && (
        <NoteSheet
          title={byId.get(w.entries[noteFor]?.exerciseId)?.name ?? ''}
          value={w.entries[noteFor]?.note ?? ''}
          onSave={(v) => {
            setEntry(noteFor, (e) => ({ ...e, note: v || undefined }));
            setNoteFor(null);
          }}
          onClose={() => setNoteFor(null)}
        />
      )}
    </div>
  );
}

/** "Last time 60×8 · 60×8 → try 62.5×8": tap fills the empty sets. */
function HintLine({ hint, done, onApply }: { hint: Hint | null; done: boolean; onApply: (h: Hint) => void }) {
  if (!hint) return null;
  const sec = t('unit.sec');
  const fmtSet = (x: { weight?: number; reps?: number; time?: number }) =>
    x.weight !== undefined && x.reps !== undefined
      ? `${num(x.weight)}×${x.reps}`
      : x.reps !== undefined
        ? `${x.reps}`
        : x.time !== undefined
          ? `${x.time} ${sec}`
          : '—';
  const last = hint.last.slice(0, 5).map(fmtSet).join(' · ') + (hint.last.length > 5 ? ' …' : '');
  return (
    <button className="wk-hint m" disabled={done} onClick={() => onApply(hint)}>
      <span className="muted">
        {t('wk.hint.last')} {last}
      </span>
      <span className="lime">
        → {t(hint.kind === 'up' ? 'wk.hint.up' : 'wk.hint.reps')} {fmtSet(hint.next)}
        {!done && <span className="muted"> · {t('wk.hint.tap')}</span>}
      </span>
    </button>
  );
}

function NoteSheet({ title, value, onSave, onClose }: { title: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
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
        <textarea rows={5} style={{ marginTop: 14 }} autoFocus value={v} placeholder={t('wk.notePh')} onChange={(e) => setV(e.target.value)} />
        <button className="btn lime" style={{ marginTop: 12 }} onClick={() => onSave(v.trim())}>
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
