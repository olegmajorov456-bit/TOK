-- Несколько фотографий в анкете.
-- Выполни один раз в Supabase: SQL Editor -> New query -> вставить -> Run.
-- avatar_url остаётся главным фото (первое в списке), поэтому всё остальное в приложении продолжает работать.

alter table public.profiles
  add column if not exists photos text[] not null default '{}';

-- Переносим уже загруженные фотографии в новый список.
update public.profiles
set photos = array[avatar_url]
where avatar_url is not null
  and coalesce(array_length(photos, 1), 0) = 0;

-- Не больше 6 фотографий на анкету.
alter table public.profiles drop constraint if exists profiles_photos_max;
alter table public.profiles
  add constraint profiles_photos_max check (coalesce(array_length(photos, 1), 0) <= 6);