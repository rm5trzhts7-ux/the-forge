create extension if not exists pgcrypto;

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

alter table public.user_profiles enable row level security;
alter table public.coach_client_links enable row level security;
alter table public.workout_logs enable row level security;
alter table public.rest_periods enable row level security;
alter table public.recovery_logs enable row level security;
alter table public.daily_checkins enable row level security;
alter table public.macro_logs enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.user_profiles to authenticated;
grant select, insert, update on public.coach_client_links to authenticated;
grant select on public.workout_logs to authenticated;
grant select on public.rest_periods to authenticated;
grant select on public.recovery_logs to authenticated;
grant select on public.daily_checkins to authenticated;
grant select on public.macro_logs to authenticated;

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

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));
create index if not exists coach_client_links_coach_idx on public.coach_client_links (coach_id, status, created_at desc);
create index if not exists coach_client_links_client_idx on public.coach_client_links (client_id, status, created_at desc);
create index if not exists coach_client_links_invited_email_idx on public.coach_client_links (lower(invited_email), status);
