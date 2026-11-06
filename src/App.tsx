import { useEffect, useState } from 'react';
import { t } from './i18n';
import { hardReload, useUpdateAvailable } from './lib/update';
import { TabBar, type Tab } from './components/TabBar';
import { Home } from './screens/Home';
import { Calendar } from './screens/Calendar';
import { Placeholder } from './screens/Placeholder';
import { Exercises } from './screens/Exercises';
import { Settings } from './screens/Settings';

export function App() {
  // ?screen=calendar|progress|exercises|settings opens a screen directly (handy for screenshots)
  const initial = new URLSearchParams(location.search).get('screen');
  const [tab, setTab] = useState<Tab>(
    initial === 'calendar' || initial === 'progress' || initial === 'exercises' ? initial : 'workout',
  );
  const [settings, setSettings] = useState(initial === 'settings');
  const updateAvailable = useUpdateAvailable();
  const openSettings = () => setSettings(true);

  // Braces matter: new Chrome returns a Promise from scrollTo, and an effect must not return it
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, settings]);

  return (
    <div className="app">
      {updateAvailable && !settings && (
        <div className="banner">
          <span className="m">{t('banner.update')}</span>
          <button onClick={() => void hardReload()}>{t('banner.update.action')}</button>
        </div>
      )}

      {settings ? (
        <Settings onBack={() => setSettings(false)} />
      ) : (
        <>
          {tab === 'workout' && <Home onSettings={openSettings} />}
          {tab === 'calendar' && <Calendar onSettings={openSettings} />}
          {tab === 'progress' && <Placeholder title="progress.title" text="progress.empty" onSettings={openSettings} />}
          {tab === 'exercises' && <Exercises onSettings={openSettings} />}
        </>
      )}

      <TabBar
        tab={tab}
        onTab={(next) => {
          setSettings(false);
          setTab(next);
        }}
      />
    </div>
  );
}
