import { TokensClient } from './tokens-client';
import { loadLiveTokens, type LiveToken } from '@/lib/tokens/devnet-loader';

export const dynamic = 'force-dynamic';

export default async function TokensPage() {
  let liveTokens: LiveToken[] = [];
  try {
    liveTokens = await loadLiveTokens();
  } catch (err) {
    console.error('[tokens/page] live token load threw:', err);
  }

  return <TokensClient liveTokens={liveTokens} />;
}
