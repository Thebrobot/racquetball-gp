-- Florida Racquetball Grand Prix: player accounts, phase 1.
-- Paste into the Supabase SQL Editor and run once. Safe to re-run (idempotent).

-- ─── Profiles: one row per auth user, created automatically on sign-up ───────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  -- Set when a claim is approved; matches the site's player slug (e.g. "dylan-pruitt").
  player_slug text unique,
  is_junior boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Profile claims: "I am this player", approved by an admin ────────────────
create table if not exists public.profile_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  player_slug text not null,
  player_name text not null,
  note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create unique index if not exists profile_claims_one_pending_per_user
  on public.profile_claims (user_id) where status = 'pending';
create index if not exists profile_claims_status_idx on public.profile_claims (status, created_at);

-- ─── Likes: one per user per photo ───────────────────────────────────────────
create table if not exists public.photo_likes (
  photo_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);
create index if not exists photo_likes_photo_idx on public.photo_likes (photo_id);

-- ─── Views and shares: anonymous, one per visitor per photo per day ──────────
-- visitor_hash is a salted hash of address + user agent + day; no raw IPs stored.
create table if not exists public.photo_views (
  photo_id text not null,
  day date not null,
  visitor_hash text not null,
  primary key (photo_id, day, visitor_hash)
);
create table if not exists public.photo_shares (
  photo_id text not null,
  day date not null,
  visitor_hash text not null,
  channel text not null default 'link',
  created_at timestamptz not null default now(),
  primary key (photo_id, day, visitor_hash, channel)
);

-- ─── Aggregates the site reads ───────────────────────────────────────────────
create or replace view public.photo_stats as
select
  p.photo_id,
  coalesce(l.likes, 0)  as likes,
  coalesce(v.views, 0)  as views,
  coalesce(s.shares, 0) as shares
from (
  select photo_id from public.photo_likes
  union select photo_id from public.photo_views
  union select photo_id from public.photo_shares
) p
left join (select photo_id, count(*) as likes  from public.photo_likes  group by photo_id) l using (photo_id)
left join (select photo_id, count(*) as views  from public.photo_views  group by photo_id) v using (photo_id)
left join (select photo_id, count(*) as shares from public.photo_shares group by photo_id) s using (photo_id);

-- Public lookup used by player profile pages: which slugs are claimed.
create or replace view public.verified_players as
select player_slug, display_name, is_junior
from public.profiles
where player_slug is not null;

-- ─── Row-level security ──────────────────────────────────────────────────────
alter table public.profiles       enable row level security;
alter table public.profile_claims enable row level security;
alter table public.photo_likes    enable row level security;
alter table public.photo_views    enable row level security;
alter table public.photo_shares   enable row level security;

drop policy if exists "profiles: read own"   on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and player_slug is not distinct from (select player_slug from public.profiles where id = auth.uid()));

drop policy if exists "claims: read own"   on public.profile_claims;
drop policy if exists "claims: create own" on public.profile_claims;
create policy "claims: read own"   on public.profile_claims for select using (auth.uid() = user_id);
create policy "claims: create own" on public.profile_claims for insert with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "likes: read all"   on public.photo_likes;
drop policy if exists "likes: add own"    on public.photo_likes;
drop policy if exists "likes: remove own" on public.photo_likes;
create policy "likes: read all"   on public.photo_likes for select using (true);
create policy "likes: add own"    on public.photo_likes for insert with check (auth.uid() = user_id);
create policy "likes: remove own" on public.photo_likes for delete using (auth.uid() = user_id);

-- Views and shares are written only by the site's server (service role); no public policies.

grant select on public.photo_stats to anon, authenticated;
grant select on public.verified_players to anon, authenticated;
