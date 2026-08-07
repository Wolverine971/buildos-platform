// packages/agentic-chat-runtime/src/tools/access-port.ts
//
// Injected access port for the shared read tools (Slice 18 S3-T3). The legacy
// web executors scope every read through the RLS user client plus the
// auth.uid()-derived `current_actor_has_project_member_access` RPC — an RPC
// that fails CLOSED under a service-role client, so the worker cannot reuse it
// directly. Each host supplies this port instead: web wraps its existing RLS
// client behavior byte-identically; the worker wraps `ensureActorId` +
// `actor_has_project_member_access(p_actor_id, …)` (already granted to
// service_role) and must NOT implement the created_by escape hatch that web's
// entity walk allows (see the S3 extraction map, corrections 2).

export type AgenticChatToolAccessLevelV1 = 'read' | 'write' | 'admin';

/**
 * A visible-project summary as produced by shared-agent-ops
 * `fetchProjectSummaries`. Reads only depend on `id`/`state_key`; the overview
 * tools forward the remaining fields to their payload mappers untouched.
 */
export type AgenticChatToolProjectSummaryV1 = Record<string, unknown> & {
	id: string;
	state_key?: string | null;
};

export type AgenticChatToolAccessPortV1 = {
	getActorId(): Promise<string>;
	/**
	 * Every project visible to the acting user, unfiltered. Callers apply
	 * `filterReadableProjectSummaries` — the shared paused-project predicate —
	 * before scoping queries.
	 */
	resolveProjectSummaries(): Promise<AgenticChatToolProjectSummaryV1[]>;
	/** Throws when the actor lacks the required membership on the project. */
	assertProjectAccess(
		projectId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void>;
	/** Resolves an entity to its project and asserts access on that project. */
	assertEntityAccess(
		entityId: string,
		requiredAccess: AgenticChatToolAccessLevelV1
	): Promise<void>;
};

/**
 * Query sentinel used when the actor has zero readable projects: scoping to
 * this id keeps the query shape identical while matching no rows (legacy
 * `scopeEntityQueryToReadableProject` behavior).
 */
export const AGENTIC_CHAT_NO_READABLE_PROJECTS_SENTINEL = '00000000-0000-0000-0000-000000000000';

/**
 * The one shared paused-project predicate. Appears byte-identically in legacy
 * `ontology-read-executor.ts`, `utility-executor.ts`, and the gateway's
 * `op-execution-gateway.access.ts`; single-sourced here.
 */
export function filterReadableProjectSummaries<T extends { state_key?: string | null }>(
	summaries: readonly T[]
): T[] {
	return summaries.filter((project) => project.state_key !== 'paused');
}

export function readableProjectIdsFromSummaries(
	summaries: readonly AgenticChatToolProjectSummaryV1[]
): string[] {
	return filterReadableProjectSummaries(summaries)
		.map((project) => (typeof project.id === 'string' ? project.id : null))
		.filter((id): id is string => Boolean(id));
}
