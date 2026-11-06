import { useMemo, useState } from 'react';
import { num, t } from '../i18n';
import { fmt } from '../lib/dates';
import { useExercises } from '../lib/exercises';
import { addDays, useFinishedWorkouts, useWeeklyGoal } from '../lib/stats';
import { buildReport, hoursMinutes, reportMarkdown, thisWeekStart, volumeChange } from '../lib/report';
import { copyText } from '../lib/claude';
import { Sheet } from '../components/Sheet';

/** Weekly report: summary, best sets vs last week, muscles, notes; share/copy as markdown for Claude. */
export function WeeklyReport({ start: initialStart, onClose }: { start?: number; onClose: () => void }) {
  const [start, setStart] = useState(initialStart ?? thisWeekStart());
  const workouts = useFinishedWorkouts();
  const list = useExercises();
  const [goal] = useWeeklyGoal();
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const byId = useMemo(() => new Map((list ?? []).map((e) => [e.id, e])), [list]);
  const r = useMemo(() => (workouts && list ? buildReport(workouts, byId, start, goal) : null), [workouts, list, byId, start, goal]);
  // Built ahead of the tap: iOS only allows clipboard/share inside the gesture
  const md = useMemo(() => (r ? reportMarkdown(r, byId) : ''), [r, byId]);
  const change = r ? volumeChange(r) : null;
  const isCurrent = start >= thisWeekStart();

  const shift = (n: number) => {
    setStart(addDays(start, n * 7));
    setCopied(null);
  };

  return (
    <Sheet onClose={onClose}>
      <div className="row">
        <button className="btn ghost small" style={{ width: 48 }} onClick={() => shift(-1)} aria-label={t('report.prev')}>
          ←
        </button>
        <span className="m muted">
          {fmt(new Date(start), { day: 'numeric', month: 'short' })} – {fmt(new Date(addDays(start, 6)), { day: 'numeric', month: 'short' })}
        </span>
        <button className="btn ghost small" style={{ width: 48 }} disabled={isCurrent} onClick={() => shift(1)} aria-label={t('report.next')}>
          →
        </button>
      </div>
      <div className="h h-l" style={{ marginTop: 14 }}>
        {t('report.title')}
        <br />
        <span className="cyan">{t('report.week', { n: r?.week ?? '' })}.</span>
      </div>

      {r && (
        <>
          <div className="stats-grid cyan-grid">
            <div>
              <b>
                {r.workouts.length}/{r.goal}
              </b>
              <span className="m">{t('report.workouts')}</span>
            </div>
            <div>
              <b>{hoursMinutes(r.minutes)}</b>
              <span className="m">{t('report.time')}</span>
            </div>
            <div>
              <b>{change === null ? '—' : `${change > 0 ? '+' : ''}${change}%`}</b>
              <span className="m">{t('report.volume')}</span>
            </div>
          </div>

          {r.workouts.length === 0 ? (
            <div className="dash" style={{ marginTop: 14 }}>
              <p className="body">{t('report.empty')}</p>
            </div>
          ) : (
            <>
              <div className="m muted sec">// {t('report.compare')}</div>
              {r.compare.map((c) => (
                <div key={c.ex.id} className="cmp-row m">
                  <span className="cmp-name">{c.ex.name}</span>
                  <span>{c.best}</span>
                  <span className={c.trend === 'up' ? 'lime' : c.trend === 'down' ? 'pink' : 'muted'}>
                    {c.trend === 'up' ? '▲' : c.trend === 'down' ? '▼' : c.trend === 'new' ? '★' : '='}
                  </span>
                </div>
              ))}

              {r.muscles.length > 0 && (
                <>
                  <div className="m muted sec">// {t('report.muscles')}</div>
                  <div className="chips">
                    {r.muscles.map((x) => (
                      <span key={x.m} className="chip">
                        {t(`muscle.${x.m}`)} · {x.sets}
                      </span>
                    ))}
                  </div>
                </>
              )}

              {r.notes.length > 0 && (
                <>
                  <div className="m muted sec">// {t('report.notes')}</div>
                  {r.notes.map((n, i) => (
                    <p key={i} className="body wk-note">
                      «{n.text}» <span className="muted">— {n.title}</span>
                    </p>
                  ))}
                </>
              )}

              <div className="m muted sec">// {t('report.volumeKg', { n: num(r.volume) })}</div>

              {'share' in navigator && (
                <button
                  className="btn cyan"
                  style={{ marginTop: 6 }}
                  onClick={() => void navigator.share({ title: t('report.title'), text: md }).catch(() => undefined)}
                >
                  ↗ {t('report.share')}
                </button>
              )}
              <button
                className={'btn ' + ('share' in navigator ? 'ghost small' : 'cyan')}
                style={{ marginTop: 6 }}
                onClick={() => void copyText(md).then((ok) => setCopied(ok ? 'ok' : 'fail'))}
              >
                ⧉ {t('report.copy')}
              </button>
              {copied === 'ok' && <p className="status lime">{t('report.copied')}</p>}
              {copied === 'fail' && <p className="status pink">{t('import.copyFailed')}</p>}
            </>
          )}
        </>
      )}
    </Sheet>
  );
}
