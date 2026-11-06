// App muscle vocabulary. Used for filters, exercise cards and (later) the 3D load heatmap.

export const MUSCLES = [
  'chest',
  'lats',
  'traps',
  'lowerback',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'abs',
  'glutes',
  'quads',
  'hams',
  'calves',
  'adductors',
  'neck',
  'cardio',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const GROUPS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio'] as const;
export type Group = (typeof GROUPS)[number];

const GROUP_OF: Record<Muscle, Group> = {
  chest: 'chest',
  lats: 'back',
  traps: 'back',
  lowerback: 'back',
  neck: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  abs: 'core',
  glutes: 'legs',
  quads: 'legs',
  hams: 'legs',
  calves: 'legs',
  adductors: 'legs',
  cardio: 'cardio',
};

export function groupOf(m: Muscle): Group {
  return GROUP_OF[m];
}
