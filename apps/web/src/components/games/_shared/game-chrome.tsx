'use client';

import { useEffect, useState } from 'react';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { gameAudio } from './audio';

// Shared in-game chrome: mute toggle + pause overlay.
//
// Pause wiring is per-game (each owns its rAF loop): the game keeps a
// `pausedRef`, calls usePauseKey to toggle on Esc/P, skips simulation while
// paused, and renders <PauseOverlay> on top.

/** Toggles on Escape / P. Games gate the callback on their own status. */
export function usePauseKey(onToggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        e.preventDefault();
        onToggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onToggle]);
}

export function MuteButton({ className }: { className?: string }) {
  const [muted, setMuted] = useState(gameAudio.muted);
  return (
    <button
      type="button"
      onClick={() => setMuted(gameAudio.toggleMuted())}
      aria-label={muted ? 'Unmute sound' : 'Mute sound'}
      className={
        className ??
        'pointer-events-auto inline-flex items-center justify-center rounded-md border border-white/15 bg-white/10 p-1.5 text-white/80 hover:bg-white/20'
      }
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

export function PauseButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Pause game"
      className={
        className ??
        'pointer-events-auto inline-flex items-center justify-center rounded-md border border-white/15 bg-white/10 p-1.5 text-white/80 hover:bg-white/20'
      }
    >
      <Pause className="h-3.5 w-3.5" />
    </button>
  );
}

export function PauseOverlay({
  open,
  onResume,
  onRestart,
  onExit,
  hint,
  accentClass = 'bg-violet-500 hover:bg-violet-600',
}: {
  open: boolean;
  onResume: () => void;
  onRestart?: () => void;
  onExit?: () => void;
  /** Short controls reminder shown under the buttons. */
  hint?: string;
  /** Tailwind classes for the resume button background. */
  accentClass?: string;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="rounded-2xl border border-white/15 bg-zinc-900/90 p-8 text-center max-w-sm font-mono">
        <h2 className="text-3xl font-black mb-1 text-white tracking-wide">PAUSED</h2>
        <p className="text-xs text-zinc-400 mb-6">Esc / P to resume</p>
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onResume}
            className={`inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-colors ${accentClass}`}
          >
            <Play className="h-4 w-4" /> Resume
          </button>
          {onRestart && (
            <button
              type="button"
              onClick={onRestart}
              className="rounded-full border border-white/15 bg-white/5 px-6 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/10"
            >
              Restart run
            </button>
          )}
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="rounded-full px-6 py-2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              Quit to lobby
            </button>
          )}
        </div>
        <div className="mt-6 flex items-center justify-center gap-3">
          <MuteButton />
        </div>
        {hint && (
          <p className="mt-4 text-[10px] uppercase tracking-[0.3em] text-zinc-500">{hint}</p>
        )}
      </div>
    </div>
  );
}
