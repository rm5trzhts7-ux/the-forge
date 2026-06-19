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
  temperature_f numeric check (
    recovery_type = 'sauna'
    or (temperature_f is not null and temperature_f >= 32 and temperature_f <= 80)
  ),
  notes text,
  created_at timestamptz not null default now()
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'type'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'recovery_type'
  ) then
    alter table public.recovery_logs rename column type to recovery_type;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'recovery_type'
  ) then
    alter table public.recovery_logs add column recovery_type text;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'type'
  ) then
    update public.recovery_logs
    set recovery_type = coalesce(recovery_type, type)
    where recovery_type is null;

    alter table public.recovery_logs alter column type drop not null;
  end if;

  update public.recovery_logs
  set recovery_type = coalesce(recovery_type, 'sauna')
  where recovery_type is null;

  alter table public.recovery_logs alter column recovery_type set not null;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'temperature'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'temperature_f'
  ) then
    alter table public.recovery_logs rename column temperature to temperature_f;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'temperature_f'
  ) then
    alter table public.recovery_logs add column temperature_f numeric;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'recovery_logs' and column_name = 'temperature'
  ) then
    update public.recovery_logs
    set temperature_f = coalesce(temperature_f, temperature)
    where temperature_f is null;

    alter table public.recovery_logs alter column temperature drop not null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recovery_logs'::regclass
      and conname = 'recovery_logs_recovery_type_check'
  ) then
    alter table public.recovery_logs
      add constraint recovery_logs_recovery_type_check
      check (recovery_type in ('sauna', 'cold_plunge'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.recovery_logs'::regclass
      and conname = 'recovery_logs_temperature_f_check'
  ) then
    alter table public.recovery_logs
      add constraint recovery_logs_temperature_f_check
      check (
        recovery_type = 'sauna'
        or (temperature_f is not null and temperature_f >= 32 and temperature_f <= 80)
      );
  end if;
end $$;

create table if not exists public.rest_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_id uuid not null references public.workout_logs(id) on delete cascade,
  duration_seconds integer not null check (duration_seconds > 0),
  interval_order integer not null check (interval_order > 0),
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

create table if not exists public.macro_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  water_oz numeric not null default 0 check (water_oz >= 0),
  sodium_mg numeric not null default 0 check (sodium_mg >= 0),
  body_weight_lb numeric not null default 0 check (body_weight_lb >= 0),
  notes text,
  logged_date date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, logged_date)
);

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'client' check (role in ('coach', 'client', 'both')),
  created_at timestamptz not null default now()
);

create table if not exists public.coach_client_links (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'revoked')),
  invited_email text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

alter table public.workout_logs enable row level security;
alter table public.rest_periods enable row level security;
alter table public.recovery_logs enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.macro_logs enable row level security;
alter table public.user_profiles enable row level security;
alter table public.coach_client_links enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workout_logs to authenticated;
grant select, insert, update, delete on public.rest_periods to authenticated;
grant select, insert, update, delete on public.recovery_logs to authenticated;
grant select, insert, update, delete on public.daily_checkins to authenticated;
grant select, insert, update, delete on public.macro_logs to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update on public.coach_client_links to authenticated;

drop policy if exists "Users can read their workout logs" on public.workout_logs;
drop policy if exists "Users can add their workout logs" on public.workout_logs;
drop policy if exists "Users can manage their workout logs" on public.workout_logs;
drop policy if exists "Users can access their workout logs" on public.workout_logs;
drop policy if exists "Users can read their rest periods" on public.rest_periods;
drop policy if exists "Users can add their rest periods" on public.rest_periods;
drop policy if exists "Users can manage their rest periods" on public.rest_periods;
drop policy if exists "Users can access their rest periods" on public.rest_periods;
drop policy if exists "Users can add rest periods for their workouts" on public.rest_periods;
drop policy if exists "Users can read their recovery logs" on public.recovery_logs;
drop policy if exists "Users can add their recovery logs" on public.recovery_logs;
drop policy if exists "Users can manage their recovery logs" on public.recovery_logs;
drop policy if exists "Users can access their recovery logs" on public.recovery_logs;
drop policy if exists "Users can read their check-ins" on public.daily_checkins;
drop policy if exists "Users can add their check-ins" on public.daily_checkins;
drop policy if exists "Users can manage their check-ins" on public.daily_checkins;
drop policy if exists "Users can access their daily check-ins" on public.daily_checkins;
drop policy if exists "Users can manage their macro logs" on public.macro_logs;
drop policy if exists "Users can access their macro logs" on public.macro_logs;
drop policy if exists "Coaches can read accepted client workout logs" on public.workout_logs;
drop policy if exists "Coaches can read accepted client rest periods" on public.rest_periods;
drop policy if exists "Coaches can read accepted client recovery logs" on public.recovery_logs;
drop policy if exists "Coaches can read accepted client check-ins" on public.daily_checkins;
drop policy if exists "Coaches can read accepted client macro logs" on public.macro_logs;
drop policy if exists "Users can manage their profile" on public.user_profiles;
drop policy if exists "Users can read linked profiles" on public.user_profiles;
drop policy if exists "Coaches can create client invites" on public.coach_client_links;
drop policy if exists "Users can read relevant coach links" on public.coach_client_links;
drop policy if exists "Coaches can update their own pending links" on public.coach_client_links;
drop policy if exists "Clients can respond to coach invites" on public.coach_client_links;
drop policy if exists "Clients can revoke accepted coach links" on public.coach_client_links;

create policy "Users can manage their workout logs"
  on public.workout_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their rest periods"
  on public.rest_periods for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.workout_logs
      where workout_logs.id = rest_periods.workout_id
        and workout_logs.user_id = auth.uid()
    )
  );

create policy "Users can manage their recovery logs"
  on public.recovery_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their check-ins"
  on public.daily_checkins for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage their macro logs"
  on public.macro_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Coaches can read accepted client workout logs"
  on public.workout_logs for select
  using (
    exists (
      select 1
      from public.coach_client_links
      where coach_client_links.coach_id = auth.uid()
        and coach_client_links.client_id = workout_logs.user_id
        and coach_client_links.status = 'accepted'
    )
  );

create policy "Coaches can read accepted client rest periods"
  on public.rest_periods for select
  using (
    exists (
      select 1
      from public.coach_client_links
      where coach_client_links.coach_id = auth.uid()
        and coach_client_links.client_id = rest_periods.user_id
        and coach_client_links.status = 'accepted'
    )
  );

create policy "Coaches can read accepted client recovery logs"
  on public.recovery_logs for select
  using (
    exists (
      select 1
      from public.coach_client_links
      where coach_client_links.coach_id = auth.uid()
        and coach_client_links.client_id = recovery_logs.user_id
        and coach_client_links.status = 'accepted'
    )
  );

create policy "Coaches can read accepted client check-ins"
  on public.daily_checkins for select
  using (
    exists (
      select 1
      from public.coach_client_links
      where coach_client_links.coach_id = auth.uid()
        and coach_client_links.client_id = daily_checkins.user_id
        and coach_client_links.status = 'accepted'
    )
  );

create policy "Coaches can read accepted client macro logs"
  on public.macro_logs for select
  using (
    exists (
      select 1
      from public.coach_client_links
      where coach_client_links.coach_id = auth.uid()
        and coach_client_links.client_id = macro_logs.user_id
        and coach_client_links.status = 'accepted'
    )
  );

create policy "Users can manage their profile"
  on public.user_profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Users can read linked profiles"
  on public.user_profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.coach_client_links
      where coach_client_links.status in ('pending', 'accepted')
        and (
          (coach_client_links.coach_id = auth.uid() and coach_client_links.client_id = user_profiles.id)
          or (coach_client_links.client_id = auth.uid() and coach_client_links.coach_id = user_profiles.id)
          or (lower(coach_client_links.invited_email) = lower(auth.jwt() ->> 'email') and coach_client_links.coach_id = user_profiles.id)
        )
    )
  );

create policy "Coaches can create client invites"
  on public.coach_client_links for insert
  with check (
    auth.uid() = coach_id
    and status = 'pending'
    and client_id is null
  );

create policy "Users can read relevant coach links"
  on public.coach_client_links for select
  using (
    coach_id = auth.uid()
    or client_id = auth.uid()
    or lower(invited_email) = lower(auth.jwt() ->> 'email')
  );

create policy "Clients can respond to coach invites"
  on public.coach_client_links for update
  using (
    status = 'pending'
    and lower(invited_email) = lower(auth.jwt() ->> 'email')
  )
  with check (
    client_id = auth.uid()
    and status in ('accepted', 'rejected')
  );

create policy "Clients can revoke accepted coach links"
  on public.coach_client_links for update
  using (client_id = auth.uid() and status = 'accepted')
  with check (client_id = auth.uid() and status = 'revoked');

create index if not exists workout_logs_user_created_idx on public.workout_logs (user_id, created_at desc);
create index if not exists rest_periods_user_created_idx on public.rest_periods (user_id, created_at desc);
create index if not exists rest_periods_workout_order_idx on public.rest_periods (workout_id, interval_order);
create index if not exists recovery_logs_user_created_idx on public.recovery_logs (user_id, created_at desc);
create index if not exists daily_checkins_user_created_idx on public.daily_checkins (user_id, created_at desc);
create index if not exists macro_logs_user_logged_date_idx on public.macro_logs (user_id, logged_date desc);
create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));
create index if not exists coach_client_links_coach_idx on public.coach_client_links (coach_id, status, created_at desc);
create index if not exists coach_client_links_client_idx on public.coach_client_links (client_id, status, created_at desc);
create index if not exists coach_client_links_invited_email_idx on public.coach_client_links (lower(invited_email), status);
