import { useEffect, useState } from 'react';
import { locale } from '../i18n';

// Decimal separator of the UI locale: ',' for ru/de
const SEP = (1.5).toLocaleString(locale()).charAt(1);
const show = (v: number | undefined) => (v === undefined ? '' : String(v).replace('.', SEP));

/**
 * Number field with the phone's numeric keyboard. Keeps the raw text while typing
 * (so '7,' or '' don't get eaten) and reports a number or undefined.
 */
export function NumInput({
  value,
  onChange,
  decimal,
  placeholder,
  className,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  decimal?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState(show(value));

  useEffect(() => {
    // Sync when the value changes from outside (e.g. a ticked set gets filled from the plan)
    const parsed = parse(text);
    if (parsed !== value) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      className={className}
      value={text}
      placeholder={placeholder}
      inputMode={decimal ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,]/g, '');
        setText(raw);
        onChange(parse(raw));
      }}
    />
  );
}

function parse(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}
