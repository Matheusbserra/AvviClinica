-- Execute only when connecting real WhatsApp automation. No existing clinic data is modified.
create table if not exists public.avvi_followup_runtime (
  entity text not null,
  record_id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (entity, record_id)
);
alter table public.avvi_followup_runtime enable row level security;
-- No public policies: only the server service role can access runtime rules, consent, leads, manual stages and jobs.
revoke all on public.avvi_followup_runtime from anon, authenticated;
grant all on public.avvi_followup_runtime to service_role;
create index if not exists avvi_followup_job_status_idx on public.avvi_followup_runtime ((data->>'status')) where entity = 'jobs';

-- Only one active visual conversation per patient, even with concurrent scheduler/webhook calls.
create unique index if not exists avvi_followup_active_conversation_idx
on public.avvi_followup_runtime ((data->>'patientId'))
where entity = 'flow_runs' and data->>'status' in ('active', 'waiting', 'running');
