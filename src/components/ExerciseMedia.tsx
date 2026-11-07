import { useMemo, useRef, useState } from 'react';
import type { Exercise } from '../lib/exercises';
import { t } from '../i18n';

// One object URL per blob for the whole session. Revoking on unmount broke images under StrictMode
// (the effect cleanup ran while the memoised URLs were still in use); photos are few, so keep them.
const blobUrls = new WeakMap<Blob, string>();
const urlOf = (b: Blob) => {
  let u = blobUrls.get(b);
  if (!u) blobUrls.set(b, (u = URL.createObjectURL(b)));
  return u;
};

/** Object URLs for blobs. */
export function useBlobUrls(blobs: Blob[]): string[] {
  return useMemo(() => blobs.map(urlOf), [blobs]);
}

/**
 * Exercise media on a white plate (gifs are drawn on white).
 * thumb: first own photo, else the gif. big: swipeable gallery of own photos, then the gif.
 */
export function ExerciseMedia({ ex, size }: { ex: Exercise; size: 'thumb' | 'big' }) {
  const photoUrls = useBlobUrls(ex.photos);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const slides = [...photoUrls, ...(ex.gif && !failed ? [ex.gif] : [])];
  const cls = size === 'thumb' ? 'media-thumb' : 'media-big';

  if (!slides.length)
    return (
      <div className={cls + ' media-empty'}>
        <span className="m">{size === 'big' ? t('ex.noMedia') : ex.name.slice(0, 2)}</span>
      </div>
    );

  if (size === 'thumb')
    return (
      <div className={cls}>
        <img src={slides[0]} alt="" loading="lazy" onError={() => setFailed(true)} />
      </div>
    );

  return (
    <div className="gallery">
      <div
        className="gallery-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / el.clientWidth));
        }}
      >
        {slides.map((src, i) => (
          <div key={src} className={cls}>
            <img src={src} alt="" onError={() => i === slides.length - 1 && ex.gif === src && setFailed(true)} />
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="gallery-dots">
          {slides.map((src, i) => (
            <button
              key={src}
              className={i === index ? 'on' : ''}
              aria-label={String(i + 1)}
              onClick={() => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: 'smooth' })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
