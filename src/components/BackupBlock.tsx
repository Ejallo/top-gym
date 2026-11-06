import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { fmt } from '../lib/dates';
import { exportJson, inspectBackup, lastBackupAt, restoreBackup, saveBackup, type BackupInfo } from '../lib/backup';

type Parsed = ReturnType<typeof inspectBackup>;

/** Export all data to one JSON file and restore from it. */
export function BackupBlock() {
  // Built ahead of the tap: iOS only opens the share sheet synchronously inside the gesture
  const [json, setJson] = useState<string | null>(null);
  const [last, setLast] = useState<number | undefined>();
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const prepare = () => {
    setJson(null);
    void exportJson().then(setJson);
    void lastBackupAt().then(setLast);
  };
  useEffect(prepare, []);

  const save = () => {
    if (!json) return;
    saveBackup(json)
      .then((ok) => {
        if (ok) {
          setStatus({ kind: 'ok', text: t('backup.saved') });
          setLast(Date.now());
        }
      })
      .catch(() => setStatus({ kind: 'err', text: t('backup.saveFailed') }));
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setStatus(null);
    try {
      setPending(inspectBackup(await f.text()));
    } catch (e) {
      setStatus({ kind: 'err', text: t(`backup.err.${(e as Error).message}` as 'backup.err.json') });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const restore = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await restoreBackup(pending);
      setStatus({ kind: 'ok', text: t('backup.restored') });
      setPending(null);
      prepare();
    } catch {
      setStatus({ kind: 'err', text: t('backup.restoreFailed') });
    }
    setBusy(false);
  };

  const size = json ? Math.max(1, Math.round(json.length / 1024)) : 0;

  return (
    <div className="card">
      <p className="body">{t('backup.text')}</p>
      <p className="m muted" style={{ marginTop: 8 }}>
        {last ? t('backup.last', { date: fmt(new Date(last), { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) }) : t('backup.never')}
      </p>
      <button className="btn lime" style={{ marginTop: 10 }} disabled={!json} onClick={save}>
        {json ? t('backup.save', { kb: size }) : t('backup.preparing')}
      </button>
      <button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => fileRef.current?.click()}>
        {t('backup.restore')}
      </button>
      <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {status && <p className={'status ' + (status.kind === 'ok' ? 'lime' : 'pink')}>{status.text}</p>}

      {pending && <Confirm info={pending.info} busy={busy} onYes={() => void restore()} onNo={() => setPending(null)} />}
    </div>
  );
}

function Confirm({ info, busy, onYes, onNo }: { info: BackupInfo; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <div className="dash" style={{ marginTop: 12, borderColor: 'var(--pink)' }}>
      <div className="m pink">{t('backup.confirmTitle')}</div>
      <p className="body" style={{ marginTop: 6 }}>
        {t('backup.confirmText', {
          date: fmt(new Date(info.createdAt), { day: 'numeric', month: 'long', year: 'numeric' }),
          workouts: info.workouts,
          templates: info.templates,
          exercises: info.exercises,
        })}
      </p>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn pink small" disabled={busy} onClick={onYes}>
          {busy ? '…' : t('backup.confirmYes')}
        </button>
        <button className="btn ghost small" onClick={onNo}>
          {t('backup.confirmNo')}
        </button>
      </div>
    </div>
  );
}
