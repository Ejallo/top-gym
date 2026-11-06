// TOP GYM API: «Sign in with Google» and per-record sync of each user's data (Cloudflare D1).
// Records merge last-write-wins by their updatedAt; every write gets a per-user sequence number,
// so a device pulls only what changed since its last sync. Exercise photos are stored separately.

const APP_URLS = {
  prod: 'https://ejallo.github.io/top-gym/',
  dev: 'http://localhost:5180/top-gym/',
};
const ALLOWED_ORIGINS = ['https://ejallo.github.io', 'http://localhost:5180'];
const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const TABLES = ['customExercises', 'templates', 'programs', 'workouts', 'kv'];
const MAX_RECORD = 200_000; // bytes of JSON per record
const MAX_PHOTO = 1_500_000;
const PULL_LIMIT = 500;

const b64urlDecode = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function cors(req) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

const json = (req, body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req) } });

let certCache = { keys: null, until: 0 };

async function googleKeys() {
  if (certCache.keys && Date.now() < certCache.until) return certCache.keys;
  const r = await fetch(GOOGLE_CERTS);
  const maxAge = Number(r.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] ?? 3600);
  certCache = { keys: (await r.json()).keys, until: Date.now() + maxAge * 1000 };
  return certCache.keys;
}

/** Verifies a Google ID token (RS256) and returns its claims, or null. */
async function verifyGoogleToken(token, clientId) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk || header.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!ok) return null;
  if (claims.aud !== clientId || !GOOGLE_ISSUERS.includes(claims.iss) || claims.exp * 1000 < Date.now()) return null;
  return claims;
}

const userAgentOf = (req) => (req.headers.get('User-Agent') ?? '').slice(0, 300);
const sha256 = async (s) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Creates (or refreshes) the user and returns a new session token; only its hash is stored. */
async function startSession(env, claims, userAgent) {
  const now = Date.now();
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, created, seq) VALUES (?1, ?2, ?3, ?4, 0) ON CONFLICT(id) DO UPDATE SET email = ?2, name = ?3',
  )
    .bind(claims.sub, claims.email ?? '', claims.name ?? claims.given_name ?? '', now)
    .run();
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created, user_agent, last_seen) VALUES (?1, ?2, ?3, ?4, ?3)')
    .bind(await sha256(token), claims.sub, now, userAgent)
    .run();
  return token;
}

async function userFromRequest(req, env) {
  const token = req.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare('SELECT user_id, user_agent, last_seen FROM sessions WHERE token_hash = ?1').bind(hash).first();
  if (!row) return null;
  const now = Date.now();
  const ua = userAgentOf(req);
  if (ua !== row.user_agent || !row.last_seen || now - row.last_seen > 60000) {
    await env.DB.prepare('UPDATE sessions SET user_agent = ?2, last_seen = ?3 WHERE token_hash = ?1').bind(hash, ua, now).run();
  }
  return row.user_id;
}

/** Google posts the credential here after sign-in (redirect mode); we bounce back into the app with a session. */
async function googleRedirect(req, env, target) {
  const form = await req.formData();
  const claims = await verifyGoogleToken(String(form.get('credential') ?? ''), env.GOOGLE_CLIENT_ID);
  const back = new URL(APP_URLS[target]);
  if (!claims) {
    back.hash = 'login-error';
    return Response.redirect(back.toString(), 303);
  }
  const session = await startSession(env, claims, userAgentOf(req));
  // The fragment never reaches any server; the app reads and clears it
  back.hash = new URLSearchParams({ login: session, name: claims.name ?? '', email: claims.email ?? '' }).toString();
  return Response.redirect(back.toString(), 303);
}

const validId = (s) => typeof s === 'string' && s.length > 0 && s.length <= 120 && /^[\w.:-]+$/.test(s);

/** Upserts changed records; a record only wins if it is newer than what the server has. */
async function push(req, env, userId) {
  const { changes } = await req.json();
  if (!Array.isArray(changes) || changes.length > 500) return json(req, { error: 'bad body' }, 400);
  const stmts = [];
  let k = 0;
  for (const c of changes) {
    if (!TABLES.includes(c.tbl) || !validId(c.id) || typeof c.updated !== 'number') return json(req, { error: 'bad record' }, 400);
    const body = c.deleted ? null : JSON.stringify(c.body ?? null);
    if (body && body.length > MAX_RECORD) return json(req, { error: 'too large', id: c.id }, 413);
    k++;
    stmts.push(
      env.DB.prepare(
        `INSERT INTO records (user_id, tbl, id, body, updated, deleted, seq)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT seq FROM users WHERE id = ?1) + ?7)
         ON CONFLICT(user_id, tbl, id) DO UPDATE SET body = excluded.body, updated = excluded.updated, deleted = excluded.deleted, seq = excluded.seq
         WHERE excluded.updated > records.updated`,
      ).bind(userId, c.tbl, c.id, body, c.updated, c.deleted ? 1 : 0, k),
    );
  }
  stmts.push(env.DB.prepare('UPDATE users SET seq = seq + ?2 WHERE id = ?1').bind(userId, k));
  await env.DB.batch(stmts); // one transaction: sequence numbers can't interleave between devices
  return json(req, { ok: true, count: k });
}

/** Records changed after `since`, oldest first. */
async function pull(req, env, userId) {
  const since = Number(new URL(req.url).searchParams.get('since') ?? 0);
  const { results } = await env.DB.prepare(
    'SELECT tbl, id, body, updated, deleted, seq FROM records WHERE user_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3',
  )
    .bind(userId, since, PULL_LIMIT)
    .all();
  const records = results.map((r) => ({ tbl: r.tbl, id: r.id, updated: r.updated, deleted: !!r.deleted, body: r.body ? JSON.parse(r.body) : null, seq: r.seq }));
  const seq = records.length ? records[records.length - 1].seq : since;
  return json(req, { records, seq, more: records.length === PULL_LIMIT });
}

async function photo(req, env, userId, key) {
  if (!validId(key)) return json(req, { error: 'bad id' }, 400);
  if (req.method === 'PUT') {
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO) return json(req, { error: 'bad size' }, 413);
    await env.DB.prepare('INSERT INTO photos (user_id, id, body, type) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, id) DO NOTHING')
      .bind(userId, key, bytes, req.headers.get('Content-Type') ?? 'image/jpeg')
      .run();
    return json(req, { ok: true });
  }
  const row = await env.DB.prepare('SELECT body, type FROM photos WHERE user_id = ?1 AND id = ?2').bind(userId, key).first();
  if (!row) return json(req, { error: 'not found' }, 404);
  return new Response(new Uint8Array(row.body), { headers: { 'Content-Type': row.type, 'Cache-Control': 'private, max-age=31536000', ...cors(req) } });
}

export default {
  async fetch(req, env) {
    const path = new URL(req.url).pathname;
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });

    if (req.method === 'POST' && (path === '/auth/google/prod' || path === '/auth/google/dev')) {
      return googleRedirect(req, env, path.endsWith('dev') ? 'dev' : 'prod');
    }
    if (path === '/') return json(req, { ok: true, service: 'top-gym-api' });

    const userId = await userFromRequest(req, env);
    if (!userId) return json(req, { error: 'unauthorized' }, 401);

    if (path === '/auth/me' && req.method === 'GET') {
      const u = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?1').bind(userId).first();
      return json(req, u ?? {});
    }
    if (path === '/auth/logout' && req.method === 'POST') {
      const token = req.headers.get('Authorization').slice(7);
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(await sha256(token)).run();
      return json(req, { ok: true });
    }
    if (path === '/sync' && req.method === 'GET') return pull(req, env, userId);
    if (path === '/sync' && req.method === 'POST') return push(req, env, userId);
    const m = path.match(/^\/photo\/(.+)$/);
    if (m && (req.method === 'GET' || req.method === 'PUT')) return photo(req, env, userId, decodeURIComponent(m[1]));

    return json(req, { error: 'not found' }, 404);
  },
};
