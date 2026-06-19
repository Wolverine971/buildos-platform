// apps/web/src/lib/server/agent-call/agent-call-policy.ts
//
// Re-export shim. The implementation moved to @buildos/shared-agent-ops so the
// worker Agent Run runner can share the same op policy/scope logic. Existing
// importers keep using this path unchanged.
export * from '@buildos/shared-agent-ops/policy';
