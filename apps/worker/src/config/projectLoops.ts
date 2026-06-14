// apps/worker/src/config/projectLoops.ts

/**
 * Project Loops feature flag (worker side).
 *
 * Mirrors the web flag in apps/web/src/lib/config/project-loops.ts.
 * - DEV (NODE_ENV !== 'production'): on, for dogfooding.
 * - PROD: off unless ENABLE_PROJECT_LOOPS=true (the green light).
 *
 * The worker processor defensively no-ops when disabled even though the web
 * app is responsible for gating enqueue.
 */
export const PROJECT_LOOPS_ENABLED =
	String(process.env.ENABLE_PROJECT_LOOPS ?? '').toLowerCase() === 'true' ||
	process.env.NODE_ENV !== 'production';
