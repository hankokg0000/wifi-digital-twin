import { Users, Bell, Layers, SlidersHorizontal } from 'lucide-react';
import { useSceneStore } from './store';
import { useMonitorModel } from './sim/useMonitorModel';
import { TopBar } from './shell/TopBar';
import { Rail } from './shell/Rail';
import { SceneCanvas } from './canvas/SceneCanvas';
import { LabelsOverlay } from './LabelsOverlay';
import { Toast } from './components/Toast';
import { OccupantsPanel } from './monitor/OccupantsPanel';
import { ZonesPanel } from './monitor/ZonesPanel';
import { SimControls } from './monitor/SimControls';
import { AlertsFeed } from './monitor/AlertsFeed';
import { CriticalBanner } from './monitor/CriticalBanner';
import { Timeline } from './monitor/Timeline';
import { Legend } from './monitor/Legend';
import { AlertToasts } from './monitor/AlertToasts';
import { ToolPalette } from './edit/ToolPalette';
import { EditLeftTabs } from './edit/EditLeftTabs';
import { Inspector } from './inspector/Inspector';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

function MonitorRails() {
  const m = useMonitorModel();
  const attention = m.attention.length;
  return (
    <>
      <Rail side="left" label="ในบ้านตอนนี้" icon={Users} badge={m.occupants.length}>
        <div className="rail-scroll">
          <OccupantsPanel />
          <ZonesPanel />
          <SimControls />
        </div>
      </Rail>
      <main className="canvas-area">
        <SceneCanvas />
        <LabelsOverlay />
        <CriticalBanner />
        <Legend />
        <AlertToasts />
      </main>
      <Rail side="right" label="การแจ้งเตือน" icon={Bell} badge={attention} badgeTone={m.criticalCount > 0 ? 'critical' : 'warning'}>
        <AlertsFeed />
      </Rail>
      <Timeline />
    </>
  );
}

function EditRails() {
  const selection = useSceneStore((s) => s.selection);
  return (
    <>
      <Rail side="left" label="ชั้นและวัสดุ" icon={Layers} strip={<ToolPalette />}>
        <EditLeftTabs />
      </Rail>
      <main className="canvas-area">
        <SceneCanvas />
        <LabelsOverlay />
      </main>
      <Rail side="right" label="Inspector" icon={SlidersHorizontal} autoOpenKey={selection}>
        <Inspector />
      </Rail>
    </>
  );
}

export function App() {
  useKeyboardShortcuts();
  const mode = useSceneStore((s) => s.mode);

  return (
    <div className="app" data-mode={mode}>
      <TopBar />
      {mode === 'monitor' ? <MonitorRails /> : <EditRails />}
      <Toast />
    </div>
  );
}
