-- Adiciona permissões sem apagar ou substituir contas existentes.
alter table public.avvi_user_accounts
  add column if not exists professional_registration jsonb;
notify pgrst, 'reload schema';
