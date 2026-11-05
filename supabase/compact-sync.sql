-- AVVI: return only one change fingerprint per category instead of transferring
-- every record's metadata on each refresh. No records or tables are changed.
begin;
create or replace function public.avvi_sync_revisions(requested_entities text[])
returns table (entity text, fingerprint text)
language sql stable security invoker
set search_path = pg_catalog, public
set timezone = 'UTC'
as $$
  select requested.entity,
    encode(sha256(convert_to(coalesce(string_agg(
      jsonb_build_array(records.record_id, records.updated_at)::text,
      ',' order by records.record_id collate "C"
    ) filter (where records.record_id is not null), ''), 'UTF8')), 'hex')
  from (select distinct unnest(requested_entities) as entity) requested
  left join public.avvi_records records on records.entity = requested.entity
  group by requested.entity;
$$;
revoke all on function public.avvi_sync_revisions(text[]) from public, anon, authenticated;
grant execute on function public.avvi_sync_revisions(text[]) to service_role;
commit;
