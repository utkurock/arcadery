-- ===========================================================================
-- New built-in arcade games — Sky Glider, Hex Tower, Drone Arena, Voxel Heist.
-- Schemas mirror the existing built-in pattern (00001_init.sql lines 745-833):
--   * uuid primary key, wallet + display_name, gameplay metrics, duration,
--     entry_signature, created_at.
--   * top/recent/wallet indexes for the leaderboard query in
--     apps/web/src/app/api/games/[game]/scores/route.ts.
--   * RLS enabled with a public read policy; writes go through the admin client.
-- ===========================================================================

-- ===========================================================================
-- Sky Glider — neon canyon wingsuit
-- ===========================================================================

create table if not exists public.sky_glider_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  distance_m      integer not null,
  combo_max       integer not null default 0,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists sky_glider_scores_top_idx
  on public.sky_glider_scores (distance_m desc);
create index if not exists sky_glider_scores_recent_idx
  on public.sky_glider_scores (created_at desc);
create index if not exists sky_glider_scores_wallet_idx
  on public.sky_glider_scores (wallet_address, created_at desc);

alter table public.sky_glider_scores enable row level security;

drop policy if exists "Anyone can read sky_glider_scores" on public.sky_glider_scores;
create policy "Anyone can read sky_glider_scores"
  on public.sky_glider_scores for select to public using (true);


-- ===========================================================================
-- Hex Tower — vertical procedural climber
-- ===========================================================================

create table if not exists public.hex_tower_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  height_m        integer not null,
  combo_max       integer not null default 0,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists hex_tower_scores_top_idx
  on public.hex_tower_scores (height_m desc);
create index if not exists hex_tower_scores_recent_idx
  on public.hex_tower_scores (created_at desc);
create index if not exists hex_tower_scores_wallet_idx
  on public.hex_tower_scores (wallet_address, created_at desc);

alter table public.hex_tower_scores enable row level security;

drop policy if exists "Anyone can read hex_tower_scores" on public.hex_tower_scores;
create policy "Anyone can read hex_tower_scores"
  on public.hex_tower_scores for select to public using (true);


-- ===========================================================================
-- Drone Arena — wave-based third-person mech combat
-- ===========================================================================

create table if not exists public.drone_arena_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  score           integer not null,
  wave_reached    integer not null default 1,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists drone_arena_scores_top_idx
  on public.drone_arena_scores (score desc);
create index if not exists drone_arena_scores_recent_idx
  on public.drone_arena_scores (created_at desc);
create index if not exists drone_arena_scores_wallet_idx
  on public.drone_arena_scores (wallet_address, created_at desc);

alter table public.drone_arena_scores enable row level security;

drop policy if exists "Anyone can read drone_arena_scores" on public.drone_arena_scores;
create policy "Anyone can read drone_arena_scores"
  on public.drone_arena_scores for select to public using (true);


-- ===========================================================================
-- Voxel Heist — speedrun voxel maze stealth
-- ===========================================================================

create table if not exists public.voxel_heist_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  score           integer not null,
  vaults_cracked  integer not null default 0,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists voxel_heist_scores_top_idx
  on public.voxel_heist_scores (score desc);
create index if not exists voxel_heist_scores_recent_idx
  on public.voxel_heist_scores (created_at desc);
create index if not exists voxel_heist_scores_wallet_idx
  on public.voxel_heist_scores (wallet_address, created_at desc);

alter table public.voxel_heist_scores enable row level security;

drop policy if exists "Anyone can read voxel_heist_scores" on public.voxel_heist_scores;
create policy "Anyone can read voxel_heist_scores"
  on public.voxel_heist_scores for select to public using (true);
