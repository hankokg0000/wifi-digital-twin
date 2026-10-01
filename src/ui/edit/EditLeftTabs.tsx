import { useState } from 'react';
import { LevelsTab } from '../panels/LevelsTab';
import { MaterialsTab } from '../panels/MaterialsTab';

type Tab = 'levels' | 'materials';

/** Edit-mode left rail, below the tool palette: floors/entities and wall materials. */
export function EditLeftTabs() {
  const [tab, setTab] = useState<Tab>('levels');
  return (
    <div className="edit-tabs">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'levels'} className={`tab-btn${tab === 'levels' ? ' active' : ''}`} onClick={() => setTab('levels')}>
          ชั้น
        </button>
        <button role="tab" aria-selected={tab === 'materials'} className={`tab-btn${tab === 'materials' ? ' active' : ''}`} onClick={() => setTab('materials')}>
          วัสดุ
        </button>
      </div>
      <div className="tab-panel" role="tabpanel">
        {tab === 'levels' ? <LevelsTab /> : <MaterialsTab />}
      </div>
    </div>
  );
}
