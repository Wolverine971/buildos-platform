// apps/web/src/lib/server/agent-call/agent-call-write-audit.service.ts
// Shim: carved into @buildos/shared-agent-ops (Wave 7). Worker-safe; takes the
// admin client as a param and logs via the carved security-event-logger. Kept
// here so existing $lib importers (external-tool-gateway) don't churn.
export * from '@buildos/shared-agent-ops/gateway/write-audit.service';
