-- M&A Platform — Supabase schema
-- Run this in: https://supabase.com/dashboard/project/xqkrafruaikukgkjrswv/sql/new

-- 1. Analysis access table
create table if not exists public.analysis_access (
  id          uuid default gen_random_uuid() primary key,
  user_email  text not null,
  analysis_id text not null,
  analysis_name text,
  granted_at  timestamptz default now(),
  constraint analysis_access_unique unique (user_email, analysis_id)
);

-- 2. Admins table
create table if not exists public.admins (
  email      text primary key,
  added_at   timestamptz default now()
);

-- 3. Enable Row Level Security
alter table public.analysis_access enable row level security;
alter table public.admins          enable row level security;

-- 4. Policies — analysis_access
create policy "users_see_own_access"
  on public.analysis_access for select to authenticated
  using (user_email = auth.email());

create policy "admins_full_access"
  on public.analysis_access for all to authenticated
  using    (exists (select 1 from public.admins where email = auth.email()))
  with check (exists (select 1 from public.admins where email = auth.email()));

-- 5. Policies — admins
create policy "read_admins"
  on public.admins for select to authenticated
  using (true);

create policy "admins_manage_admins"
  on public.admins for all to authenticated
  using    (exists (select 1 from public.admins where email = auth.email()))
  with check (exists (select 1 from public.admins where email = auth.email()));

-- 6. Seed first admin
insert into public.admins (email)
values ('jose.soares@omnibees.com')
on conflict do nothing;
