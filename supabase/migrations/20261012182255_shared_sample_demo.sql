-- Demo identities and sample records are isolated from production business tables.
create table public.demo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null unique check (role in ('customer','owner','admin')),
  email text not null unique,
  created_at timestamptz not null default now()
);
create table public.demo_workspace (
  id text primary key check (id = 'hyderabad'),
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.demo_accounts enable row level security;
alter table public.demo_workspace enable row level security;
revoke all on public.demo_accounts, public.demo_workspace from anon, authenticated;
grant all on public.demo_accounts, public.demo_workspace to service_role;
comment on table public.demo_workspace is 'Shared illustrative data only. Access through authenticated role-checked demo Edge API. No payments.';
