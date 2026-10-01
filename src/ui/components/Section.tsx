import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import './section.css';

interface SectionProps {
  title: string;
  /** Right-aligned header content (counts, action buttons). */
  aside?: ReactNode;
  /** When set, the header toggles the body. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Section({ title, aside, collapsible, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      <h2 className="section-title">{title}</h2>
      <span className="section-aside">{aside}</span>
      {collapsible && <ChevronDown size={16} strokeWidth={1.5} className={`section-chevron${open ? '' : ' closed'}`} />}
    </>
  );
  return (
    <section className="section">
      {collapsible ? (
        <button type="button" className="section-head section-head-btn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {head}
        </button>
      ) : (
        <div className="section-head">{head}</div>
      )}
      {open && <div className="section-body">{children}</div>}
    </section>
  );
}
