import type { ReactNode } from 'react';

/** Screen header: big title, mono subline, gear that opens settings. */
export function Header({ title, sub, onSettings }: { title: ReactNode; sub?: ReactNode; onSettings?: () => void }) {
  return (
    <div className="top">
      <div>
        <div className="h h-l">{title}</div>
        {sub && <div className="m muted sub">{sub}</div>}
      </div>
      {onSettings && (
        <button className="icon-btn" onClick={onSettings} aria-label="settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
          </svg>
        </button>
      )}
    </div>
  );
}
