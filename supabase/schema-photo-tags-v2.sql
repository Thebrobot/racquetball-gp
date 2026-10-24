-- Photo tags v2: any signed-in user can tag players on a photo.
-- Existing photo_tags rows from "Claim photo" (self-tags) stay as tags — no copy.
-- Safe to re-run. The site API writes with the service role; these policies
-- cover session-client fallbacks.

-- Primary key (photo_id, player_slug) already prevents duplicate tags.

drop policy if exists "tags: tag self" on public.photo_tags;
drop policy if exists "tags: untag self" on public.photo_tags;
drop policy if exists "tags: add signed-in" on public.photo_tags;
drop policy if exists "tags: remove own" on public.photo_tags;

create policy "tags: add signed-in" on public.photo_tags for insert with check (
  auth.uid() is not null
  and auth.uid() = tagged_by
);

create policy "tags: remove own" on public.photo_tags for delete using (
  tagged_by = auth.uid()
  or player_slug = (select player_slug from public.profiles where id = auth.uid())
);
