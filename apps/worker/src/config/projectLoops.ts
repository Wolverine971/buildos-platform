// apps/worker/src/config/projectLoops.ts

/**
 * Project Loops feature flag (worker side).
 *
 * Mirrors the web flag in apps/web/src/lib/config/project-loops.ts.
 * - An explicit ENABLE_PROJECT_LOOPS value ALWAYS wins ('true' = on, anything
 *   else = off), including an explicit `false` in dev.
 * - When the var is unset/empty, fall back to the environment default: on in
 *   DEV (NODE_ENV !== 'production') for dogfooding, off in PROD (the green
 *   light requires the explicit flag).
 *
 * The worker processor defensively no-ops when disabled even though the web
 * app is responsible for gating enqueue.
 */
export function resolveProjectLoopsEnabled(env: {
	ENABLE_PROJECT_LOOPS?: string | null;
	NODE_ENV?: string | null;
}): boolean {
	const explicit = env.ENABLE_PROJECT_LOOPS;
	// Explicit env var wins; the dev default only applies when it is unset/empty.
	if (explicit !== null && explicit !== undefined && explicit.trim() !== '') {
		return explicit.trim().toLowerCase() === 'true';
	}
	return env.NODE_ENV !== 'production';
}

export const PROJECT_LOOPS_ENABLED = resolveProjectLoopsEnabled({
	ENABLE_PROJECT_LOOPS: process.env.ENABLE_PROJECT_LOOPS,
	NODE_ENV: process.env.NODE_ENV
});
