import Link from 'next/link';
import { Coins, Sparkles, Zap, Shield, Gift } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Footer } from '@/components/layout/footer';
import { PRICING_TIERS, WELCOME_BONUS, AI_GENERATE_COST } from '@/lib/credits/config';
import { PricingCta } from './pricing-cta';

export const metadata = {
  title: 'Pricing — Arcadery',
  description: 'Buy credits to generate games with AI. Pay in USDC on Solana.',
};

const features = [
  {
    icon: Zap,
    title: '1 credit = 1 AI generation',
    body: 'Every prompt you send to the AI editor spends one credit — scene generation, element tweaks, rewrites — all metered the same.',
  },
  {
    icon: Gift,
    title: 'Free refunds on AI failures',
    body: 'If the AI returns an empty or invalid response, the credit is returned automatically. You pay for what works.',
  },
  {
    icon: Shield,
    title: 'Paid in USDC on Solana',
    body: 'Stable pricing — no SOL volatility. Your $20 is always 25 credits. USDC transfers settle in seconds.',
  },
  {
    icon: Sparkles,
    title: 'Credits never expire',
    body: 'Buy a pack today, use them next month. No subscriptions, no recurring charges, no surprises.',
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] text-white font-[family-name:var(--font-inter)]">
      <Navbar />

      <section className="mx-auto max-w-6xl px-4 py-16 pt-24 sm:px-6 sm:py-20 sm:pt-32 md:px-8 lg:px-12">
        <div className="text-center mb-14">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Credits, not subscriptions
          </h1>
          <p className="text-white/60 max-w-xl mx-auto text-[15px] leading-relaxed">
            Buy what you need, when you need it. Pay in USDC on Solana — no cards,
            no monthly charges.
          </p>
          <div className="mt-6 inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5 text-xs text-white/70">
            Every new wallet starts with{' '}
            <strong className="text-white ml-1">{WELCOME_BONUS} credits</strong>, free.
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-16">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative rounded-2xl border p-6 transition-colors sm:p-8 ${
                tier.badge
                  ? 'border-[#8b7ec8]/40 bg-[#8b7ec8]/[0.06]'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
              }`}
            >
              {tier.badge && (
                <span className="absolute -top-2.5 left-8 inline-flex items-center gap-1 rounded-full bg-[#8b7ec8] px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  <Sparkles className="w-3 h-3" />
                  {tier.badge}
                </span>
              )}
              <div className="text-[11px] uppercase tracking-widest text-white/40 mb-2">
                {tier.label}
              </div>
              <div className="flex items-baseline gap-1.5 mb-5">
                <Coins className="w-5 h-5 text-[#c9a96e] self-center mr-1" />
                <span className="text-5xl font-bold">{tier.credits}</span>
                <span className="text-sm text-white/40 ml-1">credits</span>
              </div>
              <div className="flex items-baseline gap-2 mb-6">
                <span className="text-3xl font-bold">{tier.usdLabel}</span>
                <span className="text-sm text-white/40">
                  (${tier.perCreditUsd.toFixed(2)} / credit)
                </span>
              </div>
              <PricingCta tierId={tier.id} />
              <p className="mt-3 text-[11px] text-white/30 text-center">
                ≈ {Math.floor(tier.credits / AI_GENERATE_COST)} AI generations
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-white/[0.06] pt-12">
          {features.map((f) => (
            <div key={f.title} className="flex gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-[#8b7ec8]/10 text-[#8b7ec8] flex items-center justify-center">
                <f.icon className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
                <p className="text-xs text-white/50 leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-6 py-6">
          <h3 className="text-sm font-semibold text-white mb-2">What are credits for?</h3>
          <p className="text-xs text-white/60 leading-relaxed mb-3">
            Right now, credits gate the AI game editor. As Arcadery grows, credits will also cover
            publishing games on-chain, minting your game&apos;s token, and entry into token-launch
            mechanics. One currency, one top-up, everything works.
          </p>
          <p className="text-xs text-white/40">
            Need a lot more?{' '}
            <Link href="/docs" className="text-[#8b7ec8] hover:text-white">
              Read the docs
            </Link>{' '}
            or reach out — we can set up team rates.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
