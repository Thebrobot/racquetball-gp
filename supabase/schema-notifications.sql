-- Florida Racquetball Grand Prix: notifications (email + browser push).
-- Run once in the Supabase SQL Editor after the other schema files. Safe to re-run.

-- ─── Preferences on the profile ───────────────────────────────────────────────
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.profiles add column if not exists notify_push  boolean not null default true;

-- ─── Event log: one row per thing that happened to a person ───────────────────
-- Instant kinds (claim_approved, tagged, comment) are delivered as they are
-- created. "like" rows wait for the end-of-day roll-up. Other kinds (for
-- example live scores) can be added later without changing the table.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  photo_id text,
  actor_id uuid references public.profiles (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  emailed_at timestamptz,
  pushed_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_digest_idx on public.notifications (kind, created_at) where emailed_at is null;
alter table public.notifications enable row level security;
drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own" on public.notifications for select using (auth.uid() = user_id);
-- Writes go through the server (service role) only.

-- ─── Browser push subscriptions ───────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: read own"   on public.push_subscriptions;
drop policy if exists "push: create own" on public.push_subscriptions;
drop policy if exists "push: delete own" on public.push_subscriptions;
create policy "push: read own"   on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push: create own" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push: delete own" on public.push_subscriptions for delete using (auth.uid() = user_id);
