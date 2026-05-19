import { createClient } from '@/lib/supabase/server';
import {
  ExploreClient,
  type PublishedGame,
  type FeaturedTemplate,
} from './explore-client';

// Revalidate every 30s instead of rendering on every request. Explore is a
// public listing where stale-for-30s is fine and the cached path renders in
// single-digit ms vs ~hundreds for the cold-fetch path that was previously
// running on every navigation.
export const revalidate = 30;

function shouldShowInExplore(
  gameState: { winScore?: number; winSurviveSec?: number } | null | undefined,
  category: string,
): boolean {
  if (category === 'showcase') return true;
  if (!gameState) return false;
  return Boolean(
    (gameState.winScore ?? 0) > 0 || (gameState.winSurviveSec ?? 0) > 0,
  );
}

export default async function ExplorePage() {
  let games: PublishedGame[] = [];
  let templates: FeaturedTemplate[] = [];

  try {
    const supabase = await createClient();
    // Trim columns to what ExploreClient actually reads. Previously this
    // fetched `scene` for both queries — `scene` is a large JSONB column and
    // every template carries the full scene graph. We don't render scene
    // contents in the explore cards, so we drop it from published_games
    // entirely and read only the small `gameState` slice from templates via
    // PostgREST's JSON-path syntax (kept as a JS-side filter input).
    const [gamesResult, templatesResult] = await Promise.all([
      supabase
        .from('published_games')
        .select('id, slug, name, creator_name, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('templates')
        .select('id, name, description, category, created_at, scene->gameState')
        .order('created_at', { ascending: false }),
    ]);

    if (gamesResult.error) {
      console.error('[explore/page] published_games error:', gamesResult.error);
    } else {
      games = (gamesResult.data as PublishedGame[]) ?? [];
    }

    if (templatesResult.error) {
      console.error('[explore/page] templates error:', templatesResult.error);
    } else {
      const rows = (templatesResult.data as Array<{
        id: string;
        name: string;
        description: string;
        category: string;
        created_at: string;
        gameState: { winScore?: number; winSurviveSec?: number } | null;
      }>) ?? [];
      templates = rows
        .filter((row) => shouldShowInExplore(row.gameState, row.category))
        .map(({ gameState: _gameState, ...rest }) => rest);
    }
  } catch (err) {
    console.error('[explore/page] fetch threw:', err);
  }

  return <ExploreClient games={games} templates={templates} />;
}
