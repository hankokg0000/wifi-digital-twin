import type { ReactNode } from 'react';

interface Option<T extends string | number> {
  value: T;
  label: ReactNode;
  /** Accessible name when `label` is an icon or ambiguous. */
  ariaLabel?: string;
}

interface SegmentedProps<T extends string | number> {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  fill?: boolean;
}

/** Segmented control: a group of toggle buttons (aria-pressed) with exactly one active. */
export function Segmented<T extends string | number>({ options, value, onChange, label, fill }: SegmentedProps<T>) {
  return (
    <div className={`seg${fill ? ' seg-fill' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`seg-btn${o.value === value ? ' active' : ''}`}
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
