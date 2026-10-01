import { MousePointer2, Minus, DoorOpen, PanelTop, Square, Armchair, Wifi, ShieldAlert, type LucideIcon } from 'lucide-react';
import { useSceneStore, type Tool } from '../store';
import { Tooltip } from '../components/Tooltip';
import './edit.css';

const TOOLS: { tool: Tool; label: string; shortcut: string; icon: LucideIcon }[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: MousePointer2 },
  { tool: 'wall', label: 'Wall', shortcut: 'W', icon: Minus },
  { tool: 'door', label: 'Door', shortcut: 'D', icon: DoorOpen },
  { tool: 'window', label: 'Window', shortcut: 'N', icon: PanelTop },
  { tool: 'room', label: 'Room', shortcut: 'R', icon: Square },
  { tool: 'object', label: 'Object', shortcut: 'O', icon: Armchair },
  { tool: 'ap', label: 'AP', shortcut: 'A', icon: Wifi },
  { tool: 'zone', label: 'Zone', shortcut: 'Z', icon: ShieldAlert },
];

/** Vertical tool palette. Rows with label + shortcut in the 300px rail; icon-only in the 56px
 * compact rail (CSS). Every button keeps a tooltip with its shortcut. */
export function ToolPalette() {
  const tool = useSceneStore((s) => s.tool);
  const setTool = useSceneStore((s) => s.setTool);
  return (
    <div className="tool-palette" role="toolbar" aria-label="เครื่องมือ" aria-orientation="vertical">
      {TOOLS.map(({ tool: t, label, shortcut, icon: Icon }) => (
        <Tooltip key={t} label={label} shortcut={shortcut} side="right">
          <button
            type="button"
            className={`tool-btn${tool === t ? ' active' : ''}`}
            aria-label={label}
            aria-pressed={tool === t}
            aria-keyshortcuts={shortcut}
            onClick={() => setTool(t)}
          >
            <Icon size={16} strokeWidth={1.5} />
            <span className="tool-label">{label}</span>
            <kbd className="tool-key mono">{shortcut}</kbd>
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
