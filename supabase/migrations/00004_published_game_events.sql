-- ===========================================================================
-- Per-game analytics events
-- ===========================================================================
-- One row per "thing that happened" on a published game page. Powers the
-- admin/games engagement metrics (views, signed-in views, unique wallets,
-- unique anons) so creators and the platform can show real traction.
--
-- Writes go exclusively through the server-side ingestion endpoint using the
-- service-role admin client; RLS is enabled with no public policies, so only
-- service-role bypass can read/write. Admin panel uses service-role too.

create table if not exists public.published_game_events (
  id bigserial primary key,
  game_id uuid references public.published_games(id) on delete cascade not null,
  -- 'view' fires on /play/<slug> mount; 'play_start' fires when the runtime
  -- transitions to playing; 'score_submit' fires when a score lands. Owner
  -- views are excluded by the API route so creators testing their own game
  -- can't inflate metrics.
  event_type text not null check (event_type in ('view', 'play_start', 'score_submit')),
  -- Both nullable — anon visitors have neither.
  user_id uuid references auth.users(id) on delete set null,
  wallet_address text,
  -- Long-lived cookie ID, used to count distinct anonymous visitors. Random
  -- UUID set by the auth-touch middleware on first request.
  anon_id text,
  created_at timestamptz not null default now()
);

create index if not exists published_game_events_game_created_idx
  on public.published_game_events (game_id, created_at desc);
create index if not exists published_game_events_game_type_idx
  on public.published_game_events (game_id, event_type);
create index if not exists published_game_events_game_wallet_idx
  on public.published_game_events (game_id, wallet_address)
  where wallet_address is not null;
create index if not exists published_game_events_game_anon_idx
  on public.published_game_events (game_id, anon_id)
  where anon_id is not null;

alter table public.published_game_events enable row level security;
-- No policies = no public access. Service-role bypass handles all reads/writes.
