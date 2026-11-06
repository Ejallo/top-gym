import { db, type Template, type Workout } from './db';

/**
 * Dev-only sample data for screenshots: ?demo seeds a template, two finished workouts
 * and one running workout. Never runs in production builds.
 */
export async function seedDemo(): Promise<Workout | undefined> {
  if (!import.meta.env.DEV) return;
  const p = new URLSearchParams(location.search).get('demo');
  if (p === null) return;
  const BENCH = 'EIeI8Vf';
  const SKULL = (await findId('barbell lying triceps extension skull crusher')) ?? BENCH;
  const DIPS = (await findId('triceps dip')) ?? BENCH;
  const tpl: Template = {
    id: 't_demo',
    name: 'Грудь + трицепс',
    createdAt: Date.now(),
    items: [
      { exerciseId: BENCH, sets: 4, reps: '8-10', weight: 70, rest: '2 мин' },
      { exerciseId: SKULL, sets: 3, reps: '10-12', weight: 30, rest: '90 сек', note: 'локти не разводить' },
      { exerciseId: DIPS, sets: 3, reps: '12', rest: '90 сек' },
    ],
  };
  await db.templates.put(tpl);
  await db.templates.put({ ...tpl, id: 't_demo2', name: 'Ноги', items: tpl.items.slice(0, 2) });
  const day = 86400000;
  const done = (id: string, daysAgo: number, w1: number): Workout => ({
    id,
    title: 'Грудь + трицепс',
    templateId: tpl.id,
    startedAt: Date.now() - daysAgo * day,
    endedAt: Date.now() - daysAgo * day + 58 * 60000,
    entries: [
      { exerciseId: BENCH, rest: '2 мин', sets: [60, w1, w1, w1].map((w, i) => ({ weight: w, reps: i ? 8 : 10, done: true })) },
      { exerciseId: SKULL, sets: [30, 30, 30].map((w) => ({ weight: w, reps: 12, done: true })) },
    ],
  });
  await db.workouts.bulkPut([done('w_demo1', 2, 70), done('w_demo2', 5, 67.5)]);
  // 8 weeks of history: bench creeping up, a legs day each week
  const SQUAT = (await findId('barbell full squat')) ?? BENCH;
  const history: Workout[] = [];
  for (let wk = 1; wk <= 8; wk++) {
    const benchW = 72.5 - wk * 1.25;
    history.push({ ...done(`w_demo_b${wk}`, wk * 7 + 1, benchW) });
    history.push({
      id: `w_demo_l${wk}`,
      title: 'Ноги',
      startedAt: Date.now() - (wk * 7 + 3) * day,
      endedAt: Date.now() - (wk * 7 + 3) * day + 50 * 60000,
      entries: [{ exerciseId: SQUAT, rest: '3 мин', sets: [1, 2, 3, 4].map(() => ({ weight: 100 - wk * 2.5, reps: 5, done: true })) }],
    });
  }
  await db.workouts.bulkPut(history);
  const running: Workout = {
    id: 'w_demo_run',
    title: 'Грудь + трицепс',
    templateId: tpl.id,
    startedAt: Date.now() - 34 * 60000,
    entries: tpl.items.map((it, i) => ({
      exerciseId: it.exerciseId,
      rest: it.rest,
      note: it.note,
      plan: { sets: it.sets, reps: it.reps, weight: it.weight },
      sets: Array.from({ length: it.sets }, (_, k) =>
        i === 0 && k < 2 ? { weight: k ? 72.5 : 70, reps: 8, done: true } : { done: false },
      ),
    })),
  };
  if (p === 'workout' || p === 'home') await db.workouts.put(running);
  return p === 'workout' ? running : undefined;
}

async function findId(en: string): Promise<string | undefined> {
  const rows = (await fetch(`${import.meta.env.BASE_URL}data/exercises.json`).then((r) => r.json())) as { id: string; en: string }[];
  return rows.find((r) => r.en.toLowerCase() === en)?.id;
}
