'use client';

/**
 * ComponentsPanel — the ready-made building-block palette ("Canva blocks").
 * Lists behavior-wired prefabs grouped by category, filtered to the active
 * render engine, and drops the right 2D/3D variant into the scene on click.
 */

import { useEditorStore } from '../stores/editor-store';
import { PREFABS, PREFAB_CATEGORIES, type PrefabEngine, type Prefab } from '../prefabs/prefabs';

export function ComponentsPanel({ onClose }: { onClose: () => void }) {
  const renderEngine = useEditorStore((s) => s.scene.settings?.renderEngine ?? 'three');
  const engine: PrefabEngine = renderEngine === 'phaser' ? '2d' : '3d';

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

  return (
    <div className="w-[300px] rounded-xl border border-white/10 bg-[#1C1C1F] p-3 shadow-2xl">
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-wider text-white/40">
          Components · {engine === '2d' ? '2D' : '3D'}
        </p>
        <span className="text-[10px] text-white/25">click to add</span>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
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
