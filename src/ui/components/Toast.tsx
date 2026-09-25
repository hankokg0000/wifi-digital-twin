import { useEffect } from 'react';
import { useSceneStore } from '../store';

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
      <span>{lastError}</span>
      <button className="toast-close" onClick={dismissError} aria-label="dismiss">
        &times;
      </button>
    </div>
  );
}
