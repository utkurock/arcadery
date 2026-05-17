'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Trash2 } from 'lucide-react';
import { useEditorStore } from '../stores/editor-store';

export interface ElementContextMenuProps {
  /**
   * Called when the user picks "Modify with AI" on a sprite element.
   * The host page wires this to the existing edit pipeline; the menu only
   * captures the prompt and the target element id, then calls back.
   */
  onModifyAi?: (params: {
    elementId: string;
    assetId: string;
    prompt: string;
  }) => Promise<void>;
}

export function ElementContextMenu({ onModifyAi }: ElementContextMenuProps = {}) {
  const target = useEditorStore((s) => s.contextMenuTarget);
  const close = useEditorStore((s) => s.closeContextMenu);
  const remove = useEditorStore((s) => s.removeElement);
  const element = useEditorStore((s) =>
    target ? s.scene.elements[target.elementId] : null,
  );

  const [modifyOpen, setModifyOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return close();
      if (ref.current.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [target, close]);

  if (!target || !element) return null;

  const isSpriteWithAsset =
    element.type === 'sprite' && Boolean(element.assetId) && Boolean(onModifyAi);

  const px = Math.min(target.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220);
  const py = Math.min(target.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 200);

  return (
    <>
      <div
        ref={ref}
        className="fixed z-[60] min-w-[200px] rounded-lg border border-white/10 bg-[#13141a]/95 backdrop-blur p-1 shadow-2xl"
        style={{ left: px, top: py }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {isSpriteWithAsset && (
          <MenuItem
            icon={<Sparkles size={14} className="text-[#8b7ec8]" />}
            label="Modify with AI"
            shortcut="2 cr"
            onClick={() => setModifyOpen(true)}
          />
        )}
        <MenuItem
          icon={<Copy size={14} />}
          label="Duplicate"
          disabled
          onClick={() => {
            close();
          }}
        />
        <div className="my-1 h-px bg-white/5" />
        <MenuItem
          icon={<Trash2 size={14} className="text-red-400/80" />}
          label="Delete"
          shortcut="⌫"
          onClick={() => {
            remove(target.elementId);
            close();
          }}
        />
      </div>

      {modifyOpen && isSpriteWithAsset && (
        <ModifyAiModal
          onClose={() => {
            setModifyOpen(false);
            close();
          }}
          onSubmit={async (prompt) => {
            if (!onModifyAi || !element.assetId) return;
            await onModifyAi({
              elementId: target.elementId,
              assetId: element.assetId,
              prompt,
            });
            setModifyOpen(false);
            close();
          }}
        />
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs text-white/80 hover:bg-white/[0.06] hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {shortcut && <span className="text-[10px] text-white/30 font-mono">{shortcut}</span>}
    </button>
  );
}

function ModifyAiModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (prompt: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canSubmit = prompt.trim().length >= 3 && !busy;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Sparkles size={18} className="text-[#8b7ec8]" />
              Modify with AI
            </h2>
            <p className="mt-0.5 text-xs text-white/40">
              Replaces this element&apos;s asset with an AI-edited version
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
          What should change?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={1200}
          placeholder="Make it blue with glowing eyes"
          disabled={busy}
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 resize-none disabled:opacity-60"
        />

        {err && (
          <p className="mt-2 text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-md px-2 py-1">
            {err}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onSubmit(prompt.trim());
              } catch (e) {
                setErr(e instanceof Error ? e.message : 'Modify failed');
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
          >
            {busy && (
              <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
            )}
            {busy ? 'Modifying…' : 'Apply (2 credits)'}
          </button>
        </div>
      </div>
    </div>
  );
}
