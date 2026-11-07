import { useEffect, useRef, useState } from 'react';

// Hold timer helpers: sound/vibration cues, screen wake lock, a pausable countdown.
// Time is kept as an end timestamp, so the countdown stays right after the app was in the background.

let ctx: AudioContext | null = null;

/** Call inside a tap: iOS only lets audio start from a user gesture. */
export function unlockAudio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    // no Web Audio
  }
}

/** Short beep; `long` marks the end of a hold. Also vibrates where supported (not on iPhone). */
export function cue(long = false) {
  try {
    navigator.vibrate?.(long ? [200, 80, 200] : 80);
  } catch {
    // ignore
  }
  if (!ctx) return;
  const beeps = long ? [0, 0.22] : [0];
  for (const at of beeps) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = long ? 880 : 660;
    o.connect(g).connect(ctx.destination);
    const t0 = ctx.currentTime + at;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
    o.start(t0);
    o.stop(t0 + 0.18);
  }
}

/** Keeps the screen on while mounted (Screen Wake Lock API, where available). */
export function useWakeLock(on = true) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let alive = true;
    const take = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (!alive) void lock.release();
      } catch {
        // denied or not visible
      }
    };
    void take();
    // The lock drops when the page is hidden: take it again on return
    const onVis = () => document.visibilityState === 'visible' && void take();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, [on]);
}

export interface Countdown {
  left: number; // seconds left, rounded up
  total: number;
  paused: boolean;
  running: boolean;
  start: (sec: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/** Pausable countdown that calls onEnd once when it reaches zero. */
export function useCountdown(onEnd: () => void): Countdown {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedLeft, setPausedLeft] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [, tick] = useState(0);
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => {
      if (Date.now() >= endsAt) {
        setEndsAt(null);
        endRef.current();
      } else tick((x) => x + 1);
    }, 200);
    return () => clearInterval(id);
  }, [endsAt]);

  const leftMs = pausedLeft ?? (endsAt === null ? 0 : Math.max(0, endsAt - Date.now()));
  return {
    left: Math.ceil(leftMs / 1000),
    total,
    paused: pausedLeft !== null,
    running: endsAt !== null || pausedLeft !== null,
    start: (sec) => {
      setTotal(sec);
      setPausedLeft(null);
      setEndsAt(Date.now() + sec * 1000);
    },
    pause: () => {
      if (endsAt === null) return;
      setPausedLeft(Math.max(0, endsAt - Date.now()));
      setEndsAt(null);
    },
    resume: () => {
      if (pausedLeft === null) return;
      setEndsAt(Date.now() + pausedLeft);
      setPausedLeft(null);
    },
    stop: () => {
      setEndsAt(null);
      setPausedLeft(null);
    },
  };
}

/** m:ss */
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
