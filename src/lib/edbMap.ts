// Maps ExerciseDB vocabulary (muscles, equipment) to app keys.
// Self-contained (no imports) so the Node build script can import it too.

type M =
  | 'chest' | 'lats' | 'traps' | 'lowerback' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'abs' | 'glutes' | 'quads' | 'hams' | 'calves' | 'adductors' | 'neck' | 'cardio';

const MUSCLE: Record<string, M> = {
  pectorals: 'chest', chest: 'chest', 'upper chest': 'chest', 'lower chest': 'chest', 'inner chest': 'chest', 'serratus anterior': 'chest',
  lats: 'lats', 'latissimus dorsi': 'lats', back: 'lats', 'upper back': 'traps', rhomboids: 'traps', 'middle back': 'traps',
  traps: 'traps', trapezius: 'traps', 'levator scapulae': 'neck', neck: 'neck', sternocleidomastoid: 'neck',
  spine: 'lowerback', 'lower back': 'lowerback', 'erector spinae': 'lowerback',
  delts: 'shoulders', deltoids: 'shoulders', shoulders: 'shoulders', 'rear deltoids': 'shoulders', 'front deltoids': 'shoulders', 'rotator cuff': 'shoulders',
  biceps: 'biceps', brachialis: 'biceps', triceps: 'triceps',
  forearms: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms', wrists: 'forearms', grip: 'forearms', 'grip muscles': 'forearms', hands: 'forearms',
  abs: 'abs', abdominals: 'abs', core: 'abs', obliques: 'abs', 'lower abs': 'abs', 'hip flexors': 'abs', waist: 'abs',
  glutes: 'glutes', abductors: 'glutes', 'hip abductors': 'glutes',
  quads: 'quads', quadriceps: 'quads', 'upper legs': 'quads', 'inner thighs': 'adductors', adductors: 'adductors', groin: 'adductors', 'hip adductors': 'adductors',
  hamstrings: 'hams', calves: 'calves', soleus: 'calves', shins: 'calves', ankles: 'calves', 'ankle stabilizers': 'calves', feet: 'calves', 'lower legs': 'calves',
  'cardiovascular system': 'cardio', cardio: 'cardio',
};

const BODY_PART: Record<string, M> = {
  back: 'lats', cardio: 'cardio', chest: 'chest', 'lower arms': 'forearms', 'lower legs': 'calves', neck: 'neck',
  shoulders: 'shoulders', 'upper arms': 'biceps', 'upper legs': 'quads', waist: 'abs',
};

export function mapMuscle(name: string): M | undefined {
  return MUSCLE[name.toLowerCase().trim()];
}

/** Primary + secondary app muscles for an ExerciseDB exercise. */
export function mapMuscles(target: string[], secondary: string[], bodyParts: string[]): { muscles: M[]; secondary: M[] } {
  const prim = [...new Set(target.map(mapMuscle).filter(Boolean) as M[])];
  if (!prim.length) prim.push(BODY_PART[bodyParts[0]] ?? 'abs');
  const sec = [...new Set(secondary.map(mapMuscle).filter(Boolean) as M[])].filter((m) => !prim.includes(m));
  return { muscles: prim, secondary: sec };
}

const EQUIPMENT: Record<string, string> = {
  barbell: 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell', 'ez barbell': 'ezbar', 'ez bar': 'ezbar',
  'suspension trainer': 'bodyweight', 'ab wheel': 'other', towel: 'other', 'ski ergometer': 'cardio',
  dumbbell: 'dumbbell', cable: 'cable', 'leverage machine': 'machine', 'sled machine': 'machine', 'smith machine': 'smith',
  'body weight': 'bodyweight', bodyweight: 'bodyweight', assisted: 'assisted', weighted: 'weighted',
  kettlebell: 'kettlebell', band: 'band', 'resistance band': 'band', rope: 'rope', 'medicine ball': 'ball', 'stability ball': 'ball',
  'bosu ball': 'ball', roller: 'other', 'wheel roller': 'other', hammer: 'other', tire: 'other',
  'stationary bike': 'cardio', 'elliptical machine': 'cardio', 'skierg machine': 'cardio', 'stepmill machine': 'cardio', 'upper body ergometer': 'cardio',
};

export function mapEquipment(list: string[]): string {
  return EQUIPMENT[(list[0] ?? '').toLowerCase()] ?? 'other';
}

/** Guess how the exercise is logged. */
export function guessType(name: string, bodyParts: string[], equipment: string): 'weight_reps' | 'reps' | 'time' | 'cardio' {
  const n = name.toLowerCase();
  if (/burpee/.test(n)) return 'reps';
  if (/\b(plank|hold|stretch|wall sit|isometric|l-sit|v-sit|side bridge|jump rope|jack|climber|bear crawl|high knee|hops|scissor jumps|star jump|squat jump|push to run)\b/.test(n))
    return 'time';
  if (equipment === 'cardio' || /\b(run|jog|bike|cycling|rowing|treadmill|elliptical|stepmill|ergometer)\b/.test(n)) return 'cardio';
  if (bodyParts.includes('cardio')) return 'time';
  if (equipment === 'bodyweight' || equipment === 'assisted' || equipment === 'band' || equipment === 'ball') return 'reps';
  return 'weight_reps';
}
