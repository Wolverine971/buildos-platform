// apps/web/src/lib/services/ontology/relationship-policy.ts
//
// Re-export shim. Implementation moved to @buildos/shared-agent-ops (src/ontology/relationship-policy.ts)
// so the worker Agent Run runner shares the same pure relationship/edge logic.
// Existing importers keep using this path unchanged.
export * from '@buildos/shared-agent-ops/ontology/relationship-policy';
