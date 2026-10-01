import type { ReactNode } from 'react';
import { MousePointerClick, Trash2 } from 'lucide-react';
import { removeEntity } from '../../core';
import { useSceneStore } from '../store';
import { findEntity, KIND_LABEL } from '../entityLookup';
import { LevelInspector } from './LevelInspector';
import { WallInspector } from './WallInspector';
import { OpeningInspector } from './OpeningInspector';
import { RoomInspector } from './RoomInspector';
import { ObjectInspector } from './ObjectInspector';
import { RadioInspector } from './RadioInspector';
import { AgentInspector } from './AgentInspector';
import { ZoneInspector } from './ZoneInspector';
import { StairInspector } from './StairInspector';

export function Inspector() {
  const doc = useSceneStore((s) => s.doc);
  const selection = useSceneStore((s) => s.selection);
  const apply = useSceneStore((s) => s.apply);
  const setSelection = useSceneStore((s) => s.setSelection);

  if (!selection) {
    return (
      <div className="inspector inspector-empty">
        <MousePointerClick size={24} strokeWidth={1.5} />
        <p>เลือกวัตถุในแผนผังเพื่อแก้ไขคุณสมบัติ</p>
      </div>
    );
  }

  const found = findEntity(doc, selection);
  if (!found) {
    return (
      <div className="inspector inspector-empty">
        <p>วัตถุที่เลือกไม่มีอยู่แล้ว</p>
      </div>
    );
  }

  const remove = () => {
    apply((d) => removeEntity(d, selection));
    setSelection(null);
  };

  let body: ReactNode = null;

  if (found.kind === 'level') {
    body = <LevelInspector level={doc.levels[found.index]!} />;
  } else if (found.kind === 'wall') {
    body = <WallInspector wall={doc.walls[found.index]!} />;
  } else if (found.kind === 'opening') {
    body = <OpeningInspector opening={doc.openings[found.index]!} />;
  } else if (found.kind === 'room') {
    body = <RoomInspector room={doc.rooms[found.index]!} doc={doc} />;
  } else if (found.kind === 'object') {
    body = <ObjectInspector object={doc.objects[found.index]!} />;
  } else if (found.kind === 'radio') {
    body = <RadioInspector radio={doc.radios[found.index]!} />;
  } else if (found.kind === 'agent') {
    body = <AgentInspector agent={doc.agents[found.index]!} doc={doc} />;
  } else if (found.kind === 'zone') {
    body = <ZoneInspector zone={doc.zones[found.index]!} doc={doc} />;
  } else if (found.kind === 'stair') {
    body = <StairInspector stair={doc.stairs[found.index]!} doc={doc} />;
  } else if (found.kind === 'material') {
    body = <p className="empty-hint">Edit materials from the Materials tab.</p>;
  }

  return (
    <div className="inspector">
      <div className="inspector-header">
        <span className="inspector-kind">{KIND_LABEL[found.kind]}</span>
        <button className="btn btn-sm btn-critical" onClick={remove} title="Delete">
          <Trash2 size={14} strokeWidth={1.5} />
          Delete
        </button>
      </div>
      {body}
    </div>
  );
}
