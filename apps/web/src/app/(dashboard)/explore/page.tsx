import { createClient } from '@/lib/supabase/server';
import {
  ExploreClient,
  type PublishedGame,
  type FeaturedTemplate,
} from './explore-client';

export const dynamic = 'force-dynamic';

// Decide whether a template earns a spot in Explore. Two kinds qualify:
//   1. Playable templates — `gameState` declares a winScore or winSurviveSec
//      (the existing 2D Phaser games).
//   2. Three.js *showcase* templates — `category === 'showcase'`. Visual-only
//      Roblox-style 3D scenes you can pan around but can't yet play.
// Pure scaffolds with no gameState and no showcase category (Empty Canvas,
// the 3D Chess scaffold) stay out of Explore — they live only on Templates.
function shouldShowInExplore(scene: unknown, category: string): boolean {
  if (category === 'showcase') return true;
  const gameState = (scene as { gameState?: { winScore?: number; winSurviveSec?: number } } | null)
    ?.gameState;
  if (!gameState) return false;
  return Boolean((gameState.winScore ?? 0) > 0 || (gameState.winSurviveSec ?? 0) > 0);
}

export default async function ExplorePage() {
  let games: PublishedGame[] = [];
  let templates: FeaturedTemplate[] = [];

  try {
    const supabase = await createClient();
    const [gamesResult, templatesResult] = await Promise.all([
      supabase
        .from('published_games')
        .select('id, slug, name, creator_name, scene, created_at')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('templates')
        .select('id, name, description, category, scene, created_at')
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
        scene: unknown;
        created_at: string;
      }>) ?? [];
      templates = rows
        .filter((row) => shouldShowInExplore(row.scene, row.category))
        .map(({ scene: _scene, ...rest }) => rest);
    }
  } catch (err) {
    console.error('[explore/page] fetch threw:', err);
  }

  return <ExploreClient games={games} templates={templates} />;
}
