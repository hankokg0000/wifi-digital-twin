import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import './ui/styles.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element not found');
}

// StrictMode's double-mount used to trigger a "synchronously unmount a root while React was
// already rendering" error, because a drei label helper mounted a second ReactDOM root per
// label and unmounted it inside R3F's reconciler commit. Labels are now a plain DOM overlay
// rendered by this root (see src/ui/LabelsOverlay.tsx + src/ui/canvas/LabelProjector.tsx), so
// nothing under <Canvas> creates its own React root anymore and StrictMode's double-mount is
// safe again.
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
