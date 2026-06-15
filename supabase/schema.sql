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

create table if not exists public.recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recovery_type text not null check (recovery_type in ('sauna', 'cold_plunge')),
  duration_minutes integer not null check (duration_minutes > 0),
  temperature numeric check (
    recovery_type = 'sauna'
    or (temperature is not null and temperature >= 32 and temperature <= 80)
  ),
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
alter table public.recovery_logs enable row level security;
alter table public.daily_checkins enable row level security;

drop policy if exists "Users can read their workout logs" on public.workout_logs;
drop policy if exists "Users can add their workout logs" on public.workout_logs;
drop policy if exists "Users can read their recovery logs" on public.recovery_logs;
drop policy if exists "Users can add their recovery logs" on public.recovery_logs;
drop policy if exists "Users can read their check-ins" on public.daily_checkins;
drop policy if exists "Users can add their check-ins" on public.daily_checkins;

create policy "Users can read their workout logs"
  on public.workout_logs for select
  using (auth.uid() = user_id);

create policy "Users can add their workout logs"
  on public.workout_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their recovery logs"
  on public.recovery_logs for select
  using (auth.uid() = user_id);

create policy "Users can add their recovery logs"
  on public.recovery_logs for insert
  with check (auth.uid() = user_id);

create policy "Users can read their check-ins"
  on public.daily_checkins for select
  using (auth.uid() = user_id);

create policy "Users can add their check-ins"
  on public.daily_checkins for insert
  with check (auth.uid() = user_id);

create index if not exists workout_logs_user_created_idx on public.workout_logs (user_id, created_at desc);
create index if not exists recovery_logs_user_created_idx on public.recovery_logs (user_id, created_at desc);
create index if not exists daily_checkins_user_created_idx on public.daily_checkins (user_id, created_at desc);
