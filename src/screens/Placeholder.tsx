import type { Key } from '../i18n/ru';
import { t } from '../i18n';
import { Header } from '../components/Header';

/** Tab that is built in a later stage. */
export function Placeholder({ title, text, onSettings }: { title: Key; text: Key; onSettings: () => void }) {
  return (
    <div className="screen">
      <Header title={t(title)} onSettings={onSettings} />
      <div className="dash">
        <p className="body">{t(text)}</p>
      </div>
    </div>
  );
}
