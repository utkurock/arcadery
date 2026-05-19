-- ===========================================================================
-- Community chat — single global lobby (no rooms / channels in v1).
--
-- Design choices:
--   * Display name + avatar are SNAPSHOT into the row at insert time. The
--     client only does one query (`select * from chat_messages order by
--     created_at desc limit 50`) — no joins against user_profiles, no per-
--     row enrichment. If a user later renames themselves, old messages keep
--     the historical name (just like Slack, Discord channel logs, etc.).
--   * RLS:
--       - Anyone (incl. anon) can READ. Public lobby is the whole point.
--       - Only authenticated users can INSERT, and only as themselves
--         (auth.uid() = user_id). Writes go through the user's session,
--         not the service role.
--   * Realtime publication is appended so the standard Supabase JS client
--     receives postgres_changes payloads on INSERT.
-- ===========================================================================

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  wallet_address  text not null,
  display_name    text,
  avatar_url      text,
  content         text not null check (char_length(content) between 1 and 500),
  created_at      timestamptz not null default now()
);

create index if not exists chat_messages_recent_idx
  on public.chat_messages (created_at desc);
create index if not exists chat_messages_user_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "Anyone can read chat" on public.chat_messages;
create policy "Anyone can read chat"
  on public.chat_messages for select to public using (true);

drop policy if exists "Signed in can post chat" on public.chat_messages;
create policy "Signed in can post chat"
  on public.chat_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Author can delete their own messages (self-edit-by-delete-and-repost).
drop policy if exists "Author can delete chat" on public.chat_messages;
create policy "Author can delete chat"
  on public.chat_messages for delete
  to authenticated
  using (auth.uid() = user_id);

-- Hook the table into the Supabase Realtime publication. The publication is
-- created by `supabase_realtime` extension on every project; the conditional
-- guard makes the migration idempotent if a previous run already added the
-- table.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
exception
  when undefined_object then
    -- Publication doesn't exist in this environment (e.g. local CI without
    -- the realtime extension). Silently skip — the table still works, just
    -- without push updates.
    null;
end $$;
