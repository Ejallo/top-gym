import { useEffect, useState } from 'react';
import { LANGS, getLang, setLang, t, type Lang } from '../i18n';
import { checkForUpdate, hardReload, useUpdateAvailable } from '../lib/update';
import { baseMediaUrls, cachedCount, downloadAllMedia } from '../lib/offline';
import { BackupBlock } from '../components/BackupBlock';
import { AccountBlock } from '../components/AccountBlock';

// Total size of public/media, shown as an estimate before downloading
const MEDIA_MB = 40;

function OfflineMedia() {
  const [state, setState] = useState<{ done: number; total: number; running: boolean; failed: boolean } | null>(null);

  useEffect(() => {
    void baseMediaUrls().then(async (urls) => setState({ done: await cachedCount(urls), total: urls.length, running: false, failed: false }));
  }, []);

  const run = async () => {
    setState((s) => (s ? { ...s, running: true, failed: false } : s));
    const r = await downloadAllMedia((done, total) => setState({ done, total, running: true, failed: false }));
    setState({ ...r, running: false, failed: r.done < r.total });
  };

  const complete = state && state.total > 0 && state.done >= state.total;
  return (
    <div className="card">
      <p className="body">{t('settings.offline.text', { mb: MEDIA_MB })}</p>
      {complete ? (
        <p className="status lime">{t('settings.offline.done')}</p>
      ) : (
        <>
          <button className="btn outline small" style={{ marginTop: 10 }} disabled={!state || state.running} onClick={() => void run()}>
            {state?.running ? t('settings.offline.progress', { done: state.done, total: state.total }) : t('settings.offline.download')}
          </button>
          {state && !state.running && state.done > 0 && (
            <p className={'status ' + (state.failed ? 'pink' : 'muted')}>
              {state.failed ? t('settings.offline.failed', { done: state.done, total: state.total }) : `${state.done} / ${state.total}`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

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

      {/* Account */}
      <div className="m muted" style={{ marginBottom: 8 }}>// {t('account.title')}</div>
      <AccountBlock />
      <div style={{ height: 18 }} />

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

      {/* Offline media */}
      <div className="m muted sec">// {t('settings.offline')}</div>
      <OfflineMedia />

      {/* Backup */}
      <div className="m muted sec">// {t('settings.backup')}</div>
      <BackupBlock />
    </div>
  );
}
