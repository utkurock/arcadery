'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const STORAGE_KEY = 'arcadery_editor_onboarded_v1';

const STEPS = [
  {
    title: 'Type to build',
    desc: 'Describe what you want in the chat panel — "add a player", "make the floor blue", "spawn enemies every 2 seconds".',
  },
  {
    title: 'Right-click any element',
    desc: 'Pick "Modify with AI" to remix it. Drag elements to reposition, or use the toolbar to add boxes, sprites, lights.',
  },
  {
    title: 'Mechanics & Code panels',
    desc: 'Click the chat capability buttons to tweak gravity, win conditions, and player controls — or open the JSON editor.',
  },
  {
    title: 'Play before publishing',
    desc: 'Press the Play button to test your scene. Publish when it feels right; share + launch a token from the play page.',
  },
];

export function OnboardingCoach() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        // Defer one tick so the editor visually settles before the overlay.
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch {}
  }, []);

  // Esc to skip.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function dismiss() {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  }

  if (!open || typeof document === 'undefined') return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Portal into document.body so no ancestor with a `transform` / `filter` /
  // `contain` style can constrain this fixed-position overlay. Previously the
  // overlay rendered inside the editor's flex root, and some R3F/Canvas-adjacent
  // wrapper was creating a containing block that locked the modal into the
  // left-bottom corner instead of true viewport center.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-coach-title"
      // Highest practical z-index. Click on the dimmed backdrop also dismisses.
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={dismiss}
    >
      <div
        // Stop propagation so clicking the card itself doesn't dismiss.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13141a] p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Numbered step badge — replaces the previous magic-wand / sparkle
                style icons that read as AI-flavored decoration. */}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#8b7ec8]/15 text-sm font-semibold text-[#a99ad4]">
              {String(step + 1).padStart(2, '0')}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 id="onboarding-coach-title" className="text-base font-semibold text-white">
                {current.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Skip onboarding"
            className="text-white/40 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-5 text-sm leading-relaxed text-white/70">{current.desc}</p>

        <div className="mb-5 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-[#8b7ec8]' : 'w-1.5 bg-white/15'
              }`}
              aria-hidden
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="text-xs font-medium text-white/40 hover:text-white/70"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/[0.08] hover:text-white"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
              className="rounded-lg bg-[#8b7ec8] px-5 py-1.5 text-xs font-semibold text-white hover:bg-[#7a6db8]"
            >
              {isLast ? 'Got it' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
