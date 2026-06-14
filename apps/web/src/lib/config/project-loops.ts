// apps/web/src/lib/config/project-loops.ts
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

/**
 * Project Loops feature flag.
 *
 * Loops are a per-project synthesis/reconciliation pass (drift, doc org,
 * outdated docs, task de-confliction) surfaced as reviewable AI suggestions.
 *
 * Rollout policy:
 * - DEV: always on, so it can be dogfooded without any config.
 * - PROD: OFF until PUBLIC_ENABLE_PROJECT_LOOPS=true is set (the green light).
 *
 * PUBLIC_ vars are readable on both the server and the client, so this single
 * constant gates the UI, the trigger endpoints, and the apply/replay endpoints.
 */
export const PROJECT_LOOPS_ENABLED =
	dev || String(env.PUBLIC_ENABLE_PROJECT_LOOPS ?? '').toLowerCase() === 'true';
