import { useEffect } from 'react';
import { removeEntity, updateObject } from '../core';
import { useSceneStore } from './store';
import { findEntity } from './entityLookup';
import { TOOL_HANDLERS, toolContextFromStore } from './tools';

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Global keyboard shortcuts for tool switching, undo/redo, delete and rotate; tool-specific keys go through `TOOL_HANDLERS`. */
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

      // Shift+Space toggles sim playback — plain Space is already taken by the opening toggle
      // below, so this avoids the conflict the brief calls out.
      if (e.key === ' ' && e.shiftKey) {
        e.preventDefault();
        store.toggle();
        return;
      }

      // Tool-specific keys (Enter to close a room/zone polygon, Space to toggle an opening).
      if (TOOL_HANDLERS[store.tool].onKey?.(toolContextFromStore(store), e)) return;

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
        case 'z':
          store.setTool('zone');
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
