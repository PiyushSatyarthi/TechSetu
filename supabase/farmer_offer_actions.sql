create table if not exists public.farmer_offer_actions (
  id bigserial primary key,
  farmer_user_id uuid not null references auth.users(id) on delete cascade,
  offer_id text not null,
  action text not null check (action in ('accept', 'decline', 'counter')),
  counter_rate numeric,
  counter_qty numeric,
  note text,
  offer_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_farmer_offer_actions_user_offer_created
  on public.farmer_offer_actions (farmer_user_id, offer_id, created_at desc);

alter table public.farmer_offer_actions enable row level security;

drop policy if exists "farmers can read own offer actions" on public.farmer_offer_actions;
create policy "farmers can read own offer actions"
  on public.farmer_offer_actions
  for select
  to authenticated
  using (auth.uid() = farmer_user_id);

drop policy if exists "farmers can insert own offer actions" on public.farmer_offer_actions;
create policy "farmers can insert own offer actions"
  on public.farmer_offer_actions
  for insert
  to authenticated
  with check (auth.uid() = farmer_user_id);
