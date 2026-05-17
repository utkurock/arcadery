'use client';

import { useEditorStore } from '../stores/editor-store';
import { useScrollLock } from '../hooks/use-scroll-lock';
import type { Behavior, GameStateConfig, SceneElement } from '@arcadery/shared';

const DEFAULT_GAME_STATE: GameStateConfig = {
  initialScore: 0,
  initialHealth: 3,
  winScore: 0,
  winSurviveSec: 0,
};

const QUICK_BG = ['#17181e', '#0a0a0f', '#1e293b', '#0f172a', '#312e81', '#1e1b4b', '#7c2d12', '#0c4a6e'];

type ControllerBehavior = Extract<
  Behavior,
  { type: 'platformer-controller' | 'top-down-controller' }
>;

function findPlayerController(
  elements: Record<string, SceneElement>,
): { elementId: string; elementName: string; index: number; behavior: ControllerBehavior } | null {
  for (const [id, el] of Object.entries(elements)) {
    const behaviors = el.behaviors;
    if (!behaviors?.length) continue;
    const idx = behaviors.findIndex(
      (b) => b.type === 'platformer-controller' || b.type === 'top-down-controller',
    );
    if (idx !== -1) {
      return {
        elementId: id,
        elementName: el.name,
        index: idx,
        behavior: behaviors[idx] as ControllerBehavior,
      };
    }
  }
  return null;
}

export function GameMechanicsSettings({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const sceneSettings = useEditorStore((s) => s.scene.settings);
  const sceneGameState = useEditorStore((s) => s.scene.gameState);
  const elements = useEditorStore((s) => s.scene.elements);
  const setGameState = useEditorStore((s) => s.setGameState);
  const updateSceneSettings = useEditorStore((s) => s.updateSceneSettings);

  useScrollLock(isOpen);

  if (!isOpen) return null;

  const gameState: GameStateConfig = sceneGameState ?? DEFAULT_GAME_STATE;
  const gravityY = sceneSettings.gravity?.y ?? -9.81;
  const ambient = sceneSettings.ambientLightIntensity ?? 0.4;
  const bgColor = sceneSettings.backgroundColor ?? '#17181e';

  const updateGameState = (patch: Partial<GameStateConfig>) => {
    setGameState({ ...gameState, ...patch });
  };

  const playerCandidates = Object.entries(elements)
    .filter(([, el]) => (el.tags ?? []).includes('player'))
    .map(([id, el]) => ({ id, name: el.name }));

  const controller = findPlayerController(elements);

  function patchController(patch: Partial<ControllerBehavior>) {
    if (!controller) return;
    const el = elements[controller.elementId];
    if (!el) return;
    const nextBehaviors = [...(el.behaviors ?? [])];
    nextBehaviors[controller.index] = {
      ...controller.behavior,
      ...patch,
    } as ControllerBehavior;
    useEditorStore.getState().updateElement(controller.elementId, {
      behaviors: nextBehaviors,
    } as Partial<SceneElement>);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#0d0d14] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Game Mechanics</h2>
            <p className="mt-0.5 text-xs text-white/30">
              Tune scene-wide rules — gravity, lighting, win conditions, and starting score.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <div className="space-y-8 p-6">
          {/* World */}
          <Section
            title="World"
            description="Backdrop and physics that apply to the entire scene."
          >
            <Field label="Background color">
              <div className="flex flex-wrap items-center gap-2">
                <label
                  className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-white/15 transition-colors hover:border-white/30"
                  style={{ backgroundColor: bgColor }}
                  title="Pick a custom color"
                >
                  <input
                    type="color"
                    value={bgColor}
                    onChange={(e) =>
                      updateSceneSettings({ backgroundColor: e.target.value })
                    }
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Background color"
                  />
                </label>
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => updateSceneSettings({ backgroundColor: e.target.value })}
                  className="w-28 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-xs text-white/80 outline-none focus:border-[#8b7ec8]/40"
                />
                <div className="flex gap-1.5">
                  {QUICK_BG.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => updateSceneSettings({ backgroundColor: c })}
                      className="h-6 w-6 rounded-md border border-white/10 transition-transform hover:scale-110"
                      style={{ backgroundColor: c }}
                      aria-label={`Use ${c}`}
                    />
                  ))}
                </div>
              </div>
            </Field>

            <Field
              label="Scene gravity (Y)"
              hint={
                controller?.behavior.type === 'platformer-controller'
                  ? 'Used by 3D physics. Player gravity below overrides this.'
                  : 'Negative pulls down. Try −9.81 for Earth, −2 for floaty, 0 for top-down.'
              }
            >
              <SliderInput
                value={gravityY}
                onChange={(v) =>
                  updateSceneSettings({ gravity: { x: 0, y: v, z: 0 } })
                }
                min={-30}
                max={30}
                step={0.1}
                unit=""
              />
            </Field>

            <Field label="Ambient light" hint="Overall scene brightness — 0 is dark, 1 is full.">
              <SliderInput
                value={ambient}
                onChange={(v) => updateSceneSettings({ ambientLightIntensity: v })}
                min={0}
                max={1.5}
                step={0.05}
                unit=""
              />
            </Field>
          </Section>

          {/* Player controller — surfaces per-element behavior fields if a controller is wired */}
          {controller && (
            <Section
              title={`Controls — ${controller.elementName}`}
              description={
                controller.behavior.type === 'platformer-controller'
                  ? 'These overrides come from the player\'s platformer-controller behavior. They beat scene gravity above.'
                  : 'These overrides come from the player\'s top-down-controller behavior.'
              }
            >
              <Field label="Move speed" hint="Units per second.">
                <SliderInput
                  value={controller.behavior.speed}
                  onChange={(v) =>
                    patchController({ speed: Math.max(0.1, Math.min(50, v)) } as Partial<ControllerBehavior>)
                  }
                  min={0.1}
                  max={50}
                  step={0.1}
                  unit="u/s"
                />
              </Field>

              {controller.behavior.type === 'platformer-controller' && (
                <>
                  <Field label="Jump velocity" hint="How hard the jump kicks. 12 ≈ Mario.">
                    <SliderInput
                      value={controller.behavior.jumpVelocity}
                      onChange={(v) =>
                        patchController({
                          jumpVelocity: Math.max(0.1, Math.min(50, v)),
                        } as Partial<ControllerBehavior>)
                      }
                      min={0.1}
                      max={50}
                      step={0.1}
                      unit="u/s"
                    />
                  </Field>
                  <Field
                    label="Player gravity"
                    hint="Per-player gravity. Most playable templates ignore scene gravity in favor of this."
                  >
                    <SliderInput
                      value={controller.behavior.gravity}
                      onChange={(v) =>
                        patchController({
                          gravity: Math.max(0, Math.min(200, v)),
                        } as Partial<ControllerBehavior>)
                      }
                      min={0}
                      max={200}
                      step={1}
                      unit=""
                    />
                  </Field>
                </>
              )}

              <Field label="Controls">
                <select
                  value={controller.behavior.controls}
                  onChange={(e) =>
                    patchController({
                      controls: e.target.value as 'wasd' | 'arrows' | 'both',
                    } as Partial<ControllerBehavior>)
                  }
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white/80 outline-none focus:border-[#8b7ec8]/40"
                >
                  <option value="both">WASD + Arrows</option>
                  <option value="wasd">WASD only</option>
                  <option value="arrows">Arrows only</option>
                </select>
              </Field>
            </Section>
          )}

          {/* Player state */}
          <Section
            title="Player"
            description="Starting values when the player presses Play."
          >
            <Field label="Starting health">
              <SliderInput
                value={gameState.initialHealth}
                onChange={(v) => updateGameState({ initialHealth: Math.round(v) })}
                min={0}
                max={20}
                step={1}
                unit="hp"
              />
            </Field>

            <Field label="Starting score">
              <SliderInput
                value={gameState.initialScore}
                onChange={(v) => updateGameState({ initialScore: Math.round(v) })}
                min={0}
                max={1000}
                step={10}
                unit=""
              />
            </Field>

            {playerCandidates.length > 0 && (
              <Field
                label="Camera follows"
                hint='Element with the "player" tag the camera tracks during play.'
              >
                <select
                  value={gameState.cameraFollowId ?? ''}
                  onChange={(e) =>
                    updateGameState({
                      cameraFollowId: e.target.value || undefined,
                    })
                  }
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-white/80 outline-none focus:border-[#8b7ec8]/40"
                >
                  <option value="">— None —</option>
                  {playerCandidates.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
          </Section>

          {/* Win conditions */}
          <Section title="Win conditions" description="0 means disabled. Either condition triggers a win.">
            <Field label="Win at score">
              <SliderInput
                value={gameState.winScore}
                onChange={(v) => updateGameState({ winScore: Math.round(v) })}
                min={0}
                max={1000}
                step={10}
                unit="pts"
              />
            </Field>

            <Field label="Survive for">
              <SliderInput
                value={gameState.winSurviveSec}
                onChange={(v) => updateGameState({ winSurviveSec: Math.round(v) })}
                min={0}
                max={600}
                step={5}
                unit="sec"
              />
            </Field>
          </Section>
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-white/[0.06] bg-[#0d0d14] px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#7a6db8]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white/85">{title}</h3>
      <p className="mb-4 text-xs text-white/35">{description}</p>
      <div className="space-y-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <label className="text-xs font-medium text-white/70">{label}</label>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SliderInput({
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[#8b7ec8]"
      />
      <div className="flex w-24 items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className="w-full bg-transparent font-mono text-xs text-white/80 outline-none"
        />
        {unit && <span className="text-[10px] text-white/30">{unit}</span>}
      </div>
    </div>
  );
}
