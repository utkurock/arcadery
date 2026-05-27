-- ===========================================================================
-- User-saved components (prefabs)
-- ===========================================================================
-- A "component" is a named group of scene elements the user captured from
-- their own editor scene to reuse later (the "Save selection" action in the
-- Components panel). Per-user, not per-project — they're reusable building
-- blocks across all of a creator's games.
--
-- `data` holds the serialized SceneElement[] (the editor re-ids each element
-- on insert so re-adding never collides). `engine` records whether the prefab
-- was authored for a 2D (phaser) or 3D (three) scene so the panel can filter.

create table if not exists public.user_prefabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null check (char_length(name) between 1 and 80),
  engine text not null check (engine in ('2d', '3d')),
  -- Serialized SceneElement[] captured from the scene.
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists user_prefabs_user_id_idx
  on public.user_prefabs (user_id, created_at desc);

alter table public.user_prefabs enable row level security;

drop policy if exists "Users can select own prefabs" on public.user_prefabs;
create policy "Users can select own prefabs"
  on public.user_prefabs for select using (auth.uid() = user_id);

drop policy if exists "Users can insert own prefabs" on public.user_prefabs;
create policy "Users can insert own prefabs"
  on public.user_prefabs for insert with check (auth.uid() = user_id);

drop policy if exists "Users can delete own prefabs" on public.user_prefabs;
create policy "Users can delete own prefabs"
  on public.user_prefabs for delete using (auth.uid() = user_id);
