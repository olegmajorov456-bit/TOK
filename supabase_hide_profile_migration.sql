-- TOK: allow users to hide their profile from discovery.
-- Run once in Supabase Dashboard → SQL Editor.
alter table public.profiles
  add column if not exists is_hidden boolean not null default false;

create index if not exists profiles_visible_discovery_idx
  on public.profiles (is_hidden)
  where is_hidden = false;
