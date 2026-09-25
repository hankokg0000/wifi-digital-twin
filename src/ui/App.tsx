import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { Inspector } from './components/Inspector';
import { Toast } from './components/Toast';
import { SimBar } from './components/SimBar';
import { AlertsPanel } from './components/AlertsPanel';
import { AlertToasts } from './components/AlertToasts';
import { SceneCanvas } from './canvas/SceneCanvas';
import { LabelsOverlay } from './LabelsOverlay';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

export function App() {
  useKeyboardShortcuts();

  return (
    <div className="app">
      <Toolbar />
      <div className="app-body">
        <LeftPanel />
        <div className="canvas-area">
          <SceneCanvas />
          <LabelsOverlay />
          <SimBar />
          <AlertToasts />
        </div>
        <div className="right-panel">
          <AlertsPanel />
          <Inspector />
        </div>
      </div>
      <Toast />
    </div>
  );
}
