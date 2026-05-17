import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GameRow = {
  id: string;
  slug: string;
  name: string;
  creator_name: string;
  is_tokenized: boolean | null;
  token_name: string | null;
  token_symbol: string | null;
  token_image_url: string | null;
};

/**
 * SPL token metadata JSON — Metaplex / OpenSea compatible shape.
 *
 * Wallets and explorers fetch this URI from the on-chain mint account and use
 * it to display the token name, symbol, and image. Returning an HTTP 404 here
 * (which is what we did before this route existed) leaves freshly launched
 * tokens looking nameless in Phantom / Solscan / Meteora.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await context.params;
  if (!gameId || gameId.length > 64) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: game, error } = await admin
    .from('published_games')
    .select(
      'id, slug, name, creator_name, is_tokenized, token_name, token_symbol, token_image_url',
    )
    .eq('id', gameId)
    .maybeSingle<GameRow>();

  if (error || !game) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  // Fall back to game name/slug if token_* fields aren't set yet (game existed
  // before tokenization). Description points players back to the playable URL.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const playUrl = appUrl ? `${appUrl}/play/${game.slug}` : `/play/${game.slug}`;
  const name = game.token_name || game.name;
  const symbol = game.token_symbol || '';
  const image = game.token_image_url || '';
  const description = `Token for the game "${game.name}" on Arcadery, made by ${game.creator_name}. Play: ${playUrl}`;

  const body = {
    name,
    symbol,
    description,
    image,
    external_url: playUrl,
    attributes: [
      { trait_type: 'Creator', value: game.creator_name },
      { trait_type: 'Game', value: game.name },
    ],
  };

  return NextResponse.json(body, {
    headers: {
      // Wallets cache aggressively; one hour is plenty.
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
