-- Supabase schema for Study Traffic Lights
create extension if not exists "pgcrypto";

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null default '',
  status text not null default 'red' check (status in ('red','amber','green')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists subjects_user_created_idx on public.subjects (user_id, created_at);
create index if not exists topics_user_subject_idx on public.topics (user_id, subject_id);

alter table public.subjects enable row level security;
alter table public.topics enable row level security;

drop policy if exists "Users manage their own subjects" on public.subjects;
create policy "Users manage their own subjects" on public.subjects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their own topics" on public.topics;
create policy "Users manage their own topics" on public.topics
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
