-- AVVI Clinica - Supabase schema
-- Execute este arquivo no SQL Editor do Supabase antes de usar o sistema online.

create extension if not exists pgcrypto;

create table if not exists public.avvi_records (
  entity text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (entity, record_id)
);

create index if not exists avvi_records_entity_idx on public.avvi_records (entity);
create index if not exists avvi_records_updated_at_idx on public.avvi_records (updated_at desc);
create index if not exists avvi_records_data_gin_idx on public.avvi_records using gin (data);

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text unique,
  role text not null default 'recepcao' check (role in ('admin', 'recepcao', 'profissional')),
  professional_record_id text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clinical_records (
  id uuid primary key default gen_random_uuid(),
  patient_record_id text not null,
  professional_record_id text,
  appointment_record_id text,
  title text not null default 'Prontuario',
  description text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.observations (
  id uuid primary key default gen_random_uuid(),
  entity text not null,
  record_id text not null,
  note text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  record_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists avvi_records_touch_updated_at on public.avvi_records;
create trigger avvi_records_touch_updated_at
before update on public.avvi_records
for each row execute function public.touch_updated_at();

drop trigger if exists app_users_touch_updated_at on public.app_users;
create trigger app_users_touch_updated_at
before update on public.app_users
for each row execute function public.touch_updated_at();

drop trigger if exists clinical_records_touch_updated_at on public.clinical_records;
create trigger clinical_records_touch_updated_at
before update on public.clinical_records
for each row execute function public.touch_updated_at();

alter table public.avvi_records enable row level security;
alter table public.app_users enable row level security;
alter table public.clinical_records enable row level security;
alter table public.observations enable row level security;
alter table public.audit_logs enable row level security;

-- Politicas liberadas para a chave anon enquanto a clinica valida o app.
-- Para producao com usuarios reais, troque por regras usando auth.uid() e app_users.role.
drop policy if exists "avvi_records_public_select" on public.avvi_records;
create policy "avvi_records_public_select" on public.avvi_records for select using (true);

drop policy if exists "avvi_records_public_insert" on public.avvi_records;
create policy "avvi_records_public_insert" on public.avvi_records for insert with check (true);

drop policy if exists "avvi_records_public_update" on public.avvi_records;
create policy "avvi_records_public_update" on public.avvi_records for update using (true) with check (true);

drop policy if exists "avvi_records_public_delete" on public.avvi_records;
create policy "avvi_records_public_delete" on public.avvi_records for delete using (true);

drop policy if exists "app_users_public_all" on public.app_users;
create policy "app_users_public_all" on public.app_users for all using (true) with check (true);

drop policy if exists "clinical_records_public_all" on public.clinical_records;
create policy "clinical_records_public_all" on public.clinical_records for all using (true) with check (true);

drop policy if exists "observations_public_all" on public.observations;
create policy "observations_public_all" on public.observations for all using (true) with check (true);

drop policy if exists "audit_logs_public_all" on public.audit_logs;
create policy "audit_logs_public_all" on public.audit_logs for all using (true) with check (true);

do $$
begin
  alter publication supabase_realtime add table public.avvi_records;
exception
  when duplicate_object then null;
end;
$$;
