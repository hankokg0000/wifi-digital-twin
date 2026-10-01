import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './tooltip.css';

interface TooltipProps {
  /** Tooltip body; pass null/undefined to disable. */
  label: ReactNode;
  shortcut?: string;
  side?: 'right' | 'bottom' | 'top';
  children: ReactElement<{
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
  }>;
}

/**
 * Hover/focus tooltip rendered in a portal with `position: fixed`, so rail/overflow containers
 * never clip it. Wraps a single focusable child (no extra DOM around it).
 */
export function Tooltip({ label, shortcut, side = 'bottom', children }: TooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number; end?: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show(el: HTMLElement) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (side === 'right') setPos({ x: r.right + 8, y: r.top + r.height / 2 });
      else if (side === 'top') setPos({ x: r.left + r.width / 2, y: r.top - 8 });
      else if (r.left + r.width / 2 + 100 > window.innerWidth) setPos({ x: r.right, y: r.bottom + 8, end: true });
      else setPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
    }, 250);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  }

  const child = cloneElement(children, {
    onMouseEnter: (e) => {
      children.props.onMouseEnter?.(e);
      show(e.currentTarget as HTMLElement);
    },
    onMouseLeave: (e) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e) => {
      children.props.onFocus?.(e);
      if ((e.currentTarget as HTMLElement).matches(':focus-visible')) show(e.currentTarget as HTMLElement);
    },
    onBlur: (e) => {
      children.props.onBlur?.(e);
      hide();
    },
    onPointerDown: (e) => {
      children.props.onPointerDown?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {pos &&
        label &&
        createPortal(
          <div className={`tooltip tooltip-${pos.end ? 'bottom-end' : side}`} role="tooltip" style={{ left: pos.x, top: pos.y }}>
            <span>{label}</span>
            {shortcut && <kbd className="mono">{shortcut}</kbd>}
          </div>,
          document.body,
        )}
    </>
  );
}
