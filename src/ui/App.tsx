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
import { SignalPanel } from './monitor/SignalPanel';
import { HeatmapDriver } from './rf/useHeatmap';
import { HeatmapLegend } from './rf/HeatmapLegend';
import { ProbeTooltip } from './rf/ProbeTooltip';
import { useSensingStore } from './sensing/sensingStore';
import { SensingPanel } from './sensing/SensingPanel';
import { SensingDriver } from './sensing/SensingDriver';
import { LiveDriver } from './live/LiveDriver';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import './rf/rf.css';

function MonitorRails() {
  const m = useMonitorModel();
  const real = useSceneStore((s) => s.reality === 'real');
  const observedActive = useSensingStore((st) => (st.observedActiveId ? 1 : 0));
  const attention = m.attention.length + observedActive;
  return (
    <>
      <Rail side="left" label="ในบ้านตอนนี้" icon={Users} badge={m.occupants.length}>
        <div className="rail-scroll">
          <SensingPanel />
          {!real && <OccupantsPanel />}
          {!real && <ZonesPanel />}
          {!real && <SignalPanel />}
          {!real && <SimControls />}
        </div>
      </Rail>
      <main className="canvas-area">
        <SceneCanvas />
        <LabelsOverlay />
        <CriticalBanner />
        <HeatmapLegend />
        {!real && <Legend />}
        <ProbeTooltip />
        <AlertToasts />
      </main>
      <Rail side="right" label="การแจ้งเตือน" icon={Bell} badge={attention} badgeTone={m.criticalCount > 0 ? 'critical' : 'warning'}>
        <AlertsFeed forcedFilter={real ? 'observed' : undefined} />
      </Rail>
      {!real && <Timeline />}
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
        <HeatmapLegend />
        <ProbeTooltip />
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
  const reality = useSceneStore((s) => s.reality);

  return (
    <div className="app" data-mode={mode} data-reality={reality}>
      <HeatmapDriver />
      <SensingDriver />
      <LiveDriver />
      <TopBar />
      {mode === 'monitor' ? <MonitorRails /> : <EditRails />}
      <Toast />
    </div>
  );
}
