// apps/worker/src/config/cycles.ts
/**
 * Cycle scheduling is deployed dark while Daily Brief admissions remain on the
 * legacy scheduler. Enable only for shadow/canary cohorts during migration.
 */
export const CYCLE_COORDINATOR_ENABLED =
	String(process.env.PRIVATE_CYCLE_COORDINATOR_ENABLED ?? 'false').toLowerCase() === 'true';
