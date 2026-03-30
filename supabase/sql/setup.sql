create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  make text not null,
  model text not null,
  year integer not null,
  mileage_km integer check (mileage_km is null or mileage_km >= 0),
  estimated_value double precision not null,
  confidence double precision not null check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now()
);

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars (id) on delete cascade,
  image_url text not null,
  angle text,
  created_at timestamptz not null default now()
);

create table if not exists public.analysis (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null unique references public.cars (id) on delete cascade,
  exterior_score double precision not null check (exterior_score >= 0 and exterior_score <= 1),
  interior_score double precision not null check (interior_score >= 0 and interior_score <= 1),
  tire_score double precision not null check (tire_score >= 0 and tire_score <= 1),
  damage_score double precision not null check (damage_score >= 0 and damage_score <= 1),
  summary text not null,
  detected_mods jsonb not null default '[]'::jsonb,
  market_listings jsonb not null default '[]'::jsonb,
  base_market_value double precision,
  condition_adjustment_factor double precision,
  mileage_adjustment_factor double precision,
  mods_adjustment_factor double precision,
  created_at timestamptz not null default now()
);

alter table public.cars
  add column if not exists mileage_km integer check (mileage_km is null or mileage_km >= 0);

alter table public.analysis
  add column if not exists detected_mods jsonb not null default '[]'::jsonb;

alter table public.analysis
  add column if not exists market_listings jsonb not null default '[]'::jsonb;

alter table public.analysis
  add column if not exists base_market_value double precision;

alter table public.analysis
  add column if not exists condition_adjustment_factor double precision;

alter table public.analysis
  add column if not exists mileage_adjustment_factor double precision;

alter table public.analysis
  add column if not exists mods_adjustment_factor double precision;

create index if not exists idx_cars_user_id on public.cars (user_id);
create index if not exists idx_images_car_id on public.images (car_id);
create index if not exists idx_analysis_car_id on public.analysis (car_id);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, first_name, last_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        phone = excluded.phone;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_profile();

alter table public.profiles enable row level security;
alter table public.cars enable row level security;
alter table public.images enable row level security;
alter table public.analysis enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_delete_own" on public.profiles;

create policy "profiles_select_own"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles_delete_own"
  on public.profiles
  for delete
  using (auth.uid() = id);

drop policy if exists "cars_select_own" on public.cars;
drop policy if exists "cars_insert_own" on public.cars;
drop policy if exists "cars_update_own" on public.cars;
drop policy if exists "cars_delete_own" on public.cars;

create policy "cars_select_own"
  on public.cars
  for select
  using (auth.uid() = user_id);

create policy "cars_insert_own"
  on public.cars
  for insert
  with check (auth.uid() = user_id);

create policy "cars_update_own"
  on public.cars
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cars_delete_own"
  on public.cars
  for delete
  using (auth.uid() = user_id);

drop policy if exists "images_select_own" on public.images;
drop policy if exists "images_insert_own" on public.images;
drop policy if exists "images_update_own" on public.images;
drop policy if exists "images_delete_own" on public.images;

create policy "images_select_own"
  on public.images
  for select
  using (
    exists (
      select 1
      from public.cars c
      where c.id = images.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "images_insert_own"
  on public.images
  for insert
  with check (
    exists (
      select 1
      from public.cars c
      where c.id = images.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "images_update_own"
  on public.images
  for update
  using (
    exists (
      select 1
      from public.cars c
      where c.id = images.car_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.cars c
      where c.id = images.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "images_delete_own"
  on public.images
  for delete
  using (
    exists (
      select 1
      from public.cars c
      where c.id = images.car_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "analysis_select_own" on public.analysis;
drop policy if exists "analysis_insert_own" on public.analysis;
drop policy if exists "analysis_update_own" on public.analysis;
drop policy if exists "analysis_delete_own" on public.analysis;

create policy "analysis_select_own"
  on public.analysis
  for select
  using (
    exists (
      select 1
      from public.cars c
      where c.id = analysis.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "analysis_insert_own"
  on public.analysis
  for insert
  with check (
    exists (
      select 1
      from public.cars c
      where c.id = analysis.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "analysis_update_own"
  on public.analysis
  for update
  using (
    exists (
      select 1
      from public.cars c
      where c.id = analysis.car_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.cars c
      where c.id = analysis.car_id
        and c.user_id = auth.uid()
    )
  );

create policy "analysis_delete_own"
  on public.analysis
  for delete
  using (
    exists (
      select 1
      from public.cars c
      where c.id = analysis.car_id
        and c.user_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('car-images', 'car-images', true)
on conflict (id) do nothing;

drop policy if exists "car_images_public_read" on storage.objects;
drop policy if exists "car_images_insert_own_folder" on storage.objects;
drop policy if exists "car_images_update_own_folder" on storage.objects;
drop policy if exists "car_images_delete_own_folder" on storage.objects;

create policy "car_images_public_read"
  on storage.objects
  for select
  using (bucket_id = 'car-images');

create policy "car_images_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'car-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "car_images_update_own_folder"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'car-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'car-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "car_images_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'car-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
