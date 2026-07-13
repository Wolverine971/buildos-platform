// apps/web/src/lib/tests/agentic-e2e/harness/telemetry.ts
//
// Read helpers for the three assertion surfaces: per-turn telemetry
// (chat_turn_runs / chat_tool_executions), and ground-truth onto_* rows.
// All reads use the service-role admin client (bypasses RLS).
import type { TypedSupabaseClient } from '@buildos/supabase-client';

export interface TurnRunRow {
	id: string;
	session_id: string;
	status: string;
	finished_reason: string | null;
	tool_call_count: number;
	tool_round_count: number;
	first_canonical_op: string | null;
	assistant_message_id: string | null;
}

export interface ToolExecutionRow {
	tool_name: string;
	success: boolean;
	gateway_op: string | null;
	sequence_index: number | null;
	arguments: unknown;
	result: unknown;
	affected_entities: AffectedEntity[];
}

export interface AffectedEntity {
	kind?: string;
	id?: string;
	title?: string;
	operation?: string;
	projectId?: string;
	url?: string;
}

export interface DocumentRow {
	id: string;
	project_id: string;
	title: string;
	content: string | null;
	type_key: string;
	state_key: string;
	updated_at: string;
}

export interface TaskRow {
	id: string;
	project_id: string;
	title: string;
	description: string | null;
	priority: number | null;
	due_at: string | null;
	state_key: string;
	updated_at: string;
}

export interface DocumentTreeNode {
	id: string;
	title: string | null;
	order: number;
	children: DocumentTreeNode[];
}

export interface ProjectDocumentTree {
	version: number;
	root: DocumentTreeNode[];
}

/** The single turn row for a stream_run_id (may be null if not yet persisted). */
export async function getTurnRun(
	admin: TypedSupabaseClient,
	streamRunId: string
): Promise<TurnRunRow | null> {
	const { data } = await admin
		.from('chat_turn_runs')
		.select(
			'id, session_id, status, finished_reason, tool_call_count, tool_round_count, first_canonical_op, assistant_message_id'
		)
		.eq('stream_run_id', streamRunId)
		.maybeSingle();
	return (data as TurnRunRow | null) ?? null;
}

/**
 * Retire a still-`running` turn row after it has been observed and checked. The
 * per-session admission guard rejects a new turn while the previous one is
 * `running`; local `vite dev` can leave that lock behind. Marking the row
 * cancelled records the harness intervention without fabricating a successful
 * completion. No-op when the server already finalized the row.
 */
export async function releaseTurnForFollowup(
	admin: TypedSupabaseClient,
	streamRunId: string | null
): Promise<void> {
	if (!streamRunId) return;
	const { error } = await admin
		.from('chat_turn_runs')
		.update({
			status: 'cancelled',
			finished_reason: 'agentic_e2e_followup_release_after_observation',
			finished_at: new Date().toISOString()
		})
		.eq('stream_run_id', streamRunId)
		.eq('status', 'running');
	if (error) {
		throw new Error(`[agentic-e2e] failed to release follow-up turn lock: ${error.message}`);
	}
}

/** Delete one exact harness-owned chat session and its cascading test data. */
export async function teardownChatSession(
	admin: TypedSupabaseClient,
	userId: string,
	sessionId: string | null | undefined
): Promise<void> {
	if (!sessionId) return;
	const { data, error } = await admin
		.from('chat_sessions')
		.delete()
		.eq('id', sessionId)
		.eq('user_id', userId)
		.select('id')
		.maybeSingle();
	if (error) {
		throw new Error(
			`[agentic-e2e] failed to delete chat session ${sessionId}: ${error.message}`
		);
	}
	if (!data) {
		throw new Error(`[agentic-e2e] chat session ${sessionId} was not deleted`);
	}
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/**
 * Poll for the turn's telemetry row until it reaches a terminal status (or
 * timeout). The `done` SSE event can arrive a beat before the DB write of
 * status='completed' lands, so assertions should wait on this first.
 */
export async function waitForTurnRun(
	admin: TypedSupabaseClient,
	streamRunId: string,
	options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<TurnRunRow | null> {
	// Local `vite dev` never finalizes these rows, so don't burn 15s polling for a
	// terminal status that won't come unless we're asserting telemetry strictly.
	const strict = process.env.AGENTIC_ASSERT_TELEMETRY === 'true';
	const timeoutMs = options.timeoutMs ?? (strict ? 15000 : 1500);
	const intervalMs = options.intervalMs ?? 400;
	const deadline = Date.now() + timeoutMs;
	let last: TurnRunRow | null = null;
	while (Date.now() < deadline) {
		last = await getTurnRun(admin, streamRunId);
		if (last && TERMINAL_STATUSES.has(last.status)) return last;
		await new Promise((r) => setTimeout(r, intervalMs));
	}
	return last;
}

/** All tool executions for a stream_run_id, in call order. */
export async function getToolExecutions(
	admin: TypedSupabaseClient,
	streamRunId: string
): Promise<ToolExecutionRow[]> {
	const { data } = await admin
		.from('chat_tool_executions')
		.select(
			'tool_name, success, gateway_op, sequence_index, arguments, result, affected_entities'
		)
		.eq('stream_run_id', streamRunId)
		.order('sequence_index', { ascending: true });
	return ((data as ToolExecutionRow[] | null) ?? []).map((row) => ({
		...row,
		affected_entities: Array.isArray(row.affected_entities)
			? (row.affected_entities as AffectedEntity[])
			: []
	}));
}

/** All live (non-deleted) documents under a project. */
export async function listDocuments(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<DocumentRow[]> {
	const { data } = await admin
		.from('onto_documents')
		.select('id, project_id, title, content, type_key, state_key, updated_at')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });
	return (data as DocumentRow[] | null) ?? [];
}

/** First live document under a project whose title contains `titlePart` (case-insensitive). */
export async function getDocumentByTitle(
	admin: TypedSupabaseClient,
	projectId: string,
	titlePart: string
): Promise<DocumentRow | null> {
	const docs = await listDocuments(admin, projectId);
	const needle = titlePart.toLowerCase();
	return docs.find((d) => d.title.toLowerCase().includes(needle)) ?? null;
}

export async function getDocumentById(
	admin: TypedSupabaseClient,
	id: string
): Promise<DocumentRow | null> {
	const { data } = await admin
		.from('onto_documents')
		.select('id, project_id, title, content, type_key, state_key, updated_at')
		.eq('id', id)
		.maybeSingle();
	return (data as DocumentRow | null) ?? null;
}

/** All live tasks under a project. */
export async function listTasks(admin: TypedSupabaseClient, projectId: string): Promise<TaskRow[]> {
	const { data } = await admin
		.from('onto_tasks')
		.select('id, project_id, title, description, priority, due_at, state_key, updated_at')
		.eq('project_id', projectId)
		.is('deleted_at', null)
		.order('updated_at', { ascending: false });
	return (data as TaskRow[] | null) ?? [];
}

export async function getProjectDocumentTree(
	admin: TypedSupabaseClient,
	projectId: string
): Promise<ProjectDocumentTree> {
	const { data, error } = await admin
		.from('onto_projects')
		.select('doc_structure')
		.eq('id', projectId)
		.maybeSingle();
	if (error) {
		throw new Error(`[agentic-e2e] failed to read project document tree: ${error.message}`);
	}
	if (!data) throw new Error(`[agentic-e2e] project ${projectId} was not found`);
	const raw = data.doc_structure;
	const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
	return {
		version:
			typeof record.version === 'number' && Number.isFinite(record.version)
				? record.version
				: 1,
		root: normalizeDocumentTreeNodes(record.root)
	};
}

function normalizeDocumentTreeNodes(value: unknown): DocumentTreeNode[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((node) => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
		const record = node as Record<string, unknown>;
		if (typeof record.id !== 'string' || !record.id) return [];
		return [
			{
				id: record.id,
				title: typeof record.title === 'string' ? record.title : null,
				order:
					typeof record.order === 'number' && Number.isFinite(record.order)
						? record.order
						: 0,
				children: normalizeDocumentTreeNodes(record.children)
			}
		];
	});
}
