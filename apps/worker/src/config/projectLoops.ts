// apps/worker/src/config/projectLoops.ts

/**
 * Project Loops graduated from its rollout flag in July 2026. Keep the shared
 * symbol as an always-on compatibility shim until the guarded call sites are
 * simplified; worker execution must no longer depend on deployment env drift.
 */
export const PROJECT_LOOPS_ENABLED = true;
