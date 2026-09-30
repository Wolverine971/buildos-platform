// packages/shared-types/src/agent-permission.types.ts
// Capability version is an authorization contract: additions require new consent.
export type AgentEditCapability = 'document.edit.v1' | 'task.edit.v1';
export type AgentPermissionStatus = 'pending' | 'applied' | 'denied' | 'expired' | 'stale' | 'canceled';
export type AgentPermissionDecision = 'once' | 'always' | 'deny';
export type AgentCredentialReference =
 | { kind: 'key'; caller_id: string; token_hash: string }
 | { kind: 'oauth'; access_token_id: string; caller_id: string; grant_id: string };
export interface AgentPermissionRequest {
 id: string; user_id: string; caller_id: string; grant_id: string | null;
 project_id: string; target_id: string; capability: AgentEditCapability;
 status: AgentPermissionStatus; epoch: number; created_at: string; expires_at: string;
 reason: string | null; reviewed_digest: string; before_snapshot: Record<string, unknown> | null;
 mutation: Record<string, unknown> | null; receipt: Record<string, unknown> | null;
 decision: AgentPermissionDecision | 'scoped' | null;
}
