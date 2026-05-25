import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Games panel data — fetches every published game (tokenized + not) and folds
// in two analytics rollups so the admin table can show meaningful engagement
// without N+1 round-trips:
//
//   1. Leaderboard play counts (legacy — scores submitted before the events
//      table existed are only countable here).
//   2. `published_game_events` rollups for the last 30 days: total views,
//      signed-in views (proxy for "auth'd reach"), unique wallets, unique
//      anon cookies.
//
// Both rollups are pulled in parallel with the row list. Each query is capped;
// if a single game exceeds the cap the count becomes a floor (UI shows "+").

export interface AdminGameRow {
  id: string;
  slug: string;
  name: string;
  creator_name: string;
  user_id: string;
  is_tokenized: boolean;
  token_name: string | null;
  token_symbol: string | null;
  token_mint: string | null;
  token_image_url: string | null;
  token_creator_wallet: string | null;
  token_launched_at: string | null;
  created_at: string;
  updated_at: string;
  /** Total scores submitted via leaderboard (lifetime). */
  plays: number;
  /** 30-day `view` events (excludes owner). */
  views30d: number;
  /** 30-day views where the visitor was signed-in (wallet attached). */
  signedInViews30d: number;
  /** 30-day distinct wallets across all event types. */
  uniqueWallets30d: number;
  /** 30-day distinct anonymous cookies (proxy for unique visitors). */
  uniqueAnons30d: number;
}

const ROW_CAP = 1000;
const LEADER_CAP = 50_000;
const EVENTS_CAP = 200_000;
const SINCE_DAYS = 30;

export async function getPublishedGameList(): Promise<AdminGameRow[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('published_games')
    .select(
      'id, slug, name, creator_name, user_id, is_tokenized, token_name, token_symbol, token_mint, token_image_url, token_creator_wallet, token_launched_at, created_at, updated_at',
    )
    .order('created_at', { ascending: false })
    .limit(ROW_CAP);
  if (error) {
    console.error('admin published-games fetch failed', error);
    return [];
  }
  const rows = (data ?? []) as Omit<
    AdminGameRow,
    'plays' | 'views30d' | 'signedInViews30d' | 'uniqueWallets30d' | 'uniqueAnons30d'
  >[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const sinceIso = new Date(Date.now() - SINCE_DAYS * 86400000).toISOString();

  // Parallel rollup queries. Leaderboard pulls just game_id (we count
  // client-side); events pulls the minimum needed for view + uniqueness
  // computation.
  const [lbRes, evRes] = await Promise.all([
    admin
      .from('leaderboard')
      .select('game_id')
      .in('game_id', ids)
      .limit(LEADER_CAP),
    admin
      .from('published_game_events')
      .select('game_id, event_type, wallet_address, anon_id')
      .in('game_id', ids)
      .gte('created_at', sinceIso)
      .limit(EVENTS_CAP),
  ]);
  if (lbRes.error) console.error('admin leaderboard rollup failed', lbRes.error);
  if (evRes.error) console.error('admin events rollup failed', evRes.error);

  const playCounts = new Map<string, number>();
  for (const r of (lbRes.data ?? []) as Array<{ game_id: string }>) {
    playCounts.set(r.game_id, (playCounts.get(r.game_id) ?? 0) + 1);
  }

  interface EventStat {
    views: number;
    signedInViews: number;
    wallets: Set<string>;
    anons: Set<string>;
  }
  const ev = new Map<string, EventStat>();
  for (const r of (evRes.data ?? []) as Array<{
    game_id: string;
    event_type: string;
    wallet_address: string | null;
    anon_id: string | null;
  }>) {
    let slot = ev.get(r.game_id);
    if (!slot) {
      slot = { views: 0, signedInViews: 0, wallets: new Set(), anons: new Set() };
      ev.set(r.game_id, slot);
    }
    if (r.event_type === 'view') {
      slot.views += 1;
      if (r.wallet_address) slot.signedInViews += 1;
    }
    if (r.wallet_address) slot.wallets.add(r.wallet_address);
    if (r.anon_id) slot.anons.add(r.anon_id);
  }

  return rows.map((r) => {
    const stat = ev.get(r.id);
    return {
      ...r,
      plays: playCounts.get(r.id) ?? 0,
      views30d: stat?.views ?? 0,
      signedInViews30d: stat?.signedInViews ?? 0,
      uniqueWallets30d: stat?.wallets.size ?? 0,
      uniqueAnons30d: stat?.anons.size ?? 0,
    };
  });
}
