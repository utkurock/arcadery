import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadLiveTokens } from '@/lib/tokens/devnet-loader';
import { TokenDetailClient } from './token-detail-client';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const tokens = await loadLiveTokens().catch(() => []);
  const token = tokens.find((t) => t.slug === slug);
  if (!token) {
    return { title: 'Token Not Found' };
  }
  return {
    title: `$${token.symbol} · ${token.name} — arcadery`,
    description: `Trade $${token.symbol} on the Meteora bonding curve and play ${token.name}.`,
    openGraph: {
      title: `$${token.symbol} · ${token.name}`,
      description: `Live game token on ${token.cluster}.`,
      type: 'website',
    },
  };
}

export default async function TokenDetailPage({ params }: Props) {
  const { slug } = await params;
  const tokens = await loadLiveTokens();
  const token = tokens.find((t) => t.slug === slug);
  if (!token) {
    notFound();
  }
  return <TokenDetailClient token={token} />;
}
