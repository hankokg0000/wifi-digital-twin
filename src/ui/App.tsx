import { Toolbar } from './components/Toolbar';
import { LeftPanel } from './components/LeftPanel';
import { Inspector } from './components/Inspector';
import { Toast } from './components/Toast';
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
        </div>
        <Inspector />
      </div>
      <Toast />
    </div>
  );
}
