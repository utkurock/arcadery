-- ============================================================================
-- Arcadery — consolidated schema (single migration)
-- ----------------------------------------------------------------------------
-- Single canonical migration. Idempotent: re-running it on an existing
-- database is a no-op (uses IF NOT EXISTS / OR REPLACE everywhere).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Clean up tables that previous migrations created but no code path uses.
-- Kept here (rather than silently dropped) so this file documents what was
-- removed. Safe on a fresh DB since `if exists` is a no-op.
-- ---------------------------------------------------------------------------

drop table if exists public.onchain_events cascade;
drop table if exists public.game_economies cascade;


-- ===========================================================================
-- Helpers
-- ===========================================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ===========================================================================
-- Projects
-- ===========================================================================

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null default 'Untitled Game',
  scene jsonb not null default '{}'::jsonb,
  forked_from uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_updated_at_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

drop policy if exists "Users can select own projects" on public.projects;
create policy "Users can select own projects"
  on public.projects for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own projects" on public.projects;
create policy "Users can insert own projects"
  on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own projects" on public.projects;
create policy "Users can update own projects"
  on public.projects for update using (auth.uid() = user_id);
drop policy if exists "Users can delete own projects" on public.projects;
create policy "Users can delete own projects"
  on public.projects for delete using (auth.uid() = user_id);

drop trigger if exists on_projects_updated on public.projects;
create trigger on_projects_updated
  before update on public.projects
  for each row execute function public.handle_updated_at();


-- ===========================================================================
-- Assets (storage + metadata)
-- ===========================================================================

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

drop policy if exists "Users can upload assets" on storage.objects;
create policy "Users can upload assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public read access for assets" on storage.objects;
create policy "Public read access for assets"
  on storage.objects for select
  to public
  using (bucket_id = 'assets');

drop policy if exists "Users can delete own assets" on storage.objects;
create policy "Users can delete own assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  project_id uuid references public.projects(id) on delete cascade not null,
  name text not null,
  url text not null,
  type text not null,
  size integer not null,
  storage_path text not null,
  -- frame_metadata: null for plain images, populated for sliced sprite sheets,
  -- animation cycles, or 3D models. Shapes:
  --   { mode: 'sheet', frame_count, frame_urls, frame_size: {w,h}, views: [...] }
  --   { mode: 'animation', frame_count, frame_urls, frame_size: {w,h}, fps }
  --   { mode: 'model', provider: 'meshy', meshy_task_id, thumbnail_url }
  frame_metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists assets_project_id_idx on public.assets (project_id);
create index if not exists assets_user_id_idx on public.assets (user_id);
create index if not exists assets_frame_mode_idx on public.assets ((frame_metadata->>'mode'));

alter table public.assets enable row level security;

drop policy if exists "Users can select own assets" on public.assets;
create policy "Users can select own assets"
  on public.assets for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own assets" on public.assets;
create policy "Users can insert own assets"
  on public.assets for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own assets" on public.assets;
create policy "Users can delete own assets"
  on public.assets for delete using (auth.uid() = user_id);


-- ===========================================================================
-- Templates
-- ===========================================================================

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null,
  thumbnail_url text,
  scene jsonb not null,
  category text not null default 'general',
  created_at timestamptz not null default now()
);

alter table public.templates enable row level security;

drop policy if exists "Anyone can read templates" on public.templates;
create policy "Anyone can read templates"
  on public.templates for select to public using (true);


-- ===========================================================================
-- Published games (with on-chain + token-launch fields)
-- ===========================================================================

create table if not exists public.published_games (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null,
  slug text unique not null,
  name text not null,
  scene jsonb not null,
  creator_name text not null default 'Anonymous',

  -- Solana token fields (populated after Meteora DBC launch)
  token_mint text,
  token_symbol text,
  token_name text,
  token_supply bigint,
  bonding_curve_address text,
  pool_config_address text,
  is_tokenized boolean not null default false,
  chain text not null default 'solana',
  deploy_tx text,
  token_image_url text,
  token_launched_at timestamptz,
  token_creator_wallet text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists published_games_slug_idx on public.published_games (slug);
create index if not exists published_games_user_id_idx on public.published_games (user_id);

alter table public.published_games enable row level security;

drop policy if exists "Anyone can read published games" on public.published_games;
create policy "Anyone can read published games"
  on public.published_games for select to public using (true);
drop policy if exists "Users can insert own published games" on public.published_games;
create policy "Users can insert own published games"
  on public.published_games for insert with check (auth.uid() = user_id);
drop policy if exists "Users can update own published games" on public.published_games;
create policy "Users can update own published games"
  on public.published_games for update using (auth.uid() = user_id);

drop trigger if exists on_published_games_updated on public.published_games;
create trigger on_published_games_updated
  before update on public.published_games
  for each row execute function public.handle_updated_at();

-- Late FK: projects.forked_from references published_games. Added here so the
-- table referenced by the constraint definitely exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'projects_forked_from_fkey'
  ) then
    alter table public.projects
      add constraint projects_forked_from_fkey
      foreign key (forked_from)
      references public.published_games(id)
      on delete set null;
  end if;
end $$;


-- ===========================================================================
-- User profiles (display name + wallet + avatar)
-- ===========================================================================

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  wallet_address text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

drop policy if exists "Public can read profiles" on public.user_profiles;
create policy "Public can read profiles"
  on public.user_profiles for select to public using (true);
drop policy if exists "Users can insert own profile" on public.user_profiles;
create policy "Users can insert own profile"
  on public.user_profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = id);


-- ===========================================================================
-- Credit system (USDC-backed, off-chain ledger)
-- ===========================================================================

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_purchased integer not null default 0,
  lifetime_spent integer not null default 0,
  lifetime_granted integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_credits enable row level security;

drop policy if exists "Users can read own credits" on public.user_credits;
create policy "Users can read own credits"
  on public.user_credits for select using (auth.uid() = user_id);

drop trigger if exists on_user_credits_updated on public.user_credits;
create trigger on_user_credits_updated
  before update on public.user_credits
  for each row execute function public.handle_updated_at();

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  delta integer not null,                    -- positive = grant, negative = spend
  reason text not null,
  balance_after integer not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.credit_ledger
  drop constraint if exists credit_ledger_reason_check;
alter table public.credit_ledger
  add constraint credit_ledger_reason_check
  check (reason in (
    'purchase',
    'welcome',
    'ai_generate',
    'ai_plan',
    'ai_image',
    'token_launch',
    'refund',
    'admin_grant',
    'admin_debit'
  ));

create index if not exists credit_ledger_user_idx on public.credit_ledger (user_id, created_at desc);

alter table public.credit_ledger enable row level security;

drop policy if exists "Users can read own ledger" on public.credit_ledger;
create policy "Users can read own ledger"
  on public.credit_ledger for select using (auth.uid() = user_id);

-- Idempotency table for Solana SPL purchases.
create table if not exists public.credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  tx_signature text unique not null,
  wallet_address text not null,
  payment_mint text not null,
  amount_base_units bigint not null,
  credits_granted integer not null,
  tier_id text,
  verified_at timestamptz not null default now()
);

create index if not exists credit_purchases_user_idx on public.credit_purchases (user_id, verified_at desc);

alter table public.credit_purchases enable row level security;

drop policy if exists "Users can read own purchases" on public.credit_purchases;
create policy "Users can read own purchases"
  on public.credit_purchases for select using (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- Atomic credit RPCs (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.spend_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
    from public.user_credits
    where user_id = p_user_id
    for update;

  if v_balance < p_amount then raise exception 'insufficient_credits'; end if;

  v_balance := v_balance - p_amount;

  update public.user_credits
    set balance = v_balance,
        lifetime_spent = lifetime_spent + p_amount
    where user_id = p_user_id;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, metadata)
  values (p_user_id, -p_amount, p_reason, v_balance, coalesce(p_metadata, '{}'::jsonb));

  return v_balance;
end;
$$;

revoke all on function public.spend_credits(uuid, integer, text, jsonb) from public;
grant execute on function public.spend_credits(uuid, integer, text, jsonb) to service_role;


create or replace function public.grant_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_is_purchase boolean := p_reason = 'purchase';
  v_is_grant boolean := p_reason in ('welcome', 'admin_grant', 'refund');
begin
  if p_amount <= 0 then raise exception 'amount_must_be_positive'; end if;

  insert into public.user_credits (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.user_credits
    set balance = balance + p_amount,
        lifetime_purchased = lifetime_purchased + (case when v_is_purchase then p_amount else 0 end),
        lifetime_granted = lifetime_granted + (case when v_is_grant then p_amount else 0 end)
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, balance_after, metadata)
  values (p_user_id, p_amount, p_reason, v_balance, coalesce(p_metadata, '{}'::jsonb));

  return v_balance;
end;
$$;

revoke all on function public.grant_credits(uuid, integer, text, jsonb) from public;
grant execute on function public.grant_credits(uuid, integer, text, jsonb) to service_role;


-- record_purchase: idempotent. Inserts into credit_purchases (unique on
-- tx_signature) and grants credits in the same transaction. Caller catches
-- the unique-violation to detect replays.
create or replace function public.record_purchase(
  p_user_id uuid,
  p_tx_signature text,
  p_wallet_address text,
  p_payment_mint text,
  p_amount_base_units bigint,
  p_credits integer,
  p_tier_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_credits <= 0 then raise exception 'credits_must_be_positive'; end if;

  insert into public.credit_purchases (
    user_id, tx_signature, wallet_address, payment_mint,
    amount_base_units, credits_granted, tier_id
  ) values (
    p_user_id, p_tx_signature, p_wallet_address, p_payment_mint,
    p_amount_base_units, p_credits, p_tier_id
  );

  v_balance := public.grant_credits(
    p_user_id,
    p_credits,
    'purchase',
    jsonb_build_object('tx_signature', p_tx_signature, 'tier_id', p_tier_id)
  );

  return v_balance;
end;
$$;

revoke all on function public.record_purchase(uuid, text, text, text, bigint, integer, text) from public;
grant execute on function public.record_purchase(uuid, text, text, text, bigint, integer, text) to service_role;


-- ===========================================================================
-- Generic published-game leaderboard (used by user-published games)
-- ===========================================================================

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.published_games(id) on delete cascade not null,
  player_name text not null,
  score integer not null,
  wallet_address text,
  created_at timestamptz not null default now()
);

create index if not exists leaderboard_game_score_idx
  on public.leaderboard (game_id, score desc);
create index if not exists leaderboard_game_created_idx
  on public.leaderboard (game_id, created_at desc);

alter table public.leaderboard enable row level security;

drop policy if exists "Anyone can read leaderboard" on public.leaderboard;
create policy "Anyone can read leaderboard"
  on public.leaderboard for select to public using (true);

-- INSERT goes through submit_score() — no direct public INSERT policy.

create or replace function public.submit_score(
  p_game_id uuid,
  p_player_name text,
  p_score integer,
  p_wallet_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_name text;
begin
  v_name := nullif(trim(p_player_name), '');
  if v_name is null then v_name := 'Anonymous'; end if;
  if char_length(v_name) > 40 then v_name := substring(v_name from 1 for 40); end if;

  if p_score is null or p_score < 0 or p_score > 1000000000 then
    raise exception 'invalid_score';
  end if;

  if not exists (select 1 from public.published_games where id = p_game_id) then
    raise exception 'game_not_found';
  end if;

  -- Per-(game, name) anti-spam: one submit per 10 seconds.
  if exists (
    select 1 from public.leaderboard
    where game_id = p_game_id
      and player_name = v_name
      and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'rate_limited';
  end if;

  insert into public.leaderboard (game_id, player_name, score, wallet_address)
  values (p_game_id, v_name, p_score, p_wallet_address)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.submit_score(uuid, text, integer, text) from public;
grant execute on function public.submit_score(uuid, text, integer, text) to anon, authenticated;


-- ===========================================================================
-- Fly Birds — pay-to-play prize pool (template-specific)
-- ===========================================================================

create table if not exists public.fly_birds_rounds (
  id uuid primary key default gen_random_uuid(),
  opens_at timestamptz not null default now(),
  pool_lamports bigint not null default 0,
  winner_wallet text,
  claimed_at timestamptz,
  claim_tx_signature text
);

-- Only one open round at a time.
create unique index if not exists fly_birds_rounds_one_open_idx
  on public.fly_birds_rounds ((1)) where claimed_at is null;

create table if not exists public.fly_birds_entries (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fly_birds_rounds(id) on delete cascade,
  wallet_address text not null,
  signature text not null unique,
  lamports bigint not null check (lamports > 0),
  created_at timestamptz not null default now()
);

create index if not exists fly_birds_entries_round_idx
  on public.fly_birds_entries (round_id);

create table if not exists public.fly_birds_scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.fly_birds_rounds(id) on delete cascade,
  wallet_address text not null,
  score integer not null check (score >= 0 and score <= 1000000000),
  created_at timestamptz not null default now()
);

create index if not exists fly_birds_scores_rank_idx
  on public.fly_birds_scores (round_id, score desc);

alter table public.fly_birds_rounds enable row level security;
alter table public.fly_birds_entries enable row level security;
alter table public.fly_birds_scores enable row level security;

drop policy if exists "anyone reads rounds" on public.fly_birds_rounds;
create policy "anyone reads rounds" on public.fly_birds_rounds for select to public using (true);
drop policy if exists "anyone reads entries" on public.fly_birds_entries;
create policy "anyone reads entries" on public.fly_birds_entries for select to public using (true);
drop policy if exists "anyone reads scores" on public.fly_birds_scores;
create policy "anyone reads scores"  on public.fly_birds_scores  for select to public using (true);


create or replace function public.fly_birds_active_round()
returns public.fly_birds_rounds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.fly_birds_rounds;
begin
  select * into v_row from public.fly_birds_rounds where claimed_at is null limit 1;
  if v_row.id is null then
    insert into public.fly_birds_rounds default values returning * into v_row;
  end if;
  return v_row;
end;
$$;

create or replace function public.fly_birds_record_entry(
  p_signature text,
  p_wallet text,
  p_lamports bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.fly_birds_rounds;
  v_existing uuid;
begin
  if p_signature is null or char_length(p_signature) < 32 then raise exception 'invalid_signature'; end if;
  if p_wallet is null or char_length(p_wallet) < 32 then raise exception 'invalid_wallet'; end if;
  if p_lamports is null or p_lamports <= 0 then raise exception 'invalid_amount'; end if;

  select round_id into v_existing from public.fly_birds_entries where signature = p_signature;
  if v_existing is not null then return v_existing; end if;

  v_round := public.fly_birds_active_round();

  insert into public.fly_birds_entries (round_id, wallet_address, signature, lamports)
  values (v_round.id, p_wallet, p_signature, p_lamports);

  update public.fly_birds_rounds
    set pool_lamports = pool_lamports + p_lamports
    where id = v_round.id;

  return v_round.id;
end;
$$;

create or replace function public.fly_birds_submit_score(
  p_wallet text,
  p_score integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_round public.fly_birds_rounds;
  v_id uuid;
begin
  if p_wallet is null or char_length(p_wallet) < 32 then raise exception 'invalid_wallet'; end if;
  if p_score is null or p_score < 0 or p_score > 1000000000 then raise exception 'invalid_score'; end if;

  v_round := public.fly_birds_active_round();

  insert into public.fly_birds_scores (round_id, wallet_address, score)
  values (v_round.id, p_wallet, p_score)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.fly_birds_close_round(
  p_round_id uuid,
  p_winner_wallet text,
  p_claim_signature text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.fly_birds_rounds
    set winner_wallet = p_winner_wallet,
        claim_tx_signature = p_claim_signature,
        claimed_at = now()
    where id = p_round_id and claimed_at is null;
  if not found then raise exception 'round_already_claimed_or_missing'; end if;
end;
$$;

revoke all on function public.fly_birds_active_round() from public;
revoke all on function public.fly_birds_record_entry(text, text, bigint) from public;
revoke all on function public.fly_birds_submit_score(text, integer) from public;
revoke all on function public.fly_birds_close_round(uuid, text, text) from public;

grant execute on function public.fly_birds_active_round() to service_role, anon, authenticated;
grant execute on function public.fly_birds_record_entry(text, text, bigint) to service_role;
grant execute on function public.fly_birds_submit_score(text, integer) to service_role;
grant execute on function public.fly_birds_close_round(uuid, text, text) to service_role;


-- ===========================================================================
-- Drift Racer — built-in template scores + token claim
-- ===========================================================================

create table if not exists public.drift_racer_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  best_lap_sec    numeric(8,3) not null,
  total_time_sec  numeric(8,3) not null,
  drift_score     integer not null default 0,
  laps_completed  integer not null default 0,
  won             boolean not null default false,
  entry_signature text,                            -- on-chain proof of paid entry
  created_at      timestamptz not null default now()
);

create index if not exists drift_racer_scores_winners_idx
  on public.drift_racer_scores (best_lap_sec asc)
  where won = true;
create index if not exists drift_racer_scores_recent_idx
  on public.drift_racer_scores (created_at desc);
create index if not exists drift_racer_scores_wallet_idx
  on public.drift_racer_scores (wallet_address, created_at desc);

alter table public.drift_racer_scores enable row level security;

drop policy if exists "Anyone can read drift_racer_scores" on public.drift_racer_scores;
create policy "Anyone can read drift_racer_scores"
  on public.drift_racer_scores for select to public using (true);


create table if not exists public.drift_racer_claims (
  wallet_address    text primary key,
  score_id          uuid references public.drift_racer_scores(id) on delete set null,
  signature         text not null,
  amount_base_units bigint not null,
  created_at        timestamptz not null default now()
);

alter table public.drift_racer_claims enable row level security;

drop policy if exists "Anyone can read drift_racer_claims" on public.drift_racer_claims;
create policy "Anyone can read drift_racer_claims"
  on public.drift_racer_claims for select to public using (true);


-- ===========================================================================
-- Neon Asteroids — built-in template scores
-- ===========================================================================

create table if not exists public.neon_asteroids_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  score           integer not null,
  wave_reached    integer not null default 1,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists neon_asteroids_scores_top_idx
  on public.neon_asteroids_scores (score desc);
create index if not exists neon_asteroids_scores_recent_idx
  on public.neon_asteroids_scores (created_at desc);
create index if not exists neon_asteroids_scores_wallet_idx
  on public.neon_asteroids_scores (wallet_address, created_at desc);

alter table public.neon_asteroids_scores enable row level security;

drop policy if exists "Anyone can read neon_asteroids_scores" on public.neon_asteroids_scores;
create policy "Anyone can read neon_asteroids_scores"
  on public.neon_asteroids_scores for select to public using (true);


-- ===========================================================================
-- Cube Runner — built-in template scores
-- ===========================================================================

create table if not exists public.cube_runner_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  distance_m      integer not null,
  coins           integer not null default 0,
  duration_sec    numeric(8,3) not null default 0,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists cube_runner_scores_top_idx
  on public.cube_runner_scores (distance_m desc);
create index if not exists cube_runner_scores_recent_idx
  on public.cube_runner_scores (created_at desc);
create index if not exists cube_runner_scores_wallet_idx
  on public.cube_runner_scores (wallet_address, created_at desc);

alter table public.cube_runner_scores enable row level security;

drop policy if exists "Anyone can read cube_runner_scores" on public.cube_runner_scores;
create policy "Anyone can read cube_runner_scores"
  on public.cube_runner_scores for select to public using (true);


-- ===========================================================================
-- Brick Smash — built-in template scores
-- ===========================================================================

create table if not exists public.brick_smash_scores (
  id              uuid primary key default gen_random_uuid(),
  wallet_address  text not null,
  display_name    text,
  score           integer not null,
  level_reached   integer not null default 1,
  bricks_destroyed integer not null default 0,
  duration_sec    numeric(8,3) not null default 0,
  won             boolean not null default false,
  entry_signature text,
  created_at      timestamptz not null default now()
);

create index if not exists brick_smash_scores_top_idx
  on public.brick_smash_scores (score desc);
create index if not exists brick_smash_scores_recent_idx
  on public.brick_smash_scores (created_at desc);
create index if not exists brick_smash_scores_wallet_idx
  on public.brick_smash_scores (wallet_address, created_at desc);

alter table public.brick_smash_scores enable row level security;

drop policy if exists "Anyone can read brick_smash_scores" on public.brick_smash_scores;
create policy "Anyone can read brick_smash_scores"
  on public.brick_smash_scores for select to public using (true);
