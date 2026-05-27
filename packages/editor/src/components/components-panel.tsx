'use client';

/**
 * ComponentsPanel — the ready-made building-block palette ("Canva blocks").
 * Lists behavior-wired prefabs grouped by category, filtered to the active
 * render engine, and drops the right 2D/3D variant into the scene on click.
 */

import { Save, X, Package } from 'lucide-react';
import { generateId, type SceneElement } from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';
import { PREFABS, PREFAB_CATEGORIES, type PrefabEngine, type Prefab } from '../prefabs/prefabs';
import type { SavedPrefab } from '../stores/types';

export function ComponentsPanel({ onClose }: { onClose: () => void }) {
  const renderEngine = useEditorStore((s) => s.scene.settings?.renderEngine ?? 'three');
  const engine: PrefabEngine = renderEngine === 'phaser' ? '2d' : '3d';
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const savedPrefabs = useEditorStore((s) => s.savedPrefabs);

  const addPrefab = (prefab: Prefab) => {
    const { elements, patchGameState } = prefab.build(engine);
    const ids = elements.map((e) => e.id);
    const store = useEditorStore.getState();
    for (const el of elements) store.addElement(el);
    if (patchGameState) {
      store.setGameState(patchGameState(store.scene.gameState, ids));
    }
    store.setSelectedIds(ids);
    onClose();
  };

  // Drop a user-saved component into the scene. Re-id each element so re-adding
  // never collides with the originals (or a second insertion of the same one).
  const addSavedPrefab = (prefab: SavedPrefab) => {
    const store = useEditorStore.getState();
    const ids: string[] = [];
    for (const el of prefab.elements) {
      const clone = { ...structuredClone(el), id: generateId() } as SceneElement;
      store.addElement(clone);
      ids.push(clone.id);
    }
    store.setSelectedIds(ids);
    onClose();
  };

  // Capture the current selection as a reusable component. The web app owns
  // persistence: it listens for this event, POSTs to /api/prefabs, then calls
  // addSavedPrefab() on the store with the server id.
  const saveSelection = () => {
    const store = useEditorStore.getState();
    const elements = store.selectedIds
      .map((id) => store.scene.elements[id])
      .filter((e): e is SceneElement => Boolean(e))
      .map((e) => structuredClone(e));
    if (elements.length === 0) return;
    const name = window.prompt('Name this component', `Component ${savedPrefabs.length + 1}`);
    if (!name?.trim()) return;
    window.dispatchEvent(
      new CustomEvent('arcadery:save-prefab', {
        detail: { name: name.trim(), engine, elements },
      }),
    );
  };

  const deleteSavedPrefab = (id: string) => {
    // Optimistic: drop from the store now; web app persists the delete.
    useEditorStore.getState().removeSavedPrefab(id);
    window.dispatchEvent(new CustomEvent('arcadery:delete-prefab', { detail: { id } }));
  };

  const mySaved = savedPrefabs.filter((p) => p.engine === engine);

  return (
    <div className="w-[300px] rounded-xl border border-white/10 bg-[#1C1C1F] p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-wider text-white/40">
          Components · {engine === '2d' ? '2D' : '3D'}
        </p>
        <span className="text-[10px] text-white/25">click to add</span>
      </div>

      {/* Save current selection as a reusable component. */}
      <button
        onClick={saveSelection}
        disabled={selectedIds.length === 0}
        title={
          selectedIds.length === 0
            ? 'Select element(s) on the canvas to save them as a component'
            : 'Save selection as a reusable component'
        }
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#8b7ec8]/30 bg-[#8b7ec8]/[0.08] px-2.5 py-2 text-xs font-medium text-[#b3a7e8] transition-colors hover:border-[#8b7ec8]/60 hover:bg-[#8b7ec8]/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Save size={13} />
        Save selection{selectedIds.length > 0 ? ` (${selectedIds.length})` : ''}
      </button>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {/* User-saved components. */}
        {mySaved.length > 0 && (
          <div>
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Your components
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {mySaved.map((prefab) => (
                <div
                  key={prefab.id}
                  className="group relative flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-[#8b7ec8]/50 hover:bg-[#8b7ec8]/10"
                >
                  <button
                    onClick={() => addSavedPrefab(prefab)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <Package size={15} className="mt-0.5 shrink-0 text-white/50 group-hover:text-[#b3a7e8]" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-white/80">{prefab.name}</span>
                      <span className="block truncate text-[10px] text-white/35">
                        {prefab.elements.length} element{prefab.elements.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => deleteSavedPrefab(prefab.id)}
                    title="Delete component"
                    className="absolute right-1 top-1 rounded p-0.5 text-white/25 opacity-0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:opacity-100"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {PREFAB_CATEGORIES.map((category) => {
          const items = PREFABS.filter(
            (p) => p.category === category && p.engines.includes(engine),
          );
          if (items.length === 0) return null;
          return (
            <div key={category}>
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35">
                {category}
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((prefab) => {
                  const Icon = prefab.icon;
                  return (
                    <button
                      key={prefab.id}
                      onClick={() => addPrefab(prefab)}
                      className="group flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-left transition-colors hover:border-[#8b7ec8]/50 hover:bg-[#8b7ec8]/10"
                    >
                      <Icon size={15} className="mt-0.5 shrink-0 text-white/50 group-hover:text-[#b3a7e8]" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-white/80">
                          {prefab.label}
                        </span>
                        <span className="block truncate text-[10px] text-white/35">{prefab.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
