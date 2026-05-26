'use client';

import { useState } from 'react';
import { DEFAULT_ECONOMY } from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';
import { useScrollLock } from '../hooks/use-scroll-lock';
import { EconomyForm, EconomySummary, ECONOMY_MODELS } from './game-economy-settings';

export interface PublishFlowProps {
  open: boolean;
  onClose: () => void;
  /** Performs the actual publish. Returns the slug on success, or null when the
   *  host needs the user to authenticate first. */
  onPublish?: () => Promise<string | null>;
  /** Called with the slug after a successful publish so the host can show its
   *  share UI. */
  onPublished?: (slug: string) => void;
}

type Step = 'monetize' | 'review';
const STEPS: { id: Step; label: string }[] = [
  { id: 'monetize', label: 'Monetize' },
  { id: 'review', label: 'Review' },
];

/**
 * Two-step launch wizard that replaces the old "instant publish" button. The
 * monetization config that used to hide behind the gear icon is now the first
 * thing a creator sees on their way to going live: Monetize → Review → (publish)
 * → the host's "Published!" share modal.
 */
export function PublishFlow({ open, onClose, onPublish, onPublished }: PublishFlowProps) {
  const [step, setStep] = useState<Step>('monetize');
  const [publishing, setPublishing] = useState(false);

  const sceneName = useEditorStore((s) => s.scene.name) || 'Untitled Game';
  const config = useEditorStore((s) => s.scene.economy ?? DEFAULT_ECONOMY);

  useScrollLock(open);
  if (!open) return null;

  const revenueTotal = config.rewards.winnerShare + config.rewards.creatorShare + config.rewards.platformShare;
  const revenueOk = config.model === 'free' || revenueTotal === 100;
  const modelLabel = ECONOMY_MODELS.find((m) => m.id === config.model)?.label ?? 'Free to Play';

  const close = () => {
    setStep('monetize');
    onClose();
  };

  const goLive = async () => {
    if (!onPublish || publishing) return;
    setPublishing(true);
    try {
      const slug = await onPublish();
      if (slug) {
        onPublished?.(slug);
        setStep('monetize'); // reset for next time
      } else {
        // Host listens for this to open its auth UI; keep the editor decoupled.
        window.dispatchEvent(new CustomEvent('arcadery:auth-required'));
      }
    } finally {
      setPublishing(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl">
        {/* Header + step rail */}
        <div className="shrink-0 border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">Publish “{sceneName}”</h2>
              <p className="mt-0.5 text-xs text-white/30">Set up how your game earns, then go live.</p>
            </div>
            <button onClick={close} className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/60">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
            </button>
          </div>

          {/* Progress: Monetize · Review · Live */}
          <div className="mt-4 flex items-center gap-2">
            {STEPS.map((s, i) => (
              <Segment key={s.id} label={s.label} active={i === stepIndex} done={i < stepIndex} />
            ))}
            <Segment label="Live" active={false} done={false} terminal />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {step === 'monetize' && <EconomyForm />}

          {step === 'review' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
                <p className="text-xs uppercase tracking-wider text-white/30">Going live</p>
                <p className="mt-1 text-lg font-semibold text-white">{sceneName}</p>
                <p className="mt-1 text-xs text-white/40">
                  Monetization: <span className="text-white/70">{modelLabel}</span>
                </p>
              </div>

              {config.model !== 'free' ? (
                <EconomySummary />
              ) : (
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 text-xs text-white/40">
                  This game is free to play — no wallet or token required. You can add monetization any time by editing and re-publishing.
                </div>
              )}

              {!revenueOk && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3 text-xs text-red-300">
                  Revenue split must total 100% before publishing. Go back to Monetize to fix it.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4">
          <span className="text-[11px] text-white/30">Auto-saved with your project</span>
          <div className="flex items-center gap-2">
            {step === 'review' && (
              <button
                onClick={() => setStep('monetize')}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.05]"
              >
                Back
              </button>
            )}
            {step === 'monetize' ? (
              <button
                onClick={() => setStep('review')}
                className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8]"
              >
                Next: Review
              </button>
            ) : (
              <button
                onClick={goLive}
                disabled={publishing || !revenueOk}
                className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#7a6db8] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishing ? 'Publishing…' : 'Publish & go live'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Segment({ label, active, done, terminal }: { label: string; active: boolean; done: boolean; terminal?: boolean }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
          done
            ? 'bg-[#8b7ec8] text-white'
            : active
              ? 'bg-[#8b7ec8]/20 text-[#8b7ec8] ring-1 ring-[#8b7ec8]/50'
              : 'bg-white/[0.06] text-white/30'
        }`}
      >
        {done ? (
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /></svg>
        ) : terminal ? (
          '★'
        ) : (
          ''
        )}
      </span>
      <span className={`text-[11px] font-medium ${active ? 'text-white/80' : 'text-white/30'}`}>{label}</span>
      {!terminal && <span className="h-px flex-1 bg-white/[0.08]" />}
    </div>
  );
}
