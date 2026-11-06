import { useEffect, useState } from 'react';
import { LANGS, getLang, setLang, t, type Lang } from '../i18n';
import { checkForUpdate, hardReload, useUpdateAvailable } from '../lib/update';

type UpdState = 'idle' | 'checking' | 'latest' | 'offline';

export function Settings({ onBack }: { onBack: () => void }) {
  const available = useUpdateAvailable();
  const [upd, setUpd] = useState<UpdState>('idle');
  const [persisted, setPersisted] = useState<boolean | null>(null);

  useEffect(() => {
    void navigator.storage?.persisted?.().then(setPersisted, () => setPersisted(false));
  }, []);

  const check = async () => {
    setUpd('checking');
    const r = await checkForUpdate();
    setUpd(r === 'available' ? 'idle' : r);
  };

  return (
    <div className="screen">
      <button className="m muted" onClick={onBack} style={{ marginBottom: 12 }}>
        {t('settings.back')}
      </button>
      <div className="h h-l" style={{ marginBottom: 18 }}>
        {t('settings.title')}
      </div>

      {/* Update */}
      <div className="card">
        <div className="row">
          <span className="m muted">{t('settings.version')}</span>
          <span className="m">{__BUILD__}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          {available ? (
            <>
              <p className="status lime">{t('settings.update.available')}</p>
              <button className="btn pink" style={{ marginTop: 8 }} onClick={() => void hardReload()}>
                {t('settings.update.install')}
              </button>
            </>
          ) : (
            <button className="btn lime" onClick={() => void check()} disabled={upd === 'checking'}>
              {upd === 'checking' ? t('settings.update.checking') : t('settings.update.check')}
            </button>
          )}
          {upd === 'latest' && !available && <p className="status lime">✓ {t('settings.update.latest')}</p>}
          {upd === 'offline' && <p className="status pink">{t('settings.update.offline')}</p>}
          {(upd === 'latest' || upd === 'offline') && !available && (
            <button className="link" onClick={() => void hardReload()}>
              {t('settings.update.force')}
            </button>
          )}
        </div>
      </div>

      {/* Language */}
      <div className="m muted sec">// {t('settings.language')}</div>
      {LANGS.map((l) => (
        <button
          key={l.id}
          className="list-item"
          style={{ width: '100%' }}
          onClick={() => l.id !== getLang() && setLang(l.id as Lang)}
        >
          <span className="h h-s">{l.label}</span>
          {l.id === getLang() && <span className="m lime">✓</span>}
        </button>
      ))}

      {/* Storage */}
      <div className="m muted sec">// {t('settings.storage')}</div>
      <div className="list-item">
        <span className={'m ' + (persisted ? 'lime' : 'pink')}>
          {persisted ? '✓ ' + t('settings.storage.persisted') : t('settings.storage.notPersisted')}
        </span>
      </div>

      {/* Backup */}
      <div className="m muted sec">// {t('settings.backup')}</div>
      <div className="dash">
        <p className="body">{t('settings.backup.soon')}</p>
      </div>
    </div>
  );
}
