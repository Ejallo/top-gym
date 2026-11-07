import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { db, type Workout } from '../lib/db';
import { useExercises, type Exercise } from '../lib/exercises';
import { cue, mmss, unlockAudio, useCountdown, useWakeLock } from '../lib/hold';
import { DEFAULT_HOLD, PREP } from '../lib/mobility';
import { minutes } from '../lib/workouts';
import { ExerciseMedia } from '../components/ExerciseMedia';
import { ExerciseDetail } from '../components/ExerciseDetail';

interface Step {
  ei: number; // entry index
  si: number; // set index
  ex?: Exercise;
  time: number;
  side?: 'left' | 'right';
}

/**
 * Stretching / yoga session: one pose after another with a get-ready pause, a hold countdown,
 * a sound at the end and automatic sides for one-sided holds. Saved on every step.
 */
export function MobilityPlayer({ initial, onClose }: { initial: Workout; onClose: () => void }) {
  const list = useExercises();
  const byId = new Map((list ?? []).map((e) => [e.id, e]));
  const [w, setW] = useState(initial);
  const steps: Step[] = w.entries.flatMap((e, ei) => {
    const ex = byId.get(e.exerciseId);
    const time = e.plan?.time ?? DEFAULT_HOLD;
    const sided = !!ex?.perSide && e.sets.length === 2;
    return e.sets.map((_, si) => ({ ei, si, ex, time, side: sided ? (si === 0 ? 'left' : 'right') : undefined }));
  });
  const firstOpen = steps.findIndex((s) => !w.entries[s.ei].sets[s.si].done);
  const [idx, setIdx] = useState(firstOpen < 0 ? steps.length : firstOpen);
  const [phase, setPhase] = useState<'idle' | 'prep' | 'hold'>('idle');
  const [info, setInfo] = useState<Exercise | null>(null);
  const finished = idx >= steps.length || !!w.endedAt;
  const step = steps[idx];
  useWakeLock(!finished);

  // Persist on every change
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void db.workouts.put(w);
  }, [w]);

  const markDone = (s: Step, time: number) =>
    setW((x) => ({
      ...x,
      entries: x.entries.map((e, i) => (i !== s.ei ? e : { ...e, sets: e.sets.map((st, j) => (j === s.si ? { ...st, time, done: true } : st)) })),
    }));

  const timer = useCountdown(() => {
    if (phase === 'prep') {
      cue();
      setPhase('hold');
      timer.start(step.time);
    } else if (phase === 'hold') {
      cue(true);
      markDone(step, step.time);
      next();
    }
  });

  const begin = (i: number) => {
    setIdx(i);
    if (i >= steps.length) return finish();
    setPhase('prep');
    timer.start(PREP);
  };
  const next = () => begin(idx + 1);
  const finish = () => {
    timer.stop();
    setPhase('idle');
    setW((x) => (x.endedAt ? x : { ...x, endedAt: Date.now() }));
  };

  const skip = () => {
    // Skipping mid-hold keeps what was held so far
    if (phase === 'hold' && step) {
      const held = Math.max(0, timer.total - timer.left);
      if (held >= 5) markDone(step, held);
    }
    next();
  };
  const back = () => {
    if (idx === 0) return begin(0);
    const prev = steps[idx - 1];
    setW((x) => ({
      ...x,
      entries: x.entries.map((e, i) => (i !== prev.ei ? e : { ...e, sets: e.sets.map((st, j) => (j === prev.si ? { done: false } : st)) })),
    }));
    begin(idx - 1);
  };

  const discard = async () => {
    if (!confirm(t('wk.discardConfirm'))) return;
    await db.workouts.delete(w.id);
    onClose();
  };

  if (finished) return <Done w={w} poses={steps.filter((s) => w.entries[s.ei].sets[s.si].done).length} onClose={onClose} />;

  const yoga = step?.ex?.category === 'yoga';
  const cat = step?.ex?.category === 'stretch' ? 'stretch' : 'yoga';
  const after = steps[idx + 1];
  const shown = phase === 'idle' ? step.time : timer.left;
  const total = phase === 'prep' ? PREP : step.time;
  const pct = phase === 'idle' ? 0 : 1 - timer.left / Math.max(1, total);

  return (
    <div className={'workout player ' + cat}>
      <div className="wk-top">
        <button className="m muted" onClick={onClose}>
          ← {t('wk.minimize')}
        </button>
        <span className={'m ' + (cat === 'yoga' ? 'violet' : 'orange')}>
          {idx + 1} / {steps.length}
        </span>
      </div>
      <div className="pl-bar">
        <i style={{ width: `${(idx / steps.length) * 100}%` }} />
      </div>

      <button className="pl-media" onClick={() => step.ex && setInfo(step.ex)}>
        {step.ex && <ExerciseMedia ex={step.ex} size="big" />}
      </button>
      <div className="m muted" style={{ marginTop: 12 }}>
        {w.title}
        {step.side && <b className={cat === 'yoga' ? 'violet' : 'orange'}> · {t(`side.${step.side}`)}</b>}
      </div>
      <div className="h h-l" style={{ marginTop: 4 }}>
        {step.ex?.name ?? '…'}
      </div>

      <div className="pl-timer">
        <div className="pl-ring" style={{ ['--p' as string]: pct }}>
          <span className="h">{mmss(shown)}</span>
          <span className="m">{phase === 'prep' ? t('player.ready') : phase === 'hold' ? t('player.hold') : t('player.tapStart')}</span>
        </div>
        {yoga && phase === 'hold' && !timer.paused && (
          <div className="pl-breath">
            <i />
            <span className="m">{t('player.breath')}</span>
          </div>
        )}
      </div>

      {phase === 'idle' ? (
        <button
          className={'btn ' + (cat === 'yoga' ? 'violet-bg' : 'orange-bg')}
          onClick={() => {
            unlockAudio();
            begin(idx);
          }}
        >
          {idx === 0 ? t('player.start') : t('player.resume')} →
        </button>
      ) : (
        <div className="btn-row pl-ctrl">
          <button className="btn ghost small" onClick={back} aria-label={t('player.back')}>
            ←
          </button>
          <button
            className="btn outline small"
            onClick={() => {
              unlockAudio();
              if (timer.paused) timer.resume();
              else timer.pause();
            }}
          >
            {timer.paused ? t('player.resume') : t('player.pause')}
          </button>
          <button className="btn lime small" onClick={skip}>
            {t('player.next')} →
          </button>
        </div>
      )}

      {after && (
        <p className="m muted" style={{ marginTop: 14 }}>
          {t('player.after')}: {after.ex?.name}
          {after.side && ` · ${t(`side.${after.side}`)}`} · {after.time} {t('unit.sec')}
        </p>
      )}

      <div className="btn-row" style={{ marginTop: 24 }}>
        <button className="link" onClick={finish}>
          {t('player.finish')}
        </button>
        <button className="link" onClick={() => void discard()}>
          {t('wk.discard')}
        </button>
      </div>
      {info && <ExerciseDetail ex={info} onClose={() => setInfo(null)} />}
    </div>
  );
}

function Done({ w, poses, onClose }: { w: Workout; poses: number; onClose: () => void }) {
  return (
    <div className="workout">
      <div className="m lime" style={{ marginTop: 30 }}>
        // {t('player.done')}
      </div>
      <div className="h h-xl" style={{ marginTop: 10 }}>
        {w.title}
      </div>
      <div className="stats-grid">
        <div>
          <b>{minutes((w.endedAt ?? Date.now()) - w.startedAt)}</b>
          <span className="m">{t('unit.min')}</span>
        </div>
        <div>
          <b>{poses}</b>
          <span className="m">{t('player.poses')}</span>
        </div>
      </div>
      <button className="btn lime" style={{ marginTop: 24 }} onClick={onClose}>
        {t('wk.summary.close')}
      </button>
    </div>
  );
}
