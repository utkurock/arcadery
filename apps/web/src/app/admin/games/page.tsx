import { getPublishedGameList } from '@/lib/admin/published-games';
import { GamesClient } from './games-client';

export const dynamic = 'force-dynamic';

export default async function AdminGamesPage() {
  const rows = await getPublishedGameList();
  return <GamesClient rows={rows} />;
}
