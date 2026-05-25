import { NextResponse } from 'next/server';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Per-game analytics ingestion. Lightweight POST that the play page's beacon
// fires for 'view', 'play_start', and 'score_submit'. Inserts into
// `published_game_events` using the service-role client (table is RLS-locked
// with no public policies).
//
// Design notes:
//   • The play page already has an authenticated server-component context, so
//     we resolve user_id / wallet via the SSR-cookie supabase client here too.
//     This means a signed-in visitor's events are wallet-attributed without
//     the client sending anything sensitive.
//   • Owner-of-the-game views are dropped server-side. Creators testing their
//     own game would otherwise inflate engagement metrics.
//   • The slug → game_id lookup is unavoidable per call. Slug is unique +
//     indexed in 00001_init.sql, so this is a cheap point read.
//   • We deliberately return 204 with no body so the client beacon can ignore
//     the response (and use `keepalive: true` / `sendBeacon` cleanly).

const ALLOWED_EVENTS = new Set(['view', 'play_start', 'score_submit'] as const);
type EventType = typeof ALLOWED_EVENTS extends Set<infer T> ? T : never;

export const dynamic = 'force-dynamic';

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(req: Request, { params }: RouteContext) {
  const { slug } = await params;

  let body: { event_type?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const eventType = body.event_type;
  if (!eventType || !ALLOWED_EVENTS.has(eventType as EventType)) {
    return NextResponse.json({ error: 'invalid_event_type' }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // Look up the game by slug + the current viewer in parallel.
  const [{ data: game }, { data: { user: viewer } }] = await Promise.all([
    supabase.from('published_games').select('id, user_id').eq('slug', slug).single(),
    supabase.auth.getUser(),
  ]);
  if (!game) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }

  // Drop owner views so creators testing their own game don't inflate
  // metrics. We still log play_start / score_submit from owners — those are
  // genuine engagement signals even from the creator.
  if (eventType === 'view' && viewer?.id === game.user_id) {
    return new NextResponse(null, { status: 204 });
  }

  // Resolve wallet for signed-in viewers. Profile row is the canonical
  // source; fall back to auth metadata in case the profile insert is racing.
  let walletAddress: string | null = null;
  if (viewer) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('wallet_address')
      .eq('id', viewer.id)
      .maybeSingle<{ wallet_address: string | null }>();
    walletAddress =
      profile?.wallet_address ||
      (viewer.user_metadata?.wallet_address as string | undefined) ||
      null;
  }

  // Anon-id from the cookie stamped by middleware. Missing means the
  // visitor disabled cookies or middleware didn't run — store null in that
  // case and the row only counts toward total views, not unique anons.
  const cookieHeader = req.headers.get('cookie') ?? '';
  const anonMatch = cookieHeader.match(/(?:^|;\s*)arc_anon_id=([^;]+)/);
  const anonId = anonMatch ? decodeURIComponent(anonMatch[1]) : null;

  const admin = createAdminClient();
  const { error } = await admin.from('published_game_events').insert({
    game_id: game.id,
    event_type: eventType,
    user_id: viewer?.id ?? null,
    wallet_address: walletAddress,
    anon_id: anonId,
  });
  if (error) {
    console.error('event ingest failed', error);
    return NextResponse.json({ error: 'insert_failed' }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
