-- ConnectHub database schema for Supabase
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  author_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  reaction text not null,
  created_at timestamptz default now(),
  unique(post_id,user_id)
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid references public.profiles(id) on delete cascade not null,
  following_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(follower_id,following_id),
  check(follower_id <> following_id)
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid references public.profiles(id) on delete cascade not null,
  blocked_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  body text not null,
  is_read boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists public.room_channels (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms(id) on delete cascade not null,
  name text not null,
  type text default 'text',
  created_at timestamptz default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.room_channels(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null
);

-- Automatically create profile + default room channels after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  new_room uuid;
begin
  insert into public.profiles(id,username,display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username','user_'||substr(new.id::text,1,8)),
    coalesce(new.raw_user_meta_data->>'display_name','Người dùng')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Create default channels whenever a room is created.
create or replace function public.create_default_channels()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.room_channels(room_id,name,type) values
    (new.id,'general','text'),
    (new.id,'announcements','text');
  return new;
end;
$$;

drop trigger if exists room_default_channels on public.rooms;
create trigger room_default_channels
after insert on public.rooms
for each row execute procedure public.create_default_channels();

-- RLS
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_reactions enable row level security;
alter table public.follows enable row level security;
alter table public.friend_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;
alter table public.rooms enable row level security;
alter table public.room_channels enable row level security;
alter table public.messages enable row level security;
alter table public.system_settings enable row level security;

create policy "profiles public read" on public.profiles for select using (true);
create policy "profiles own update" on public.profiles for update using (auth.uid()=id);
create policy "profiles own insert" on public.profiles for insert with check (auth.uid()=id);

create policy "posts public read" on public.posts for select using (true);
create policy "posts auth insert" on public.posts for insert with check (auth.uid()=author_id);
create policy "posts own delete" on public.posts for delete using (auth.uid()=author_id);
create policy "comments public read" on public.comments for select using (true);
create policy "comments auth insert" on public.comments for insert with check (auth.uid()=author_id);
create policy "reactions read" on public.post_reactions for select using (true);
create policy "reactions own write" on public.post_reactions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

create policy "follows read" on public.follows for select using (true);
create policy "follows own write" on public.follows for all using (auth.uid()=follower_id) with check (auth.uid()=follower_id);
create policy "friend requests own" on public.friend_requests for all using (auth.uid()=sender_id or auth.uid()=receiver_id) with check (auth.uid()=sender_id);
create policy "blocks own" on public.blocks for all using (auth.uid()=blocker_id) with check (auth.uid()=blocker_id);

create policy "notifications own" on public.notifications for select using (auth.uid()=user_id);
create policy "notifications own update" on public.notifications for update using (auth.uid()=user_id);

create policy "rooms public read" on public.rooms for select using (true);
create policy "rooms auth create" on public.rooms for insert with check (auth.uid()=owner_id);
create policy "rooms owner update" on public.rooms for update using (auth.uid()=owner_id);
create policy "rooms owner delete" on public.rooms for delete using (auth.uid()=owner_id);

create policy "channels public read" on public.room_channels for select using (true);
create policy "channels owner create" on public.room_channels for insert
with check (exists(select 1 from public.rooms r where r.id=room_id and r.owner_id=auth.uid()));
create policy "channels owner delete" on public.room_channels for delete
using (exists(select 1 from public.rooms r where r.id=room_id and r.owner_id=auth.uid()));

create policy "messages read" on public.messages for select using (true);
create policy "messages auth insert" on public.messages for insert with check (auth.uid()=sender_id);

-- Admin policies: change/delete moderation should be done server-side in production.
-- This example permits an admin profile to delete posts via a policy using profiles.is_admin.
create policy "admin delete posts" on public.posts for delete using (
  auth.uid()=author_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);

-- Admin can insert server notifications.
create policy "admin insert notifications" on public.notifications for insert with check (
  auth.uid()=user_id or exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_admin=true)
);

-- Realtime
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.messages;