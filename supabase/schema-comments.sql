-- Florida Racquetball Grand Prix: photo comments, reports, junior flags (phase 2).
-- Run once in the Supabase SQL Editor after schema.sql and schema-tags.sql. Safe to re-run.

-- ─── Photo-level flags set by admins (junior photos hold comments for review) ─
create table if not exists public.photo_flags (
  photo_id text primary key,
  is_junior boolean not null default false,
  comments_off boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.photo_flags enable row level security;
drop policy if exists "flags: read all" on public.photo_flags;
create policy "flags: read all" on public.photo_flags for select using (true);
-- Writes go through the server (service role) only.

-- ─── Comments ────────────────────────────────────────────────────────────────
create table if not exists public.photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  -- visible: shown; pending: waiting for admin (junior photo); hidden: reported or removed by admin
  status text not null default 'visible' check (status in ('visible', 'pending', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists photo_comments_photo_idx on public.photo_comments (photo_id, created_at);
create index if not exists photo_comments_status_idx on public.photo_comments (status, created_at desc);

alter table public.photo_comments enable row level security;
drop policy if exists "comments: read visible or own" on public.photo_comments;
drop policy if exists "comments: create own"          on public.photo_comments;
drop policy if exists "comments: delete own"          on public.photo_comments;
create policy "comments: read visible or own" on public.photo_comments for select
  using (status = 'visible' or auth.uid() = user_id);
create policy "comments: create own" on public.photo_comments for insert
  with check (auth.uid() = user_id and status in ('visible', 'pending'));
create policy "comments: delete own" on public.photo_comments for delete
  using (auth.uid() = user_id);

-- ─── Reports: one per person per comment ─────────────────────────────────────
create table if not exists public.comment_reports (
  comment_id uuid not null references public.photo_comments (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);
alter table public.comment_reports enable row level security;
drop policy if exists "reports: create own" on public.comment_reports;
create policy "reports: create own" on public.comment_reports for insert with check (auth.uid() = reporter_id);

-- ─── Public feed: visible comments with author names ─────────────────────────
create or replace view public.photo_comment_feed as
select c.id, c.photo_id, c.body, c.created_at, c.user_id,
       p.display_name, p.player_slug
from public.photo_comments c
join public.profiles p on p.id = c.user_id
where c.status = 'visible';
grant select on public.photo_comment_feed to anon, authenticated;

-- ─── Stats view gains a comment count (column appended; existing columns unchanged)
create or replace view public.photo_stats as
select
  p.photo_id,
  coalesce(l.likes, 0)    as likes,
  coalesce(v.views, 0)    as views,
  coalesce(s.shares, 0)   as shares,
  coalesce(c.comments, 0) as comments
from (
  select photo_id from public.photo_likes
  union select photo_id from public.photo_views
  union select photo_id from public.photo_shares
  union select photo_id from public.photo_comments where status = 'visible'
) p
left join (select photo_id, count(*) as likes    from public.photo_likes    group by photo_id) l using (photo_id)
left join (select photo_id, count(*) as views    from public.photo_views    group by photo_id) v using (photo_id)
left join (select photo_id, count(*) as shares   from public.photo_shares   group by photo_id) s using (photo_id)
left join (select photo_id, count(*) as comments from public.photo_comments where status = 'visible' group by photo_id) c using (photo_id);
grant select on public.photo_stats to anon, authenticated;
