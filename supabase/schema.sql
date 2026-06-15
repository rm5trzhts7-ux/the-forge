create extension if not exists pgcrypto;

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise text not null,
  sets integer not null check (sets > 0),
  reps integer not null check (reps > 0),
  weight numeric not null default 0 check (weight >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sauna_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.cold_plunge_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  duration_minutes integer not null check (duration_minutes > 0),
  temperature numeric not null check (temperature >= 32 and temperature <= 80),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mood integer not null check (mood between 1 and 10),
  energy integer not null check (energy between 1 and 10),
  soreness integer not null check (soreness between 1 and 10),
  sleep integer not null check (sleep between 1 and 10),
  motivation integer not null check (motivation between 1 and 10),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.workout_logs enable row level security;
alter table public.sauna_logs enable row level security;
alter table public.cold_plunge_logs enable row level security;
alter table public.daily_checkins enable row level security;

create policy "Users can read their workout logs"
  on public.workout_logs for select
  using (auth.uid() = user_id);

create policy "Users can add their workout logs"
  on public.workout_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their sauna logs"
  on public.sauna_logs for select
  using (auth.uid() = user_id);

create policy "Users can add their sauna logs"
  on public.sauna_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their cold plunge logs"
  on public.cold_plunge_logs for select
  using (auth.uid() = user_id);

create policy "Users can add their cold plunge logs"
  on public.cold_plunge_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their check-ins"
  on public.daily_checkins for select
  using (auth.uid() = user_id);

create policy "Users can add their check-ins"
  on public.daily_checkins for insert
  with check (auth.uid() = user_id);

create index if not exists workout_logs_user_created_idx on public.workout_logs (user_id, created_at desc);
create index if not exists sauna_logs_user_created_idx on public.sauna_logs (user_id, created_at desc);
create index if not exists cold_plunge_logs_user_created_idx on public.cold_plunge_logs (user_id, created_at desc);
create index if not exists daily_checkins_user_created_idx on public.daily_checkins (user_id, created_at desc);
