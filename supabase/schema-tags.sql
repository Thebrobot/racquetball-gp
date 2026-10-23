-- Florida Racquetball Grand Prix: photo tags + liker names (phase 1b).
-- Run once in the Supabase SQL Editor after schema.sql. Safe to re-run.

-- ─── Tags: "this player is in this photo" ────────────────────────────────────
create table if not exists public.photo_tags (
  photo_id text not null,
  player_slug text not null,
  tagged_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (photo_id, player_slug)
);
create index if not exists photo_tags_slug_idx on public.photo_tags (player_slug, created_at desc);

alter table public.photo_tags enable row level security;

drop policy if exists "tags: read all"   on public.photo_tags;
drop policy if exists "tags: tag self"   on public.photo_tags;
drop policy if exists "tags: untag self" on public.photo_tags;
create policy "tags: read all" on public.photo_tags for select using (true);
-- A verified player may tag themselves only (their approved player_slug).
create policy "tags: tag self" on public.photo_tags for insert with check (
  auth.uid() = tagged_by
  and player_slug = (select player_slug from public.profiles where id = auth.uid())
);
create policy "tags: untag self" on public.photo_tags for delete using (
  player_slug = (select player_slug from public.profiles where id = auth.uid())
);
-- Admins tag/untag anyone through the site's server (service role).

-- ─── Public views: who is in a photo, who liked it ───────────────────────────
create or replace view public.photo_people as
select t.photo_id, t.player_slug, p.display_name, t.created_at
from public.photo_tags t
left join public.profiles p on p.player_slug = t.player_slug;

create or replace view public.photo_likers as
select l.photo_id, p.display_name, p.player_slug, l.created_at
from public.photo_likes l
join public.profiles p on p.id = l.user_id;

grant select on public.photo_people to anon, authenticated;
grant select on public.photo_likers to anon, authenticated;
