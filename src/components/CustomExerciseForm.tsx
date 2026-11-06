import { useRef, useState } from 'react';
import { t } from '../i18n';
import { db, uid, type Category, type ExerciseType, type Side } from '../lib/db';
import { exercisesChanged, type Exercise } from '../lib/exercises';
import { MUSCLES, type Muscle } from '../lib/muscles';
import { Sheet } from './Sheet';
import { useBlobUrls } from './ExerciseMedia';

const MAX_PHOTOS = 8;
const SIDES: Side[] = ['both', 'left', 'right'];

const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'bodyweight', 'kettlebell', 'band', 'cardio', 'other'] as const;
const TYPES: ExerciseType[] = ['weight_reps', 'reps', 'time', 'cardio'];

/** Create an own exercise or edit an own/downloaded one. */
export function CustomExerciseForm({ edit, category: initialCategory, onClose }: { edit?: Exercise; category?: Category; onClose: () => void }) {
  const [category, setCategory] = useState<Category | undefined>(edit ? edit.category : initialCategory);
  const [side, setSide] = useState<Side | undefined>(edit?.side);
  const [name, setName] = useState(edit?.name ?? '');
  const [muscle, setMuscle] = useState<Muscle>(edit?.muscles[0] ?? 'chest');
  const [equipment, setEquipment] = useState(edit?.equipment ?? 'barbell');
  const [type, setType] = useState<ExerciseType>(edit?.type ?? 'weight_reps');
  const [photos, setPhotos] = useState<Blob[]>(edit?.photos ?? []);
  const photoUrls = useBlobUrls(photos);
  const [video, setVideo] = useState(edit?.videoUrl ?? '');
  const [steps, setSteps] = useState(edit?.steps.join('\n') ?? '');
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const next = await Promise.all([...files].slice(0, room).map(downscale));
    setPhotos((p) => [...p, ...next].slice(0, MAX_PHOTOS));
    if (fileRef.current) fileRef.current.value = '';
  };
  const removePhoto = (i: number) => setPhotos((p) => p.filter((_, j) => j !== i));
  const movePhoto = (i: number) => setPhotos((p) => (i === 0 ? p : [p[i], ...p.filter((_, j) => j !== i)]));

  const save = async () => {
    if (!name.trim()) return setError(t('custom.nameRequired'));
    const prev = edit ? await db.customExercises.get(edit.id) : undefined;
    await db.customExercises.put({
      ...prev,
      id: edit?.id ?? uid('c_'),
      name: name.trim(),
      muscles: [muscle, ...(edit?.muscles.slice(1).filter((m) => m !== muscle) ?? [])],
      secondary: edit?.secondary,
      equipment,
      type,
      photos: photos.length ? photos : undefined,
      category,
      side,
      videoUrl: video.trim() || undefined,
      steps: steps.split('\n').map((s) => s.trim()).filter(Boolean),
      source: edit?.source === 'full' ? 'full' : 'own',
      createdAt: prev?.createdAt ?? Date.now(),
    });
    exercisesChanged();
    onClose();
  };

  return (
    <Sheet onClose={onClose}>
      <div className="h h-l">{t(edit ? 'custom.editTitle' : 'custom.title')}</div>

      <label className="field">
        <span className="m muted">{t('custom.name')}</span>
        <input
          value={name}
          placeholder={t('custom.namePh')}
          onChange={(e) => {
            setName(e.target.value);
            setError('');
          }}
        />
        {error && <span className="m pink">{error}</span>}
      </label>

      <button className={'toggle' + (category === 'rehab' ? ' on' : '')} onClick={() => setCategory(category === 'rehab' ? undefined : 'rehab')}>
        <span className="toggle-box">{category === 'rehab' ? '✓' : ''}</span>
        <span>
          <b className="h h-s">{t('custom.rehab')}</b>
          <span className="m muted">{t('custom.rehabHint')}</span>
        </span>
      </button>

      <div className="field">
        <span className="m muted">{t('custom.photos', { n: photos.length, max: MAX_PHOTOS })}</span>
        {photos.length > 0 && (
          <div className="photo-grid">
            {photoUrls.map((u, i) => (
              <div key={u} className="photo-cell">
                <img src={u} alt="" />
                {i === 0 ? (
                  <span className="photo-main m">{t('custom.photoMain')}</span>
                ) : (
                  <button className="photo-star m" onClick={() => movePhoto(i)}>
                    {t('custom.photoMakeMain')}
                  </button>
                )}
                <button className="photo-del" aria-label={t('custom.photoRemove')} onClick={() => removePhoto(i)}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void pickPhotos(e.target.files)} />
        {photos.length < MAX_PHOTOS && (
          <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
            + {t('custom.photoPick')}
          </button>
        )}
      </div>

      <div className="field">
        <span className="m muted">{t('custom.side')}</span>
        <div className="chips">
          <button className={'chip' + (!side ? ' on' : '')} onClick={() => setSide(undefined)}>
            {t('side.none')}
          </button>
          {SIDES.map((s) => (
            <button key={s} className={'chip' + (s === side ? ' on' : '')} onClick={() => setSide(s)}>
              {t(`side.${s}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="m muted">{t('custom.muscle')}</span>
        <div className="chips">
          {MUSCLES.map((m) => (
            <button key={m} className={'chip' + (m === muscle ? ' on' : '')} onClick={() => setMuscle(m)}>
              {t(`muscle.${m}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="m muted">{t('custom.equipment')}</span>
        <div className="chips">
          {EQUIPMENT.map((q) => (
            <button key={q} className={'chip' + (q === equipment ? ' on' : '')} onClick={() => setEquipment(q)}>
              {t(`eq.${q}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="m muted">{t('custom.type')}</span>
        <div className="chips">
          {TYPES.map((x) => (
            <button key={x} className={'chip' + (x === type ? ' on' : '')} onClick={() => setType(x)}>
              {t(`type.${x}`)}
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="m muted">{t('custom.video')}</span>
        <input value={video} placeholder={t('custom.videoPh')} inputMode="url" onChange={(e) => setVideo(e.target.value)} />
      </label>

      <label className="field">
        <span className="m muted">{t('custom.steps')}</span>
        <textarea rows={4} value={steps} placeholder={t('custom.stepsPh')} onChange={(e) => setSteps(e.target.value)} />
      </label>

      <button className="btn lime" style={{ marginTop: 18 }} onClick={() => void save()}>
        {t('custom.save')}
      </button>
    </Sheet>
  );
}

/** Shrinks a phone photo to max 900px JPEG so IndexedDB stays small. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 900 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.82));
  } catch {
    return file;
  }
}
