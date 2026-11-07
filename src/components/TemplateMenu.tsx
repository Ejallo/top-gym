import { t } from '../i18n';
import { db, type Template } from '../lib/db';
import { Sheet } from './Sheet';

/** Template sheet: start (or continue the active workout), edit, delete. */
export function TemplateMenu({
  tpl,
  hasActive,
  onStart,
  onEdit,
  onClose,
}: {
  tpl: Template;
  hasActive: boolean;
  onStart: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const sets = tpl.items.reduce((a, x) => a + (x.sets || 0), 0);
  return (
    <Sheet onClose={onClose}>
      <div className="m muted">// {t('home.template')}</div>
      <div className="h h-l" style={{ marginTop: 6 }}>
        {tpl.name}
      </div>
      <p className="m muted" style={{ marginTop: 8 }}>
        {t('home.tplCount', { n: tpl.items.length, sets })}
      </p>
      <button className="btn lime" style={{ marginTop: 18 }} onClick={onStart}>
        {hasActive ? t('home.continueActive') : t('home.startTemplate')} →
      </button>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button className="btn ghost small" onClick={onEdit}>
          {t('ex.edit')}
        </button>
        <button
          className="btn ghost small pink-text"
          onClick={async () => {
            if (!confirm(t('home.deleteTemplate', { name: tpl.name }))) return;
            await db.templates.delete(tpl.id);
            onClose();
          }}
        >
          {t('home.delete')}
        </button>
      </div>
    </Sheet>
  );
}
