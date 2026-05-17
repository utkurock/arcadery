'use client';

import { useState, useCallback } from 'react';

export interface AssetFrameInfo {
  mode: 'sheet' | 'animation' | 'model';
  frame_count?: number;
  frame_urls?: string[];
  frame_size?: { w: number; h: number };
  fps?: number;
  views?: readonly string[];
  // For 3D model assets
  provider?: string;
  thumbnail_url?: string;
  meshy_task_id?: string;
}

export interface AssetData {
  id: string;
  name: string;
  url: string;
  type: string;
  frameMetadata?: AssetFrameInfo | null;
}

type ModelArtStyle = 'realistic' | 'cartoon' | 'low-poly' | 'sculpture';

type GenerateStyle =
  | 'pixel-art'
  | 'cartoon'
  | '3d-render'
  | 'photorealistic'
  | 'hand-drawn'
  | 'none';

type GenerateMode = 'single' | 'sheet' | 'animation';

export interface AssetManagerProps {
  assets: AssetData[];
  uploading: boolean;
  error: string | null;
  onUpload: (file: File) => Promise<void>;
  onDelete: (asset: AssetData) => void;
  onUseInScene: (asset: AssetData) => void;
  onGenerate?: (opts: {
    prompt: string;
    style: GenerateStyle;
    mode: GenerateMode;
  }) => Promise<void>;
  onGenerate3D?: (opts: {
    prompt: string;
    artStyle: ModelArtStyle;
  }) => Promise<void>;
  onEdit?: (
    asset: AssetData,
    opts: { prompt: string; style: GenerateStyle },
  ) => Promise<void>;
}

const defaultProps: AssetManagerProps = {
  assets: [],
  uploading: false,
  error: null,
  onUpload: async () => {},
  onDelete: () => {},
  onUseInScene: () => {},
};

const STYLE_OPTIONS: { id: GenerateStyle; label: string }[] = [
  { id: 'pixel-art', label: 'Pixel art' },
  { id: 'cartoon', label: 'Cartoon' },
  { id: '3d-render', label: '3D render' },
  { id: 'photorealistic', label: 'Photoreal' },
  { id: 'hand-drawn', label: 'Hand-drawn' },
  { id: 'none', label: 'No style' },
];

export function AssetManager(props: Partial<AssetManagerProps> = {}) {
  const { assets, uploading, error, onUpload, onDelete, onUseInScene, onGenerate, onGenerate3D, onEdit } = {
    ...defaultProps,
    ...props,
  };

  const [search, setSearch] = useState('');
  const [genOpen, setGenOpen] = useState(false);
  const [gen3DOpen, setGen3DOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AssetData | null>(null);

  const handleUploadClick = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/gif';
    input.onchange = () => {
      if (!input.files) return;
      Array.from(input.files).forEach((file) => {
        onUpload(file);
      });
    };
    input.click();
  }, [onUpload]);

  const filtered = assets.filter((a) =>
    a.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="absolute inset-0 z-10 flex flex-col overflow-y-auto" style={{ backgroundColor: '#0D0D0E' }}>
      {/* Search */}
      <div className="px-6 pt-4 pb-4">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/20 transition-colors"
          />
        </div>
      </div>

      {/* Add buttons row */}
      <div className="px-6 pb-4 flex gap-3 flex-wrap">
        {onGenerate && (
          <button
            onClick={() => setGenOpen(true)}
            disabled={uploading}
            className="flex flex-col items-center gap-3 py-8 px-6 rounded-xl border border-[#8b7ec8]/30 bg-[#8b7ec8]/[0.05] hover:border-[#8b7ec8]/60 hover:bg-[#8b7ec8]/10 transition-all text-center group w-48 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-8 h-8 text-[#8b7ec8] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span className="text-xs font-semibold text-white">Generate 2D</span>
            <span className="text-[10px] text-white/40 leading-snug">
              Sprite, sheet, or walk-cycle animation
            </span>
          </button>
        )}

        {onGenerate3D && (
          <button
            onClick={() => setGen3DOpen(true)}
            disabled={uploading}
            className="flex flex-col items-center gap-3 py-8 px-6 rounded-xl border border-[#5db8a8]/30 bg-[#5db8a8]/[0.05] hover:border-[#5db8a8]/60 hover:bg-[#5db8a8]/10 transition-all text-center group w-48 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-8 h-8 text-[#5db8a8] group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
            <span className="text-xs font-semibold text-white">Generate 3D</span>
            <span className="text-[10px] text-white/40 leading-snug">
              Text → rigged GLB model · 15 cr
            </span>
          </button>
        )}

        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="flex flex-col items-center gap-3 py-8 px-6 rounded-xl border border-white/10 hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.04] transition-all text-center group w-48 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <div className="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          ) : (
            <svg className="w-8 h-8 text-white/40 group-hover:text-white/70 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
            </svg>
          )}
          <span className="text-xs font-medium text-white/80">
            {uploading ? 'Working...' : 'Upload image'}
          </span>
          <span className="text-[10px] text-white/30 leading-snug">
            PNG, JPEG, SVG, or GIF
          </span>
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-6 pb-3">
          <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
            {error}
          </p>
        </div>
      )}

      {/* Uploaded assets grid */}
      <div className="px-6 pb-6 flex-1">
        {filtered.length > 0 && (
          <div className="grid grid-cols-4 gap-3">
            {filtered.map((asset) => (
              <div
                key={asset.id}
                // Whole card is the drag handle. The inner <img> still has
                // draggable=false to avoid the browser hijacking the gesture
                // with its own image-drag ghost.
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy';
                  e.dataTransfer.setData(
                    'application/x-arcadery-asset',
                    JSON.stringify({
                      id: asset.id,
                      name: asset.name,
                      url: asset.url,
                      type: asset.type,
                      frameMetadata: asset.frameMetadata ?? null,
                    }),
                  );
                }}
                className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02] group relative cursor-grab active:cursor-grabbing hover:border-[#8b7ec8]/40 transition-colors"
              >
                <div className="aspect-[4/3] bg-white/5 overflow-hidden relative pointer-events-none">
                  {asset.type.startsWith('image/') ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : asset.frameMetadata?.thumbnail_url ? (
                    <img
                      src={asset.frameMetadata.thumbnail_url}
                      alt={asset.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <svg className="w-10 h-10 text-[#5db8a8]/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                      </svg>
                    </div>
                  )}
                  {asset.frameMetadata?.mode && (
                    <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-white/80">
                      {asset.frameMetadata.mode === 'animation'
                        ? `anim · ${asset.frameMetadata.frame_count ?? 0}f`
                        : asset.frameMetadata.mode === 'sheet'
                          ? '6-view'
                          : asset.frameMetadata.mode === 'model'
                            ? '3D'
                            : asset.frameMetadata.mode}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-white/60 truncate flex-1">{asset.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => onUseInScene(asset)}
                      className="p-1 text-white/30 hover:text-green-400 transition-colors"
                      title="Use in scene (or drag the card onto the canvas)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M12 4v16m8-8H4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent('arcadery:attach-asset-to-chat', {
                            detail: {
                              id: asset.id,
                              name: asset.name,
                              url: asset.url,
                              type: asset.type,
                            },
                          }),
                        )
                      }
                      className="p-1 text-white/30 hover:text-white transition-colors"
                      title="Attach to chat as reference"
                    >
                      {/* Paperclip — neutral attach affordance. */}
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                    {onEdit && (
                      <button
                        onClick={() => setEditTarget(asset)}
                        className="p-1 text-white/30 hover:text-[#8b7ec8] transition-colors"
                        title="Modify with AI (2 credits)"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={async () => {
                        // Direct download via fetch+blob — using just an <a download>
                        // on a cross-origin Supabase URL navigates instead of
                        // saving. Blob URL keeps it as a Save dialog.
                        try {
                          const res = await fetch(asset.url);
                          if (!res.ok) throw new Error('fetch failed');
                          const blob = await res.blob();
                          const objectUrl = URL.createObjectURL(blob);
                          const safeName = (asset.name || 'asset')
                            .replace(/[^a-z0-9._-]/gi, '_')
                            .replace(/\.(png|jpg|jpeg|webp)?$/i, '');
                          const a = document.createElement('a');
                          a.href = objectUrl;
                          a.download = `${safeName}.png`;
                          a.click();
                          URL.revokeObjectURL(objectUrl);
                        } catch {
                          // Fallback: open in new tab so user can save manually
                          window.open(asset.url, '_blank', 'noopener');
                        }
                      }}
                      className="p-1 text-white/30 hover:text-white transition-colors"
                      title="Download as PNG"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(asset)}
                      className="p-1 text-white/30 hover:text-red-400 transition-colors"
                      title="Delete asset"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {assets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-white/20">No assets yet</p>
            <p className="text-xs text-white/10 mt-1">Generate with AI or upload from your computer</p>
          </div>
        )}
      </div>

      {genOpen && onGenerate && (
        <GenerateModal
          uploading={uploading}
          onClose={() => setGenOpen(false)}
          onSubmit={async (opts) => {
            try {
              await onGenerate(opts);
              setGenOpen(false);
            } catch {
              // error surfaced via `error` prop
            }
          }}
        />
      )}

      {gen3DOpen && onGenerate3D && (
        <Generate3DModal
          uploading={uploading}
          onClose={() => setGen3DOpen(false)}
          onSubmit={async (opts) => {
            try {
              await onGenerate3D(opts);
              setGen3DOpen(false);
            } catch {
              // surfaced via error prop
            }
          }}
        />
      )}

      {editTarget && onEdit && (
        <EditModal
          asset={editTarget}
          uploading={uploading}
          onClose={() => setEditTarget(null)}
          onSubmit={async (opts) => {
            try {
              await onEdit(editTarget, opts);
              setEditTarget(null);
            } catch {
              // surfaced via error prop
            }
          }}
        />
      )}
    </div>
  );
}

function GenerateModal({
  uploading,
  onClose,
  onSubmit,
}: {
  uploading: boolean;
  onClose: () => void;
  onSubmit: (opts: {
    prompt: string;
    style: GenerateStyle;
    mode: GenerateMode;
  }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<GenerateStyle>('pixel-art');
  const [mode, setMode] = useState<GenerateMode>('single');
  const canSubmit = prompt.trim().length >= 3 && !uploading;
  const cost = mode === 'animation' ? 6 : mode === 'sheet' ? 5 : 3;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-[#8b7ec8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
              Generate image
            </h2>
            <p className="mt-0.5 text-xs text-white/40">Powered by OpenAI gpt-image-1</p>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        {/* Mode picker */}
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-1">
          <ModeButton
            active={mode === 'single'}
            onClick={() => setMode('single')}
            disabled={uploading}
            label="Single"
            caption="1024² · 3 cr"
          />
          <ModeButton
            active={mode === 'sheet'}
            onClick={() => setMode('sheet')}
            disabled={uploading}
            label="Sprite sheet"
            caption="6 views · 5 cr"
          />
          <ModeButton
            active={mode === 'animation'}
            onClick={() => setMode('animation')}
            disabled={uploading}
            label="Animation"
            caption="6 frames · 6 cr"
          />
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
          Describe the subject
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={1200}
          placeholder={
            mode === 'sheet'
              ? 'A red racing car, clean lines, metallic paint'
              : mode === 'animation'
                ? 'A knight walking — one full step cycle, side view'
                : 'A red racing car, side view, transparent background'
          }
          disabled={uploading}
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 resize-none disabled:opacity-60"
          autoFocus
        />
        {mode === 'sheet' && (
          <p className="mt-1.5 text-[11px] text-white/30">
            Renders 6 views automatically: front · front ¾ · side · back ¾ · back · top-down.
          </p>
        )}
        {mode === 'animation' && (
          <p className="mt-1.5 text-[11px] text-white/30">
            6-frame loop, side-view. Plays at 8 fps in the editor — drop into the scene to see it move.
          </p>
        )}

        <div className="mt-4">
          <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
            Style
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                disabled={uploading}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  style === s.id
                    ? 'border-[#8b7ec8]/60 bg-[#8b7ec8]/20 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-white/30">{prompt.length}/1200</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ prompt: prompt.trim(), style, mode })}
              disabled={!canSubmit}
              className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {uploading && (
                <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
              )}
              {uploading ? 'Generating…' : `Generate (${cost} credits)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  disabled,
  label,
  caption,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  label: string;
  caption: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-md px-3 py-2 text-left transition-colors disabled:opacity-60 ${
        active ? 'bg-[#8b7ec8]/15 text-white' : 'text-white/50 hover:text-white/80'
      }`}
    >
      <div className="text-xs font-semibold">{label}</div>
      <div className="text-[10px] text-white/30 font-mono tabular-nums">{caption}</div>
    </button>
  );
}

function EditModal({
  asset,
  uploading,
  onClose,
  onSubmit,
}: {
  asset: AssetData;
  uploading: boolean;
  onClose: () => void;
  onSubmit: (opts: { prompt: string; style: GenerateStyle }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<GenerateStyle>('none');
  const canSubmit = prompt.trim().length >= 3 && !uploading;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-[#8b7ec8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
              Modify with AI
            </h2>
            <p className="mt-0.5 text-xs text-white/40">
              Creates a new asset — original stays put
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>

        <div className="mb-4 flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.url} alt="" className="h-full w-full object-cover" draggable={false} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-white/80 truncate">{asset.name}</p>
            <p className="text-[10px] text-white/30">Current asset</p>
          </div>
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
          What should change?
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={1200}
          placeholder="Make the car blue and add racing stripes"
          disabled={uploading}
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#8b7ec8]/40 resize-none disabled:opacity-60"
          autoFocus
        />

        <div className="mt-4">
          <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
            Style override
          </label>
          <div className="flex flex-wrap gap-2">
            {STYLE_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                disabled={uploading}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  style === s.id
                    ? 'border-[#8b7ec8]/60 bg-[#8b7ec8]/20 text-white'
                    : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:text-white'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-white/30">{prompt.length}/1200</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onSubmit({ prompt: prompt.trim(), style })}
              disabled={!canSubmit}
              className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white hover:bg-[#7a6db8] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {uploading && (
                <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
              )}
              {uploading ? 'Editing…' : 'Modify (2 credits)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ART_STYLES: { id: ModelArtStyle; label: string; caption: string }[] = [
  { id: "cartoon", label: "Cartoon", caption: "Stylized + bold" },
  { id: "realistic", label: "Realistic", caption: "PBR materials" },
  { id: "low-poly", label: "Low-poly", caption: "Game-ready faces" },
  { id: "sculpture", label: "Sculpture", caption: "Smooth no-color" },
];

function Generate3DModal({
  uploading,
  onClose,
  onSubmit,
}: {
  uploading: boolean;
  onClose: () => void;
  onSubmit: (opts: { prompt: string; artStyle: ModelArtStyle }) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [artStyle, setArtStyle] = useState<ModelArtStyle>("cartoon");
  const canSubmit = prompt.trim().length >= 3 && !uploading;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !uploading) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <svg className="w-5 h-5 text-[#5db8a8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z M3.27 6.96L12 12.01l8.73-5.05 M12 22.08V12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
              </svg>
              Generate 3D model
            </h2>
            <p className="mt-0.5 text-xs text-white/40">Powered by Meshy text-to-3D · GLB output</p>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-white/40 hover:text-white/80 disabled:opacity-30"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
          Describe the model
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          maxLength={1200}
          placeholder="A friendly robot mascot, blue and white, big eyes"
          disabled={uploading}
          autoFocus
          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-white/25 outline-none focus:border-[#5db8a8]/40 resize-none disabled:opacity-60"
        />
        <p className="mt-1.5 text-[11px] text-white/30">
          Generation takes ~60-90s. Includes a preview mesh ready to drop into your scene.
        </p>

        <div className="mt-4">
          <label className="block text-[11px] uppercase tracking-widest text-white/40 mb-2">
            Art style
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ART_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setArtStyle(s.id)}
                disabled={uploading}
                className={`rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-60 ${
                  artStyle === s.id
                    ? "border-[#5db8a8]/60 bg-[#5db8a8]/15"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                <div className="text-xs font-semibold text-white">{s.label}</div>
                <div className="text-[10px] text-white/40">{s.caption}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <span className="text-[11px] text-white/30">{prompt.length}/1200</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={uploading}
              className="rounded-lg px-4 py-2 text-xs font-medium text-white/60 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit({ prompt: prompt.trim(), artStyle })}
              className="rounded-lg bg-[#5db8a8] px-5 py-2 text-xs font-semibold text-white hover:bg-[#4ca597] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {uploading && (
                <span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" />
              )}
              {uploading ? "Generating…" : "Generate (15 credits)"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
