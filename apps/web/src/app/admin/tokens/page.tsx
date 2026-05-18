import { getTokenList } from '@/lib/admin/tokens';
import { TokensClient } from './tokens-client';

export const dynamic = 'force-dynamic';

export default async function TokensPage() {
  const rows = await getTokenList();
  return <TokensClient rows={rows} />;
}
