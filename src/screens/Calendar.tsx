import { useState } from 'react';
import { t } from '../i18n';
import { fmt, monthCells, sameDay, weekdayNames } from '../lib/dates';
import { Header } from '../components/Header';

export function Calendar({ onSettings }: { onSettings: () => void }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const shift = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));

  return (
    <div className="screen">
      <Header
        title={
          <>
            {fmt(cursor, { month: 'long' })}
            <br />
            <span className="lime">{cursor.getFullYear()}.</span>
          </>
        }
        onSettings={onSettings}
      />

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button className="btn ghost small" onClick={() => shift(-1)}>
          ←
        </button>
        <button className="btn ghost small" onClick={() => shift(1)}>
          →
        </button>
      </div>

      <div className="cal">
        {weekdayNames().map((n) => (
          <div key={n} className="dow">
            {n.toUpperCase()}
          </div>
        ))}
        {cells.map((d, i) =>
          d ? (
            <div key={i} className={'day' + (sameDay(d, today) ? ' today' : '')}>
              {String(d.getDate()).padStart(2, '0')}
            </div>
          ) : (
            <div key={i} className="day blank" />
          ),
        )}
      </div>

      <p className="m muted" style={{ marginTop: 12 }}>
        {t('calendar.legend')}
      </p>
      <p className="m muted" style={{ marginTop: 6 }}>
        // {t('calendar.empty')}
      </p>
    </div>
  );
}
