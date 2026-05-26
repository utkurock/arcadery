'use client';

import { DEFAULT_ECONOMY, type GameEconomyConfig, type LaunchPlatform } from '@arcadery/shared';
import { useEditorStore } from '../stores/editor-store';
import { useScrollLock } from '../hooks/use-scroll-lock';

export type { GameEconomyConfig, LaunchPlatform };

export const ECONOMY_MODELS = [
  { id: 'free', label: 'Free to Play', desc: 'No tokens, no entry fee. Anyone can play.', icon: '🎮' },
  { id: 'pay-to-play', label: 'Pay to Play', desc: 'Players pay SOL/USDC per session. You earn directly.', icon: '💰' },
  { id: 'play-to-earn', label: 'Play to Earn', desc: 'Players earn your game token by playing. Token holders get benefits.', icon: '⛏️' },
  { id: 'tournament', label: 'Tournament / PvP', desc: 'Entry fees create prize pools. Top players win. Leaderboard payouts.', icon: '🏆' },
  { id: 'token-launch', label: 'Token Launch', desc: 'Launch your game token on pump.fun, Meteora, or Bags. Build community around your game.', icon: '🚀' },
] as const;

export const LAUNCH_PLATFORMS = [
  { id: 'pumpfun', label: 'pump.fun', desc: 'Bonding curve → auto-migrate to Raydium at $69K mcap', color: '#00d924', url: 'pump.fun' },
  { id: 'meteora', label: 'Meteora', desc: 'DLMM pools with dynamic fees. Best for sustained liquidity.', color: '#6ee7b7', url: 'meteora.ag' },
  { id: 'bags', label: 'Bags', desc: 'Fair launch platform. Community-first token distribution.', color: '#f472b6', url: 'bags.fm' },
] as const;

/**
 * The monetization config form, model-first. Used by the Publish flow's
 * "Monetize" step and (via the thin modal wrapper below) anywhere the economy
 * needs editing on its own. Reads and writes `scene.economy` directly.
 *
 * Picking a model is the primary action: "Free to Play" is the off-state
 * (sets `enabled: false`); any earning model flips `enabled` on and ensures
 * the player-facing wallet button is available.
 */
export function EconomyForm() {
  const config = useEditorStore((s) => s.scene.economy ?? DEFAULT_ECONOMY);
  const setEconomy = useEditorStore((s) => s.setEconomy);

  const update = <K extends keyof GameEconomyConfig>(key: K, value: GameEconomyConfig[K]) => {
    setEconomy({ ...config, [key]: value });
  };

  const updateNested = <K extends keyof GameEconomyConfig>(key: K, field: string, value: unknown) => {
    setEconomy({ ...config, [key]: { ...(config[key] as Record<string, unknown>), [field]: value } });
  };

  const selectModel = (id: GameEconomyConfig['model']) => {
    const isFree = id === 'free';
    setEconomy({
      ...config,
      model: id,
      enabled: !isFree,
      // Earning models all need players to connect a wallet; turn it on so the
      // creator can't ship a paid game with no way to pay. Free keeps whatever
      // the creator chose.
      walletConnect: { ...config.walletConnect, enabled: isFree ? config.walletConnect.enabled : true },
    });
  };

  const isEarning = config.model !== 'free';
  const usesToken = config.model === 'token-launch' || config.model === 'play-to-earn';
  const usesEntryFee = config.model === 'pay-to-play' || config.model === 'tournament';
  const revenueTotal = config.rewards.winnerShare + config.rewards.creatorShare + config.rewards.platformShare;

  return (
    <div className="space-y-8">
      {/* Model selection — the primary choice */}
      <div>
        <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">How will your game earn?</h3>
        <div className="grid grid-cols-1 gap-2">
          {ECONOMY_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => selectModel(m.id as GameEconomyConfig['model'])}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                config.model === m.id
                  ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/[0.06]'
                  : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
              }`}
            >
              <span className="text-xl mt-0.5">{m.icon}</span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${config.model === m.id ? 'text-[#8b7ec8]' : 'text-white/70'}`}>{m.label}</p>
                <p className="text-xs text-white/30 mt-0.5">{m.desc}</p>
              </div>
              {config.model === m.id && (
                <div className="w-5 h-5 rounded-full bg-[#8b7ec8] flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {isEarning && (
        <>
          {/* Wallet connect — required for any paid/token model */}
          <div className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
            <div className="pr-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#9945ff]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-1M16 12h5v4h-5a2 2 0 110-4z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
                <p className="text-sm font-medium text-white/85">Solana Wallet Connection</p>
              </div>
              <p className="text-xs text-white/40 mt-1">Players see a Connect Wallet button. Required for any token / payment flow.</p>
            </div>
            <button
              onClick={() => updateNested('walletConnect', 'enabled', !config.walletConnect.enabled)}
              className={`w-11 h-6 rounded-full transition-colors shrink-0 ${config.walletConnect.enabled ? 'bg-[#9945ff]' : 'bg-white/10'}`}
              aria-label="Toggle wallet connection"
            >
              <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform mx-0.5 ${config.walletConnect.enabled ? 'translate-x-5' : ''}`} />
            </button>
          </div>

          {/* Token details */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Token Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-white/30 mb-1 block">Token Name</label>
                <input
                  value={config.token.name}
                  onChange={(e) => updateNested('token', 'name', e.target.value)}
                  placeholder="e.g. Runner Coin"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-[#8b7ec8]/30"
                />
              </div>
              <div>
                <label className="text-xs text-white/30 mb-1 block">Ticker</label>
                <input
                  value={config.token.symbol}
                  onChange={(e) => updateNested('token', 'symbol', e.target.value.toUpperCase().slice(0, 6))}
                  placeholder="e.g. $RUN"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-[#8b7ec8]/30"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-white/30 mb-1 block">Description</label>
                <textarea
                  value={config.token.description}
                  onChange={(e) => updateNested('token', 'description', e.target.value)}
                  placeholder="What's this game token about? This shows on the launchpad page."
                  rows={2}
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 placeholder:text-white/15 outline-none focus:border-[#8b7ec8]/30 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Launch platform */}
          {usesToken && (
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Launch Platform</h3>
              <p className="text-xs text-white/20 mb-3">We mint your token on the platform you choose. They handle the bonding curve & liquidity — you just publish.</p>
              <div className="grid grid-cols-1 gap-2">
                {LAUNCH_PLATFORMS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => update('launchPlatform', p.id as LaunchPlatform)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all ${
                      config.launchPlatform === p.id
                        ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/[0.06]'
                        : 'border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${p.color}15` }}>
                      <span className="text-sm font-bold" style={{ color: p.color }}>{p.label[0]}</span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`text-sm font-medium ${config.launchPlatform === p.id ? 'text-white' : 'text-white/70'}`}>{p.label}</p>
                        <span className="text-[10px] text-white/15">{p.url}</span>
                      </div>
                      <p className="text-xs text-white/30 mt-0.5">{p.desc}</p>
                    </div>
                    {config.launchPlatform === p.id && (
                      <div className="w-5 h-5 rounded-full bg-[#8b7ec8] flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" /></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Token gating */}
          {usesToken && (
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Token Gating</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/70">Require Token to Play</p>
                    <p className="text-xs text-white/25">Players must hold your token to access the game</p>
                  </div>
                  <button
                    onClick={() => updateNested('tokenGating', 'enabled', !config.tokenGating.enabled)}
                    className={`w-10 h-5 rounded-full transition-colors ${config.tokenGating.enabled ? 'bg-[#8b7ec8]' : 'bg-white/10'}`}
                  >
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${config.tokenGating.enabled ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
                {config.tokenGating.enabled && (
                  <div>
                    <label className="text-xs text-white/30 mb-1 block">Minimum tokens to hold</label>
                    <input
                      type="number"
                      value={config.tokenGating.minTokens}
                      onChange={(e) => updateNested('tokenGating', 'minTokens', Number(e.target.value))}
                      className="w-40 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none"
                    />
                    <p className="text-[10px] text-white/15 mt-1">Players need at least this many ${config.token.symbol || 'tokens'} in their wallet</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Entry fee */}
          {usesEntryFee && (
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Entry Fee</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/30 mb-1 block">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={config.pricing.entryFee}
                    onChange={(e) => updateNested('pricing', 'entryFee', Number(e.target.value))}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none focus:border-[#8b7ec8]/30"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/30 mb-1 block">Currency</label>
                  <select
                    value={config.pricing.entryCurrency}
                    onChange={(e) => updateNested('pricing', 'entryCurrency', e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/70 outline-none"
                  >
                    <option value="SOL">SOL</option>
                    <option value="USDC">USDC</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Revenue split */}
          <div>
            <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Revenue Split</h3>
            <div className="space-y-3">
              <SliderRow label="Players / Winners" value={config.rewards.winnerShare} onChange={(v) => updateNested('rewards', 'winnerShare', v)} color="#10b981" />
              <SliderRow label="Creator (You)" value={config.rewards.creatorShare} onChange={(v) => updateNested('rewards', 'creatorShare', v)} color="#8b7ec8" />
              <SliderRow label="Platform Fee" value={config.rewards.platformShare} onChange={(v) => updateNested('rewards', 'platformShare', v)} color="#f59e0b" />
              <div className={`text-xs font-medium mt-2 ${revenueTotal === 100 ? 'text-green-400/60' : 'text-red-400'}`}>
                Total: {revenueTotal}% {revenueTotal !== 100 && '(must equal 100%)'}
              </div>
            </div>
            <div className="mt-3 flex h-3 rounded-full overflow-hidden">
              <div style={{ width: `${config.rewards.winnerShare}%`, backgroundColor: '#10b981' }} />
              <div style={{ width: `${config.rewards.creatorShare}%`, backgroundColor: '#8b7ec8' }} />
              <div style={{ width: `${config.rewards.platformShare}%`, backgroundColor: '#f59e0b' }} />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-white/20">
              <span>Players {config.rewards.winnerShare}%</span>
              <span>Creator {config.rewards.creatorShare}%</span>
              <span>Platform {config.rewards.platformShare}%</span>
            </div>
          </div>

          {/* Tournament */}
          {config.model === 'tournament' && (
            <div>
              <h3 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Tournament</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-white/30 mb-1 block">Max Players</label>
                  <input
                    type="number"
                    value={config.tournament.maxPlayers}
                    onChange={(e) => updateNested('tournament', 'maxPlayers', Number(e.target.value))}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/80 outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/30 mb-1 block">Duration</label>
                  <select
                    value={config.tournament.duration}
                    onChange={(e) => updateNested('tournament', 'duration', e.target.value)}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-white/70 outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-white/30 mb-2 block">Leaderboard Rewards (top 4)</label>
                <div className="grid grid-cols-4 gap-2">
                  {config.tournament.leaderboardRewards.map((pct, i) => (
                    <div key={i} className="text-center">
                      <span className="text-[10px] text-white/20 block mb-1">{['1st', '2nd', '3rd', '4th'][i]}</span>
                      <input
                        type="number"
                        value={pct}
                        onChange={(e) => {
                          const newRewards = [...config.tournament.leaderboardRewards];
                          newRewards[i] = Number(e.target.value);
                          updateNested('tournament', 'leaderboardRewards', newRewards);
                        }}
                        className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-center text-sm text-white/80 outline-none"
                      />
                      <span className="text-[10px] text-white/15">%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Compact, read-only recap of the configured economy — used on the Publish
 *  flow's Review step and the in-form summary. */
export function EconomySummary() {
  const config = useEditorStore((s) => s.scene.economy ?? DEFAULT_ECONOMY);
  const usesToken = config.model === 'token-launch' || config.model === 'play-to-earn';
  return (
    <div className="rounded-xl border border-[#8b7ec8]/20 bg-[#8b7ec8]/[0.04] p-4">
      <h3 className="text-xs font-semibold text-[#8b7ec8] uppercase tracking-wider mb-2">Economy Summary</h3>
      <div className="space-y-1 text-xs text-white/40">
        <p>Model: <span className="text-white/70">{ECONOMY_MODELS.find((m) => m.id === config.model)?.label}</span></p>
        {config.token.symbol && <p>Token: <span className="text-white/70">${config.token.symbol}</span></p>}
        {usesToken && <p>Launch: <span className="text-white/70">{LAUNCH_PLATFORMS.find((p) => p.id === config.launchPlatform)?.label}</span></p>}
        {config.pricing.entryFee > 0 && <p>Entry: <span className="text-white/70">{config.pricing.entryFee} {config.pricing.entryCurrency}</span></p>}
        {config.model !== 'free' && <p>Creator Revenue: <span className="text-white/70">{config.rewards.creatorShare}%</span> of all transactions</p>}
        {config.tokenGating.enabled && <p>Token Gate: <span className="text-white/70">min {config.tokenGating.minTokens} ${config.token.symbol || 'tokens'}</span> to play</p>}
      </div>
    </div>
  );
}

/**
 * Standalone modal wrapper around {@link EconomyForm}. The editor no longer
 * surfaces this directly (economy now lives in the Publish flow), but it's kept
 * exported for any host that wants to edit the economy on its own.
 */
export function GameEconomySettings({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useScrollLock(isOpen);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0d0d14] shadow-2xl">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/[0.06] bg-[#0d0d14] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Game Economy</h2>
            <p className="text-xs text-white/30 mt-0.5">Configure tokenomics, revenue, and player rewards</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-white/30 hover:bg-white/[0.05] hover:text-white/60 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>
          </button>
        </div>

        <div className="p-6">
          <EconomyForm />
          <div className="mt-8">
            <EconomySummary />
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-white/[0.06] bg-[#0d0d14] px-6 py-4">
          <span className="text-[11px] text-white/30">Auto-saved with your project</span>
          <button onClick={onClose} className="rounded-lg bg-[#8b7ec8] px-5 py-2 text-xs font-semibold text-white hover:bg-[#7a6db8] transition-colors">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, color }: { label: string; value: number; onChange: (v: number) => void; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs text-white/50 w-28 shrink-0">{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
        style={{
          backgroundImage: `linear-gradient(to right, ${color} 0%, ${color} ${value}%, rgba(255,255,255,0.06) ${value}%, rgba(255,255,255,0.06) 100%)`,
        }}
      />
      <span className="text-xs text-white/60 w-10 text-right">{value}%</span>
    </div>
  );
}
