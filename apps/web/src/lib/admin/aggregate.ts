import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ADMIN_GAMES, type AdminGame } from './games';

// Aggregator powering the /admin/overview dashboard. Pulls completed-play
// counts, paid-play counts, and recent activity rows from every game's score
// table in parallel and folds them into a single OverviewData payload that
// the client renders directly (no extra API call needed for the initial
// render — only "refresh" hits an API).
//
// The recent rows are also where we derive the daily 30-day plot and the
// "active wallets" number. We intentionally cap RECENT_ROW_CAP per table to
// keep tail-latency bounded; if a single game crosses that in 30 days, the
// chart slightly under-counts (with a known marker) and the user can drill
// in via the per-game scores API.

const SINCE_DAYS = 30;
const RECENT_ROW_CAP = 5000;

export interface DailyPoint {
  /** YYYY-MM-DD (UTC) */
  date: string;
  plays: number;
  /** Revenue in SOL */
  revenue: number;
}

export interface GameStat {
  key: string;
  label: string;
  color: string;
  plays: number;
  paidPlays: number;
  revenueSol: number;
  /** Last completed play's created_at (ISO), or null if none yet. */
  lastPlayAt: string | null;
}

export interface OverviewData {
  /** Lifetime completed plays across all games. */
  totalPlays: number;
  /** Lifetime paid plays (rows with non-null entry_signature). */
  totalPaidPlays: number;
  /** Lifetime revenue in SOL = sum(paidPlays * fee) per game. */
  totalRevenueSol: number;
  /** Distinct wallets that completed a play in the last 30 days. */
  activeWallets30d: number;
  /** Number of tokenized published games (count of published_games.is_tokenized). */
  tokenizedGames: number;
  /** Total token supply summed across tokenized published games. */
  totalTokenSupply: number;
  /** 30-day plays + revenue series (in chronological order). */
  daily: DailyPoint[];
  /** Per-game stats, sorted by lifetime plays descending. */
  perGame: GameStat[];
  /** True if any per-game recent query hit the row cap (chart may undercount). */
  truncated: boolean;
  /** Server-side stamp for the data so the client can show "as of" time. */
  generatedAt: string;
}

interface PerGameRaw {
  game: AdminGame;
  plays: number;
  paidPlays: number;
  recent: Array<{
    created_at: string;
    entry_signature: string | null;
    wallet_address: string;
  }>;
  truncated: boolean;
}

export async function getOverview(): Promise<OverviewData> {
  const admin = createAdminClient();
  const sinceIso = new Date(
    Date.now() - SINCE_DAYS * 86400000,
  ).toISOString();

  const perGame: PerGameRaw[] = await Promise.all(
    ADMIN_GAMES.map(async (game) => {
      const [allRes, paidRes, recentRes] = await Promise.all([
        admin
          .from(game.scoresTable)
          .select('id', { count: 'exact', head: true }),
        admin
          .from(game.scoresTable)
          .select('id', { count: 'exact', head: true })
          .not('entry_signature', 'is', null),
        admin
          .from(game.scoresTable)
          .select('created_at, entry_signature, wallet_address')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: true })
          .limit(RECENT_ROW_CAP + 1),
      ]);
      const recent = (recentRes.data ?? []) as PerGameRaw['recent'];
      const truncated = recent.length > RECENT_ROW_CAP;
      if (truncated) recent.length = RECENT_ROW_CAP;
      return {
        game,
        plays: allRes.count ?? 0,
        paidPlays: paidRes.count ?? 0,
        recent,
        truncated,
      };
    }),
  );

  // ─── Fold totals + chart ─────────────────────────────────────────────
  let totalPlays = 0;
  let totalPaidPlays = 0;
  let totalRevenueSol = 0;
  let truncatedAny = false;
  const dailyMap = new Map<string, DailyPoint>();
  const activeWallets = new Set<string>();
  const gameLastPlay = new Map<string, string | null>();

  for (const { game, plays, paidPlays, recent, truncated } of perGame) {
    totalPlays += plays;
    totalPaidPlays += paidPlays;
    totalRevenueSol += paidPlays * game.feeSol;
    if (truncated) truncatedAny = true;
    let lastPlayAt: string | null = null;
    for (const row of recent) {
      activeWallets.add(row.wallet_address);
      const day = row.created_at.slice(0, 10);
      const slot = dailyMap.get(day) ?? { date: day, plays: 0, revenue: 0 };
      slot.plays += 1;
      if (row.entry_signature) slot.revenue += game.feeSol;
      dailyMap.set(day, slot);
      if (!lastPlayAt || row.created_at > lastPlayAt) lastPlayAt = row.created_at;
    }
    gameLastPlay.set(game.key, lastPlayAt);
  }

  // Build a zero-filled 30-day series so the chart never has missing X-axis
  // points (even when no plays happen on a given day).
  const daily: DailyPoint[] = [];
  for (let i = SINCE_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.toISOString().slice(0, 10);
    const slot = dailyMap.get(day);
    daily.push(
      slot
        ? {
            date: day,
            plays: slot.plays,
            revenue: Number(slot.revenue.toFixed(4)),
          }
        : { date: day, plays: 0, revenue: 0 },
    );
  }

  const perGameStats: GameStat[] = perGame.map(
    ({ game, plays, paidPlays }) => ({
      key: game.key,
      label: game.label,
      color: game.color,
      plays,
      paidPlays,
      revenueSol: Number((paidPlays * game.feeSol).toFixed(4)),
      lastPlayAt: gameLastPlay.get(game.key) ?? null,
    }),
  );
  perGameStats.sort((a, b) => b.plays - a.plays);

  // ─── Token rollup ────────────────────────────────────────────────────
  const tokens = await admin
    .from('published_games')
    .select('token_supply', { count: 'exact' })
    .eq('is_tokenized', true);
  let totalTokenSupply = 0;
  for (const row of (tokens.data ?? []) as Array<{ token_supply: number | null }>) {
    if (row.token_supply) totalTokenSupply += Number(row.token_supply);
  }

  return {
    totalPlays,
    totalPaidPlays,
    totalRevenueSol: Number(totalRevenueSol.toFixed(4)),
    activeWallets30d: activeWallets.size,
    tokenizedGames: tokens.count ?? 0,
    totalTokenSupply,
    daily,
    perGame: perGameStats,
    truncated: truncatedAny,
    generatedAt: new Date().toISOString(),
  };
}
