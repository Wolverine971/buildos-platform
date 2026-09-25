-- supabase/migrations/20260925013200_functions_private_by_default.sql
-- Tasker 104 / 76, class fix. Until now every function a migration created in public was
-- executable by PUBLIC, anon and authenticated unless the migration revoked it; that default
-- produced 76 client-callable SECURITY DEFINER functions. From here on, new functions created
-- by postgres (every migration applied with `supabase db query --linked`) are executable only
-- by their owner and service_role. Existing functions keep their current grants.
-- A function that the browser or a signed-in session calls, or that an RLS policy or an
-- invoker trigger evaluates for client writes, needs an explicit
--   GRANT EXECUTE ON FUNCTION ... TO authenticated;   -- (anon only for logged-out paths)
-- `pnpm db:rehearse` reports new functions without a client grant.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated;
COMMIT;
