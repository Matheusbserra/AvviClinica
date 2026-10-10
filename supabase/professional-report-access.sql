-- Run once before publishing the limited professional report feature.
-- Only adds account permission metadata; existing users and clinical data are preserved.
alter table public.avvi_user_accounts
  add column if not exists professional_report jsonb;
notify pgrst, 'reload schema';
