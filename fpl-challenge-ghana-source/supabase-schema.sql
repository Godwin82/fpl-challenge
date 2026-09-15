-- FPL Challenge Ghana — Supabase schema
-- Run this once in Supabase: Project > SQL Editor > New query > Run

create table if not exists codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  gw_id int not null,
  status text not null default 'UNUSED',           -- 'UNUSED' | 'USED'
  used_by_name text,
  used_by_team_id text,
  used_by_phone text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists registrations (
  id uuid primary key default gen_random_uuid(),
  gw_id int not null,
  name text not null,
  team_id text not null,
  phone text not null,
  points int not null default 0,
  code text,
  created_at timestamptz not null default now()
);

-- Row Level Security: on by default in Supabase. This app has no user
-- accounts, so both the public registration form and the admin panel
-- talk to these tables with the same anon key. These policies open the
-- tables up to anyone with the anon key (same trust level as this
-- being a client-side app already) — good enough for this prototype,
-- but revisit before handling real volumes of money/traffic.
alter table codes enable row level security;
alter table registrations enable row level security;

create policy "public read codes" on codes for select using (true);
create policy "public insert codes" on codes for insert with check (true);
create policy "public update codes" on codes for update using (true);

create policy "public read registrations" on registrations for select using (true);
create policy "public insert registrations" on registrations for insert with check (true);
create policy "public update registrations" on registrations for update using (true);
