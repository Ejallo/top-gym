import { t } from '../i18n';
import type { Exercise } from '../lib/exercises';

/** Technique steps and common mistakes of an exercise. */
export function Technique({ ex }: { ex: Exercise }) {
  return (
    <>
      {ex.steps.length > 0 && (
        <>
          <div className="m muted sec">// {t('ex.technique')}</div>
          <ol className="steps">
            {ex.steps.map((s, i) => (
              <li key={i}>
                <span className="lime m">{String(i + 1).padStart(2, '0')}</span>
                <span className="body">{s}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {ex.mistakes.length > 0 && (
        <>
          <div className="m muted sec">// {t('ex.mistakes')}</div>
          <ul className="steps mistakes">
            {ex.mistakes.map((s, i) => (
              <li key={i}>
                <span className="pink m">✕</span>
                <span className="body">{s}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

export const hasTechnique = (ex?: Exercise) => !!ex && (ex.steps.length > 0 || ex.mistakes.length > 0);
