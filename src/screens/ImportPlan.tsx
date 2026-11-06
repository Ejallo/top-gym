import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db } from '../lib/db';
import { activatePlan, buildPrompt, copyText, matchPlan, parsePlan, type Match, type ParsedPlan } from '../lib/claude';
import { Sheet } from '../components/Sheet';
import { weekdayNames } from '../lib/dates';


/** Copy the template for Claude → paste the answer → check exercises → activate the weekly program. */
export function ImportPlan({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [withHistory, setWithHistory] = useState(true);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<ParsedPlan | null>(null);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [busy, setBusy] = useState<'check' | 'save' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const current = useLiveQuery(() => db.programs.toArray(), [])?.[0];
  // Built ahead of the tap: iOS Safari only allows clipboard writes synchronously inside the gesture
  const [prompt, setPrompt] = useState('');
  useEffect(() => {
    setPrompt('');
    void buildPrompt(withHistory).then(setPrompt);
  }, [withHistory]);

  const copy = async () => {
    if (!prompt) return;
    const ok = await copyText(prompt);
    setCopyState(ok ? 'ok' : 'fail');
  };
  const share = async () => {
    try {
      await navigator.share({ text: prompt });
    } catch {
      // cancelled
    }
  };
  const pasteClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      reset();
    } catch {
      // permission denied: user pastes manually
    }
  };
  const reset = () => {
    setPlan(null);
    setMatches(null);
    setError('');
  };

  const check = async () => {
    reset();
    let p: ParsedPlan;
    try {
      p = parsePlan(text);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setBusy('check');
    setPlan(p);
    setMatches(await matchPlan(p));
    setBusy(null);
  };

  const activate = async () => {
    if (!plan || !matches) return;
    setBusy('save');
    await activatePlan(plan, matches);
    setBusy(null);
    onDone();
  };

  const count = (s: Match['status']) => matches?.filter((m) => m.status === s).length ?? 0;

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">
        {t('import.title')}
        <span className="lime">.</span>
      </div>

      <div className="m muted sec">// {t('import.step1')}</div>
      <p className="body">{t('import.step1Text')}</p>
      <button className={'toggle' + (withHistory ? ' on lime-toggle' : '')} onClick={() => setWithHistory(!withHistory)}>
        <span className="toggle-box">{withHistory ? '✓' : ''}</span>
        <span className="m">{t('import.withHistory')}</span>
      </button>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn lime" disabled={!prompt} onClick={() => void copy()}>
          ⧉ {t('import.copy')}
        </button>
        {'share' in navigator && (
          <button className="btn ghost" style={{ flex: '0 0 auto', width: 'auto' }} onClick={() => void share()}>
            ↗
          </button>
        )}
      </div>
      {copyState === 'ok' && <p className="status lime">{t('import.copied')}</p>}
      {copyState === 'fail' && <p className="status pink">{t('import.copyFailed')}</p>}

      <div className="m muted sec">// {t('import.step2')}</div>
      <textarea
        rows={6}
        value={text}
        placeholder={t('import.pastePh')}
        onChange={(e) => {
          setText(e.target.value);
          reset();
        }}
        style={{ fontSize: 12 }}
      />
      <div className="btn-row" style={{ marginTop: 6 }}>
        <button className="btn ghost small" onClick={() => void pasteClipboard()}>
          {t('import.paste')}
        </button>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
          {t('import.file')}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) {
            setText(await f.text());
            reset();
          }
          e.target.value = '';
        }}
      />
      <button className="btn outline" style={{ marginTop: 10 }} disabled={!text.trim() || busy !== null} onClick={() => void check()}>
        {busy === 'check' ? t('import.checking') : t('import.check')}
      </button>
      {error && <p className="status pink">{error}</p>}

      {plan && matches && (
        <>
          <div className="m muted sec">// {t('import.step3')}</div>
          <div className="h h-m">{plan.program}</div>
          <div className="ok-line m" style={{ marginTop: 10 }}>
            <i className="lime-bg">✓</i>
            {t('import.found', { n: count('found') })}
          </div>
          {count('full') > 0 && (
            <div className="ok-line m">
              <i className="cyan-bg">↓</i>
              {t('import.full', { n: count('full') })}
            </div>
          )}
          {count('own') > 0 && (
            <div className="ok-line m">
              <i className="pink-bg">!</i>
              {t('import.own', { n: count('own') })}
            </div>
          )}

          {plan.days.map((d, di) => (
            <div key={di} className="view-entry">
              <div className="row">
                <b className="h h-s">{d.title}</b>
                <span className="m lime">{weekdayNames()[d.weekday - 1]}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                {d.exercises.map((x, xi) => {
                  const m = matches.find((mm) => mm.day === di && mm.index === xi)!;
                  return (
                    <div key={xi} className="m import-ex">
                      <span className={m.status === 'found' ? 'lime' : m.status === 'full' ? 'cyan' : 'pink'}>
                        {m.status === 'found' ? '✓' : m.status === 'full' ? '↓' : '!'}
                      </span>
                      <span style={{ textTransform: 'none' }}>{m.label}</span>
                      <span className="muted">
                        {x.sets ?? 3}×{x.reps ?? (x.time_sec ? `${x.time_sec}s` : '—')}
                        {x.weight ? ` · ${x.weight}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {current && <p className="status pink">{t('import.replace', { name: current.name })}</p>}
          <button className="btn pink" style={{ marginTop: 12 }} disabled={busy !== null} onClick={() => void activate()}>
            {busy === 'save' ? t('import.activating') : t('import.activate')}
          </button>
        </>
      )}
    </Sheet>
  );
}
