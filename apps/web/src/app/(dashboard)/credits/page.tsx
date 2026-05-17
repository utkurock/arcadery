import Link from 'next/link';
import { Coins, ArrowUpRight, ArrowDownRight, ExternalLink } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { TopUpButton } from './top-up-button';

export const metadata = {
  title: 'Credits — Arcadery',
  description: 'Your credit balance and history.',
};

type CreditsRow = {
  balance: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  lifetime_granted: number;
};

type LedgerRow = {
  id: string;
  delta: number;
  reason: string;
  balance_after: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  tx_signature: string;
  amount_base_units: number;
  credits_granted: number;
  payment_mint: string;
  tier_id: string | null;
  verified_at: string;
};

const REASON_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  welcome: 'Welcome bonus',
  ai_generate: 'AI scene',
  ai_plan: 'AI plan',
  ai_image: 'AI image',
  token_launch: 'Token launch',
  refund: 'Refund',
  admin_grant: 'Admin grant',
  admin_debit: 'Admin debit',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUsdc(baseUnits: number): string {
  return `$${(baseUnits / 1_000_000).toFixed(2)}`;
}

export default async function CreditsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <main className="min-h-full bg-[#0a0a0f] text-white font-[family-name:var(--font-inter)]">
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 max-w-md mx-auto text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#c9a96e]/10">
            <Coins className="w-7 h-7 text-[#c9a96e]" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Sign in to see your credits</h1>
          <p className="text-white/50 text-sm mb-6">
            Connect your Solana wallet to view your balance, purchase history, and ledger.
          </p>
          <TopUpButton label="Connect wallet" mode="login" />
        </div>
      </main>
    );
  }

  const [{ data: credits }, { data: ledger }, { data: purchases }] = await Promise.all([
    supabase
      .from('user_credits')
      .select('balance, lifetime_purchased, lifetime_spent, lifetime_granted')
      .eq('user_id', user.id)
      .maybeSingle<CreditsRow>(),
    supabase
      .from('credit_ledger')
      .select('id, delta, reason, balance_after, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .returns<LedgerRow[]>(),
    supabase
      .from('credit_purchases')
      .select('id, tx_signature, amount_base_units, credits_granted, payment_mint, tier_id, verified_at')
      .eq('user_id', user.id)
      .order('verified_at', { ascending: false })
      .limit(20)
      .returns<PurchaseRow[]>(),
  ]);

  const balance = credits?.balance ?? 0;

  return (
    <main className="min-h-full bg-[#0a0a0f] text-white font-[family-name:var(--font-inter)]">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 md:px-8 lg:px-10">
        <h1 className="text-2xl font-bold mb-6">Credits</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-10">
          <div className="md:col-span-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <div className="flex items-center gap-2 mb-1 text-[11px] text-white/40 uppercase tracking-widest">
              <Coins className="w-3.5 h-3.5 text-[#c9a96e]" />
              Balance
            </div>
            <div className="text-5xl font-bold text-white font-mono tabular-nums">
              {balance}
            </div>
            <div className="mt-5">
              <TopUpButton label="Top up credits" mode="buy" />
            </div>
          </div>

          <StatCard label="Lifetime bought" value={credits?.lifetime_purchased ?? 0} />
          <StatCard label="Lifetime spent" value={credits?.lifetime_spent ?? 0} />
        </div>

        <section className="mb-10">
          <h2 className="text-sm font-semibold text-white/80 mb-3">Recent activity</h2>
          {!ledger || ledger.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-10 text-center text-sm text-white/40">
              No activity yet.{' '}
              {credits?.lifetime_granted ? '' : 'Your welcome bonus should appear here soon.'}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="bg-white/[0.03] text-white/40 text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Activity</th>
                    <th className="px-4 py-3 text-right font-medium">Change</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="bg-white/[0.01]">
                  {ledger.map((row) => {
                    const isCredit = row.delta > 0;
                    return (
                      <tr key={row.id} className="border-t border-white/[0.04]">
                        <td className="px-4 py-2.5 text-white/40 text-xs whitespace-nowrap">
                          {formatDate(row.created_at)}
                        </td>
                        <td className="px-4 py-2.5 text-white/80">
                          {REASON_LABELS[row.reason] ?? row.reason}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                            isCredit ? 'text-emerald-400' : 'text-white/80'
                          }`}
                        >
                          <span className="inline-flex items-center gap-1">
                            {isCredit ? (
                              <ArrowUpRight className="w-3 h-3" />
                            ) : (
                              <ArrowDownRight className="w-3 h-3" />
                            )}
                            {isCredit ? '+' : ''}
                            {row.delta}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white/60">
                          {row.balance_after}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {purchases && purchases.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-white/80 mb-3">Purchases</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-white/[0.03] text-white/40 text-[11px] uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">When</th>
                    <th className="px-4 py-3 text-left font-medium">Tier</th>
                    <th className="px-4 py-3 text-right font-medium">Paid</th>
                    <th className="px-4 py-3 text-right font-medium">Credits</th>
                    <th className="px-4 py-3 text-right font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody className="bg-white/[0.01]">
                  {purchases.map((row) => (
                    <tr key={row.id} className="border-t border-white/[0.04]">
                      <td className="px-4 py-2.5 text-white/40 text-xs whitespace-nowrap">
                        {formatDate(row.verified_at)}
                      </td>
                      <td className="px-4 py-2.5 text-white/80">{row.tier_id ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-white/80">
                        {formatUsdc(row.amount_base_units)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-400">
                        +{row.credits_granted}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`https://solscan.io/tx/${row.tx_signature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-[#8b7ec8]"
                        >
                          {row.tx_signature.slice(0, 6)}…
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
      <div className="text-[11px] text-white/40 uppercase tracking-widest mb-1">{label}</div>
      <div className="text-2xl font-semibold text-white font-mono tabular-nums">{value}</div>
    </div>
  );
}
