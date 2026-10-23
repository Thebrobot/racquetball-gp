-- Florida Racquetball Grand Prix: player photo uploads with approval. Run once. Safe to re-run.
create table if not exists public.photo_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  album text not null,
  caption text,
  pathname text not null,
  url text not null,
  content_type text,
  bytes int,
  width int,
  height int,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  photo_id text,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text
);
create index if not exists photo_submissions_status_idx on public.photo_submissions (status, created_at);
create index if not exists photo_submissions_user_idx on public.photo_submissions (user_id, created_at desc);
alter table public.photo_submissions enable row level security;
drop policy if exists "submissions: read own" on public.photo_submissions;
create policy "submissions: read own" on public.photo_submissions for select using (auth.uid() = user_id);
-- Writes go through the server (service role) only.
