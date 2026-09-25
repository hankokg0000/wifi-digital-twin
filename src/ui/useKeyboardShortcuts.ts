import { useEffect } from 'react';
import { addRoom, removeEntity, toggleOpening, updateObject } from '../core';
import { useSceneStore } from './store';
import { findEntity } from './entityLookup';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Global keyboard shortcuts for tools, undo/redo, delete, rotate, and opening toggle. */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e.target)) return;

      const store = useSceneStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }

      if (e.key === 'Escape') {
        store.clearDraft();
        return;
      }

      if (e.key === 'Enter' && store.tool === 'room' && store.draft?.kind === 'room-polygon') {
        if (store.draft.points.length >= 3) {
          const levelId = store.activeLevelId;
          const points = store.draft.points;
          store.applyOp((d) => addRoom(d, { levelId, polygon: points }));
          store.clearDraft();
        }
        return;
      }

      if (e.key === ' ' && store.tool === 'select' && store.selection) {
        const found = findEntity(store.doc, store.selection);
        if (found?.kind === 'opening') {
          e.preventDefault();
          store.apply((d) => toggleOpening(d, store.selection!));
        }
        return;
      }

      if ((e.key === '[' || e.key === ']') && store.selection) {
        const found = findEntity(store.doc, store.selection);
        if (found?.kind === 'object') {
          const obj = store.doc.objects[found.index]!;
          const delta = e.key === '[' ? -15 : 15;
          const rotationY = obj.rotationY + (delta * Math.PI) / 180;
          store.apply((d) => updateObject(d, obj.id, { rotationY }));
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.selection) {
          e.preventDefault();
          const id = store.selection;
          store.apply((d) => removeEntity(d, id));
          store.setSelection(null);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          store.setTool('select');
          break;
        case 'w':
          store.setTool('wall');
          break;
        case 'd':
          store.setTool('door');
          break;
        case 'n':
          store.setTool('window');
          break;
        case 'r':
          store.setTool('room');
          break;
        case 'o':
          store.setTool('object');
          break;
        case 'a':
          store.setTool('ap');
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
