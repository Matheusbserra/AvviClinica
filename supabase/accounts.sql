-- Run once in the existing Supabase project's SQL Editor before managing cloud users.
-- No clinical records, appointments or financial data are changed.
create table if not exists public.avvi_user_accounts (
  id text primary key,
  login text not null unique,
  name text not null,
  role text not null check (role in ('admin', 'standard')),
  tabs jsonb not null default '[]'::jsonb,
  salt text not null,
  password_hash text not null,
  password_ciphertext text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  constraint avvi_user_login_normalized check (login = lower(login) and login <> 'admin')
);
alter table public.avvi_user_accounts add column if not exists professional_report jsonb;
alter table public.avvi_user_accounts enable row level security;
revoke all on public.avvi_user_accounts from anon, authenticated;
grant all on public.avvi_user_accounts to service_role;
-- Only the server may read this table, using SUPABASE_SERVICE_ROLE_KEY.
-- Keep AVVI_SESSION_SECRET stable: it also protects the stored passwords.
