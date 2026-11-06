import { useEffect, type ReactNode } from 'react';
import { t } from '../i18n';

/** Full-screen panel over the current screen (detail views, forms). */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="sheet">
      <div className="sheet-in">
        <button className="m muted" onClick={onClose} style={{ marginBottom: 12 }}>
          ← {t('ex.close')}
        </button>
        {children}
      </div>
    </div>
  );
}
