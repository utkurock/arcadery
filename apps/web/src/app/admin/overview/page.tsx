import { getOverview } from '@/lib/admin/aggregate';
import { OverviewClient } from './overview-client';

// Server-fetches the aggregated overview once per request, hands the payload
// to the client component which renders cards + charts. Refreshing the page
// re-runs the aggregator. A "Refresh" button on the client also hits this
// route (via router.refresh()).

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const data = await getOverview();
  return <OverviewClient data={data} />;
}
