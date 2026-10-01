import { useState } from 'react';
import { SimTab } from './SimTab';
import { LevelsTab } from './LevelsTab';
import { MaterialsTab } from './MaterialsTab';

type Tab = 'sim' | 'levels' | 'materials';

export function LeftPanel() {
  // "จำลอง" (Sim) opens by default — this is the tab the demo is built around (design brief §3).
  const [tab, setTab] = useState<Tab>('sim');

  return (
    <div className="left-panel">
      <div className="tabs">
        <button className={`tab-btn${tab === 'sim' ? ' active' : ''}`} onClick={() => setTab('sim')}>
          จำลอง
        </button>
        <button className={`tab-btn${tab === 'levels' ? ' active' : ''}`} onClick={() => setTab('levels')}>
          Levels
        </button>
        <button className={`tab-btn${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')}>
          Materials
        </button>
      </div>
      {tab === 'sim' ? <SimTab /> : tab === 'levels' ? <LevelsTab /> : <MaterialsTab />}
    </div>
  );
}
