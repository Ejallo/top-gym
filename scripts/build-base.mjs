// Builds the bundled exercise base from the downloaded ExerciseDB catalog:
//   public/data/exercises.json     language-neutral rows
//   public/data/exercises.ru.json  id -> { n: name, s: steps }
//   public/data/exercises.de.json  same in German (scripts/de: by English name, extras/yoga by id)
//   + common mistakes from scripts/mistakes (see build-mistakes.mjs)
//   public/media/<id>.gif          gifs (skipped if already downloaded)
// Usage: node scripts/build-base.mjs [--no-media]
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { mapMuscles, mapEquipment, guessType } from '../src/lib/edbMap.ts';

const root = new URL('../', import.meta.url);
const read = async (p) => readFile(new URL(p, root), 'utf8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const catalog = JSON.parse(await read('scripts/raw/catalog.json')).items;
const byName = new Map();
for (const x of catalog) if (!byName.has(x.name.toLowerCase())) byName.set(x.name.toLowerCase(), x);
// Some ids have no gif on the CDN: use a duplicate entry of the same exercise that has one
const override = JSON.parse(await read('scripts/media-override.json'));
for (const [name, id] of Object.entries(override)) byName.set(name, catalog.find((x) => x.exerciseId === id));

// Sections '# == stretch', '# == yoga' and '# == rehab' set the category; '| side' marks one-side-at-a-time holds
const picked = [];
let section = '';
for (const raw of (await read('scripts/selection.txt')).split('\n')) {
  const line = raw.trim();
  if (line.startsWith('# ==')) section = line.slice(4).trim().split(/\s/)[0];
  if (!line || line.startsWith('#')) continue;
  const [name, flag] = line.split('|').map((x) => x.trim());
  picked.push({ name, category: ['stretch', 'yoga', 'rehab'].includes(section) ? section : undefined, perSide: flag === 'side' || undefined });
}
const names = picked.map((p) => p.name);
// Logging type where the name-based guess is wrong
const TYPE_FIX = { 'side plank hip abduction': 'reps' };

const ru = {};
for (const f of await readdir(new URL('scripts/ru/', root))) Object.assign(ru, JSON.parse(await read(`scripts/ru/${f}`)));
const de = {};
for (const f of await readdir(new URL('scripts/de/', root))) Object.assign(de, JSON.parse(await read(`scripts/de/${f}`)));

// Classics that the open catalog lacks: shipped without a gif
const EXTRAS = [
  { id: 'x_plank', en: 'plank', muscles: ['abs'], secondary: ['shoulders', 'glutes'], equipment: 'bodyweight', type: 'time',
    ru: { n: 'Планка', s: ['Упор на предплечья и носки, локти под плечами.', 'Тело — прямая линия, пресс и ягодицы напряжены.', 'Удерживай заданное время, дыши ровно.'] } },
  { id: 'x_hip_thrust', en: 'barbell hip thrust', muscles: ['glutes'], secondary: ['hams', 'quads'], equipment: 'barbell', type: 'weight_reps',
    ru: { n: 'Ягодичный мост со штангой от скамьи (хип-траст)', s: ['Лопатки на скамье, штанга на тазу через подушку.', 'Подними таз до прямой линии от плеч до колен.', 'Сожми ягодицы вверху и опусти медленно.'] } },
  { id: 'x_rowing', en: 'rowing machine', muscles: ['cardio'], secondary: ['lats', 'quads'], equipment: 'cardio', type: 'cardio',
    ru: { n: 'Гребной тренажёр', s: ['Толкнись ногами, затем отклонись и дотяни рукоять к животу.', 'Вернись в обратном порядке: руки, корпус, ноги.', 'Запиши время и дистанцию.'] } },
  { id: 'x_wall_sit', en: 'wall sit', muscles: ['quads'], secondary: ['glutes'], equipment: 'bodyweight', type: 'time',
    ru: { n: 'Стульчик у стены', s: ['Спиной к стене, опустись до прямого угла в коленях.', 'Стопы под коленями, спина прижата.', 'Удерживай заданное время.'] } },
];

// Yoga poses the catalog lacks: drawn as pictograms (scripts/pictograms.mjs -> public/pict/<key>.svg)
const Y = (key, en, muscles, secondary, perSide, n, s) => ({ id: `y_${key}`, en, muscles, secondary, equipment: 'bodyweight', type: 'time', category: 'yoga', perSide: perSide || undefined, pict: key, ru: { n, s } });
const YOGA = [
  Y('mountain', 'mountain pose', ['abs'], ['glutes'], false, 'Гора', ['Встань прямо, стопы вместе или на ширине таза.', 'Вытянись макушкой вверх, плечи вниз, руки вдоль тела.', 'Вес равномерно на стопах, дыши ровно.']),
  Y('tree', 'tree pose', ['glutes'], ['calves', 'abs'], true, 'Дерево', ['Встань на одну ногу, стопу другой поставь на внутреннюю сторону бедра или голени (не на колено).', 'Ладони сложи у груди или подними вверх.', 'Взгляд в одну точку, держи и смени ногу.']),
  Y('warrior1', 'warrior I', ['quads'], ['glutes', 'shoulders'], true, 'Воин I', ['Широкий шаг вперёд, переднее колено над пяткой, задняя стопа под углом 45°.', 'Таз развёрнут вперёд, руки подняты вверх.', 'Держи, затем смени ногу.']),
  Y('warrior2', 'warrior II', ['quads'], ['adductors', 'shoulders'], true, 'Воин II', ['Ноги широко, передняя стопа вперёд, задняя поперёк.', 'Согни переднее колено над пяткой, руки в стороны параллельно полу.', 'Взгляд через переднюю руку. Смени сторону.']),
  Y('triangle', 'triangle pose', ['hams'], ['adductors', 'abs'], true, 'Треугольник', ['Ноги широко, передняя стопа вперёд, обе ноги прямые.', 'Потянись вперёд и наклонись: нижняя рука к голени, верхняя вверх.', 'Грудь раскрыта, держи и смени сторону.']),
  Y('chair', 'chair pose', ['quads'], ['glutes', 'shoulders'], false, 'Стул', ['Стопы вместе, согни колени, таз назад, как будто садишься.', 'Руки подними вверх, корпус чуть вперёд.', 'Вес на пятках, держи.']),
  Y('forwardfold', 'standing forward fold', ['hams'], ['lowerback', 'calves'], false, 'Наклон стоя', ['Стопы на ширине таза, наклонись вперёд от таза.', 'Колени можно чуть согнуть, голова свободно висит.', 'Руки к полу или к голеням, держи.']),
  Y('downdog', 'downward facing dog', ['hams'], ['calves', 'shoulders', 'lats'], false, 'Собака мордой вниз', ['Из упора на четвереньках подними таз вверх и назад.', 'Руки и спина в одну линию, пятки тянутся к полу.', 'Колени можно согнуть, если спина округляется. Дыши ровно.']),
  Y('cobra', 'cobra pose', ['lowerback'], ['abs', 'chest'], false, 'Кобра', ['Ляг на живот, ладони под плечами.', 'Поднимай грудь силой спины, локти слегка согнуты.', 'Лобок на полу, плечи вниз, держи.']),
  Y('child', 'child pose', ['lowerback'], ['lats', 'glutes'], false, 'Поза ребёнка', ['Сядь на пятки, колени чуть шире таза.', 'Наклонись вперёд, лоб на пол, руки вытяни вперёд.', 'Расслабься и дыши в спину.']),
  Y('catcow', 'cat cow', ['lowerback'], ['abs'], false, 'Кошка-корова', ['Встань на четвереньки: руки под плечами, колени под тазом.', 'На выдохе округли спину вверх, подбородок к груди.', 'На вдохе прогнись, взгляд вперёд. Чередуй плавно.']),
  Y('pigeon', 'pigeon pose', ['glutes'], ['quads'], true, 'Голубь', ['Из упора выведи колено вперёд к руке, голень поперёк коврика.', 'Заднюю ногу вытяни назад, таз опусти.', 'Корпус прямо или ляг на переднюю ногу. Смени сторону.']),
  Y('bridge', 'bridge pose', ['glutes'], ['hams', 'lowerback'], false, 'Мост', ['Ляг на спину, стопы на полу у таза.', 'Подними таз вверх, руки вдоль тела.', 'Колени смотрят вперёд, держи.']),
  Y('happybaby', 'happy baby', ['adductors'], ['glutes', 'lowerback'], false, 'Счастливый ребёнок', ['Ляг на спину, подтяни колени к подмышкам.', 'Возьмись за внешние края стоп, голени вертикально.', 'Поясница на полу, можно покачаться.']),
  Y('seatedfold', 'seated forward fold', ['hams'], ['lowerback', 'calves'], false, 'Наклон сидя', ['Сядь, ноги вытянуты вместе, носки на себя.', 'Вытяни спину вверх и наклонись вперёд от таза.', 'Руки к голеням или стопам, держи.']),
  Y('lowlunge', 'low lunge', ['quads'], ['glutes', 'abs'], true, 'Низкий выпад', ['Шагни вперёд в выпад, заднее колено на пол.', 'Переднее колено над пяткой, таз опусти вперёд-вниз.', 'Руки вверх, держи и смени ногу.']),
  Y('shavasana', 'corpse pose', ['abs'], [], false, 'Шавасана', ['Ляг на спину, ноги и руки свободно, ладони вверх.', 'Закрой глаза, расслабь всё тело.', 'Дыши спокойно, просто лежи.']),
];

// Classic stretches the catalog lacks: pictograms too, logged as stretches
const S = (key, en, muscles, secondary, n, s) => ({ id: `s_${key}`, en, muscles, secondary, equipment: 'bodyweight', type: 'time', category: 'stretch', perSide: true, pict: key, ru: { n, s } });
const STRETCH = [
  S('crossbody', 'cross-body shoulder stretch', ['shoulders'], ['traps'], 'Растяжка плеча рукой поперёк груди', ['Выведи прямую руку поперёк груди.', 'Другой рукой прижми её над локтем к себе.', 'Плечо опущено, держи. Смени руку.']),
  S('doorway', 'doorway chest stretch', ['chest'], ['shoulders'], 'Растяжка груди в дверном проёме', ['Предплечье под прямым углом на косяк, локоть на уровне плеча.', 'Шагни вперёд и разверни корпус от руки.', 'Держи до натяжения в груди и переднем плече. Смени сторону.']),
  S('couch', 'couch stretch', ['quads'], ['glutes', 'abs'], 'Растяжка сгибателя бедра у стены (couch stretch)', ['Встань на колени спиной к стене, одно колено у стены, голень вверх по стене.', 'Другую стопу поставь вперёд, корпус выпрями.', 'Напряги ягодицу, подай таз вперёд. Держи и смени ногу.']),
  S('9090', '90/90 hip stretch', ['glutes'], ['adductors', 'lowerback'], 'Поза 90/90 для бедра', ['Сядь: передняя нога согнута под 90° перед тобой, задняя под 90° сбоку.', 'Корпус прямо, наклонись над передней голенью с прямой спиной.', 'Держи, затем смени сторону.']),
  S('sidelunge', 'side lunge adductor stretch', ['adductors'], ['hams', 'glutes'], 'Растяжка приводящих в боковом выпаде', ['Широко расставь ноги, носки чуть наружу.', 'Согни одно колено и сдвинь таз в сторону, другая нога прямая.', 'Держи до натяжения внутри прямой ноги. Смени сторону.']),
  S('thread', 'thread the needle', ['traps'], ['shoulders', 'lowerback'], 'Скручивание «продень иголку»', ['Встань на четвереньки: руки под плечами, колени под тазом.', 'Проведи одну руку под другой, опусти плечо и висок на пол.', 'Держи, дыши в скручивание. Смени сторону.']),
  S('wristflex', 'wrist flexor stretch', ['forearms'], [], 'Растяжка сгибателей запястья', ['Вытяни руку вперёд ладонью от себя, пальцы вниз.', 'Другой рукой мягко потяни пальцы на себя.', 'Держи до натяжения внутри предплечья. Смени руку.']),
  S('soleus', 'soleus wall stretch', ['calves'], [], 'Растяжка камбаловидной у стены', ['Встань лицом к стене, одна стопа впереди, другая чуть сзади.', 'Согни оба колена, пятка задней ноги на полу.', 'Держи до натяжения низко в икре. Смени ногу.']),
];

// Own exercises with a gif cut from a video (public/media/v_*.gif is committed, never downloaded)
const V = (key, en, muscles, secondary, n, s) => ({ id: `v_${key}`, en, muscles, secondary, equipment: 'band', type: 'reps', category: 'rehab', ru: { n, s } });
const VIDEO = [
  { id: 'v_low_row', en: 'low row machine', muscles: ['traps'], secondary: ['lats', 'biceps', 'forearms'], equipment: 'machine', type: 'weight_reps', perHand: true,
    ru: { n: 'Нижняя тяга Low Row в рычажном тренажёре', s: ['Сядь, грудь прижми к упору, рукояти впереди внизу.', 'Тяни рукояти к низу живота, сводя лопатки, локти вдоль корпуса.', 'Верни медленно до растяжения спины, грудь не отрывай.'] } },
  V('prone_band_raise', 'prone single-arm band raise', ['traps'], ['shoulders'], 'Подъём ленты лёжа на животе одной рукой', ['Ляг лицом вниз, руки вытянуты вперёд, лента в ладонях.', 'Одна рука держит ленту у пола, другая тянет её вверх и в сторону.', 'Медленно вернись. Шея расслаблена, плечо не тянется к уху. Смени руку.']),
  V('quadruped_band_row', 'quadruped single-arm band row', ['lats'], ['traps', 'shoulders'], 'Тяга ленты на четвереньках одной рукой', ['Встань на четвереньки, колени на коврике, спина ровная.', 'Одна рука прижимает ленту к полу, другая тянет её к бедру, лопатка идёт к позвоночнику.', 'Медленно вернись, корпус не раскачивай. Смени руку.']),
  V('overhead_band_rotation', 'kneeling overhead band rotation', ['traps'], ['shoulders', 'abs'], 'Поворот корпуса с лентой над головой, сидя на пятках', ['Сядь на пятки, лента натянута над головой, локти согнуты.', 'Удерживая натяжение и опустив лопатки, поворачивай корпус вправо-влево.', 'Поясница не прогибается, подбородок не выезжает вперёд.']),
];

const rows = [];
const text = {};
const textDe = {};
const missingRu = [];
for (const { name, category, perSide } of picked) {
  const x = byName.get(name.toLowerCase());
  if (!x) throw new Error('not in catalog: ' + name);
  const equipment = mapEquipment(x.equipments);
  let { muscles, secondary } = mapMuscles(x.targetMuscles, x.secondaryMuscles, x.bodyParts);
  // ExerciseDB marks most squats/lunges as glutes-only; quads carry them in practice
  if (muscles[0] === 'glutes' && /squat|lunge|leg press|step-up|split|single-leg press|pistol/i.test(x.name)) {
    muscles = ['quads', ...muscles];
    secondary = secondary.filter((m) => m !== 'quads');
  }
  if (/farmers walk/i.test(x.name)) {
    rows.push({ id: x.exerciseId, en: x.name, muscles: ['forearms'], secondary: ['traps', 'abs'], equipment, type: 'weight_reps' });
    const t = ru[name.toLowerCase()];
    if (t) text[x.exerciseId] = t;
    if (de[name.toLowerCase()]) textDe[x.exerciseId] = de[name.toLowerCase()];
    continue;
  }
  rows.push({
    id: x.exerciseId,
    en: x.name,
    muscles,
    secondary,
    equipment,
    type: TYPE_FIX[x.name.toLowerCase()] ?? (category === 'stretch' || category === 'yoga' ? 'time' : guessType(x.name, x.bodyParts, equipment)),
    ...(category && { category }),
    ...(perSide && { perSide }),
  });
  const t = ru[name.toLowerCase()];
  if (t) text[x.exerciseId] = t;
  else missingRu.push(name);
  if (de[name.toLowerCase()]) textDe[x.exerciseId] = de[name.toLowerCase()];
}
for (const e of EXTRAS) {
  const { ru: t, ...row } = e;
  rows.push({ ...row, noMedia: true });
  text[e.id] = t;
  if (de[e.id]) textDe[e.id] = de[e.id];
}
for (const e of [...YOGA, ...STRETCH, ...VIDEO]) {
  const { ru: t, ...row } = e;
  rows.push(JSON.parse(JSON.stringify(row))); // drops undefined perSide
  text[e.id] = t;
  if (de[e.id]) textDe[e.id] = de[e.id];
}

// Weight is entered per hand: dumbbells/kettlebells (except one weight held in both hands) and one-arm work
const ONE_WEIGHT = /pullover|goblet|leg curl|swing|kettlebell front squat|dumbbell seated triceps extension/i;
for (const r of rows) {
  if (r.type !== 'weight_reps' || r.category) continue;
  const free = (r.equipment === 'dumbbell' || r.equipment === 'kettlebell') && !ONE_WEIGHT.test(r.en);
  if (free || /single-arm|unilateral/i.test(r.en)) r.perHand = true;
}

await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/exercises.json', root), JSON.stringify(rows));
await writeFile(new URL('public/data/exercises.ru.json', root), JSON.stringify(text));
await writeFile(new URL('public/data/exercises.de.json', root), JSON.stringify(textDe));
console.log(`rows ${rows.length}, ru ${Object.keys(text).length}, de ${Object.keys(textDe).length}`);
const missingDe = rows.filter((r) => !textDe[r.id]).map((r) => r.en);
if (missingDe.length) console.log('MISSING DE:', missingDe);
if (missingRu.length) console.log('MISSING RU:', missingRu);
const unused = Object.keys(ru).filter((k) => !names.some((n) => n.toLowerCase() === k));
if (unused.length) console.log('UNUSED RU KEYS:', unused);

await import('./build-mistakes.mjs');

if (!process.argv.includes('--no-media')) {
  await mkdir(new URL('public/media/', root), { recursive: true });
  let got = 0;
  const missingMedia = [];
  for (const r of rows) {
    if (r.id.startsWith('x_') || r.pict) continue;
    const file = new URL(`public/media/${r.id}.gif`, root);
    try {
      await access(file);
      continue;
    } catch {}
    // Rate-limited CDN: keep retrying with long pauses instead of giving up
    for (let attempt = 0; attempt < 20; attempt++) {
      let res;
      try {
        res = await fetch(`https://static.exercisedb.dev/media/${r.id}.gif`);
      } catch (e) {
        console.log(`media ${r.id}: ${e.message}`);
      }
      if (res?.ok && (res.headers.get('content-type') ?? '').includes('gif')) {
        await writeFile(file, Buffer.from(await res.arrayBuffer()));
        got++;
        if (got % 25 === 0) console.log(`media ${got}`);
        break;
      }
      if (res?.status === 404) {
        missingMedia.push(r.id);
        console.log(`media ${r.id} (${r.en}): no gif on the server`);
        break;
      }
      console.log(`media ${r.id}: ${res?.status ?? 'error'}, wait 60s`);
      await sleep(60000);
    }
    await sleep(1500);
  }
  console.log('media downloaded', got);
  // Rows without a gif get noMedia so the app does not request a missing file
  if (missingMedia.length) {
    for (const r of rows) if (missingMedia.includes(r.id)) r.noMedia = true;
    await writeFile(new URL('public/data/exercises.json', root), JSON.stringify(rows));
    await writeFile(new URL('scripts/raw/missing-media.json', root), JSON.stringify(missingMedia));
    console.log('no gif:', missingMedia.length);
  }
}
