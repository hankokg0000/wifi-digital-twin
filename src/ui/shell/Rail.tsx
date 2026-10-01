import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Tooltip } from '../components/Tooltip';
import { useMediaQuery } from './useMediaQuery';

interface RailProps {
  side: 'left' | 'right';
  /** Panel name; also the aria-label of the compact-rail toggle. */
  label: string;
  icon: LucideIcon;
  /** Small count shown on the compact toggle. */
  badge?: number;
  badgeTone?: 'critical' | 'warning' | 'neutral';
  /** Always-visible controls for the 56px compact rail (e.g. the tool palette). */
  strip?: ReactNode;
  /** In compact mode, open the overlay whenever this becomes truthy / changes (e.g. a selection). */
  autoOpenKey?: string | null;
  children: ReactNode;
}

/**
 * A side rail. At >= 1280px it is a fixed-width column. Below that it collapses to a 56px icon
 * rail whose button opens the same content as an overlay over the canvas.
 */
export function Rail({ side, label, icon: Icon, badge, badgeTone = 'neutral', strip, autoOpenKey, children }: RailProps) {
  const compact = useMediaQuery('(max-width: 1279px)');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compact) setOpen(false);
  }, [compact]);

  useEffect(() => {
    if (compact && autoOpenKey) setOpen(true);
  }, [compact, autoOpenKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!compact) {
    return (
      <aside className={`rail rail-${side}`} aria-label={label}>
        {strip}
        {children}
      </aside>
    );
  }

  return (
    <div ref={ref} className={`rail rail-${side} rail-compact`}>
      <Tooltip label={label} side={side === 'left' ? 'right' : 'top'}>
        <button
          type="button"
          className={`icon-btn icon-btn-lg rail-toggle${open ? ' active' : ''}`}
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon size={20} strokeWidth={1.5} />
          {badge !== undefined && badge > 0 && <span className={`rail-badge rail-badge-${badgeTone} mono`}>{badge}</span>}
        </button>
      </Tooltip>
      {strip}
      {open && (
        <aside className={`rail-overlay rail-overlay-${side}`} aria-label={label}>
          {children}
        </aside>
      )}
    </div>
  );
}
