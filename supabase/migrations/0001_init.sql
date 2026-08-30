-- ════════════════════════════════════════════════════════════════
-- עזר תורה – תושיה תפרח · Supabase schema (secured with Supabase Auth)
-- Migration 0001 — app_state table + RLS + updated_at trigger + seed
-- ════════════════════════════════════════════════════════════════
-- Security model: the whole app database lives in one JSONB blob in
-- app_state (id='main'), plus per-user presence rows (id='presence_*').
-- RLS DENIES the anonymous role entirely and allows only AUTHENTICATED
-- users (i.e. staff who signed in through Supabase Auth). The public
-- anon key can therefore no longer read or write donor data.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.app_state (
  id          text primary key,
  data        jsonb        not null default '{}'::jsonb,
  updated_at  timestamptz  not null default now()
);

comment on table public.app_state is
  'Single-blob application store. id=main holds the whole app DB; id=presence_* holds live presence.';

-- ── keep updated_at fresh on every update ──
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_state_updated on public.app_state;
create trigger trg_app_state_updated
  before update on public.app_state
  for each row
  execute function public.set_updated_at();

-- ── Row Level Security ──
alter table public.app_state enable row level security;

-- authenticated staff: full access. anon: nothing (no policy = denied).
drop policy if exists "app_state authenticated select" on public.app_state;
create policy "app_state authenticated select"
  on public.app_state for select
  to authenticated
  using (true);

drop policy if exists "app_state authenticated insert" on public.app_state;
create policy "app_state authenticated insert"
  on public.app_state for insert
  to authenticated
  with check (true);

drop policy if exists "app_state authenticated update" on public.app_state;
create policy "app_state authenticated update"
  on public.app_state for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "app_state authenticated delete" on public.app_state;
create policy "app_state authenticated delete"
  on public.app_state for delete
  to authenticated
  using (true);

-- ── seed the main row (empty; the app backfills defaults and, on the
--    first Supabase-authenticated login, provisions that user as
--    superadmin) ──
insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;
