import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parse,
  serialize,
  sampleHouse,
  createEmptyDoc,
  SceneOpError,
  addLevel,
  addWall,
  removeLevel,
  type SceneDoc,
} from '../core';
import type { Tool, ViewMode } from './store';

describe('useSceneStore', () => {
  let localStorageMock: Record<string, string>;

  beforeEach(() => {
    // Create mock localStorage
    localStorageMock = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, value: string) => {
        localStorageMock[key] = value;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
    });

    // Use fake timers for debounce
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('1. Initial load', () => {
    it('no localStorage → doc is sampleHouse', async () => {
      vi.resetModules();
      const { useSceneStore } = await import('./store');
      const store = useSceneStore.getState();
      const sample = sampleHouse();

      expect(store.doc.levels.length).toBe(sample.levels.length);
      expect(store.doc.rooms.length).toBe(sample.rooms.length);
    });

    it('valid serialized doc in localStorage → that doc is loaded', async () => {
      const doc = createEmptyDoc();
      localStorageMock['wifi-digital-twin:scene-doc'] = serialize(doc);

      vi.resetModules();
      const { useSceneStore } = await import('./store');
      const store = useSceneStore.getState();

      expect(store.doc.levels.length).toBe(doc.levels.length);
      expect(store.doc.walls.length).toBe(doc.walls.length);
    });

    it('corrupt JSON in localStorage → falls back to sample house without throwing', async () => {
      localStorageMock['wifi-digital-twin:scene-doc'] = '{ invalid json }';

      vi.resetModules();
      const { useSceneStore } = await import('./store');
      const store = useSceneStore.getState();

      const sample = sampleHouse();
      expect(store.doc.levels.length).toBe(sample.levels.length);
      expect(store.doc.rooms.length).toBe(sample.rooms.length);
    });

    it('localStorage that throws on access → still loads sample house', async () => {
      vi.stubGlobal('localStorage', {
        getItem: () => {
          throw new Error('Private mode');
        },
        setItem: () => {},
        removeItem: () => {},
        clear: () => {},
      });

      vi.resetModules();
      const { useSceneStore } = await import('./store');
      const store = useSceneStore.getState();

      const sample = sampleHouse();
      expect(store.doc.levels.length).toBe(sample.levels.length);
      expect(store.doc.rooms.length).toBe(sample.rooms.length);
    });
  });

  describe('2. apply/applyOp history', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('apply pushes to past and clears future', () => {
      const originalDoc = useSceneStore.getState().doc;

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc, levels: [...doc.levels] }));

      const state = useSceneStore.getState();
      expect(state.past.length).toBeGreaterThan(0);
      expect(state.past[state.past.length - 1]).toEqual(originalDoc);
      expect(state.future.length).toBe(0);
    });

    it('applyOp pushes to past, clears future, selects new entity', () => {
      const initialPastLength = useSceneStore.getState().past.length;

      const id = useSceneStore.getState().applyOp((doc: SceneDoc) => addLevel(doc, { name: 'Test Level' }));

      const state = useSceneStore.getState();
      expect(id).toBeTruthy();
      expect(state.past.length).toBe(initialPastLength + 1);
      expect(state.future.length).toBe(0);
      expect(state.selection).toBe(id);
    });

    it('undo restores previous doc', () => {
      const doc1 = useSceneStore.getState().doc;

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      const docAfterEdit = useSceneStore.getState().doc;

      useSceneStore.getState().undo();

      const state = useSceneStore.getState();
      expect(state.doc).toEqual(doc1);
      expect(state.future[0]).toEqual(docAfterEdit);
    });

    it('redo restores to future doc', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      const docAfterEdit = useSceneStore.getState().doc;

      useSceneStore.getState().undo();
      useSceneStore.getState().redo();

      expect(useSceneStore.getState().doc).toEqual(docAfterEdit);
    });

    it('redo stack cleared by new edit', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      useSceneStore.getState().undo();

      expect(useSceneStore.getState().canRedo()).toBe(true);

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));

      expect(useSceneStore.getState().canRedo()).toBe(false);
    });

    it('history capped at 100 edits', () => {
      for (let i = 0; i < 105; i++) {
        useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      }

      expect(useSceneStore.getState().past.length).toBe(100);
    });

    it('canUndo reflects past state', () => {
      expect(useSceneStore.getState().canUndo()).toBe(false);

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));

      expect(useSceneStore.getState().canUndo()).toBe(true);
    });

    it('canRedo reflects future state', () => {
      expect(useSceneStore.getState().canRedo()).toBe(false);

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      useSceneStore.getState().undo();

      expect(useSceneStore.getState().canRedo()).toBe(true);
    });

    it('undo with no history does nothing', () => {
      const initialDoc = useSceneStore.getState().doc;

      useSceneStore.getState().undo();

      expect(useSceneStore.getState().doc).toEqual(initialDoc);
    });

    it('redo with no future does nothing', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      const docAfterEdit = useSceneStore.getState().doc;

      useSceneStore.getState().redo();

      expect(useSceneStore.getState().doc).toEqual(docAfterEdit);
    });
  });

  describe('3. Error handling', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('SceneOpError → doc unchanged, history unchanged, lastError set', () => {
      const originalDoc = useSceneStore.getState().doc;
      const originalPastLength = useSceneStore.getState().past.length;

      useSceneStore.getState().apply(() => {
        throw new SceneOpError('Test error');
      });

      const state = useSceneStore.getState();
      expect(state.doc).toEqual(originalDoc);
      expect(state.past.length).toBe(originalPastLength);
      expect(state.lastError).toBe('Test error');
    });

    it('dismissError clears lastError', () => {
      useSceneStore.getState().apply(() => {
        throw new SceneOpError('Test error');
      });

      expect(useSceneStore.getState().lastError).not.toBeNull();

      useSceneStore.getState().dismissError();

      expect(useSceneStore.getState().lastError).toBeNull();
    });

    it('non-SceneOpError Error exception sets lastError', () => {
      useSceneStore.getState().apply(() => {
        throw new Error('Generic error');
      });

      expect(useSceneStore.getState().lastError).toBe('Generic error');
    });

    it('non-Error exception stringified to lastError', () => {
      useSceneStore.getState().apply(() => {
        // eslint-disable-next-line no-throw-literal
        throw 'string error';
      });

      expect(useSceneStore.getState().lastError).toBe('string error');
    });

    it('applyOp SceneOpError → returns null and sets lastError', () => {
      const result = useSceneStore.getState().applyOp(() => {
        throw new SceneOpError('Op failed');
      });

      expect(result).toBeNull();
      expect(useSceneStore.getState().lastError).toBe('Op failed');
    });

    it('applyOp non-Error exception returns null and sets lastError', () => {
      const result = useSceneStore.getState().applyOp(() => {
        throw new Error('Op error');
      });

      expect(result).toBeNull();
      expect(useSceneStore.getState().lastError).toBe('Op error');
    });
  });

  describe('4. Autosave', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('after an edit, nothing written before 500ms', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));

      expect(localStorageMock['wifi-digital-twin:scene-doc']).toBeUndefined();
    });

    it('written after 500ms', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(500);

      expect(localStorageMock['wifi-digital-twin:scene-doc']).toBeTruthy();
    });

    it('multiple edits within 500ms → one write after debounce', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(100);
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(100);
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));

      // Not yet written
      expect(localStorageMock['wifi-digital-twin:scene-doc']).toBeUndefined();

      vi.advanceTimersByTime(500);

      // Now written (500ms after last edit)
      expect(localStorageMock['wifi-digital-twin:scene-doc']).toBeTruthy();
    });

    it('stored value parses back correctly', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(500);

      const saved = localStorageMock['wifi-digital-twin:scene-doc']!;
      const parsed = parse(saved);
      const currentDoc = useSceneStore.getState().doc;

      expect(serialize(parsed)).toBe(serialize(currentDoc));
    });

    it('localStorage.setItem error is silently caught', () => {
      vi.stubGlobal('localStorage', {
        getItem: (key: string) => localStorageMock[key] ?? null,
        setItem: () => {
          throw new Error('Quota exceeded');
        },
        removeItem: () => {},
        clear: () => {},
      });

      // Should not throw
      expect(() => {
        useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
        vi.advanceTimersByTime(500);
      }).not.toThrow();
    });

    it('loadDoc schedules autosave', () => {
      const newDoc = createEmptyDoc();

      useSceneStore.getState().loadDoc(newDoc);
      vi.advanceTimersByTime(500);

      expect(localStorageMock['wifi-digital-twin:scene-doc']).toBeTruthy();
    });

    it('undo/redo schedule autosave', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(500);
      localStorageMock['wifi-digital-twin:scene-doc'] = 'first save';

      useSceneStore.getState().undo();
      vi.advanceTimersByTime(500);

      // Should have written undo state
      expect(localStorageMock['wifi-digital-twin:scene-doc']).not.toBe('first save');
    });
  });

  describe('5. Selection / activeLevelId / tool / viewMode / draft', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('setSelection updates selection', () => {
      const levelId = useSceneStore.getState().doc.levels[0]?.id;

      useSceneStore.getState().setSelection(levelId ?? null);

      expect(useSceneStore.getState().selection).toBe(levelId);
    });

    it('setActiveLevelId updates activeLevelId', () => {
      const levelId = useSceneStore.getState().doc.levels[0]?.id;

      useSceneStore.getState().setActiveLevelId(levelId ?? '');

      expect(useSceneStore.getState().activeLevelId).toBe(levelId);
    });

    it('setActiveLevelId clears selection and draft', () => {
      const levelId = useSceneStore.getState().doc.levels[0]?.id;

      useSceneStore.getState().setSelection('something');
      useSceneStore.getState().setDraft({ kind: 'wall-chain', points: [] });

      useSceneStore.getState().setActiveLevelId(levelId ?? '');

      const state = useSceneStore.getState();
      expect(state.selection).toBeNull();
      expect(state.draft).toBeNull();
    });

    it('setTool updates tool', () => {
      useSceneStore.getState().setTool('wall');

      expect(useSceneStore.getState().tool).toBe('wall');
    });

    it('setTool clears draft', () => {
      useSceneStore.getState().setDraft({ kind: 'wall-chain', points: [] });
      useSceneStore.getState().setTool('door');

      expect(useSceneStore.getState().draft).toBeNull();
    });

    it('setViewMode updates viewMode', () => {
      useSceneStore.getState().setViewMode('3d');

      expect(useSceneStore.getState().viewMode).toBe('3d');
    });

    it('setDraft sets draft', () => {
      const draft = { kind: 'wall-chain' as const, points: [[0, 0]] };

      useSceneStore.getState().setDraft(draft);

      expect(useSceneStore.getState().draft).toEqual(draft);
    });

    it('clearDraft sets draft to null', () => {
      useSceneStore.getState().setDraft({ kind: 'wall-chain', points: [] });
      useSceneStore.getState().clearDraft();

      expect(useSceneStore.getState().draft).toBeNull();
    });

    it('removing active level → activeLevelId points at existing level', () => {
      const levelToRemove = useSceneStore.getState().doc.levels[1]!.id;
      useSceneStore.getState().setActiveLevelId(levelToRemove);

      useSceneStore.getState().apply((doc: SceneDoc) => removeLevel(doc, levelToRemove));

      const { doc, activeLevelId } = useSceneStore.getState();
      expect(doc.levels.map((l: { id: string }) => l.id)).not.toContain(levelToRemove);
      expect(doc.levels.some((l: { id: string }) => l.id === activeLevelId)).toBe(true);
    });

    it('undo that removes the selected entity clears selection', () => {
      const levelId = useSceneStore.getState().doc.levels[0]!.id;
      const id = useSceneStore.getState().applyOp((d: SceneDoc) => addWall(d, { levelId, a: [20, 20], b: [22, 20] }));
      expect(useSceneStore.getState().selection).toBe(id);

      useSceneStore.getState().undo();

      expect(useSceneStore.getState().selection).toBeNull();
    });

    it('undo of addLevel while on the new level falls back to an existing level', () => {
      const id = useSceneStore.getState().applyOp((d: SceneDoc) => addLevel(d));
      useSceneStore.getState().setActiveLevelId(id);

      useSceneStore.getState().undo();

      const { doc, activeLevelId } = useSceneStore.getState();
      expect(doc.levels.some((l: { id: string }) => l.id === activeLevelId)).toBe(true);
    });
  });

  describe('6. File actions', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('newDoc creates empty doc and clears history', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      expect(useSceneStore.getState().past.length).toBeGreaterThan(0);

      useSceneStore.getState().newDoc();

      const empty = createEmptyDoc();
      const state = useSceneStore.getState();
      expect(state.doc.levels.length).toBe(empty.levels.length);
      expect(state.doc.walls.length).toBe(empty.walls.length);
      expect(state.past.length).toBe(0);
      expect(state.future.length).toBe(0);
    });

    it('newDoc clears selection and draft', () => {
      useSceneStore.getState().setSelection('test');
      useSceneStore.getState().setDraft({ kind: 'wall-chain', points: [] });

      useSceneStore.getState().newDoc();

      const state = useSceneStore.getState();
      expect(state.selection).toBeNull();
      expect(state.draft).toBeNull();
    });

    it('loadSample loads sampleHouse', () => {
      useSceneStore.getState().newDoc();
      useSceneStore.getState().loadSample();

      const sample = sampleHouse();
      const state = useSceneStore.getState();
      expect(state.doc.levels.length).toBe(sample.levels.length);
      expect(state.doc.rooms.length).toBe(sample.rooms.length);
    });

    it('loadSample clears history', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      useSceneStore.getState().loadSample();

      const state = useSceneStore.getState();
      expect(state.past.length).toBe(0);
      expect(state.future.length).toBe(0);
    });

    it('openJsonText with valid JSON loads the doc', () => {
      const doc = createEmptyDoc();
      const json = serialize(doc);

      const result = useSceneStore.getState().openJsonText(json);

      expect(result.ok).toBe(true);
      expect(useSceneStore.getState().doc.levels.length).toBe(doc.levels.length);
    });

    it('openJsonText with invalid JSON returns error issues', () => {
      const result = useSceneStore.getState().openJsonText('{ invalid }');

      expect(result.ok).toBe(false);
      expect((result as any).issues).toBeDefined();
      expect(Array.isArray((result as any).issues)).toBe(true);
    });

    it('openJsonText error sets lastError', () => {
      useSceneStore.getState().openJsonText('{ invalid }');

      expect(useSceneStore.getState().lastError).not.toBeNull();
    });

    it('loadDoc clears history', () => {
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      const newDoc = createEmptyDoc();

      useSceneStore.getState().loadDoc(newDoc);

      const state = useSceneStore.getState();
      expect(state.past.length).toBe(0);
      expect(state.future.length).toBe(0);
    });

    it('loadDoc clears selection and draft', () => {
      useSceneStore.getState().setSelection('test');
      useSceneStore.getState().setDraft({ kind: 'wall-chain', points: [] });

      const newDoc = createEmptyDoc();
      useSceneStore.getState().loadDoc(newDoc);

      const state = useSceneStore.getState();
      expect(state.selection).toBeNull();
      expect(state.draft).toBeNull();
    });

    it('loadDoc updates activeLevelId', () => {
      const newDoc = createEmptyDoc();
      const expectedLevelId = newDoc.levels[0]?.id ?? '';

      useSceneStore.getState().loadDoc(newDoc);

      expect(useSceneStore.getState().activeLevelId).toBe(expectedLevelId);
    });
  });

  describe('edge cases and integration', () => {
    let useSceneStore: any;

    beforeEach(async () => {
      vi.resetModules();
      const module = await import('./store');
      useSceneStore = module.useSceneStore;
    });

    it('autosave persists state across reload', async () => {
      const initialDoc = useSceneStore.getState().doc;

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      vi.advanceTimersByTime(500);

      const savedDoc = useSceneStore.getState().doc;

      // Simulate reload
      vi.resetModules();
      vi.useFakeTimers();

      const { useSceneStore: reloadedStore } = await import('./store');
      const reloadedDoc = reloadedStore.getState().doc;

      expect(serialize(reloadedDoc)).toBe(serialize(savedDoc));
    });

    it('selection is cleared when doc is loaded', () => {
      useSceneStore.getState().setSelection('test');
      expect(useSceneStore.getState().selection).toBeTruthy();

      const newDoc = createEmptyDoc();
      useSceneStore.getState().loadDoc(newDoc);

      expect(useSceneStore.getState().selection).toBeNull();
    });

    it('error is retained until dismissed', () => {
      useSceneStore.getState().apply(() => {
        throw new SceneOpError('Error 1');
      });

      expect(useSceneStore.getState().lastError).toBe('Error 1');

      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));

      expect(useSceneStore.getState().lastError).toBe('Error 1');

      useSceneStore.getState().dismissError();

      expect(useSceneStore.getState().lastError).toBeNull();
    });

    it('complex workflow: edit, undo, new edit, redo unavailable', () => {
      // Edit 1
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      expect(useSceneStore.getState().past.length).toBe(1);

      // Undo
      useSceneStore.getState().undo();
      expect(useSceneStore.getState().canRedo()).toBe(true);

      // New edit clears future
      useSceneStore.getState().apply((doc: SceneDoc) => ({ ...doc }));
      expect(useSceneStore.getState().canRedo()).toBe(false);
    });

    it('applyOp auto-selects new entity', () => {
      const levelCount = useSceneStore.getState().doc.levels.length;

      const id = useSceneStore.getState().applyOp((doc: SceneDoc) => addLevel(doc, { name: 'New' }));

      const state = useSceneStore.getState();
      expect(state.doc.levels.length).toBe(levelCount + 1);
      expect(state.selection).toBe(id);
    });
  });
});
