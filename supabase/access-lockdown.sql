-- Apply only after configuring SUPABASE_SERVICE_ROLE_KEY, AVVI_SESSION_SECRET,
-- and NEXT_PUBLIC_AVVI_PROTECTED_DATABASE=true in the Next.js deployment.
-- The server enforces the two explicit accounts and their allowed sections.
-- This changes access policies only; it does not delete or recreate any records.
begin;
drop policy if exists "avvi_records_public_select" on public.avvi_records;
drop policy if exists "avvi_records_public_insert" on public.avvi_records;
drop policy if exists "avvi_records_public_update" on public.avvi_records;
drop policy if exists "avvi_records_public_delete" on public.avvi_records;
drop policy if exists "avvi_records_block_direct_browser" on public.avvi_records;
create policy "avvi_records_block_direct_browser" on public.avvi_records as restrictive
for all to anon, authenticated using (false) with check (false);
commit;
-- service_role bypasses RLS. It must never be exposed through NEXT_PUBLIC_*.
