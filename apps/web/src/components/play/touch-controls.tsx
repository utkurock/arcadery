'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * On-screen touch controls for mobile / Solana Mobile Seeker. Synthesizes
 * keyboard events the BehaviorRuntime is already listening for, so we don't
 * have to thread a separate input bus through the engine.
 *
 * Auto-detects coarse-pointer / no-keyboard environments (typical phones).
 * Hidden on desktop unless the user passes `forceShow`.
 */

type ControllerKind = 'platformer' | 'top-down';

const KEY_BY_DIR: Record<string, string> = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: ' ',
};

function dispatchKey(type: 'keydown' | 'keyup', key: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
}

function useIsTouchEnv(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    setIsTouch(coarse || hasTouch);
  }, []);
  return isTouch;
}

export function TouchControls({
  kind,
  forceShow = false,
}: {
  kind: ControllerKind;
  forceShow?: boolean;
}) {
  const isTouch = useIsTouchEnv();
  if (!isTouch && !forceShow) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-30 flex items-end justify-between px-4 select-none">
      {kind === 'platformer' ? (
        <>
          <DirectionPad axes="horizontal" />
          <ActionButton dir="jump" label="JUMP" />
        </>
      ) : (
        <>
          <DirectionPad axes="all" />
          <div />
        </>
      )}
    </div>
  );
}

function DirectionPad({ axes }: { axes: 'horizontal' | 'all' }) {
  return (
    <div className="pointer-events-auto grid grid-cols-3 gap-1.5 grid-rows-3">
      <span />
      {axes === 'all' ? <PadButton dir="up" label="↑" /> : <span />}
      <span />
      <PadButton dir="left" label="←" />
      <span className="rounded-full bg-white/[0.04]" />
      <PadButton dir="right" label="→" />
      <span />
      {axes === 'all' ? <PadButton dir="down" label="↓" /> : <span />}
      <span />
    </div>
  );
}

function PadButton({ dir, label }: { dir: keyof typeof KEY_BY_DIR; label: string }) {
  return <Btn dir={dir} label={label} className="h-12 w-12 text-lg" />;
}

function ActionButton({
  dir,
  label,
}: {
  dir: keyof typeof KEY_BY_DIR;
  label: string;
}) {
  return (
    <Btn
      dir={dir}
      label={label}
      className="h-16 w-16 text-xs font-bold uppercase tracking-wider"
    />
  );
}

function Btn({
  dir,
  label,
  className,
}: {
  dir: keyof typeof KEY_BY_DIR;
  label: string;
  className?: string;
}) {
  const downRef = useRef(false);
  const key = KEY_BY_DIR[dir];

  const press = () => {
    if (downRef.current) return;
    downRef.current = true;
    dispatchKey('keydown', key);
    // Some browsers expect both lower and uppercase variants of letters; spaces
    // and arrows are unaffected. We keep it simple: only synthesize the canonical key.
  };
  const release = () => {
    if (!downRef.current) return;
    downRef.current = false;
    dispatchKey('keyup', key);
  };

  return (
    <button
      type="button"
      className={`pointer-events-auto rounded-full bg-black/55 backdrop-blur border border-white/10 text-white/90 active:bg-[#5db8a8]/40 active:border-[#5db8a8]/60 ${className ?? ''}`}
      onTouchStart={(e) => {
        e.preventDefault();
        press();
      }}
      onTouchEnd={(e) => {
        e.preventDefault();
        release();
      }}
      onTouchCancel={() => release()}
      onMouseDown={(e) => {
        e.preventDefault();
        press();
      }}
      onMouseUp={() => release()}
      onMouseLeave={() => release()}
      aria-label={`Press ${dir}`}
    >
      {label}
    </button>
  );
}
