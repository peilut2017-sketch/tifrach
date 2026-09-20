-- ════════════════════════════════════════════════════════════════
-- Migration 0003 — delete hardening
-- ════════════════════════════════════════════════════════════════
-- Migration 0001 let ANY signed-in account delete ANY row of app_state,
-- including id='main' — the whole application database — with a single
-- REST call. Nothing in the app ever deletes that row, so the policy now
-- allows deleting presence rows only (each client removes its own
-- 'presence_<uid>' row on logout).
--
-- Note on roles: the app's roles (superadmin / admin / editor / viewer)
-- are enforced in the client. Every signed-in account can still UPDATE
-- the main row, because even viewers legitimately write to it (chat
-- messages, read receipts, last-login stamps). Keep the Auth user list
-- limited to trusted staff; see README → "מודל ההרשאות".
-- ════════════════════════════════════════════════════════════════

drop policy if exists "app_state authenticated delete" on public.app_state;
create policy "app_state delete presence only"
  on public.app_state for delete
  to authenticated
  using (id like 'presence\_%');
