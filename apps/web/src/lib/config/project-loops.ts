// apps/web/src/lib/config/project-loops.ts
/**
 * Project Loops availability.
 *
 * Loops are a per-project synthesis/reconciliation pass (drift, doc org,
 * outdated docs, task de-confliction) surfaced as reviewable AI suggestions.
 *
 * Project Loops graduated from its rollout flag in July 2026. Keep this export
 * as an always-on compatibility shim while callers are simplified separately;
 * availability must not vary between the web app and worker because of env
 * configuration.
 */
export const PROJECT_LOOPS_ENABLED = true;
