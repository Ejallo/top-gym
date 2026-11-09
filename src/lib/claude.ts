import { t } from '../i18n';
import { db, isWork, uid, type ExerciseType, type PlanItem, type Program, type Template } from './db';
import { allExercises, exercisesChanged, searchFull, type Exercise } from './exercises';
import { addFromFull } from '../components/FullSearch';
import { MUSCLES, type Muscle } from './muscles';

// ---------- 1. Prompt for Claude ----------

const TYPE_CODE: Record<ExerciseType, string> = { weight_reps: 'W', reps: 'R', time: 'T', cardio: 'C' };

const dateKey = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Short history of the last `days` days: one line per workout. */
export async function historyText(days = 28): Promise<string> {
  const since = Date.now() - days * 86400000;
  const list = await allExercises();
  const byId = new Map(list.map((e) => [e.id, e]));
  const ws = (await db.workouts.where('startedAt').above(since).toArray()).filter((w) => w.endedAt);
  return ws
    .map((w) => {
      const parts = w.entries
        .map((e) => {
          const ex = byId.get(e.exerciseId);
          const sets = e.sets
            .filter(isWork)
            .map(
              (s) =>
                (s.weight && s.reps ? `${s.weight}×${s.reps}` : s.reps ? `${s.reps}` : s.time ? `${s.time}s${s.distance ? `/${s.distance}km` : ''}` : '✓') +
                (s.effort ? `@${s.effort}` : '') +
                (s.comment ? ` «${s.comment}»` : ''),
            );
          if (!sets.length) return '';
          return `${ex?.name ?? e.exerciseId}: ${sets.join(', ')}${e.note ? ` (${e.note})` : ''}`;
        })
        .filter(Boolean);
      return `- ${dateKey(w.startedAt)} «${w.title}», ${Math.round(((w.endedAt ?? w.startedAt) - w.startedAt) / 60000)} ${t('unit.min')}: ${parts.join('; ')}${w.note ? ` | ${w.note}` : ''}`;
    })
    .join('\n');
}


/** Full text the user pastes into Claude: rules, format, catalog, optional history. */
export async function buildPrompt(withHistory: boolean): Promise<string> {
  const list = await allExercises();
  const catalog = list
    .map((e) => `${e.id} | ${e.name} | ${e.en} | ${t(`group.${e.group}`)}${e.category ? ` (${t(`cat.${e.category}`).toLowerCase()})` : ''} | ${TYPE_CODE[e.type]}${e.perHand ? ` (${t('claude.perHand')})` : ''}`)
    .join('\n');
  const history = withHistory ? await historyText() : '';
  return t('claude.prompt', {
    today: dateKey(Date.now()),
    muscles: MUSCLES.join(', '),
    history: history ? t('claude.history', { lines: history }) : t('claude.noHistory'),
    catalog,
  });
}

/** Copies text; falls back to a hidden textarea where the Clipboard API is missing. */
export async function copyText(text: string): Promise<boolean> {
  try {
    // Called synchronously from the tap handler: no await before this line
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

// ---------- 2. Parsing Claude's answer ----------

export interface PlanExercise {
  id: string | null;
  name?: string;
  en?: string;
  muscle?: string;
  sets?: number;
  reps?: string | number;
  weight?: number | null;
  time_sec?: number | null;
  distance_km?: number | null;
  rest?: string | null;
  note?: string | null;
}
export interface PlanDay {
  weekday: number;
  title: string;
  exercises: PlanExercise[];
}
export interface ParsedPlan {
  program: string;
  days: PlanDay[];
}

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1, пн: 1, понедельник: 1, tue: 2, tuesday: 2, вт: 2, вторник: 2, wed: 3, wednesday: 3, ср: 3, среда: 3,
  thu: 4, thursday: 4, чт: 4, четверг: 4, fri: 5, friday: 5, пт: 5, пятница: 5, sat: 6, saturday: 6, сб: 6, суббота: 6,
  sun: 7, sunday: 7, вс: 7, воскресенье: 7, mo: 1, di: 2, mi: 3, do: 4, fr: 5, sa: 6, so: 7,
  montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonntag: 7,
};

function weekdayOf(v: unknown): number | undefined {
  if (typeof v === 'number' && v >= 1 && v <= 7) return Math.round(v);
  if (typeof v === 'string') {
    const n = Number(v);
    if (n >= 1 && n <= 7) return n;
    return WEEKDAYS[v.trim().toLowerCase().replace('.', '')];
  }
}

const numOrUndef = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Finds the JSON in Claude's answer (code block or bare) and validates it. Throws a user-facing message. */
export function parsePlan(text: string): ParsedPlan {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  let raw = block ?? text;
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error(t('import.err.noJson'));
  raw = raw.slice(a, b + 1).replace(/,\s*([}\]])/g, '$1'); // tolerate trailing commas
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(t('import.err.badJson'));
  }
  const o = data as { program?: unknown; name?: unknown; days?: unknown };
  if (!Array.isArray(o.days) || !o.days.length) throw new Error(t('import.err.noDays'));
  const days: PlanDay[] = [];
  for (const d of o.days as Record<string, unknown>[]) {
    const weekday = weekdayOf(d.weekday ?? d.day);
    if (!weekday) throw new Error(t('import.err.weekday', { v: String(d.weekday ?? d.day) }));
    const exs = Array.isArray(d.exercises) ? (d.exercises as PlanExercise[]) : [];
    if (!exs.length) continue;
    days.push({ weekday, title: String(d.title ?? d.name ?? t('import.day', { n: weekday })), exercises: exs });
  }
  if (!days.length) throw new Error(t('import.err.noDays'));
  days.sort((x, y) => x.weekday - y.weekday);
  return { program: String(o.program ?? o.name ?? t('import.defaultName')), days };
}

// ---------- 3. Matching exercises ----------

export type MatchStatus = 'found' | 'full' | 'own';
export interface Match {
  day: number;
  index: number;
  status: MatchStatus;
  exerciseId?: string; // found
  fullId?: string; // full: to download on activation
  label: string;
}

const norm = (s?: string) => (s ?? '').toLowerCase().replaceAll('ё', 'е').replace(/\s+/g, ' ').trim();

/** Local base → full online base (by English name) → own exercise. Network errors fall through to 'own'. */
export async function matchPlan(plan: ParsedPlan): Promise<Match[]> {
  const list = await allExercises();
  const byId = new Map(list.map((e) => [e.id, e]));
  const byEn = new Map<string, Exercise>();
  const byName = new Map<string, Exercise>();
  for (const e of list) {
    if (!byEn.has(norm(e.en))) byEn.set(norm(e.en), e);
    if (!byName.has(norm(e.name))) byName.set(norm(e.name), e);
  }
  const fullCache = new Map<string, string | null>();
  const out: Match[] = [];
  for (const [day, d] of plan.days.entries()) {
    for (const [index, x] of d.exercises.entries()) {
      const label = x.name ?? x.en ?? x.id ?? '?';
      const local = (x.id && byId.get(x.id)) || byEn.get(norm(x.en)) || byName.get(norm(x.name));
      if (local) {
        out.push({ day, index, status: 'found', exerciseId: local.id, label: local.name });
        continue;
      }
      const en = norm(x.en);
      if (en) {
        if (!fullCache.has(en)) {
          try {
            const hits = await searchFull(en);
            fullCache.set(en, hits.find((h) => norm(h.name) === en)?.exerciseId ?? null);
          } catch {
            fullCache.set(en, null);
          }
        }
        const fullId = fullCache.get(en);
        if (fullId) {
          out.push({ day, index, status: 'full', fullId, label });
          continue;
        }
      }
      out.push({ day, index, status: 'own', label });
    }
  }
  return out;
}

// ---------- 4. Activation ----------

function typeOf(x: PlanExercise): ExerciseType {
  if (numOrUndef(x.distance_km)) return 'cardio';
  if (numOrUndef(x.time_sec) && !x.reps) return 'time';
  if (numOrUndef(x.weight)) return 'weight_reps';
  return 'weight_reps';
}

/** Downloads/creates missing exercises, stores the plan as a new program and makes it active. */
export async function activatePlan(plan: ParsedPlan, matches: Match[]): Promise<Program> {
  const idFor = new Map<string, string>(); // `${day}:${index}` → exercise id
  for (const m of matches) {
    const key = `${m.day}:${m.index}`;
    const x = plan.days[m.day].exercises[m.index];
    if (m.status === 'found') idFor.set(key, m.exerciseId!);
    else if (m.status === 'full') {
      try {
        const id = await addFromFull(m.fullId!);
        // Keep Claude's name in the UI language instead of the English one from the full base
        if (x.name) await db.customExercises.update(id, { name: x.name });
        idFor.set(key, id);
        continue;
      } catch {
        // offline: fall back to an own exercise below
      }
    }
    if (!idFor.has(key)) {
      const muscle = (MUSCLES as readonly string[]).includes(x.muscle ?? '') ? (x.muscle as Muscle) : 'abs';
      const id = uid('c_');
      await db.customExercises.put({
        id,
        name: x.name ?? x.en ?? '?',
        en: x.en,
        muscles: [muscle],
        type: typeOf(x),
        source: 'own',
        createdAt: Date.now(),
      });
      idFor.set(key, id);
    }
  }
  exercisesChanged();

  // Older programs stay stored; the new one becomes the active one
  for (const p of await db.programs.toArray()) if (p.active) await db.programs.update(p.id, { active: false });

  const programId = uid('p_');
  const templates: Template[] = plan.days.map((d, di) => ({
    id: uid('t_'),
    name: d.title,
    programId,
    createdAt: Date.now(),
    items: d.exercises.map((x, xi): PlanItem => ({
      exerciseId: idFor.get(`${di}:${xi}`)!,
      sets: Math.max(1, Math.min(20, Math.round(numOrUndef(x.sets) ?? 3))),
      reps: x.reps === undefined || x.reps === null ? undefined : String(x.reps),
      weight: numOrUndef(x.weight),
      time: numOrUndef(x.time_sec),
      distance: numOrUndef(x.distance_km),
      rest: x.rest ? String(x.rest) : undefined,
      note: x.note ? String(x.note) : undefined,
    })),
  }));
  await db.templates.bulkPut(templates);
  const program: Program = {
    id: programId,
    name: plan.program,
    days: plan.days.map((d, i) => ({ weekday: d.weekday, templateId: templates[i].id })),
    active: true,
    importedAt: Date.now(),
  };
  await db.programs.put(program);
  return program;
}
