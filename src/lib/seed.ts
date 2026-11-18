import { db, type Template } from './db';

/**
 * Ready-made workouts that land in a home block once. A key in kv marks it as delivered,
 * so a template the user later deletes or edits does not come back.
 */
const SEEDS: { key: string; tpl: Template }[] = [
  {
    key: 'seed:back-30',
    tpl: {
      id: 'seed_back_30',
      name: 'Спина: комплекс на 30 дней',
      createdAt: 1763460000000,
      folder: 'x',
      items: [
        { exerciseId: 'v_supine_knee_drop', sets: 2, reps: '10', note: 'Ежедневно в течение 30 дней' },
        { exerciseId: 'v_quadruped_open_reach', sets: 2, reps: '10', note: 'Каждую сторону' },
        { exerciseId: 'v_bridge_leg_raise', sets: 2, reps: '10', note: 'Каждую ногу' },
      ],
    },
  },
];

export async function seedTemplates(): Promise<void> {
  for (const s of SEEDS) {
    if (await db.kv.get(s.key)) continue;
    await db.transaction('rw', db.templates, db.kv, async () => {
      if (!(await db.templates.get(s.tpl.id))) await db.templates.put(s.tpl);
      await db.kv.put({ key: s.key, value: true });
    });
  }
}
