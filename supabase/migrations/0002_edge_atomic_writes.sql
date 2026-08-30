-- ════════════════════════════════════════════════════════════════
-- Migration 0002 — atomic append helpers for the Edge Functions
-- ════════════════════════════════════════════════════════════════
-- Problem solved: the self-service and yemot-ivr functions used to read
-- the WHOLE app blob, modify it in JS, and write it back unconditionally.
-- Any staff save that landed between that read and write was silently
-- erased. These helpers append a single record inside the blob in ONE
-- transaction (row-locked), so nothing else can be clobbered.
--
-- They are executable ONLY by the service role (the Edge Functions);
-- browser clients (anon/authenticated) cannot call them.
-- ════════════════════════════════════════════════════════════════

-- Append one pending-edit record to data->'pendingEdits'
create or replace function public.append_pending_edit(p_edit jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_state
  set data = jsonb_set(
    data,
    '{pendingEdits}',
    coalesce(data->'pendingEdits', '[]'::jsonb) || jsonb_build_array(p_edit)
  )
  where id = 'main';
end;
$$;

-- Append one donation to a specific donor's donations array.
-- Returns false when the donor id is not found.
create or replace function public.append_donor_donation(p_donor_id text, p_donation jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_data jsonb;
  v_idx  int;
begin
  -- lock the row so a concurrent client save cannot interleave
  select data into v_data from public.app_state where id = 'main' for update;
  if v_data is null then return false; end if;

  select (ord - 1)::int into v_idx
  from jsonb_array_elements(v_data->'donors') with ordinality t(donor, ord)
  where donor->>'id' = p_donor_id
  limit 1;
  if v_idx is null then return false; end if;

  update public.app_state
  set data = jsonb_set(
    v_data,
    array['donors', v_idx::text, 'donations'],
    coalesce(v_data->'donors'->v_idx->'donations', '[]'::jsonb) || jsonb_build_array(p_donation)
  )
  where id = 'main';
  return true;
end;
$$;

-- Only the service role (Edge Functions) may call these
revoke execute on function public.append_pending_edit(jsonb) from public, anon, authenticated;
revoke execute on function public.append_donor_donation(text, jsonb) from public, anon, authenticated;
grant execute on function public.append_pending_edit(jsonb) to service_role;
grant execute on function public.append_donor_donation(text, jsonb) to service_role;
