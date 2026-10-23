// apps/worker/src/workers/agentic-chat/shared/workspace-context.ts
//
// The user's Workspace (onto_projects.kind 'workspace': loose notes, docs and
// tasks, not a project; docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md).

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Creates a chat in another project may aim at the user's Workspace. */
export const WORKSPACE_CREATE_TOOL_NAMES: ReadonlySet<string> = new Set([
	'create_onto_task',
	'create_onto_document'
]);

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/**
 * The user's own Workspace project id from the admitted context the web server
 * loaded for this user (`data.workspace_project_id`, via the ensure RPC on the
 * user's own session), never from model arguments or message text. Null when
 * the context carries none (contexts loaded before the Workspace existed).
 */
export function workspaceProjectIdFromContextPayload(contextPayload: unknown): string | null {
	const id = record(record(contextPayload)?.data)?.workspace_project_id;
	return typeof id === 'string' && UUID_TEXT.test(id) ? id.toLowerCase() : null;
}
