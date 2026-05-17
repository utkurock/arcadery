'use client';

import { useStore } from 'zustand';
import {
  Box,
  Circle,
  Square,
  Image,
  Type,
  Lightbulb,
  MousePointer2,
  Move,
  RotateCcw,
  Maximize2,
  Undo2,
  Redo2,
  Trash2,
  Plus,
  Play,
  Square as StopIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  createBoxElement,
  createSphereElement,
  createPlaneElement,
  createSpriteElement,
  createTextElement,
  createLightElement,
} from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';

const PRIMITIVES = [
  { type: 'box', label: 'Box', icon: Box, factory: createBoxElement },
  { type: 'sphere', label: 'Sphere', icon: Circle, factory: createSphereElement },
  { type: 'plane', label: 'Plane', icon: Square, factory: createPlaneElement },
  { type: 'sprite', label: 'Sprite', icon: Image, factory: createSpriteElement },
  { type: 'text', label: 'Text', icon: Type, factory: createTextElement },
  { type: 'light', label: 'Light', icon: Lightbulb, factory: createLightElement },
] as const;

const btn = 'p-1.5 rounded-md transition-colors';

export function CanvasToolbar() {
  const [showAdd, setShowAdd] = useState(false);
  const transformMode = useEditorStore((s) => s.transformMode);
  const selectedId = useEditorStore((s) => s.selectedIds[0] ?? null);
  const mode = useEditorStore((s) => s.mode);
  const hasGameState = useEditorStore((s) => Boolean(s.scene.gameState));
  const canUndo = useStore(useEditorStore.temporal, (s) => s.pastStates.length > 0);
  const canRedo = useStore(useEditorStore.temporal, (s) => s.futureStates.length > 0);

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-white/10 bg-black/60 backdrop-blur-md">
      {/* Play / Stop */}
      <button
        onClick={() => {
          const next = mode === 'play' ? 'edit' : 'play';
          useEditorStore.getState().setMode(next);
        }}
        disabled={!hasGameState && mode === 'edit'}
        className={`${btn} ${
          mode === 'play'
            ? 'bg-red-500/90 text-white hover:bg-red-500'
            : hasGameState
              ? 'bg-emerald-500/80 text-white hover:bg-emerald-500'
              : 'text-white/20 cursor-not-allowed'
        }`}
        title={
          mode === 'play'
            ? 'Stop test'
            : hasGameState
              ? 'Test play (game logic runs)'
              : 'Enable "Playable" in scene settings to test'
        }
      >
        {mode === 'play' ? <StopIcon size={15} /> : <Play size={15} />}
      </button>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Add element */}
      <div className="relative">
        <button
          onClick={() => setShowAdd(!showAdd)}
          className={`${btn} ${showAdd ? 'bg-[#8b7ec8] text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}
          title="Add Element"
        >
          <Plus size={16} />
        </button>

        {showAdd && (
          <div className="absolute top-full left-0 mt-2 bg-[#1C1C1F] border border-white/10 rounded-xl p-2 shadow-2xl min-w-[160px]">
            <p className="text-[10px] text-white/40 uppercase tracking-wider px-2 mb-1.5">Add Element</p>
            {PRIMITIVES.map(({ type, label, icon: Icon, factory }) => (
              <button
                key={type}
                onClick={() => {
                  const el = factory({ name: `${label} ${Date.now() % 1000}` } as never);
                  useEditorStore.getState().addElement(el);
                  useEditorStore.getState().setSelectedIds([el.id]);
                  setShowAdd(false);
                }}
                className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white text-xs transition-colors"
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Tools: Select / Move / Rotate / Scale */}
      <button
        onClick={() => useEditorStore.getState().setTransformMode('select')}
        className={`${btn} ${transformMode === 'select' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
        title="Select (V) — click to select, drag to move freely"
      >
        <MousePointer2 size={15} />
      </button>
      <button
        onClick={() => useEditorStore.getState().setTransformMode('translate')}
        className={`${btn} ${transformMode === 'translate' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
        title="Move (W) — axis-locked gizmo"
      >
        <Move size={15} />
      </button>
      <button
        onClick={() => useEditorStore.getState().setTransformMode('rotate')}
        className={`${btn} ${transformMode === 'rotate' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
        title="Rotate (E)"
      >
        <RotateCcw size={15} />
      </button>
      <button
        onClick={() => useEditorStore.getState().setTransformMode('scale')}
        className={`${btn} ${transformMode === 'scale' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/10'}`}
        title="Scale (R)"
      >
        <Maximize2 size={15} />
      </button>

      <div className="w-px h-5 bg-white/10 mx-0.5" />

      {/* Undo / Redo */}
      <button
        onClick={() => canUndo && useEditorStore.temporal.getState().undo()}
        className={`${btn} ${canUndo ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-white/20 cursor-not-allowed'}`}
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={15} />
      </button>
      <button
        onClick={() => canRedo && useEditorStore.temporal.getState().redo()}
        className={`${btn} ${canRedo ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-white/20 cursor-not-allowed'}`}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={15} />
      </button>

      {/* Delete */}
      {selectedId && (
        <>
          <div className="w-px h-5 bg-white/10 mx-0.5" />
          <button
            onClick={() => {
              const id = useEditorStore.getState().selectedIds[0] ?? null;
              if (id) useEditorStore.getState().removeElement(id);
            }}
            className={`${btn} text-red-400/60 hover:text-red-400 hover:bg-red-500/10`}
            title="Delete (Del)"
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
    </div>
  );
}
