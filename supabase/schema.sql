create type user_role as enum ('admin', 'recepcao', 'profissional');
create type appointment_status as enum ('Agendado', 'Confirmado', 'Compareceu', 'Faltou', 'Cancelado', 'Reagendado', 'Finalizado');
create type payment_method as enum ('Pix', 'Débito', 'Crédito', 'Dinheiro');
create type discount_split as enum ('Empresa assume', 'Profissional assume', 'Empresa e profissional dividem');
create type fixed_cost_status as enum ('Pago', 'Pendente', 'Atrasado');

create table professionals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text not null,
  active boolean not null default true,
  color text not null default '#2563eb',
  commission_percent numeric(5,2) not null default 50,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  role user_role not null default 'recepcao',
  professional_id uuid references professionals(id),
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  cpf text,
  birth_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table procedures (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric(12,2) not null default 0,
  average_cost numeric(12,2) not null default 0,
  professional_percent numeric(5,2) not null default 50,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references patients(id),
  professional_id uuid not null references professionals(id),
  procedure_id uuid references procedures(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status appointment_status not null default 'Agendado',
  event_type text not null default 'Novo Agendamento',
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table appointment_actions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id) on delete cascade,
  action_type text not null,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table financial_entries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references appointments(id),
  patient_id uuid not null references patients(id),
  professional_id uuid not null references professionals(id),
  procedure_id uuid references procedures(id),
  manual_procedure text,
  quantity integer not null default 1,
  service_price numeric(12,2) not null default 0,
  product_cost numeric(12,2) not null default 0,
  machine_fee numeric(12,2) not null default 0,
  commercial_discount numeric(12,2) not null default 0,
  discount_split discount_split not null default 'Empresa e profissional dividem',
  professional_percent numeric(5,2) not null default 50,
  entry_date date not null,
  notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table payment_items (
  id uuid primary key default gen_random_uuid(),
  financial_entry_id uuid not null references financial_entries(id) on delete cascade,
  method payment_method not null,
  amount numeric(12,2) not null default 0,
  fee numeric(12,2) not null default 0,
  installments integer default 1
);

create table fixed_costs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  value numeric(12,2) not null default 0,
  due_date date not null,
  status fixed_cost_status not null default 'Pendente',
  payment_method payment_method,
  replicate_months integer not null default 0,
  credit_installments integer not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

create table receipts (
  id uuid primary key default gen_random_uuid(),
  patient_name text not null,
  cpf text,
  procedure text not null,
  amount numeric(12,2) not null default 0,
  payment_method payment_method not null,
  receipt_date date not null,
  professional_id uuid references professionals(id),
  notes text,
  pdf_path text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table monthly_goals (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references professionals(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null,
  goal_value numeric(12,2) not null default 0,
  unique (professional_id, month, year)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table users enable row level security;
alter table professionals enable row level security;
alter table patients enable row level security;
alter table procedures enable row level security;
alter table appointments enable row level security;
alter table appointment_actions enable row level security;
alter table financial_entries enable row level security;
alter table payment_items enable row level security;
alter table fixed_costs enable row level security;
alter table receipts enable row level security;
alter table monthly_goals enable row level security;
alter table audit_logs enable row level security;
