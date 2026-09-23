// apps/worker/src/workers/agentic-chat/shared/postgres-failure.ts
// One answer to "is this database failure worth retrying?" for every chat
// worker path that retries, defers, or requeues on a Supabase error.
//
// Transient means the same request can succeed later without any change:
// the connection dropped, the transaction lost a race, the server was busy or
// restarting. Everything else (RAISE EXCEPTION guards, privilege errors,
// constraint and data errors, PostgREST request or schema errors) is
// deterministic and fails fast. Callers keep their own attempt bounds.
//
// This does not answer "could the write have committed?"; recovery paths that
// need that (see workflow/preparation-store.ts) keep their own rule.

const TRANSIENT_SQLSTATES = new Set([
	'40001', // serialization_failure
	'40P01', // deadlock_detected
	'55P03', // lock_not_available
	'57014', // query_canceled (statement timeout)
	'57P01', // admin_shutdown
	'57P02', // crash_shutdown
	'57P03' // cannot_connect_now
]);

// PostgREST could not reach or talk to Postgres (connection refused, pool
// timeout, schema cache reload). Other PGRST codes describe the request.
const TRANSIENT_POSTGREST_CODES = new Set(['PGRST000', 'PGRST001', 'PGRST002', 'PGRST003']);

/**
 * True when a Supabase/Postgres error code describes a failure that retrying
 * the identical request can fix. An empty code means the request never got a
 * database answer (network or fetch failure), which is transient.
 */
export function isTransientDatabaseFailureCode(code: string | null | undefined): boolean {
	const normalized = (code ?? '').trim().toUpperCase();
	if (!normalized) return true;
	if (TRANSIENT_SQLSTATES.has(normalized)) return true;
	if (TRANSIENT_POSTGREST_CODES.has(normalized)) return true;
	// Class 08: connection exception. Class 53: insufficient resources.
	return /^(08|53)[0-9A-Z]{3}$/.test(normalized);
}
