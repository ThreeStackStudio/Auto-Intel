alter table public.cars
  add column if not exists vin text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$');
