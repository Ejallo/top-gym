import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../i18n';
import { db, type Folder, type Template } from '../lib/db';
import { Header } from '../components/Header';
import { TemplateEditor } from '../components/TemplateEditor';
import { TemplateMenu } from '../components/TemplateMenu';

/** Home block X / Y: its own list of workout templates. */
export function FolderScreen({ folder, hasActive, onStart, onBack }: { folder: Folder; hasActive: boolean; onStart: (tpl: Template) => void; onBack: () => void }) {
  const templates = useLiveQuery(() => db.templates.orderBy('name').filter((x) => x.folder === folder).toArray(), [folder]);
  const [editing, setEditing] = useState<Template | 'new' | null>(null);
  const [menu, setMenu] = useState<Template | null>(null);
  const color = folder === 'x' ? 'lime' : 'pink';

  return (
    <div className="screen">
      <button className="m muted" onClick={onBack} style={{ marginBottom: 12 }}>
        {t('settings.back')}
      </button>
      <Header title={<span className={color}>{t(`folder.${folder}`)}</span>} sub={`// ${t('folder.count', { n: templates?.length ?? 0 })}`} />

      <div className="row sec">
        <span className="m muted">// {t('home.templates')}</span>
        <button className={'m ' + color} onClick={() => setEditing('new')}>
          + {t('home.newTemplate')}
        </button>
      </div>
      {templates && templates.length === 0 && (
        <button className="dash-btn m" style={{ marginTop: 0 }} onClick={() => setEditing('new')}>
          {t('folder.empty')}
        </button>
      )}
      {templates?.map((tpl, i) => (
        <button key={tpl.id} className={'tpl-card' + (i === 0 ? ' first' : '')} onClick={() => setMenu(tpl)}>
          <span className="m">{t('home.tplCount', { n: tpl.items.length, sets: tpl.items.reduce((a, x) => a + (x.sets || 0), 0) })}</span>
          <b className="h h-m">{tpl.name}</b>
        </button>
      ))}

      {menu && (
        <TemplateMenu
          tpl={menu}
          hasActive={hasActive}
          onStart={() => {
            const tpl = menu;
            setMenu(null);
            onStart(tpl);
          }}
          onEdit={() => {
            setEditing(menu);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
      {editing && <TemplateEditor folder={folder} edit={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
