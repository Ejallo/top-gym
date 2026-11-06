import { t } from '../i18n';
import { fmt, isoWeek } from '../lib/dates';
import { Header } from '../components/Header';

export function Home({ onSettings }: { onSettings: () => void }) {
  const now = new Date();
  const sub = `// ${fmt(now, { weekday: 'short', day: '2-digit', month: 'short' })} · ${t('home.week', { n: isoWeek(now) })}`;
  return (
    <div className="screen">
      <Header
        title={
          <>
            {t('app.name')}
            <span className="lime">.</span>
          </>
        }
        sub={sub}
        onSettings={onSettings}
      />

      <div className="dash">
        <div className="h h-m">{t('home.noProgram.title')}</div>
        <p className="body" style={{ marginTop: 8 }}>
          {t('home.noProgram.text')}
        </p>
      </div>

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn outline small">{t('home.free')}</button>
        <button className="btn ghost small">{t('home.import')}</button>
      </div>
      <p className="m muted" style={{ marginTop: 10 }}>
        // {t('home.soon')}
      </p>
    </div>
  );
}
