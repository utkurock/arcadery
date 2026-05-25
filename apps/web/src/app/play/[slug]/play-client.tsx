'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { GitFork, Trophy, X, Heart, Coins } from 'lucide-react';
import { useWallet } from '@solana/wallet-adapter-react';
// Pulling JUST the zustand store via the sub-export keeps the heavy editor
// chrome (EditorShell, AssetLibrary, etc) out of the /play/[slug] bundle.
// The viewport components (GameCanvas, ReadOnlySceneRenderer) are loaded
// dynamically below where they're actually rendered.
import { useEditorStore } from '@arcadery/editor/store';
import { isWalletConnectEnabled } from '@arcadery/shared';
import type { RuntimeState } from '@arcadery/engine';
import { createClient } from '@/lib/supabase/client';
import { useModals } from '@/lib/ui/modals';
import { TokenSection } from '@/components/tokens/token-section';
import { TouchControls } from '@/components/play/touch-controls';
import { GameIntroScreen } from '@/components/play/game-intro-screen';
import { FlyBirdsEntryGate } from '@/components/play/fly-birds-entry-gate';
import { FlyBirdsClaimScreen } from '@/components/play/fly-birds-claim-screen';
import { AnalyticsBeacon, fireGameEvent } from '@/components/play/analytics-beacon';

const FLY_BIRDS_SLUG = 'template-fly-birds';

interface FlyBirdsState {
  roundId: string;
  poolLamports: number;
  entryLamports: number;
  top: Array<{ wallet_address: string; score: number }>;
  myRank: number | null;
  myBest: number | null;
  isWinner: boolean;
}

function lamportsToSol(l: number): string {
  return (l / 1e9).toFixed(4);
}

const AuthButton = dynamic(
  () => import('@/components/auth/auth-button').then((m) => m.AuthButton),
  { ssr: false },
);

const GameCanvas = dynamic(
  () => import('@arcadery/engine').then((mod) => ({ default: mod.GameCanvas })),
  { ssr: false },
);

const ReadOnlySceneRenderer = dynamic(
  () => import('@arcadery/editor').then((mod) => ({ default: mod.ReadOnlySceneRenderer })),
  { ssr: false },
);

const PhaserCanvas = dynamic(
  () => import('@arcadery/engine/phaser').then((mod) => ({ default: mod.PhaserCanvas })),
  { ssr: false },
);

const PlayCanvas3D = dynamic(
  () => import('@arcadery/engine').then((mod) => ({ default: mod.PlayCanvas3D })),
  { ssr: false },
);

interface PlayGame {
  id: string;
  slug: string;
  name: string;
  scene: any;
  creator_name: string;
  is_tokenized?: boolean | null;
  token_mint?: string | null;
  token_symbol?: string | null;
  token_image_url?: string | null;
}

function detectControllerKind(scene: any): 'platformer' | 'top-down' {
  if (!scene?.elements) return 'platformer';
  for (const el of Object.values(scene.elements) as any[]) {
    const behaviors = el?.behaviors as Array<{ type: string }> | undefined;
    if (!behaviors) continue;
    if (behaviors.some((b) => b.type === 'top-down-controller')) return 'top-down';
    if (behaviors.some((b) => b.type === 'platformer-controller')) return 'platformer';
    // Third-person uses dpad + jump, same touch layout as platformer.
    if (behaviors.some((b) => b.type === 'third-person-controller')) return 'platformer';
  }
  return 'platformer';
}

/** A "three" scene is playable in 3D when it has a game-state config and an
 *  element carrying a 3D-capable controller (third-person or top-down). */
function has3DController(scene: any): boolean {
  if (!scene?.elements) return false;
  for (const el of Object.values(scene.elements) as any[]) {
    const behaviors = el?.behaviors as Array<{ type: string }> | undefined;
    if (!behaviors) continue;
    if (
      behaviors.some(
        (b) => b.type === 'third-person-controller' || b.type === 'top-down-controller',
      )
    ) {
      return true;
    }
  }
  return false;
}

interface LeaderboardEntry {
  id: string;
  player_name: string;
  score: number;
  created_at: string;
}

export function PlayClient({ game, isOwner = false }: { game: PlayGame; isOwner?: boolean }) {
  const hydratedRef = useRef(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitName, setSubmitName] = useState('');
  const [submitScore, setSubmitScore] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  // Bumped by "Play again" to remount the game canvas — cheaper than a full
  // window.location.reload(), which used to also re-mount the wallet adapter
  // and could fire an unwanted Phantom popup mid-restart.
  const [runId, setRunId] = useState(0);
  const isPlayable = Boolean(game.scene?.gameState);
  // A 3D scene that should run the live runtime (not just the static viewer).
  const is3DPlayable =
    game.scene?.settings?.renderEngine !== 'phaser' &&
    isPlayable &&
    has3DController(game.scene);

  // Roblox-style intro gate. The game canvas only mounts after "Play" so the
  // runtime doesn't tick behind the splash. Fly Birds keeps its own paid
  // entry gate; an intro explicitly disabled in the scene is skipped.
  const introEnabled = game.scene?.intro?.enabled !== false;
  const isFlyBirdsGame = game.slug === FLY_BIRDS_SLUG;
  const [started, setStarted] = useState(false);
  const showIntro = !isFlyBirdsGame && introEnabled && !started;
  const canvasMounted = isFlyBirdsGame || !introEnabled || started;

  // ── Fly Birds pay-to-play layer ────────────────────────────────────────────
  // Only the official Fly Birds template runs the entry-gate / prize-pool
  // flow. Other games render unchanged.
  const isFlyBirds = game.slug === FLY_BIRDS_SLUG;
  const { publicKey } = useWallet();
  const walletAddress = publicKey?.toBase58() ?? null;
  const [flyState, setFlyState] = useState<FlyBirdsState | null>(null);
  const [hasEntered, setHasEntered] = useState(false);
  const [scoreSubmittedThisRun, setScoreSubmittedThisRun] = useState(false);

  const refreshFlyState = useCallback(async () => {
    if (!isFlyBirds) return;
    try {
      const url = walletAddress
        ? `/api/games/fly-birds/state?wallet=${encodeURIComponent(walletAddress)}`
        : '/api/games/fly-birds/state';
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) setFlyState((await res.json()) as FlyBirdsState);
    } catch {}
  }, [isFlyBirds, walletAddress]);

  // Initial fetch + refetch when wallet changes (for myRank / isWinner).
  useEffect(() => {
    refreshFlyState();
  }, [refreshFlyState]);

  // Hydrate hasEntered from sessionStorage so a refresh doesn't re-prompt
  // payment for someone who already paid in this round.
  useEffect(() => {
    if (!isFlyBirds) return;
    try {
      if (sessionStorage.getItem('flybirds_entered')) setHasEntered(true);
    } catch {}
  }, [isFlyBirds]);

  function restartRun() {
    setRuntimeState(null);
    setAutoSubmitted(false);
    setHintVisible(true);
    setRunId((n) => n + 1);
    setScoreSubmittedThisRun(false);
    if (isFlyBirds) {
      // A new run requires a new entry — clear the gate so the user has to
      // pay again, and refresh the pool/leaderboard so the new round (if
      // they just claimed) shows correctly.
      setHasEntered(false);
      try {
        sessionStorage.removeItem('flybirds_entered');
      } catch {}
      refreshFlyState();
    }
  }

  // Hide controls hint after 4 seconds of play, or as soon as the user moves.
  useEffect(() => {
    if (!isPlayable) return;
    const timeout = setTimeout(() => setHintVisible(false), 4000);
    const dismiss = () => setHintVisible(false);
    window.addEventListener('keydown', dismiss, { once: true });
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('keydown', dismiss);
    };
  }, [isPlayable]);

  // Per-run play_start beacon. Fires once per remount (restartRun bumps
  // runId, which clears playStartFiredRef on the next mount via the
  // dependency below). Guard against the 'playing' status flickering on
  // pause/resume — only the first transition counts.
  const playStartFiredRef = useRef(false);
  useEffect(() => {
    playStartFiredRef.current = false;
  }, [runId]);
  useEffect(() => {
    if (playStartFiredRef.current) return;
    if (runtimeState?.status !== 'playing') return;
    playStartFiredRef.current = true;
    fireGameEvent(game.slug, 'play_start');
  }, [runtimeState?.status, game.slug]);

  // Fly Birds: post the run's final score to the prize-pool leaderboard, then
  // refresh the pool/rank so the claim screen reflects the new ranking.
  // Wallet-keyed (no anon entries — they couldn't have paid the entry).
  useEffect(() => {
    if (!isFlyBirds) return;
    if (!runtimeState || runtimeState.status === 'playing') return;
    if (scoreSubmittedThisRun) return;
    if (!walletAddress) return;
    if (runtimeState.score < 0) return;
    setScoreSubmittedThisRun(true);
    (async () => {
      try {
        await fetch('/api/games/fly-birds/score', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress, score: runtimeState.score }),
        });
      } catch {}
      await refreshFlyState();
    })();
  }, [isFlyBirds, runtimeState, scoreSubmittedThisRun, walletAddress, refreshFlyState]);

  // Auto-submit score to the leaderboard once the runtime ends. Anonymous
  // players land as "Anonymous"; signed-in users get their email handle.
  //
  // Client-side dedupe: "Play again" remounts the canvas (key={runId}) and
  // resets `autoSubmitted`. We additionally persist the best score we've
  // already submitted for this game in `sessionStorage` so a repeat run with
  // the same-or-lower score doesn't spam duplicate rows. Submitting a *higher*
  // score is still allowed (legitimate improvement). Per-tab is fine —
  // cross-tab abuse is the server's responsibility, not ours to police here.
  useEffect(() => {
    if (!runtimeState) return;
    if (runtimeState.status === 'playing') return;
    if (autoSubmitted) return;
    if (runtimeState.score <= 0) return;

    const submittedKey = `arcadery_score_${game.id}`;
    let lastSubmitted = 0;
    try {
      lastSubmitted = parseInt(sessionStorage.getItem(submittedKey) || '0', 10) || 0;
    } catch {}
    if (runtimeState.score <= lastSubmitted) {
      setAutoSubmitted(true);
      return;
    }

    setAutoSubmitted(true);
    const scoreToSubmit = runtimeState.score;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        let playerName = 'Anonymous';
        let walletAddress: string | null = null;
        if (user) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('display_name, wallet_address')
            .eq('id', user.id)
            .maybeSingle();
          playerName =
            profile?.display_name ||
            (user.user_metadata?.full_name as string | undefined) ||
            user.email?.split('@')[0] ||
            'Anonymous';
          walletAddress = profile?.wallet_address ?? null;
        }

        const { error } = await supabase.rpc('submit_score', {
          p_game_id: game.id,
          p_player_name: playerName,
          p_score: scoreToSubmit,
          p_wallet_address: walletAddress,
        });
        if (!error) {
          try {
            sessionStorage.setItem(submittedKey, String(scoreToSubmit));
          } catch {}
          fireGameEvent(game.slug, 'score_submit');
        }
      } catch {
        // best effort — don't block the UI on submission failure
      }
    })();
  }, [runtimeState, autoSubmitted, game.id, game.slug]);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    // Schema mismatches on legacy scenes can throw here. Swallow the error so
    // the play page still renders chrome (Remix, Leaderboard, etc.) — the
    // canvas itself will just show an empty backdrop, which is recoverable.
    try {
      useEditorStore.getState().loadScene(game.scene);
    } catch (err) {
      console.error('Failed to load scene:', err);
    }
  }, [game.scene]);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('leaderboard')
        .select('id, player_name, score, created_at')
        .eq('game_id', game.id)
        .order('score', { ascending: false })
        .limit(20);
      setEntries(data || []);
    } catch {}
    setLoading(false);
  }, [game.id]);

  const submitScoreEntry = async () => {
    const name = submitName.trim() || 'Anonymous';
    const score = parseInt(submitScore, 10);
    if (isNaN(score) || score < 0) return;

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      let walletAddress: string | null = null;
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('wallet_address')
          .eq('id', user.id)
          .maybeSingle();
        walletAddress = profile?.wallet_address ?? null;
      }
      await supabase.rpc('submit_score', {
        p_game_id: game.id,
        p_player_name: name,
        p_score: score,
        p_wallet_address: walletAddress,
      });
      fireGameEvent(game.slug, 'score_submit');
      setSubmitted(true);
      setSubmitScore('');
      loadLeaderboard();
    } catch {}
  };

  async function handleFork() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      sessionStorage.setItem('arcadery_fork', game.id);
      window.location.href = '/create/new';
    } else {
      useModals.getState().openLogin();
    }
  }

  return (
    <div className="h-screen w-screen bg-[#1e1f26] text-white relative overflow-hidden">
      {/* Per-game analytics — view event fires once on mount (server-side
          dropped for owners so creators testing their own game can't inflate
          metrics). play_start + score_submit are fired imperatively above. */}
      <AnalyticsBeacon slug={game.slug} isOwner={isOwner} />

      {/* Top overlay bar — z-50 sits above the canvas so game elements (pipes,
          tilemaps) can't render through it. Solid backdrop on Fly Birds where
          the bright sky would otherwise wash out the controls. */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-between gap-2 px-3 py-3 sm:px-4 ${
          isFlyBirds
            ? 'border-b border-white/10 bg-[#0b0c14]/80 backdrop-blur-md'
            : 'bg-gradient-to-b from-black/60 to-transparent'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">{game.name}</span>
          <span className="hidden truncate text-sm text-white/50 sm:inline">by {game.creator_name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {isFlyBirds && flyState && (
            <div className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-gradient-to-r from-yellow-500/15 to-amber-500/10 px-2.5 py-1.5 text-xs font-semibold text-yellow-300 sm:px-3">
              <Coins className="h-3.5 w-3.5" />
              <span className="tabular-nums">{lamportsToSol(flyState.poolLamports)}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-yellow-300/60">SOL pool</span>
            </div>
          )}
          <TokenSection
            game={{
              id: game.id,
              name: game.name,
              is_tokenized: game.is_tokenized ?? null,
              token_mint: game.token_mint ?? null,
              token_symbol: game.token_symbol ?? null,
              token_image_url: game.token_image_url ?? null,
            }}
            isOwner={isOwner}
            cluster={
              (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as 'mainnet' | 'devnet' | undefined) ===
              'devnet'
                ? 'devnet'
                : 'mainnet'
            }
            // Carry over name / symbol / image from the Game Economy panel
            // so the creator doesn't fill them in twice.
            economyDefaults={{
              name: game.scene?.economy?.token?.name,
              symbol: game.scene?.economy?.token?.symbol,
              image: game.scene?.economy?.token?.image,
            }}
          />
          <button
            onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }}
            aria-label="Leaderboard"
            className="flex items-center gap-1.5 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-2.5 py-1.5 text-xs font-medium text-yellow-400 transition-colors hover:bg-yellow-500/20 sm:px-3"
          >
            <Trophy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leaderboard</span>
          </button>
          <button
            onClick={handleFork}
            aria-label="Remix"
            className="flex items-center gap-1.5 rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-white/20 sm:px-3"
          >
            <GitFork className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Remix</span>
          </button>
          {(isFlyBirds || isWalletConnectEnabled(game.scene?.economy)) && <AuthButton />}
        </div>
      </div>

      {/* Game canvas. `key={runId}` makes "Play again" a cheap full remount
          of just the canvas instead of a window.location.reload() that also
          churns the wallet adapter and triggers a stray Phantom popup. */}
      {canvasMounted &&
        (game.scene?.settings?.renderEngine === 'phaser' ? (
          <PhaserCanvas
            key={runId}
            elements={game.scene.elements || {}}
            backgroundColor={game.scene.settings?.backgroundColor || '#17181e'}
            isEditMode={false}
            scene={game.scene}
            onGameStateChange={setRuntimeState}
          />
        ) : is3DPlayable ? (
          <PlayCanvas3D
            key={runId}
            scene={game.scene}
            backgroundColor={game.scene.settings?.backgroundColor || '#0b0c14'}
            onGameStateChange={setRuntimeState}
          />
        ) : (
          <GameCanvas key={runId} cameraType="3d" showGrid={false} backgroundColor="#17181e">
            <ReadOnlySceneRenderer />
          </GameCanvas>
        ))}

      {/* Roblox-style entry splash — shown until the player hits Play. */}
      {showIntro && (
        <GameIntroScreen
          intro={game.scene?.intro}
          gameName={game.name}
          creatorName={game.creator_name}
          onPlay={() => setStarted(true)}
        />
      )}

      {/* Touch controls — auto-shown on touch devices, infers controller kind from elements */}
      {isPlayable && runtimeState?.status === 'playing' && !runtimeState.paused && (
        <TouchControls
          kind={detectControllerKind(game.scene)}
        />
      )}

      {/* Onboarding hint — controls reminder for first 4s */}
      {isPlayable && hintVisible && runtimeState?.status === 'playing' && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center">
          <div className="rounded-full bg-black/70 backdrop-blur px-4 py-2 text-xs text-white/80 font-mono animate-pulse">
            {detectControllerKind(game.scene) === 'platformer'
              ? 'WASD / arrows · space to jump · Esc to pause'
              : 'WASD / arrows to move · click to shoot · Esc to pause'}
          </div>
        </div>
      )}

      {/* PAUSED overlay */}
      {isPlayable && runtimeState?.paused && runtimeState.status === 'playing' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#13141a] px-8 py-6 text-center">
            <h2 className="text-xl font-bold mb-1 text-white">Paused</h2>
            <p className="text-xs text-white/40">Press Esc to resume</p>
          </div>
        </div>
      )}

      {/* Live HUD — score + health, only when scene is playable */}
      {isPlayable && runtimeState && (
        <div className="pointer-events-none absolute top-14 left-4 z-10 flex flex-col gap-2 select-none">
          <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 flex items-center gap-2 font-mono">
            <span className="text-[10px] uppercase tracking-widest text-white/50">Score</span>
            <span className="text-lg font-bold text-yellow-300 tabular-nums">
              {runtimeState.score}
            </span>
          </div>
          <div className="rounded-lg bg-black/60 backdrop-blur px-3 py-2 flex items-center gap-1.5">
            {Array.from({ length: Math.max(0, runtimeState.health) }).map((_, i) => (
              <Heart key={i} className="w-4 h-4 text-red-400 fill-red-400" />
            ))}
            {runtimeState.health <= 0 && (
              <span className="text-[10px] uppercase tracking-widest text-red-400/80">No HP</span>
            )}
          </div>
        </div>
      )}

      {/* Win / Lose overlay — default game flow. Fly Birds renders its own
          claim screen below instead. */}
      {!isFlyBirds && isPlayable && runtimeState && runtimeState.status !== 'playing' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="rounded-2xl border border-white/10 bg-[#13141a] p-8 text-center max-w-md">
            <h2 className={`text-3xl font-bold mb-2 ${
              runtimeState.status === 'won' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {runtimeState.status === 'won' ? 'You won!' : 'Game over'}
            </h2>
            <p className="text-sm text-white/50 mb-2">
              Final score: <span className="text-white font-semibold">{runtimeState.score}</span>
            </p>
            {autoSubmitted && runtimeState.score > 0 && (
              <p className="text-[11px] text-emerald-400/80 mb-4">✓ Submitted to leaderboard</p>
            )}
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={restartRun}
                className="rounded-lg bg-[#5db8a8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4ca597] transition-colors"
              >
                Play again
              </button>
              <button
                onClick={() => { setShowLeaderboard(true); loadLeaderboard(); }}
                className="rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
              >
                Leaderboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fly Birds claim screen — replaces the default win/lose overlay and
          ties the result to the on-chain prize pool. */}
      {isFlyBirds && isPlayable && runtimeState && runtimeState.status !== 'playing' && (
        <FlyBirdsClaimScreen
          status={runtimeState.status === 'won' ? 'won' : 'lost'}
          finalScore={runtimeState.score}
          poolLamports={flyState?.poolLamports ?? 0}
          myRank={flyState?.myRank ?? null}
          myBest={flyState?.myBest ?? null}
          topPlayer={flyState?.top?.[0] ?? null}
          isWinner={
            !!walletAddress &&
            (flyState?.top?.[0]?.wallet_address === walletAddress) &&
            (flyState?.top?.[0]?.score ?? 0) > 0
          }
          onPlayAgain={restartRun}
          onClaimed={() => refreshFlyState()}
        />
      )}

      {/* Fly Birds entry gate — blocks the canvas until a paid entry lands. */}
      {isFlyBirds && !hasEntered && flyState && (
        <FlyBirdsEntryGate
          poolLamports={flyState.poolLamports}
          topPlayer={flyState.top[0] ?? null}
          onEntered={() => {
            setHasEntered(true);
            refreshFlyState();
          }}
        />
      )}

      {/* Made with Arcadery badge */}
      <Link
        href="/"
        className="absolute bottom-3 right-3 z-10 text-xs text-white/50 hover:text-white/80 bg-black/40 rounded-lg px-3 py-1.5 transition-colors"
      >
        Made with arcadery
      </Link>

      {/* Leaderboard Panel */}
      {showLeaderboard && (
        <div className="absolute top-0 right-0 bottom-0 z-20 flex w-full flex-col border-l border-white/[0.06] bg-[#0d0d14]/95 backdrop-blur-xl sm:w-80">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-yellow-400" />
              <h3 className="text-sm font-semibold">Leaderboard</h3>
            </div>
            <button onClick={() => setShowLeaderboard(false)} className="p-1 rounded text-white/30 hover:text-white/60 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Scores list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <p className="text-xs text-white/20 text-center py-10">Loading...</p>
            ) : entries.length === 0 ? (
              <div className="text-center py-10">
                <Trophy className="mx-auto mb-2 h-8 w-8 text-white/10" />
                <p className="text-xs text-white/25">No scores yet</p>
                <p className="text-[10px] text-white/15">Be the first to submit!</p>
              </div>
            ) : (
              <div>
                {entries.map((entry, i) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.03] ${i < 3 ? 'bg-yellow-500/[0.03]' : ''}`}
                  >
                    <span className={`w-6 text-center text-xs font-bold ${
                      i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-orange-400' : 'text-white/20'
                    }`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/70 truncate">{entry.player_name}</p>
                    </div>
                    <span className="text-sm font-bold text-white/80">{entry.score.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit score */}
          <div className="border-t border-white/[0.06] p-4">
            <p className="text-[10px] text-white/25 uppercase tracking-wider font-semibold mb-2">Submit Your Score</p>
            {submitted ? (
              <div className="text-center py-2">
                <p className="text-xs text-green-400">Score submitted!</p>
                <button onClick={() => setSubmitted(false)} className="text-[10px] text-white/30 hover:text-white/50 mt-1">Submit another</button>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  value={submitName}
                  onChange={(e) => setSubmitName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/80 placeholder:text-white/15 outline-none"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={submitScore}
                    onChange={(e) => setSubmitScore(e.target.value)}
                    placeholder="Score"
                    className="flex-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-xs text-white/80 placeholder:text-white/15 outline-none"
                  />
                  <button
                    onClick={submitScoreEntry}
                    disabled={!submitScore}
                    className="rounded-lg bg-[#8b7ec8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#7a6db8] transition-colors disabled:opacity-30"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
