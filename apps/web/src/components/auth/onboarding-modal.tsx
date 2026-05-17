'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, X } from 'lucide-react';
import { useModals } from '@/lib/ui/modals';
import { useScrollLock } from '@/lib/ui/use-scroll-lock';

const ONBOARDED_KEY = 'arcadery_onboarded';

type Slide = {
  title: string;
  body: string;
  // Future: image/video URL — for now we render a numbered placeholder.
  media?: { kind: 'placeholder'; tint: string };
};

const SLIDES: Slide[] = [
  {
    title: 'Welcome to Arcadery',
    body:
      'Describe a game in plain English and our AI builds a playable Three.js scene for you. No code, no engine setup — just an idea and a prompt.',
    media: { kind: 'placeholder', tint: '#8b7ec8' },
  },
  {
    title: 'You start with 5 credits, free',
    body:
      'Credits power AI generations — building scenes, editing assets, generating images. Every new account gets 5 to play with. Top up anytime from the Credits page.',
    media: { kind: 'placeholder', tint: '#6db8a4' },
  },
  {
    title: 'Launch your game on Solana',
    body:
      'When your game is ready, deploy it on-chain with one click. Arcadery spins up a bonding-curve token tied to your game so players can buy in and you earn from every transaction.',
    media: { kind: 'placeholder', tint: '#c87ec8' },
  },
  {
    title: 'Own it. Share it. Earn.',
    body:
      'Your code, assets, and token authority belong to you — export anytime. Publish to Explore so players can discover your game, climb your leaderboard, and trade your token.',
    media: { kind: 'placeholder', tint: '#c8a87e' },
  },
];

export function OnboardingModal() {
  const open = useModals((s) => s.onboardingOpen);
  const close = useModals((s) => s.closeOnboarding);
  const [index, setIndex] = useState(0);

  useScrollLock(open);

  // Reset to first slide each time the modal opens so a returning view starts fresh.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  if (!open) return null;

  const slide = SLIDES[index];
  const isLast = index === SLIDES.length - 1;

  function finish() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(ONBOARDED_KEY, '1');
      }
    } catch {}
    close();
  }

  function skip() {
    finish();
  }

  function next() {
    if (isLast) {
      finish();
      return;
    }
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#13141a] shadow-2xl">
        <div className="relative">
          {/* Media placeholder — swap for <video> / <Image> later. */}
          <div
            className="h-44 w-full overflow-hidden rounded-t-2xl"
            style={{
              background: `radial-gradient(circle at 30% 30%, ${slide.media?.tint}33, transparent 60%), radial-gradient(circle at 70% 70%, ${slide.media?.tint}22, transparent 50%), #0e0f15`,
            }}
            aria-hidden="true"
          >
            <div className="flex h-full w-full items-center justify-center">
              {/* Numbered placeholder where a screenshot/video will go later. */}
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 text-lg font-semibold text-white/70"
                style={{ background: `${slide.media?.tint}1a` }}
              >
                {String(index + 1).padStart(2, '0')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={skip}
            aria-label="Skip onboarding"
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/60 hover:bg-black/60 hover:text-white/90"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="px-6 pb-5 pt-5">
          <h2 className="text-lg font-semibold text-white">{slide.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-white/60">{slide.body}</p>

          <div className="mt-5 flex items-center justify-between">
            <div className="flex items-center gap-1.5" aria-label="Progress">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? 'w-5 bg-[#8b7ec8]'
                      : i < index
                        ? 'w-1.5 bg-white/40'
                        : 'w-1.5 bg-white/15'
                  }`}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {!isLast && (
                <button
                  type="button"
                  onClick={skip}
                  className="rounded-lg px-3 py-2 text-xs text-white/45 hover:text-white/80"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex items-center gap-1.5 rounded-lg bg-[#8b7ec8] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
              >
                {isLast ? 'Start building' : 'Next'}
                {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Open the onboarding modal only if this device has not seen it yet. */
export function maybeOpenOnboardingForNewUser(force = false) {
  try {
    if (!force && typeof localStorage !== 'undefined') {
      if (localStorage.getItem(ONBOARDED_KEY)) return;
    }
  } catch {}
  useModals.getState().openOnboarding();
}
