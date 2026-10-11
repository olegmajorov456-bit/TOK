-- ТОК: социальные функции (признания, достижения, случайный чат).
-- Один раз выполни этот файл целиком в Supabase Dashboard -> SQL Editor.
-- Новые таблицы закрыты RLS; случайный подбор собеседника выполняется серверной функцией.

create extension if not exists pgcrypto;

create table if not exists public.confessions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 700),
  category text not null default 'История',
  created_at timestamptz not null default now()
);

create table if not exists public.confession_reactions (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'laugh', 'wow')),
  created_at timestamptz not null default now(),
  unique (confession_id, user_id)
);

create table if not exists public.confession_comments (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.confession_reports (
  id uuid primary key default gen_random_uuid(),
  confession_id uuid not null references public.confessions(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'Другое',
  created_at timestamptz not null default now(),
  unique (confession_id, reporter_id)
);

create table if not exists public.user_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default current_date,
  created_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);

create table if not exists public.random_chat_rooms (
  id uuid primary key default gen_random_uuid(),
  user1_id uuid not null references auth.users(id) on delete cascade,
  user2_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  check (user1_id <> user2_id)
);

create table if not exists public.random_chat_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now()
);

create table if not exists public.random_chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.random_chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists confessions_created_at_idx on public.confessions (created_at desc);
create index if not exists confession_comments_post_time_idx on public.confession_comments (confession_id, created_at asc);
create index if not exists confession_reactions_post_idx on public.confession_reactions (confession_id);
create index if not exists random_chat_queue_joined_idx on public.random_chat_queue (joined_at);
create index if not exists random_chat_messages_room_time_idx on public.random_chat_messages (room_id, created_at asc);
create index if not exists random_chat_rooms_user1_status_idx on public.random_chat_rooms (user1_id, status);
create index if not exists random_chat_rooms_user2_status_idx on public.random_chat_rooms (user2_id, status);

alter table public.confessions enable row level security;
alter table public.confession_reactions enable row level security;
alter table public.confession_comments enable row level security;
alter table public.confession_reports enable row level security;
alter table public.user_daily_activity enable row level security;
alter table public.random_chat_rooms enable row level security;
alter table public.random_chat_queue enable row level security;
alter table public.random_chat_messages enable row level security;

drop policy if exists confessions_read_authenticated on public.confessions;
create policy confessions_read_authenticated on public.confessions for select to authenticated using (true);
drop policy if exists confessions_insert_self on public.confessions;
create policy confessions_insert_self on public.confessions for insert to authenticated with check (author_id = auth.uid());
drop policy if exists confessions_delete_self on public.confessions;
create policy confessions_delete_self on public.confessions for delete to authenticated using (author_id = auth.uid());

drop policy if exists confession_reactions_read_authenticated on public.confession_reactions;
create policy confession_reactions_read_authenticated on public.confession_reactions for select to authenticated using (true);
drop policy if exists confession_reactions_insert_self on public.confession_reactions;
create policy confession_reactions_insert_self on public.confession_reactions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists confession_reactions_update_self on public.confession_reactions;
create policy confession_reactions_update_self on public.confession_reactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists confession_reactions_delete_self on public.confession_reactions;
create policy confession_reactions_delete_self on public.confession_reactions for delete to authenticated using (user_id = auth.uid());

drop policy if exists confession_comments_read_authenticated on public.confession_comments;
create policy confession_comments_read_authenticated on public.confession_comments for select to authenticated using (true);
drop policy if exists confession_comments_insert_self on public.confession_comments;
create policy confession_comments_insert_self on public.confession_comments for insert to authenticated with check (author_id = auth.uid());
drop policy if exists confession_comments_delete_self on public.confession_comments;
create policy confession_comments_delete_self on public.confession_comments for delete to authenticated using (author_id = auth.uid());

drop policy if exists confession_reports_insert_self on public.confession_reports;
create policy confession_reports_insert_self on public.confession_reports for insert to authenticated with check (reporter_id = auth.uid());
drop policy if exists confession_reports_read_self on public.confession_reports;
create policy confession_reports_read_self on public.confession_reports for select to authenticated using (reporter_id = auth.uid());

drop policy if exists daily_activity_read_self on public.user_daily_activity;
create policy daily_activity_read_self on public.user_daily_activity for select to authenticated using (user_id = auth.uid());
drop policy if exists daily_activity_insert_self on public.user_daily_activity;
create policy daily_activity_insert_self on public.user_daily_activity for insert to authenticated with check (user_id = auth.uid());

drop policy if exists random_chat_queue_insert_self on public.random_chat_queue;
create policy random_chat_queue_insert_self on public.random_chat_queue for insert to authenticated with check (user_id = auth.uid());
drop policy if exists random_chat_queue_delete_self on public.random_chat_queue;
create policy random_chat_queue_delete_self on public.random_chat_queue for delete to authenticated using (user_id = auth.uid());

drop policy if exists random_chat_rooms_read_participant on public.random_chat_rooms;
create policy random_chat_rooms_read_participant on public.random_chat_rooms for select to authenticated
  using (user1_id = auth.uid() or user2_id = auth.uid());

drop policy if exists random_chat_messages_read_participant on public.random_chat_messages;
create policy random_chat_messages_read_participant on public.random_chat_messages for select to authenticated
  using (exists (
    select 1 from public.random_chat_rooms r
    where r.id = room_id and (r.user1_id = auth.uid() or r.user2_id = auth.uid())
  ));
drop policy if exists random_chat_messages_insert_participant on public.random_chat_messages;
create policy random_chat_messages_insert_participant on public.random_chat_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.random_chat_rooms r
      where r.id = room_id and r.status = 'active'
        and (r.user1_id = auth.uid() or r.user2_id = auth.uid())
    )
  );

grant select, insert, delete on public.confessions to authenticated;
grant select, insert, update, delete on public.confession_reactions to authenticated;
grant select, insert, delete on public.confession_comments to authenticated;
grant select, insert on public.confession_reports to authenticated;
grant select, insert on public.user_daily_activity to authenticated;
grant select on public.random_chat_rooms to authenticated;
grant insert, select on public.random_chat_messages to authenticated;
grant insert, delete on public.random_chat_queue to authenticated;

create or replace function public.find_random_chat_partner()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_partner uuid;
  v_room uuid;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select r.id into v_existing
  from public.random_chat_rooms r
  where r.status = 'active' and (r.user1_id = v_user or r.user2_id = v_user)
  order by r.created_at desc
  limit 1;

  if v_existing is not null then
    return v_existing;
  end if;

  delete from public.random_chat_queue q
  where q.joined_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.random_chat_rooms r
      where r.status = 'active' and (r.user1_id = q.user_id or r.user2_id = q.user_id)
    );

  insert into public.random_chat_queue (user_id, joined_at)
  values (v_user, now())
  on conflict (user_id) do nothing;

  select q.user_id into v_partner
  from public.random_chat_queue q
  where q.user_id <> v_user
    and not exists (
      select 1 from public.random_chat_rooms r
      where r.status = 'active' and (r.user1_id = q.user_id or r.user2_id = q.user_id)
    )
  order by q.joined_at asc
  for update skip locked
  limit 1;

  if v_partner is null then
    return null;
  end if;

  v_room := gen_random_uuid();
  insert into public.random_chat_rooms (id, user1_id, user2_id, status)
  values (v_room, v_user, v_partner, 'active');

  delete from public.random_chat_queue where user_id in (v_user, v_partner);
  return v_room;
end;
$$;

create or replace function public.leave_random_chat(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_changed boolean := false;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  update public.random_chat_rooms
  set status = 'ended', ended_at = now()
  where id = target_room_id and status = 'active'
    and (user1_id = v_user or user2_id = v_user);
  v_changed := found;

  delete from public.random_chat_queue where user_id = v_user;
  return v_changed;
end;
$$;

revoke all on function public.find_random_chat_partner() from public, anon;
grant execute on function public.find_random_chat_partner() to authenticated;
revoke all on function public.leave_random_chat(uuid) from public, anon;
grant execute on function public.leave_random_chat(uuid) to authenticated;

do $$
begin
  execute 'alter publication supabase_realtime add table public.random_chat_messages';
exception
  when duplicate_object then null;
  when undefined_object then null;
  when insufficient_privilege then null;
end;
$$;
do $$
begin
  execute 'alter publication supabase_realtime add table public.random_chat_rooms';
exception
  when duplicate_object then null;
  when undefined_object then null;
  when insufficient_privilege then null;
end;
$$;
