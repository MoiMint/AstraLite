-- AstraLite Supabase tables and RLS policies
-- Run this in Supabase SQL Editor after enabling Authentication.

create table if not exists public.tasks (
  id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  due text not null default 'unscheduled',
  done boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  due text not null default '',
  bookmark_color text not null default '#ffca4f',
  bookmark_emoji text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_events (
  id bigint primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date text not null,
  time text not null default '',
  title text not null default '',
  location text not null default '',
  tone text not null default 'ink' check (tone in ('tomato', 'star', 'ink')),
  updated_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.notes enable row level security;
alter table public.calendar_events enable row level security;

create policy "Users can manage their tasks"
on public.tasks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage their notes"
on public.notes
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can manage their calendar events"
on public.calendar_events
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists calendar_events_user_id_idx on public.calendar_events(user_id);
