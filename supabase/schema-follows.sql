-- Florida Racquetball Grand Prix: live result notifications. Run once. Safe to re-run.

-- Your own results on or off (verified players only).
alter table public.profiles add column if not exists notify_results boolean not null default true;

-- Who follows what: kind 'player' (key = player slug) or 'event' (key = event slug).
create table if not exists public.follows (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('player', 'event')),
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);
create index if not exists follows_key_idx on public.follows (kind, key);
alter table public.follows enable row level security;
drop policy if exists "follows: read own"   on public.follows;
drop policy if exists "follows: create own" on public.follows;
drop policy if exists "follows: delete own" on public.follows;
create policy "follows: read own"   on public.follows for select using (auth.uid() = user_id);
create policy "follows: create own" on public.follows for insert with check (auth.uid() = user_id);
create policy "follows: delete own" on public.follows for delete using (auth.uid() = user_id);

-- Result events already handled, so a result is never announced twice.
create table if not exists public.result_events (
  id text primary key,
  event_slug text,
  processed_at timestamptz not null default now(),
  notified int not null default 0
);
alter table public.result_events enable row level security;
-- Server (service role) only.
