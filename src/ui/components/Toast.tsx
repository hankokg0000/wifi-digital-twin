import { useEffect } from 'react';
import { CircleAlert, X } from 'lucide-react';
import { useSceneStore } from '../store';

/** Transient editor-error toast (rejected edits, invalid files). Neutral on purpose: red/amber
 * are reserved for safety alerts. */
export function Toast() {
  const lastError = useSceneStore((s) => s.lastError);
  const dismissError = useSceneStore((s) => s.dismissError);

  useEffect(() => {
    if (!lastError) return;
    const t = setTimeout(dismissError, 5000);
    return () => clearTimeout(t);
  }, [lastError, dismissError]);

  if (!lastError) return null;

  return (
    <div className="toast" role="alert">
      <CircleAlert size={16} strokeWidth={1.5} />
      <span>{lastError}</span>
      <button className="icon-btn" onClick={dismissError} aria-label="dismiss">
        <X size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
