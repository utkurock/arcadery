import Link from 'next/link';
import {
  Coins,
  Gamepad2,
  Sparkles,
  ExternalLink,
  TrendingUp,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopUpButton } from '@/app/(dashboard)/credits/top-up-button';
import { ClaimEarningsButton } from './claim-earnings-button';

export const dynamic = 'force-dynamic';

type CreditsRow = {
  balance: number;
  lifetime_purchased: number | null;
  lifetime_spent: number | null;
  lifetime_granted: number | null;
};

type GameRow = {
  id: string;
  slug: string;
  name: string;
  is_tokenized: boolean | null;
  token_symbol: string | null;
  token_name: string | null;
  token_mint: string | null;
  token_launched_at: string | null;
  created_at: string;
};

export default async function EarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-full bg-[#0a0a0f] text-white">
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#c9a96e]/10">
            <TrendingUp className="h-7 w-7 text-[#c9a96e]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Sign in to see your earnings</h1>
          <p className="mb-6 text-sm text-white/50">
            Connect your wallet to track published games, tokenized games, and credits spent.
          </p>
          <TopUpButton label="Connect wallet" mode="login" />
        </div>
      </main>
    );
  }

  const [{ data: credits }, { data: games }] = await Promise.all([
    supabase
      .from('user_credits')
      .select('balance, lifetime_purchased, lifetime_spent, lifetime_granted')
      .eq('user_id', user.id)
      .maybeSingle<CreditsRow>(),
    supabase
      .from('published_games')
      .select(
        'id, slug, name, is_tokenized, token_symbol, token_name, token_mint, token_launched_at, created_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .returns<GameRow[]>(),
  ]);

  const publishedCount = games?.length ?? 0;
  const tokenizedGames = games?.filter((g) => g.is_tokenized && g.token_mint) ?? [];
  const lifetimeSpent = credits?.lifetime_spent ?? 0;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER === 'devnet' ? 'devnet' : 'mainnet';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
      <h1 className="mb-1 text-xl font-semibold text-white">Earnings</h1>
      <p className="mb-8 text-sm text-white/40">
        Your published catalog, tokenized games, and credit spend. Trading fees from
        token launches accrue on Meteora — claim them per-token below.
      </p>

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          label="Published games"
          value={publishedCount}
          icon={<Gamepad2 className="h-4 w-4 text-white/30" />}
        />
        <Stat
          label="Tokenized"
          value={tokenizedGames.length}
          icon={<Sparkles className="h-4 w-4 text-[#c9a96e]/60" />}
        />
        <Stat
          label="Credits spent"
          value={lifetimeSpent}
          icon={<Coins className="h-4 w-4 text-[#8b7ec8]/60" />}
        />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/80">
          Tokenized games
        </h2>

        {tokenizedGames.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-10 text-center text-white/40">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-white/15" />
            <p className="text-sm font-medium text-white/60">No tokens launched yet</p>
            <p className="mt-1 text-xs text-white/30">
              Publish a game and click <strong className="text-white/70">Launch token</strong> on
              its play page to earn 70% of trading fees on Meteora.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {tokenizedGames.map((g) => {
              const meteoraUrl = `https://launch.meteora.ag/token/${g.token_mint}${
                cluster === 'devnet' ? '?cluster=devnet' : ''
              }`;
              return (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-[#c9a96e]" />
                      <span className="truncate text-sm font-semibold text-white">
                        {g.name}
                      </span>
                      {g.token_symbol && (
                        <span className="rounded bg-[#c9a96e]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#c9a96e]">
                          ${g.token_symbol}
                        </span>
                      )}
                    </div>
                    {g.token_mint && (
                      <p className="mt-0.5 truncate font-mono text-[10px] text-white/30">
                        {g.token_mint}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      href={`/play/${g.slug}`}
                      className="text-xs text-white/50 hover:text-white"
                    >
                      Play
                    </Link>
                    <Link
                      href={meteoraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/60"
                      title="View pool on Meteora launchpad"
                    >
                      Pool
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                    <ClaimEarningsButton gameId={g.id} />
                  </div>
                </div>
              );
            })}
            <p className="mt-3 text-[11px] leading-relaxed text-white/30">
              Trading fees split <strong>70% creator / 30% platform</strong>. Claim from the
              Meteora launchpad. Once a pool reaches 80 SOL raised, anyone can graduate it to
              DAMM v2 for full AMM trading.
            </p>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/80">
          Credits
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Balance"
            value={credits?.balance ?? 0}
            icon={<Coins className="h-4 w-4 text-[#8b7ec8]/60" />}
          />
          <Stat label="Purchased" value={credits?.lifetime_purchased ?? 0} />
          <Stat label="Granted" value={credits?.lifetime_granted ?? 0} />
          <Stat label="Spent" value={credits?.lifetime_spent ?? 0} />
        </div>
        <Link
          href="/credits"
          className="mt-4 inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white"
        >
          View full ledger →
        </Link>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="mb-2 flex items-center gap-2">
        {icon}
        <span className="text-[11px] uppercase tracking-widest text-white/40">{label}</span>
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}
