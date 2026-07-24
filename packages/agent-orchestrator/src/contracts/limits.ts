// packages/agent-orchestrator/src/contracts/limits.ts
export const CONTRACT_SCHEMA_VERSION = 1 as const;

export const MAX_OBJECTIVE_CHARS = 4_000;
export const MAX_DESCRIPTION_CHARS = 4_000;
export const MAX_SUMMARY_CHARS = 1_000;
export const MAX_EXCERPT_CHARS = 12_000;
export const MAX_ARRAY_ITEMS = 50;
export const MAX_STEPS_PER_STAGE = 20;
export const MAX_PROJECTS = 20;
export const MAX_ARTIFACT_PAYLOAD_BYTES = 256 * 1024;
export const MAX_DIGEST_TOKENS = 4_000;
