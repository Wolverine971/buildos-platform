// apps/web/src/lib/services/ontology/containment-organizer.ts
//
// Re-export shim. Implementation moved to @buildos/shared-agent-ops (src/ontology/containment-organizer.ts)
// so the worker Agent Run runner shares the same pure relationship/edge logic.
// Existing importers keep using this path unchanged.
export * from '@buildos/shared-agent-ops/ontology/containment-organizer';
