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

-- Client-facing views never reveal confession authors, commenters, or random chat participants.
create or replace view public.confessions_feed as
  select id, body, category, created_at, (author_id = auth.uid()) as is_mine
  from public.confessions;

create or replace view public.confession_reaction_summary as
  select confession_id,
    count(*) filter (where reaction = 'heart')::integer as heart_count,
    count(*) filter (where reaction = 'laugh')::integer as laugh_count,
    count(*) filter (where reaction = 'wow')::integer as wow_count,
    max(reaction) filter (where user_id = auth.uid()) as my_reaction
  from public.confession_reactions
  group by confession_id;

create or replace view public.confession_comments_feed as
  select id, confession_id, body, created_at, (author_id = auth.uid()) as is_mine
  from public.confession_comments;

create or replace view public.random_chat_messages_feed as
  select m.id, m.room_id, (m.sender_id = auth.uid()) as is_mine, m.body, m.created_at
  from public.random_chat_messages m
  where exists (
    select 1 from public.random_chat_rooms r
    where r.id = m.room_id and (r.user1_id = auth.uid() or r.user2_id = auth.uid())
  );


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

-- Restrict base-table access: anonymous authors/participants are exposed only via safe views.
revoke all on public.confessions, public.confession_reactions, public.confession_comments,
  public.confession_reports, public.random_chat_rooms, public.random_chat_queue,
  public.random_chat_messages from public, anon, authenticated;

revoke all on public.confessions_feed, public.confession_reaction_summary,
  public.confession_comments_feed, public.random_chat_messages_feed from public, anon;

grant select on public.confessions_feed to authenticated;
grant select on public.confession_reaction_summary to authenticated;
grant select on public.confession_comments_feed to authenticated;
grant select on public.random_chat_messages_feed to authenticated;
grant insert (author_id, body, category) on public.confessions to authenticated;
grant insert (confession_id, author_id, body) on public.confession_comments to authenticated;
grant insert (confession_id, reporter_id, reason) on public.confession_reports to authenticated;
grant select, insert on public.user_daily_activity to authenticated;
grant select (id, status, created_at) on public.random_chat_rooms to authenticated;
grant insert (room_id, sender_id, body) on public.random_chat_messages to authenticated;

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

create or replace function public.leave_random_chat(target_room_id uuid default null)
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
  where status = 'active'
    and (user1_id = v_user or user2_id = v_user)
    and (target_room_id is null or id = target_room_id);
  v_changed := found;

  delete from public.random_chat_queue where user_id = v_user;
  return v_changed;
end;
$$;


create or replace function public.set_confession_reaction(target_confession_id uuid, target_reaction text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if target_reaction is null then
    delete from public.confession_reactions where confession_id = target_confession_id and user_id = v_user;
    return false;
  end if;
  if target_reaction not in ('heart', 'laugh', 'wow') then raise exception 'Invalid reaction'; end if;
  insert into public.confession_reactions (confession_id, user_id, reaction)
  values (target_confession_id, v_user, target_reaction)
  on conflict (confession_id, user_id) do update
    set reaction = excluded.reaction, created_at = now();
  return true;
end;
$$;

create or replace function public.delete_own_confession(target_confession_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  delete from public.confessions where id = target_confession_id and author_id = v_user;
  return found;
end;
$$;

create or replace function public.get_random_chat_room_status(target_room_id uuid)
returns text language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid := auth.uid(); v_status text;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select r.status into v_status from public.random_chat_rooms r
  where r.id = target_room_id and (r.user1_id = v_user or r.user2_id = v_user);
  return v_status;
end;
$$;

revoke all on function public.find_random_chat_partner() from public, anon;
grant execute on function public.find_random_chat_partner() to authenticated;
revoke all on function public.leave_random_chat(uuid) from public, anon;
grant execute on function public.leave_random_chat(uuid) to authenticated;
revoke all on function public.set_confession_reaction(uuid, text) from public, anon;
grant execute on function public.set_confession_reaction(uuid, text) to authenticated;
revoke all on function public.delete_own_confession(uuid) from public, anon;
grant execute on function public.delete_own_confession(uuid) to authenticated;
revoke all on function public.get_random_chat_room_status(uuid) from public, anon;
grant execute on function public.get_random_chat_room_status(uuid) to authenticated;

-- Random chat uses participant-scoped polling, so raw realtime rows aren't published.


-- If an earlier version of this migration was applied, remove the raw chat tables
-- from Realtime too; the client now polls the participant-scoped safe view.
do $$
begin
  execute 'alter publication supabase_realtime drop table public.random_chat_messages';
exception when undefined_object or object_not_in_prerequisite_state or insufficient_privilege then null;
end;
$$;
do $$
begin
  execute 'alter publication supabase_realtime drop table public.random_chat_rooms';
exception when undefined_object or object_not_in_prerequisite_state or insufficient_privilege then null;
end;
$$;

-- Interest-based group rooms. The client gets a safe feed without author IDs.
create table if not exists public.interest_rooms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null,
  icon text not null default '💬',
  created_at timestamptz not null default now()
);

create table if not exists public.interest_room_members (
  room_id uuid not null references public.interest_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create table if not exists public.interest_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.interest_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

insert into public.interest_rooms (slug, name, description, icon) values
  ('general', 'Общая комната', 'Знакомься, задавай вопросы и общайся со студентами ИГЭУ.', '👋'),
  ('coding', 'IT и программирование', 'Код, пет-проекты, технологии, хакатоны и помощь новичкам.', '💻'),
  ('gaming', 'Игры', 'Находи тиммейтов, обсуждай новинки и любимые игры.', '🎮'),
  ('music', 'Музыка', 'Делись треками, находи единомышленников и ходи на концерты.', '🎧'),
  ('moto', 'Мотоциклы и техника', 'Обсуждай мото, машины, ремонт и технические увлечения.', '🏍️'),
  ('sport', 'Спорт и активность', 'Ищи компанию для тренировок, прогулок и соревнований.', '⚡')
on conflict (slug) do update set name = excluded.name, description = excluded.description, icon = excluded.icon;

create index if not exists interest_room_messages_room_time_idx
  on public.interest_room_messages (room_id, created_at asc);

alter table public.interest_rooms enable row level security;
alter table public.interest_room_members enable row level security;
alter table public.interest_room_messages enable row level security;

drop policy if exists interest_rooms_read_authenticated on public.interest_rooms;
create policy interest_rooms_read_authenticated on public.interest_rooms
  for select to authenticated using (true);

drop policy if exists interest_room_members_read_self on public.interest_room_members;
create policy interest_room_members_read_self on public.interest_room_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists interest_room_members_join_self on public.interest_room_members;
create policy interest_room_members_join_self on public.interest_room_members
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.interest_rooms r where r.id = room_id)
  );

drop policy if exists interest_room_members_leave_self on public.interest_room_members;
create policy interest_room_members_leave_self on public.interest_room_members
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists interest_room_messages_read_member on public.interest_room_messages;
create policy interest_room_messages_read_member on public.interest_room_messages
  for select to authenticated using (
    exists (select 1 from public.interest_room_members m
      where m.room_id = interest_room_messages.room_id and m.user_id = auth.uid())
  );

drop policy if exists interest_room_messages_write_member on public.interest_room_messages;
create policy interest_room_messages_write_member on public.interest_room_messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (select 1 from public.interest_room_members m
      where m.room_id = interest_room_messages.room_id and m.user_id = auth.uid())
  );

create or replace view public.interest_room_messages_feed as
  select msg.id, msg.room_id, (msg.sender_id = auth.uid()) as is_mine, msg.body, msg.created_at
  from public.interest_room_messages msg
  where exists (
    select 1 from public.interest_room_members m
    where m.room_id = msg.room_id and m.user_id = auth.uid()
  );

-- Keep private identifiers out of the browser API and expose only the safe message view.
revoke all on public.interest_rooms, public.interest_room_members, public.interest_room_messages
  from public, anon, authenticated;
revoke all on public.interest_room_messages_feed from public, anon;
grant select (id, slug, name, description, icon, created_at) on public.interest_rooms to authenticated;
grant select (room_id, user_id, joined_at), insert (room_id, user_id), delete
  on public.interest_room_members to authenticated;
grant insert (room_id, sender_id, body) on public.interest_room_messages to authenticated;
grant select on public.interest_room_messages_feed to authenticated;

notify pgrst, 'reload schema';
