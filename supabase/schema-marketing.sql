-- Florida Racquetball Grand Prix: marketing consent. Run once in the SQL Editor. Safe to re-run.
alter table public.profiles add column if not exists marketing_opt_in boolean not null default false;
alter table public.profiles add column if not exists marketing_opt_in_at timestamptz;

-- Carry the sign-up checkbox into the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, marketing_opt_in, marketing_opt_in_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false),
    case when (new.raw_user_meta_data ->> 'marketing_opt_in')::boolean then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
