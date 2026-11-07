import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { fmt } from '../lib/dates';
import { ACCOUNT_API, claimPair, pairNonce, signOut, syncNow, useSyncStatus } from '../lib/sync';

// OAuth client shared with Deutsch Reader (public value)
const GOOGLE_CLIENT_ID = '638517168513-2n5pta330caejvn46sfljo74dd4tlhk8.apps.googleusercontent.com';

type Gis = { accounts: { id: { initialize: (o: object) => void; renderButton: (el: HTMLElement, o: object) => void } } };
let loading: Promise<Gis> | null = null;
function loadGis(): Promise<Gis> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve((window as unknown as { google: Gis }).google);
    s.onerror = () => {
      loading = null;
      reject(new Error('load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * «Sign in with Google» in redirect mode: popups don't work in an iOS home-screen app, so Google posts
 * the sign-in to our server. The session is handed over by a pairing nonce (see claimPair), because on
 * iOS the redirect back may open in Safari rather than in the app.
 */
function GoogleButton() {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(() => {
    const failed = sessionStorage.getItem('loginError');
    sessionStorage.removeItem('loginError');
    return failed ? t('account.loginFailed') : '';
  });

  const [elsewhere] = useState(() => {
    const v = sessionStorage.getItem('pairedElsewhere');
    sessionStorage.removeItem('pairedElsewhere');
    return !!v;
  });

  // Sign-in may finish in another browser context: keep asking the server while this block is open
  useEffect(() => {
    const id = setInterval(() => void claimPair(), 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const dev = location.hostname === 'localhost';
    Promise.all([loadGis(), pairNonce()])
      .then(([google, nonce]) => {
        google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          ux_mode: 'redirect',
          login_uri: `${ACCOUNT_API}/auth/google/${dev ? 'dev' : 'prod'}`,
          nonce,
        });
        if (ref.current)
          google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large', shape: 'rectangular', text: 'signin_with', locale: 'ru', width: 300 });
      })
      .catch(() => setError(t('account.gisFailed')));
  }, []);

  return (
    <div>
      {elsewhere && <p className="status lime">{t('account.pairedElsewhere')}</p>}
      <div ref={ref} className="google-btn" />
      {error && <p className="status pink">{error}</p>}
    </div>
  );
}

/** Settings block: sign in with Google, sync status, sign out. */
export function AccountBlock() {
  const s = useSyncStatus();

  if (!s.account)
    return (
      <div className="card">
        <p className="body">{t('account.pitch')}</p>
        <div style={{ marginTop: 12 }}>
          <GoogleButton />
        </div>
      </div>
    );

  const state =
    s.state === 'syncing'
      ? t('account.syncing')
      : s.state === 'error'
        ? t('account.error')
        : s.state === 'offline'
          ? t('account.offline')
          : s.lastSync
            ? t('account.synced', { time: fmt(new Date(s.lastSync), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) })
            : t('account.notYet');

  return (
    <div className="card">
      <div className="row">
        <div style={{ minWidth: 0 }}>
          <b className="h h-s">{s.account.name || s.account.email}</b>
          <div className="m muted" style={{ marginTop: 4, textTransform: 'none' }}>
            {s.account.email}
          </div>
        </div>
        <span className="m lime">●</span>
      </div>
      <p className={'status ' + (s.state === 'error' ? 'pink' : s.state === 'idle' ? 'lime' : 'muted')}>
        {state}
        {s.pending > 0 && s.state !== 'syncing' && ` · ${t('account.pending', { n: s.pending })}`}
      </p>
      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn outline small" disabled={s.state === 'syncing'} onClick={() => void syncNow()}>
          {t('account.syncNow')}
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            if (confirm(t('account.signOutConfirm'))) void signOut();
          }}
        >
          {t('account.signOut')}
        </button>
      </div>
    </div>
  );
}
