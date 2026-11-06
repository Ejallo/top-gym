import { t } from '../i18n';

export type Tab = 'workout' | 'calendar' | 'progress' | 'exercises';

const TABS: Tab[] = ['workout', 'calendar', 'progress', 'exercises'];

export function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  return (
    <nav className="nav">
      {TABS.map((id) => (
        <button key={id} className={tab === id ? 'on' : ''} onClick={() => onTab(id)}>
          {t(`tab.${id}`)}
        </button>
      ))}
    </nav>
  );
}
