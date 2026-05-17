import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FLY_BIRDS_ENTRY_LAMPORTS } from '@/lib/games/fly-birds';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const supabase = createAdminClient();

  const { data: round, error: roundErr } = await supabase.rpc('fly_birds_active_round');
  if (roundErr || !round) {
    return Response.json({ error: 'Failed to load round' }, { status: 500 });
  }

  const { data: scores } = await supabase
    .from('fly_birds_scores')
    .select('wallet_address, score, created_at')
    .eq('round_id', round.id)
    .order('score', { ascending: false })
    .limit(50);

  // Top per wallet, then top 10 wallets — derive in JS to avoid a window
  // function in the RPC layer (the leaderboard is small enough that this is
  // fine).
  const bestByWallet = new Map<string, { wallet_address: string; score: number }>();
  for (const row of scores ?? []) {
    const cur = bestByWallet.get(row.wallet_address);
    if (!cur || row.score > cur.score) {
      bestByWallet.set(row.wallet_address, { wallet_address: row.wallet_address, score: row.score });
    }
  }
  const top = Array.from(bestByWallet.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const myWallet = req.nextUrl.searchParams.get('wallet');
  const myRank = myWallet ? top.findIndex((t) => t.wallet_address === myWallet) + 1 || null : null;
  const myBest = myWallet ? bestByWallet.get(myWallet)?.score ?? null : null;

  return Response.json({
    roundId: round.id,
    poolLamports: Number(round.pool_lamports ?? 0),
    entryLamports: FLY_BIRDS_ENTRY_LAMPORTS,
    opensAt: round.opens_at,
    top,
    myRank,
    myBest,
    isWinner:
      !!myWallet && top.length > 0 && top[0].wallet_address === myWallet && (myBest ?? 0) > 0,
  });
}
