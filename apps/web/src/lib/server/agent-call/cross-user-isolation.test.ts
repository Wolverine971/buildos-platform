// apps/web/src/lib/server/agent-call/cross-user-isolation.test.ts
//
// Cross-user isolation for connected agents (people layer audit, 2026-10-23).
//
// Sam connects an agent. The suite drives the real MCP tool surface
// (executeBuildosAgentGatewayTool → shared gateway → handlers) against an in-memory
// database that honors PostgREST filters and leaks by default (see
// cross-user-isolation.test-helpers.ts), so a handler that forgets a project filter
// returns other people's rows here and fails.
//
// The world:
//   A  Sam's own project, granted to the connector (read_write)
//   U  Sam's own project, NOT granted to this connector ("selected" mode)
//   S  DJ's project, Sam is a viewer, DJ lets Sam's agents read, Sam granted it
//   W  DJ's project, Sam is an editor, DJ lets Sam's agents write, Sam granted it
//   O  DJ's project, Sam is an editor, DJ turned Sam's agents OFF, Sam granted it
//   X  Eve's project, never shared with Sam
//
// Anything whose name or title starts with "SECRET" must never reach the agent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentCallScope, BuildosAgentAllowedOp } from '@buildos/shared-types';
import { BUILDOS_AGENT_READ_OPS, BUILDOS_AGENT_WRITE_OPS } from '@buildos/shared-types';
import { FakeDb, type FakeRow } from './cross-user-isolation.test-helpers';

const calendarExecutorCalls = vi.hoisted(() => [] as Array<{ method: string; args: unknown }>);
const docTreeCalls = vi.hoisted(() => [] as Array<unknown[]>);

vi.mock('@buildos/shared-agent-ops/ops/async-activity-logger', () => ({
	logCreateAsync: vi.fn(async () => undefined),
	logUpdateAsync: vi.fn(async () => undefined)
}));
vi.mock('@buildos/shared-agent-ops/ops/entity-mention-notification.service', () => ({
	resolveEntityMentionUserIds: vi.fn(async () => []),
	notifyEntityMentionsAdded: vi.fn(async () => ({ notifiedUserIds: [] }))
}));
vi.mock('@buildos/shared-agent-ops/ontology/doc-structure.service', () => ({
	addDocumentToTree: vi.fn(async (...args: unknown[]) => {
		docTreeCalls.push(args);
		return { version: 2, root: [] };
	}),
	updateDocNodeMetadata: vi.fn(async () => null),
	getDocTree: vi.fn(async () => ({ version: 1, root: [] })),
	moveDocument: vi.fn(async (...args: unknown[]) => {
		docTreeCalls.push(args);
		return { version: 2, root: [] };
	})
}));
vi.mock('@buildos/shared-agent-ops/ontology/versioning.service', () => ({
	createOrMergeDocumentVersion: vi.fn(async () => ({
		status: 'created',
		versionNumber: 1,
		versionId: 'version-1'
	})),
	toDocumentSnapshot: (document: Record<string, unknown>) => ({ ...document })
}));
vi.mock('$lib/services/ontology/task-event-sync.service', () => ({
	TaskEventSyncService: class TaskEventSyncService {
		syncTaskEvents = vi.fn(async () => undefined);
	}
}));
vi.mock('$lib/services/agentic-chat/tools/core/executors/calendar-executor', () => {
	const record =
		(method: string) =>
		async (args: unknown): Promise<Record<string, unknown>> => {
			calendarExecutorCalls.push({ method, args });
			return { ok: true, events: [] };
		};
	return {
		CalendarExecutor: class CalendarExecutor {
			listCalendarEvents = record('listCalendarEvents');
			getCalendarEventDetails = record('getCalendarEventDetails');
			createCalendarEvent = record('createCalendarEvent');
			updateCalendarEvent = record('updateCalendarEvent');
			deleteCalendarEvent = record('deleteCalendarEvent');
			getProjectCalendar = record('getProjectCalendar');
			setProjectCalendar = record('setProjectCalendar');
		}
	};
});

import {
	executeBuildosAgentGatewayTool,
	getBuildosAgentGatewayTools
} from './external-tool-gateway';
import { resolveEffectiveAgentProjectScope } from './project-access.service';
import { getToolRegistry } from '@buildos/agentic-chat-runtime/catalog';
import { EXTERNAL_CUSTOM_OPS } from '@buildos/shared-agent-ops/gateway/op-execution-gateway';

// ---------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------

const PROJECT_CODE = { A: 'a', U: 'c', S: '5', W: '7', O: '9', X: 'e' } as const;
type ProjectKey = keyof typeof PROJECT_CODE;
const KIND_CODE = {
	project: '0',
	task: '1',
	doc: '2',
	goal: '3',
	plan: '4',
	milestone: '5',
	risk: '6',
	asset: '7',
	table: '8',
	row: '9',
	event: 'a',
	edge: 'b'
} as const;
type KindKey = keyof typeof KIND_CODE;

function uid(project: ProjectKey, kind: KindKey, n = 1): string {
	return `${PROJECT_CODE[project]}${KIND_CODE[kind]}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

const USER = {
	sam: 'f1000000-0000-4000-8000-000000000001',
	dj: 'f2000000-0000-4000-8000-000000000001',
	eve: 'f3000000-0000-4000-8000-000000000001'
};
const ACTOR = {
	sam: 'f1000000-0000-4000-8000-0000000000a1',
	dj: 'f2000000-0000-4000-8000-0000000000a1',
	eve: 'f3000000-0000-4000-8000-0000000000a1'
};
const CALLER = 'fc000000-0000-4000-8000-000000000001';
const SESSION = 'fd000000-0000-4000-8000-000000000001';

const PROJECT = {
	A: { id: uid('A', 'project'), name: 'Sam Alpha', owner: ACTOR.sam },
	U: { id: uid('U', 'project'), name: 'SECRET-UNGRANTED Sam side project', owner: ACTOR.sam },
	S: { id: uid('S', 'project'), name: 'DJ Readable', owner: ACTOR.dj },
	W: { id: uid('W', 'project'), name: 'DJ Writable', owner: ACTOR.dj },
	O: { id: uid('O', 'project'), name: 'SECRET-OFF DJ agents off', owner: ACTOR.dj },
	X: { id: uid('X', 'project'), name: 'SECRET-X Eve private', owner: ACTOR.eve }
} as const;

/** Projects whose rows the agent may never read. */
const HIDDEN: ProjectKey[] = ['U', 'O', 'X'];
/** Projects the agent may never write. */
const READ_ONLY_OR_HIDDEN: ProjectKey[] = ['U', 'O', 'X', 'S'];

function title(project: ProjectKey, label: string): string {
	return HIDDEN.includes(project) ? `SECRET-${project} ${label}` : `${project} ${label}`;
}

const NOW = '2026-10-23T12:00:00.000Z';

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function entityRows(project: ProjectKey): Record<string, FakeRow[]> {
	const projectId = PROJECT[project].id;
	const owner = PROJECT[project].owner;
	const base = {
		project_id: projectId,
		created_at: NOW,
		updated_at: NOW,
		archived_at: null,
		deleted_at: null,
		created_by: owner,
		props: {}
	};
	const tasks: FakeRow[] = [
		{
			...base,
			id: uid(project, 'task', 1),
			title: title(project, 'owner task'),
			description: title(project, 'owner task description'),
			type_key: 'task.execute',
			state_key: 'todo',
			priority: 3,
			start_at: null,
			due_at: null,
			completed_at: null
		}
	];
	const documents: FakeRow[] = [
		{
			...base,
			id: uid(project, 'doc', 1),
			title: title(project, 'owner doc'),
			description: null,
			type_key: 'document.default',
			state_key: 'draft',
			content: `# ${title(project, 'owner doc body')}`,
			children: null
		},
		{
			...base,
			id: uid(project, 'table', 1),
			title: title(project, 'owner table'),
			description: null,
			type_key: 'document.table',
			state_key: 'draft',
			content: title(project, 'table csv'),
			children: null,
			props: {
				table: {
					version: 1,
					columns: [{ key: 'name', label: 'Name', type: 'text' }]
				}
			}
		}
	];
	if (project === 'W') {
		// Sam's own items inside DJ's writable project, plus a DJ task assigned to Sam.
		tasks.push(
			{
				...tasks[0],
				id: uid('W', 'task', 2),
				title: 'W task Sam created',
				created_by: ACTOR.sam
			},
			{
				...tasks[0],
				id: uid('W', 'task', 3),
				title: 'W DJ task assigned to Sam'
			}
		);
		documents.push({
			...documents[0],
			id: uid('W', 'doc', 2),
			title: 'W doc Sam created',
			created_by: ACTOR.sam,
			content: '# W doc Sam created'
		});
	}
	return {
		onto_tasks: tasks,
		onto_documents: documents,
		onto_document_rows: [
			{
				id: uid(project, 'row', 1),
				document_id: uid(project, 'table', 1),
				project_id: projectId,
				position: 0,
				handle: 'r1',
				cells: { name: title(project, 'row cell') },
				created_at: NOW,
				updated_at: NOW,
				deleted_at: null
			}
		],
		onto_goals: [
			{
				...base,
				id: uid(project, 'goal'),
				name: title(project, 'goal'),
				description: null,
				goal: null,
				type_key: 'goal.outcome',
				state_key: 'active',
				target_date: null
			}
		],
		onto_plans: [
			{
				...base,
				id: uid(project, 'plan'),
				name: title(project, 'plan'),
				description: null,
				plan: null,
				type_key: 'plan.default',
				state_key: 'active'
			}
		],
		onto_milestones: [
			{
				...base,
				id: uid(project, 'milestone'),
				title: title(project, 'milestone'),
				description: null,
				milestone: null,
				type_key: 'milestone.default',
				state_key: 'pending',
				due_at: null
			}
		],
		onto_risks: [
			{
				...base,
				id: uid(project, 'risk'),
				title: title(project, 'risk'),
				content: null,
				type_key: 'risk.default',
				state_key: 'identified',
				impact: 'medium',
				probability: 0.5
			}
		],
		onto_assets: [
			{
				...base,
				id: uid(project, 'asset'),
				kind: 'image',
				title: title(project, 'asset'),
				alt_text: title(project, 'asset alt'),
				caption: null,
				content_type: 'image/png',
				storage_bucket: 'onto-assets',
				storage_path: `${projectId}/secret.png`,
				ocr_status: 'complete',
				extracted_text: title(project, 'asset ocr'),
				extracted_text_source: 'ocr',
				extraction_summary: null,
				original_filename: 'photo.png',
				file_size_bytes: 10,
				width: 1,
				height: 1
			}
		],
		onto_events: [
			{
				id: uid(project, 'event'),
				project_id: projectId,
				owner_entity_type: 'task',
				owner_entity_id: uid(project, 'task', 1),
				title: title(project, 'event'),
				description: null,
				start_at: NOW,
				end_at: NOW,
				all_day: false,
				timezone: 'UTC',
				state_key: 'scheduled',
				type_key: 'event.default',
				props: {},
				created_by: owner,
				created_at: NOW,
				updated_at: NOW,
				deleted_at: null
			}
		],
		onto_edges: [
			{
				id: uid(project, 'edge'),
				project_id: projectId,
				src_kind: 'goal',
				src_id: uid(project, 'goal'),
				dst_kind: 'task',
				dst_id: uid(project, 'task', 1),
				rel: 'supports_goal',
				props: {},
				created_at: NOW
			}
		]
	};
}

function seed(): FakeDb {
	const tables: Record<string, FakeRow[]> = {
		users: [
			{
				id: USER.sam,
				name: 'Sam',
				email: 'sam@example.com',
				timezone: 'UTC',
				deletion_status: null
			},
			// DJ never set a name: his actor was named after his email.
			{
				id: USER.dj,
				name: null,
				email: 'dj-secret@example.com',
				timezone: 'UTC',
				deletion_status: null
			},
			{
				id: USER.eve,
				name: 'Eve',
				email: 'eve-secret@example.com',
				timezone: 'UTC',
				deletion_status: null
			}
		],
		onto_actors: [
			{
				id: ACTOR.sam,
				user_id: USER.sam,
				kind: 'human',
				name: 'Sam',
				email: 'sam@example.com'
			},
			{
				id: ACTOR.dj,
				user_id: USER.dj,
				kind: 'human',
				name: 'dj-secret@example.com',
				email: 'dj-secret@example.com'
			},
			{
				id: ACTOR.eve,
				user_id: USER.eve,
				kind: 'human',
				name: 'Eve',
				email: 'eve-secret@example.com'
			}
		],
		onto_projects: (Object.keys(PROJECT) as ProjectKey[]).map((key) => ({
			id: PROJECT[key].id,
			name: PROJECT[key].name,
			description: title(key, 'project description'),
			type_key: 'project.business.product',
			state_key: 'active',
			props: {},
			created_by: PROJECT[key].owner,
			created_at: NOW,
			updated_at: NOW,
			deleted_at: null,
			archived_at: null,
			external_agent_access: 'standard',
			parent_project_id: null,
			merged_into_project_id: null,
			doc_structure: { version: 1, root: [] },
			is_public: false
		})),
		onto_project_members: [
			...(Object.keys(PROJECT) as ProjectKey[]).map((key) => ({
				id: `${PROJECT_CODE[key]}f000000-0000-4000-8000-000000000001`,
				project_id: PROJECT[key].id,
				actor_id: PROJECT[key].owner,
				role_key: 'owner',
				access: 'admin',
				agent_access: 'write',
				removed_at: null,
				created_at: NOW
			})),
			member('S', 'viewer', 'read', 'read'),
			member('W', 'editor', 'write', 'write'),
			member('O', 'editor', 'write', 'off')
		],
		onto_task_assignees: [
			{
				task_id: uid('W', 'task', 3),
				project_id: PROJECT.W.id,
				assignee_actor_id: ACTOR.sam,
				created_at: NOW
			}
		],
		external_agent_callers: [
			{
				id: CALLER,
				user_id: USER.sam,
				status: 'trusted',
				provider: 'claude',
				token_hash: 'hash',
				project_scope_mode: 'selected',
				policy: { scope_mode: 'read_write' }
			}
		],
		// Sam granted A, S, W and O (and asked for write everywhere); never U.
		external_agent_project_permissions: (['A', 'S', 'W', 'O'] as ProjectKey[]).map(
			(key, index) => ({
				id: `fe000000-0000-4000-8000-00000000000${index}`,
				user_id: USER.sam,
				external_agent_caller_id: CALLER,
				agent_oauth_grant_id: null,
				project_id: PROJECT[key].id,
				access_mode: 'read_write',
				revoked_at: null
			})
		),
		agent_permission_feature: [{ id: true, enabled: false, epoch: 1 }]
	};
	for (const key of Object.keys(PROJECT) as ProjectKey[]) {
		for (const [table, rows] of Object.entries(entityRows(key))) {
			tables[table] = [...(tables[table] ?? []), ...rows];
		}
	}
	// A legacy edge in S whose other end sits in Eve's project X.
	tables.onto_edges!.push({
		id: uid('S', 'edge', 2),
		project_id: PROJECT.S.id,
		src_kind: 'task',
		src_id: uid('S', 'task', 1),
		dst_kind: 'task',
		dst_id: uid('X', 'task', 1),
		rel: 'depends_on',
		props: {},
		created_at: NOW
	});
	tables.onto_edges!.push({
		id: uid('S', 'edge', 3),
		project_id: PROJECT.S.id,
		src_kind: 'task',
		src_id: uid('S', 'task', 1),
		dst_kind: 'project',
		dst_id: PROJECT.X.id,
		rel: 'related_to',
		props: {},
		created_at: NOW
	});

	const db = new FakeDb(tables);
	const actorById = (id: unknown) =>
		db.table('onto_actors').find((actor) => actor.id === id) ?? null;
	db.embeds.onto_project_members = [
		{ alias: 'actor', resolve: (row) => actorById(row.actor_id) }
	];
	db.embeds.onto_task_assignees = [
		{ alias: 'assignee', resolve: (row) => actorById(row.assignee_actor_id) }
	];
	installRpcs(db);
	return db;
}

function member(
	project: ProjectKey,
	role: 'viewer' | 'editor',
	access: 'read' | 'write',
	agentAccess: 'off' | 'read' | 'write'
): FakeRow {
	return {
		id: `${PROJECT_CODE[project]}f000000-0000-4000-8000-000000000002`,
		project_id: PROJECT[project].id,
		actor_id: ACTOR.sam,
		role_key: role,
		access,
		agent_access: agentAccess,
		removed_at: null,
		created_at: NOW
	};
}

/** SQL stand-ins, each mirroring the real function's access rule. */
function installRpcs(db: FakeDb) {
	db.rpcs.ensure_actor_for_user = (args) => {
		const actor = db.table('onto_actors').find((row) => row.user_id === args.p_user_id);
		return { data: actor?.id ?? null, error: actor ? null : { message: 'no actor' } };
	};
	db.rpcs.current_actor_id = () => ({ data: ACTOR.sam, error: null });
	// get_onto_project_summaries_v1: owned or member, not deleted/archived.
	db.rpcs.get_onto_project_summaries_v1 = (args) => {
		const actorId = String(args.p_actor_id);
		const rows = db
			.table('onto_projects')
			.filter((project) => !project.deleted_at && !project.archived_at)
			.flatMap((project) => {
				const membership = db
					.table('onto_project_members')
					.find(
						(row) =>
							row.project_id === project.id &&
							row.actor_id === actorId &&
							!row.removed_at
					);
				if (project.created_by !== actorId && !membership) return [];
				return [
					{
						...project,
						task_count: 1,
						goal_count: 1,
						plan_count: 1,
						document_count: 2,
						owner_actor_id: project.created_by,
						access_role: membership?.role_key ?? 'owner',
						access_level: membership?.access ?? 'admin',
						is_shared: project.created_by !== actorId,
						next_step_short: null,
						next_step_long: null,
						next_step_source: null,
						next_step_updated_at: null
					}
				];
			});
		return { data: rows, error: null };
	};
	db.rpcs.get_project_route_redirect = () => ({ data: null, error: null });
	db.rpcs.validate_facet_values = () => ({ data: [], error: null });
	db.rpcs.lookup_agent_permission_request = () => ({ data: null, error: null });
	db.rpcs.add_queue_job = () => ({ data: 'job', error: null });
	// load_fastchat_context: project snapshot for a member (members carry emails).
	db.rpcs.load_fastchat_context = (args) => {
		const projectId = String(args.p_project_id);
		return {
			data: {
				project: db.table('onto_projects').find((row) => row.id === projectId) ?? null,
				tasks: db.table('onto_tasks').filter((row) => row.project_id === projectId),
				members: db
					.table('onto_project_members')
					.filter((row) => row.project_id === projectId && !row.removed_at)
					.map((row) => {
						const actor = db.table('onto_actors').find((a) => a.id === row.actor_id);
						return {
							...row,
							actor_name: actor?.name ?? null,
							actor_email: actor?.email ?? null
						};
					})
			},
			error: null
		};
	};
	db.rpcs.get_project_document_tree_metadata = (args) => ({
		data: db
			.table('onto_documents')
			.filter((row) => row.project_id === args.p_project_id)
			.map((row) => ({ id: row.id, title: row.title, type_key: row.type_key })),
		error: null
	});
	db.rpcs.onto_task_create_with_relationships_atomic = (args) => {
		const task = { ...(args.p_task as FakeRow), created_at: NOW, updated_at: NOW };
		db.table('onto_tasks').push(task);
		return {
			data: { task, added_actor_ids: [], idempotent_replay: false, relationships: null },
			error: null
		};
	};
	db.rpcs.onto_task_update_with_relationships_atomic = (args) => {
		const taskId = String(args.p_task_id);
		const task = db.table('onto_tasks').find((row) => row.id === taskId);
		if (task) Object.assign(task, (args.p_patch ?? args.p_update ?? {}) as FakeRow);
		return { data: { task, relationships: null, added_actor_ids: [] }, error: null };
	};
	db.rpcs.onto_edge_link_atomic = (args) => ({ data: { edge: args }, error: null });
	db.rpcs.onto_apply_relationship_plan_atomic = () => ({ data: { inserted: 0 }, error: null });
	db.rpcs.onto_project_doc_structure_update_atomic = () => ({
		data: { version: 2, root: [] },
		error: null
	});
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let db: FakeDb;
let scope: AgentCallScope & { project_ids: string[]; write_project_ids: string[] };

function toolNameFor(op: BuildosAgentAllowedOp): string {
	const name =
		getToolRegistry().ops[op]?.tool_name ??
		(EXTERNAL_CUSTOM_OPS as Record<string, { tool_name: string } | undefined>)[op]?.tool_name;
	if (!name) throw new Error(`no tool for ${op}`);
	return name;
}

async function call(op: BuildosAgentAllowedOp, args: Record<string, unknown>) {
	return executeBuildosAgentGatewayTool({
		credential: { kind: 'key', caller_id: CALLER, token_hash: 'hash' },
		admin: db,
		userId: USER.sam,
		callerId: CALLER,
		projectScopeMode: 'selected',
		callSessionId: SESSION,
		scope,
		toolName: toolNameFor(op),
		arguments: { idempotency_key: `k-${Math.random()}`, ...args },
		connectorOrigin: 'https://build-os.com'
	});
}

const PROTECTED_WRITE_TABLES_IGNORED = new Set([
	'agent_call_tool_executions',
	'security_events',
	'external_agent_callers',
	'agent_call_sessions'
]);

const READ_RPCS = new Set([
	'ensure_actor_for_user',
	'current_actor_id',
	'get_onto_project_summaries_v1',
	'get_project_route_redirect',
	'validate_facet_values',
	'lookup_agent_permission_request',
	'load_fastchat_context',
	'get_project_document_tree_metadata'
]);

function idsOf(projects: ProjectKey[]): string[] {
	const ids: string[] = [];
	for (const project of projects) {
		ids.push(PROJECT[project].id);
		for (const kind of Object.keys(KIND_CODE) as KindKey[]) {
			for (let n = 1; n <= 3; n += 1) ids.push(uid(project, kind, n));
		}
	}
	return ids;
}

/**
 * Nothing named SECRET and no id from a hidden project, except ids the agent sent.
 * A project the person can see but this connector can't (U, O) is refused with its
 * id and a grant link by design, so that one id may come back; never its name.
 */
function expectNoLeak(
	result: unknown,
	sentArgs: Record<string, unknown>,
	allowedIds: string[] = []
) {
	const text = JSON.stringify(result);
	const sent = JSON.stringify(sentArgs) + allowedIds.join(',');
	expect(text).not.toMatch(/SECRET/);
	expect(text).not.toMatch(/-secret@example\.com|eve-secret|dj-secret/);
	for (const id of idsOf(HIDDEN)) {
		if (!sent.includes(id)) expect(text, `leaked id ${id}`).not.toContain(id);
	}
}

/** No data row in a project the agent may not write was inserted, changed, or deleted. */
function expectNoWritesTo(projects: ProjectKey[]) {
	const projectIds = new Set(projects.map((key) => PROJECT[key].id));
	const entityIds = new Set(idsOf(projects));
	for (const write of db.writes) {
		if (PROTECTED_WRITE_TABLES_IGNORED.has(write.table)) continue;
		for (const row of write.rows) {
			const touches =
				projectIds.has(String(row.project_id)) ||
				(write.table === 'onto_projects' && projectIds.has(String(row.id))) ||
				entityIds.has(String(row.id));
			expect(touches, `${write.kind} on ${write.table}: ${JSON.stringify(row)}`).toBe(false);
		}
	}
	for (const rpc of db.rpcCalls) {
		if (READ_RPCS.has(rpc.name)) continue;
		const text = JSON.stringify(rpc.args);
		for (const id of entityIds) {
			expect(text.includes(id), `${rpc.name} called with ${id}`).toBe(false);
		}
	}
	for (const callRecord of calendarExecutorCalls) {
		if (!/create|update|delete|set/i.test(callRecord.method)) continue;
		const text = JSON.stringify(callRecord.args);
		for (const id of entityIds) expect(text.includes(id)).toBe(false);
	}
}

function failed(result: Record<string, unknown>): boolean {
	return result.ok === false || Boolean(result.error);
}

beforeEach(async () => {
	db = seed();
	calendarExecutorCalls.length = 0;
	docTreeCalls.length = 0;
	scope = (await resolveEffectiveAgentProjectScope({
		admin: db,
		userId: USER.sam,
		callerId: CALLER,
		projectScopeMode: 'selected',
		scope: { mode: 'read_write' }
	})) as typeof scope;
	db.writes.length = 0;
	db.rpcCalls.length = 0;
});

// ---------------------------------------------------------------------------
// Requirement 1 + 2: the effective scope
// ---------------------------------------------------------------------------

describe('effective connector scope', () => {
	it('is A + the shared projects whose owner allows agents; writes only where both keys allow', () => {
		expect(new Set(scope.project_ids)).toEqual(
			new Set([PROJECT.A.id, PROJECT.S.id, PROJECT.W.id])
		);
		expect(new Set(scope.write_project_ids)).toEqual(new Set([PROJECT.A.id, PROJECT.W.id]));
	});

	it('ignores a grant row for a project the person no longer belongs to', async () => {
		db
			.table('onto_project_members')
			.find(
				(row) => row.project_id === PROJECT.W.id && row.actor_id === ACTOR.sam
			)!.removed_at = NOW;
		db.table('external_agent_project_permissions').push({
			id: 'fe000000-0000-4000-8000-0000000000ff',
			user_id: USER.sam,
			external_agent_caller_id: CALLER,
			agent_oauth_grant_id: null,
			project_id: PROJECT.X.id,
			access_mode: 'read_write',
			revoked_at: null
		});
		const next = await resolveEffectiveAgentProjectScope({
			admin: db,
			userId: USER.sam,
			callerId: CALLER,
			projectScopeMode: 'selected',
			scope: { mode: 'read_write' }
		});
		expect(next.project_ids).not.toContain(PROJECT.W.id);
		expect(next.project_ids).not.toContain(PROJECT.X.id);
	});

	it('all-projects mode still never inherits shared projects', async () => {
		db.table('external_agent_project_permissions').length = 0;
		const next = await resolveEffectiveAgentProjectScope({
			admin: db,
			userId: USER.sam,
			callerId: CALLER,
			projectScopeMode: 'all_unrestricted',
			scope: { mode: 'read_write' }
		});
		expect(new Set(next.project_ids)).toEqual(new Set([PROJECT.A.id, PROJECT.U.id]));
	});
});

// ---------------------------------------------------------------------------
// Positive controls: the harness really serves reads (else "everything fails"
// would pass the isolation tests trivially).
// ---------------------------------------------------------------------------

describe('positive controls', () => {
	it('reads Sam’s own and shared projects', async () => {
		const ownTask = await call('onto.task.get', { task_id: uid('A', 'task') });
		expect(JSON.stringify(ownTask)).toContain('A owner task');
		const sharedTask = await call('onto.task.get', { task_id: uid('S', 'task') });
		expect(JSON.stringify(sharedTask)).toContain('S owner task');
		const sharedDoc = await call('onto.document.get', { document_id: uid('S', 'doc') });
		expect(JSON.stringify(sharedDoc)).toContain('S owner doc');
		const goal = await call('onto.goal.get', { goal_id: uid('S', 'goal') });
		expect(JSON.stringify(goal)).toContain('S goal');
	});

	it('writes in Sam’s own project', async () => {
		const result = await call('onto.task.create', {
			project_id: PROJECT.A.id,
			title: 'new A task'
		});
		expect(failed(result), JSON.stringify(result)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Requirement 2: reads aimed at hidden projects return nothing and name nothing
// ---------------------------------------------------------------------------

type Case = { op: BuildosAgentAllowedOp; args: (p: ProjectKey) => Record<string, unknown> };

const READ_CASES: Case[] = [
	{ op: 'onto.project.get', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.project.status.get', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.project.graph.get', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.task.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.task.get', args: (p) => ({ task_id: uid(p, 'task') }) },
	{ op: 'onto.task.docs.list', args: (p) => ({ task_id: uid(p, 'task') }) },
	{ op: 'onto.document.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.document.get', args: (p) => ({ document_id: uid(p, 'doc') }) },
	{ op: 'onto.document.tree.get', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.document.path.get', args: (p) => ({ document_id: uid(p, 'doc') }) },
	{ op: 'onto.goal.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.goal.get', args: (p) => ({ goal_id: uid(p, 'goal') }) },
	{ op: 'onto.plan.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.plan.get', args: (p) => ({ plan_id: uid(p, 'plan') }) },
	{ op: 'onto.milestone.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.milestone.get', args: (p) => ({ milestone_id: uid(p, 'milestone') }) },
	{ op: 'onto.risk.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.risk.get', args: (p) => ({ risk_id: uid(p, 'risk') }) },
	{ op: 'onto.asset.search', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.asset.get', args: (p) => ({ asset_id: uid(p, 'asset') }) },
	{ op: 'onto.table.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'onto.table.get', args: (p) => ({ table_id: uid(p, 'table') }) },
	{ op: 'onto.table.rows.query', args: (p) => ({ table_id: uid(p, 'table') }) },
	{
		op: 'onto.entity.relationships.get',
		args: (p) => ({ entity_kind: 'task', entity_id: uid(p, 'task') })
	},
	{
		op: 'onto.entity.links.get',
		args: (p) => ({ entity_kind: 'goal', entity_id: uid(p, 'goal') })
	},
	{ op: 'cal.event.list', args: (p) => ({ project_id: PROJECT[p].id }) },
	{ op: 'cal.event.get', args: (p) => ({ onto_event_id: uid(p, 'event') }) },
	{ op: 'cal.project.get', args: (p) => ({ project_id: PROJECT[p].id }) }
];

const SEARCH_CASES: Array<{ op: BuildosAgentAllowedOp; args: Record<string, unknown> }> = [
	{ op: 'onto.project.list', args: {} },
	// Each query matches rows in every project, visible and hidden alike.
	{ op: 'onto.project.search', args: { query: 'project' } },
	{ op: 'onto.task.search', args: { query: 'task' } },
	{ op: 'onto.document.search', args: { query: 'doc' } },
	{ op: 'onto.goal.search', args: { query: 'goal' } },
	{ op: 'onto.plan.search', args: { query: 'plan' } },
	{ op: 'onto.milestone.search', args: { query: 'milestone' } },
	{ op: 'onto.risk.search', args: { query: 'risk' } },
	{ op: 'onto.asset.search', args: { query: 'asset' } },
	{ op: 'onto.table.list', args: {} },
	{ op: 'onto.search', args: { query: 'owner' } },
	{ op: 'onto.task.list', args: {} },
	{ op: 'onto.document.list', args: {} }
];

describe('reads aimed at hidden projects (other user X, agents-off O, ungranted U)', () => {
	it('every external read op is covered by this suite', () => {
		const covered = new Set([...READ_CASES, ...SEARCH_CASES].map((entry) => entry.op));
		const missing = BUILDOS_AGENT_READ_OPS.filter((op) => !covered.has(op));
		expect(missing).toEqual([]);
	});

	for (const project of HIDDEN) {
		for (const entry of READ_CASES) {
			it(`${entry.op} on ${project} fails with no data`, async () => {
				const args = entry.args(project);
				const result = await call(entry.op, args);
				expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(true);
				expectNoLeak(result, args, project === 'X' ? [] : [PROJECT[project].id]);
			});
		}
	}

	for (const entry of SEARCH_CASES) {
		it(`${entry.op}(${JSON.stringify(entry.args)}) never returns hidden rows or names`, async () => {
			const result = await call(entry.op, entry.args);
			expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(false);
			expectNoLeak(result, entry.args);
			// Positive control: the same query does find the shared project's rows.
			if (entry.op !== 'onto.project.search' && entry.op !== 'onto.asset.search') {
				expect(JSON.stringify(result)).toMatch(
					/"S |S owner|S goal|S plan|S milestone|S risk|S asset/
				);
			}
		});
	}

	it('the project list counts ungranted projects and never names them', async () => {
		const result = await call('onto.project.list', {});
		const text = JSON.stringify(result);
		expect(text).toContain('Sam Alpha');
		expect(text).toContain('DJ Readable');
		expect(text).toContain('DJ Writable');
		expectNoLeak(result, {});
	});

	it('linked entities never cross into another project through a legacy edge', async () => {
		const taskLinks = await call('onto.entity.links.get', {
			entity_kind: 'task',
			entity_id: uid('S', 'task')
		});
		expect(failed(taskLinks), JSON.stringify(taskLinks)).toBe(false);
		expectNoLeak(taskLinks, {});
		const goalLinks = await call('onto.entity.links.get', {
			entity_kind: 'goal',
			entity_id: uid('S', 'goal')
		});
		// Positive control: the in-project link still resolves.
		expect(JSON.stringify(goalLinks)).toContain('S owner task');
	});
});

// ---------------------------------------------------------------------------
// Requirement 3: no emails, no other user's identity
// ---------------------------------------------------------------------------

describe('people and identity', () => {
	it('project details and status never carry anyone’s email', async () => {
		for (const op of ['onto.project.get', 'onto.project.status.get'] as const) {
			const result = await call(op, { project_id: PROJECT.S.id });
			expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(false);
			expect(JSON.stringify(result)).not.toMatch(/@example\.com/);
		}
	});

	it('task results never carry assignee emails', async () => {
		const result = await call('onto.task.update', {
			task_id: uid('W', 'task', 3),
			title: 'Renamed by Sam’s agent',
			assignee_actor_ids: [ACTOR.sam]
		});
		expect(JSON.stringify(result)).toContain(ACTOR.sam);
		expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(false);
		expect(JSON.stringify(result)).not.toMatch(/@example\.com/);
	});

	it('no tool takes a user identity argument', () => {
		const tools = getBuildosAgentGatewayTools(scope);
		const identityArgs = tools.flatMap((tool) =>
			Object.keys(
				(tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {}
			)
				.filter((key) =>
					/^(p_)?(user_id|user|owner_user_id|as_user|actor_id|caller_id)$/.test(key)
				)
				.map((key) => `${tool.name}.${key}`)
		);
		expect(identityArgs).toEqual([]);
	});

	it('people tools act only for the connected person and never return emails', async () => {
		db.rpcs.find_person_by_handle = (args) => ({
			data: { found: true, is_self: false, handle: 'dj', name: 'DJ', viewer: args.p_user_id },
			error: null
		});
		db.rpcs.create_people_request = (args) => ({
			data: { status: 'pending', request_id: 'r1', viewer: args.p_user_id },
			error: null
		});
		db.rpcs.list_people_requests = () => ({
			data: {
				incoming: [
					{
						id: 'r2',
						note: 'hi',
						from: { name: null, handle: null, email: 'eve-secret@example.com' }
					}
				],
				outgoing: [{ id: 'r1', status: 'pending', to: { name: 'DJ', handle: 'dj' } }]
			},
			error: null
		});
		const run = (toolName: string, args: Record<string, unknown>) =>
			executeBuildosAgentGatewayTool({
				credential: { kind: 'key', caller_id: CALLER, token_hash: 'hash' },
				admin: db,
				userId: USER.sam,
				callerId: CALLER,
				scope,
				toolName,
				arguments: args
			});
		await run('find_buildos_person', { handle: '@dj', user_id: USER.eve });
		await run('request_buildos_access', { handle: '@dj', user_id: USER.eve });
		for (const rpc of db.rpcCalls.filter((entry) =>
			['find_person_by_handle', 'create_people_request', 'list_people_requests'].includes(
				entry.name
			)
		)) {
			expect(rpc.args.p_user_id).toBe(USER.sam);
		}
		const listed = await run('list_buildos_people', {});
		const text = JSON.stringify(listed);
		expect(text).not.toMatch(/@example\.com/);
		expect(text).not.toMatch(/SECRET/);
		expect(text).toContain('DJ Readable');
		// O is shared with Sam but DJ turned his agents off: counted apart from projects
		// Sam could still grant (a grant can't help there), and never named.
		expect(
			(listed.result as Record<string, unknown>).shared_but_not_given_to_this_connection
		).toBeUndefined();
		expect((listed.result as Record<string, unknown>).owners_turned_agents_off).toBe(1);
		// DJ's actor is named after his email; the tool says "Someone" instead.
		expect(text).toContain('Someone');
	});
});

// ---------------------------------------------------------------------------
// Requirement 2 + 4: writes aimed at projects the agent may not write
// ---------------------------------------------------------------------------

const WRITE_CASES: Case[] = [
	{ op: 'onto.task.create', args: (p) => ({ project_id: PROJECT[p].id, title: 'x' }) },
	{ op: 'onto.task.update', args: (p) => ({ task_id: uid(p, 'task'), title: 'x' }) },
	{
		op: 'onto.task.docs.create_or_attach',
		args: (p) => ({ task_id: uid(p, 'task'), title: 'x', content: 'x' })
	},
	{ op: 'onto.document.create', args: (p) => ({ project_id: PROJECT[p].id, title: 'x' }) },
	{ op: 'onto.document.update', args: (p) => ({ document_id: uid(p, 'doc'), title: 'x' }) },
	{
		op: 'onto.document.tree.move',
		args: (p) => ({ project_id: PROJECT[p].id, document_id: uid(p, 'doc'), new_position: 0 })
	},
	{ op: 'onto.project.update', args: (p) => ({ project_id: PROJECT[p].id, name: 'x' }) },
	{ op: 'onto.goal.create', args: (p) => ({ project_id: PROJECT[p].id, name: 'x' }) },
	{ op: 'onto.goal.update', args: (p) => ({ goal_id: uid(p, 'goal'), name: 'x' }) },
	{ op: 'onto.plan.create', args: (p) => ({ project_id: PROJECT[p].id, name: 'x' }) },
	{ op: 'onto.plan.update', args: (p) => ({ plan_id: uid(p, 'plan'), name: 'x' }) },
	{
		op: 'onto.milestone.create',
		args: (p) => ({ project_id: PROJECT[p].id, title: 'x', goal_id: uid(p, 'goal') })
	},
	{
		op: 'onto.milestone.update',
		args: (p) => ({ milestone_id: uid(p, 'milestone'), title: 'x' })
	},
	{ op: 'onto.risk.create', args: (p) => ({ project_id: PROJECT[p].id, title: 'x' }) },
	{ op: 'onto.risk.update', args: (p) => ({ risk_id: uid(p, 'risk'), title: 'x' }) },
	{
		op: 'onto.edge.link',
		args: (p) => ({
			src_kind: 'goal',
			src_id: uid(p, 'goal'),
			dst_kind: 'task',
			dst_id: uid(p, 'task'),
			rel: 'supports_goal'
		})
	},
	{ op: 'onto.edge.unlink', args: (p) => ({ edge_id: uid(p, 'edge') }) },
	{ op: 'onto.asset.update', args: (p) => ({ asset_id: uid(p, 'asset'), title: 'x' }) },
	{
		op: 'onto.table.create',
		args: (p) => ({
			project_id: PROJECT[p].id,
			title: 'x',
			columns: [{ key: 'a', label: 'A', type: 'text' }]
		})
	},
	{ op: 'onto.table.update', args: (p) => ({ table_id: uid(p, 'table'), title: 'x' }) },
	{
		op: 'onto.table.rows.update',
		args: (p) => ({ table_id: uid(p, 'table'), delete: ['r1'] })
	},
	{
		op: 'cal.event.create',
		args: (p) => ({
			project_id: PROJECT[p].id,
			title: 'x',
			start_at: '2026-10-24T10:00:00Z',
			end_at: '2026-10-24T11:00:00Z'
		})
	},
	{ op: 'cal.event.update', args: (p) => ({ onto_event_id: uid(p, 'event'), title: 'x' }) },
	{ op: 'cal.event.delete', args: (p) => ({ onto_event_id: uid(p, 'event') }) },
	{ op: 'cal.project.set', args: (p) => ({ project_id: PROJECT[p].id, calendar_id: 'primary' }) }
];

describe('writes aimed at projects the agent may not write (X, O, U, read-only S)', () => {
	it('every external write op except project.create is covered', () => {
		const covered = new Set(WRITE_CASES.map((entry) => entry.op));
		const missing = BUILDOS_AGENT_WRITE_OPS.filter(
			(op) => op !== 'onto.project.create' && !covered.has(op)
		);
		expect(missing).toEqual([]);
	});

	for (const project of READ_ONLY_OR_HIDDEN) {
		for (const entry of WRITE_CASES) {
			it(`${entry.op} on ${project} is refused and changes nothing`, async () => {
				const args = entry.args(project);
				const result = await call(entry.op, args);
				expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(true);
				expectNoLeak(result, args, project === 'X' ? [] : [PROJECT[project].id]);
				expectNoWritesTo(READ_ONLY_OR_HIDDEN);
			});
		}
	}
});

describe('cross-project reference tricks from Sam’s own project', () => {
	it('a doc created in A under an X parent lands in A and never touches X', async () => {
		const args = { project_id: PROJECT.A.id, title: 'd', parent_document_id: uid('X', 'doc') };
		const result = await call('onto.document.create', args);
		expectNoLeak(result, args);
		expectNoWritesTo(READ_ONLY_OR_HIDDEN);
		for (const write of db.writes.filter((entry) => entry.table === 'onto_documents')) {
			for (const row of write.rows) expect(row.project_id).toBe(PROJECT.A.id);
		}
	});

	const TRICKS: Array<{
		name: string;
		op: BuildosAgentAllowedOp;
		args: Record<string, unknown>;
	}> = [
		{
			name: 'task in A linked to X goal',
			op: 'onto.task.create',
			args: { project_id: PROJECT.A.id, title: 't', goal_id: uid('X', 'goal') }
		},
		{
			name: 'task in A under S milestone',
			op: 'onto.task.create',
			args: {
				project_id: PROJECT.A.id,
				title: 't',
				supporting_milestone_id: uid('S', 'milestone')
			}
		},
		{
			name: 'task in A in X plan',
			op: 'onto.task.create',
			args: { project_id: PROJECT.A.id, title: 't', plan_id: uid('X', 'plan') }
		},
		{
			name: 'A task re-pointed at X goal',
			op: 'onto.task.update',
			args: { task_id: uid('A', 'task'), goal_id: uid('X', 'goal') }
		},
		{
			name: 'X doc attached to A task',
			op: 'onto.task.docs.create_or_attach',
			args: { task_id: uid('A', 'task'), document_id: uid('X', 'doc') }
		},
		{
			name: 'S doc attached to A task',
			op: 'onto.task.docs.create_or_attach',
			args: { task_id: uid('A', 'task'), document_id: uid('S', 'doc') }
		},

		{
			name: 'X doc moved into A tree',
			op: 'onto.document.tree.move',
			args: { project_id: PROJECT.A.id, document_id: uid('X', 'doc'), new_position: 0 }
		},
		{
			name: 'A doc moved under S doc',
			op: 'onto.document.tree.move',
			args: {
				project_id: PROJECT.A.id,
				document_id: uid('A', 'doc'),
				new_parent_id: uid('S', 'doc'),
				new_position: 0
			}
		},
		{
			name: 'edge from A task to S task',
			op: 'onto.edge.link',
			args: {
				src_kind: 'task',
				src_id: uid('A', 'task'),
				dst_kind: 'task',
				dst_id: uid('S', 'task'),
				rel: 'depends_on'
			}
		},
		{
			name: 'edge from A task to X task',
			op: 'onto.edge.link',
			args: {
				src_kind: 'task',
				src_id: uid('A', 'task'),
				dst_kind: 'task',
				dst_id: uid('X', 'task'),
				rel: 'depends_on'
			}
		},
		{
			name: 'plan in A under X goal',
			op: 'onto.plan.create',
			args: { project_id: PROJECT.A.id, name: 'p', goal_id: uid('X', 'goal') }
		},
		{
			name: 'milestone in A under S goal',
			op: 'onto.milestone.create',
			args: { project_id: PROJECT.A.id, title: 'm', goal_id: uid('S', 'goal') }
		},
		{
			name: 'calendar event in A for an X task',
			op: 'cal.event.create',
			args: {
				project_id: PROJECT.A.id,
				task_id: uid('X', 'task'),
				title: 'e',
				start_at: '2026-10-24T10:00:00Z',
				end_at: '2026-10-24T11:00:00Z'
			}
		},
		{
			name: 'asset in A filed under an X document',
			op: 'onto.asset.update',
			args: { asset_id: uid('A', 'asset'), document_id: uid('X', 'doc') }
		},
		{
			name: 'assignee handle outside the project',
			op: 'onto.task.create',
			args: { project_id: PROJECT.A.id, title: 't', assignee_handles: ['@eve'] }
		},
		{
			name: 'assignee actor id outside the project',
			op: 'onto.task.create',
			args: { project_id: PROJECT.A.id, title: 't', assignee_actor_ids: [ACTOR.eve] }
		}
	];

	for (const trick of TRICKS) {
		it(`${trick.name} is refused and leaves no trace`, async () => {
			const result = await call(trick.op, trick.args);
			expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(true);
			expectNoLeak(result, trick.args);
			expectNoWritesTo(READ_ONLY_OR_HIDDEN);
			// A refused call leaves no half-made row in Sam's own project either.
			const created = db.writes.filter(
				(write) =>
					write.kind === 'insert' &&
					[
						'onto_tasks',
						'onto_plans',
						'onto_milestones',
						'onto_documents',
						'onto_edges'
					].includes(write.table)
			);
			expect(created, JSON.stringify(created)).toEqual([]);
		});
	}
});

// ---------------------------------------------------------------------------
// Requirement 4: the guest lane in W (DJ allows Sam's agents to write)
// ---------------------------------------------------------------------------

describe('guest lane in DJ’s writable project W', () => {
	it('creates tasks and documents', async () => {
		const task = await call('onto.task.create', {
			project_id: PROJECT.W.id,
			title: 'From Sam'
		});
		expect(failed(task), JSON.stringify(task).slice(0, 400)).toBe(false);
		const doc = await call('onto.document.create', {
			project_id: PROJECT.W.id,
			title: 'Notes'
		});
		expect(failed(doc), JSON.stringify(doc).slice(0, 400)).toBe(false);
	});

	it('changes a task Sam created and a task he is assigned to', async () => {
		const own = await call('onto.task.update', { task_id: uid('W', 'task', 2), title: 'Mine' });
		expect(failed(own), JSON.stringify(own).slice(0, 400)).toBe(false);
		const assigned = await call('onto.task.update', {
			task_id: uid('W', 'task', 3),
			state_key: 'in_progress'
		});
		expect(failed(assigned), JSON.stringify(assigned).slice(0, 400)).toBe(false);
	});

	it('changes a document Sam created', async () => {
		const result = await call('onto.document.update', {
			document_id: uid('W', 'doc', 2),
			content: '# Updated by Sam'
		});
		expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(false);
	});

	const REFUSED: Array<{
		name: string;
		op: BuildosAgentAllowedOp;
		args: Record<string, unknown>;
	}> = [
		{
			name: 'edit DJ’s task',
			op: 'onto.task.update',
			args: { task_id: uid('W', 'task', 1), title: 'x' }
		},
		{
			name: 'edit DJ’s doc',
			op: 'onto.document.update',
			args: { document_id: uid('W', 'doc', 1), title: 'x' }
		},
		{
			name: 'archive (soft delete) DJ’s task Sam is assigned to',
			op: 'onto.task.update',
			args: { task_id: uid('W', 'task', 3), archived: true }
		},
		{
			name: 'archive Sam’s own task in DJ’s project',
			op: 'onto.task.update',
			args: { task_id: uid('W', 'task', 2), archived: true }
		},
		{
			name: 'archive Sam’s own doc in DJ’s project',
			op: 'onto.document.update',
			args: { document_id: uid('W', 'doc', 2), archived: true }
		},
		{
			name: 'turn Sam’s doc into the project START HERE',
			op: 'onto.document.update',
			args: { document_id: uid('W', 'doc', 2), type_key: 'document.context.project' }
		},
		{
			name: 'attach DJ’s doc to Sam’s task',
			op: 'onto.task.docs.create_or_attach',
			args: { task_id: uid('W', 'task', 2), document_id: uid('W', 'doc', 1) }
		},
		{
			name: 'create a goal',
			op: 'onto.goal.create',
			args: { project_id: PROJECT.W.id, name: 'g' }
		},
		{
			name: 'edit DJ’s goal',
			op: 'onto.goal.update',
			args: { goal_id: uid('W', 'goal'), name: 'g' }
		},
		{
			name: 'create a plan',
			op: 'onto.plan.create',
			args: { project_id: PROJECT.W.id, name: 'p' }
		},
		{
			name: 'create a risk',
			op: 'onto.risk.create',
			args: { project_id: PROJECT.W.id, title: 'r' }
		},
		{
			name: 'create a milestone',
			op: 'onto.milestone.create',
			args: { project_id: PROJECT.W.id, title: 'm', goal_id: uid('W', 'goal') }
		},
		{
			name: 'rename the project',
			op: 'onto.project.update',
			args: { project_id: PROJECT.W.id, name: 'p' }
		},
		{
			name: 'link two W entities',
			op: 'onto.edge.link',
			args: {
				src_kind: 'goal',
				src_id: uid('W', 'goal'),
				dst_kind: 'task',
				dst_id: uid('W', 'task', 2),
				rel: 'supports_goal'
			}
		},
		{ name: 'unlink a W edge', op: 'onto.edge.unlink', args: { edge_id: uid('W', 'edge') } },
		{
			name: 'move a doc in W’s tree',
			op: 'onto.document.tree.move',
			args: { project_id: PROJECT.W.id, document_id: uid('W', 'doc', 2), new_position: 0 }
		},
		{
			name: 'create a table',
			op: 'onto.table.create',
			args: {
				project_id: PROJECT.W.id,
				title: 't',
				columns: [{ key: 'a', label: 'A', type: 'text' }]
			}
		},
		{
			name: 'edit DJ’s table rows',
			op: 'onto.table.rows.update',
			args: { table_id: uid('W', 'table'), delete: ['r1'] }
		},
		{
			name: 'edit an asset',
			op: 'onto.asset.update',
			args: { asset_id: uid('W', 'asset'), title: 'a' }
		},
		{
			name: 'create a calendar event',
			op: 'cal.event.create',
			args: {
				project_id: PROJECT.W.id,
				title: 'e',
				start_at: '2026-10-24T10:00:00Z',
				end_at: '2026-10-24T11:00:00Z'
			}
		},
		{
			name: 'delete a W event',
			op: 'cal.event.delete',
			args: { onto_event_id: uid('W', 'event') }
		},
		{
			name: 'set the W calendar',
			op: 'cal.project.set',
			args: { project_id: PROJECT.W.id, calendar_id: 'primary' }
		}
	];

	for (const entry of REFUSED) {
		it(`refuses: ${entry.name}`, async () => {
			const result = await call(entry.op, entry.args);
			expect(failed(result), JSON.stringify(result).slice(0, 400)).toBe(true);
			expectNoWritesTo(['W', ...READ_ONLY_OR_HIDDEN]);
		});
	}
});

// ---------------------------------------------------------------------------
// Latent: agent permission requests (feature flag off in production today)
// ---------------------------------------------------------------------------

describe('permission requests never reach into someone else’s project', () => {
	it('refuses a request to edit DJ’s task even when the feature is on', async () => {
		db.table('agent_permission_feature')[0]!.enabled = true;
		const result = await executeBuildosAgentGatewayTool({
			credential: { kind: 'key', caller_id: CALLER, token_hash: 'hash' },
			admin: db,
			userId: USER.sam,
			callerId: CALLER,
			scope,
			toolName: 'request_buildos_permission',
			arguments: {
				proposal: { kind: 'task', target_id: uid('S', 'task'), changes: { title: 'x' } },
				idempotency_key: 'perm-1'
			}
		});
		expect(failed(result), JSON.stringify(result)).toBe(true);
		expect(JSON.stringify(result)).toMatch(/projects your person owns/);
		expect(db.rpcCalls.map((rpc) => rpc.name)).not.toContain('create_agent_permission_request');
	});
});

// ---------------------------------------------------------------------------
// Tasker 140: every wall says what's in the way, who can clear it, and the one step
// ---------------------------------------------------------------------------

function accessNeeded(result: Record<string, unknown>): Record<string, any> {
	const error = (result.error ?? {}) as Record<string, any>;
	return (error.details?.access_needed ?? null) as Record<string, any>;
}

async function rescope(mode: 'read_only' | 'read_write' = 'read_write') {
	scope = (await resolveEffectiveAgentProjectScope({
		admin: db,
		userId: USER.sam,
		callerId: CALLER,
		projectScopeMode: 'selected',
		scope: { mode }
	})) as typeof scope;
	db.writes.length = 0;
	db.rpcCalls.length = 0;
}

function samMembership(project: ProjectKey): FakeRow {
	const row = db
		.table('onto_project_members')
		.find((entry) => entry.project_id === PROJECT[project].id && entry.actor_id === ACTOR.sam);
	if (!row) throw new Error(`no membership in ${project}`);
	return row;
}

const GRANT_PAGE = `https://build-os.com/profile/agent-keys/${CALLER}/grant`;

describe('access walls (tasker 140)', () => {
	it('wall 1: a project this connection was never given links to a one-tap grant, unnamed', async () => {
		const args = { project_id: PROJECT.U.id };
		const result = await call('onto.project.get', args);
		const wall = accessNeeded(result);
		expect(wall).toMatchObject({
			wall: 'project_not_granted',
			who_can_fix: 'you',
			project_id: PROJECT.U.id,
			next: { open_url: `${GRANT_PAGE}?project=${PROJECT.U.id}` }
		});
		expect(wall).not.toHaveProperty('project_name');
		expect(wall).not.toHaveProperty('link');
		expect(wall.say_to_user).toMatch(/Tap the link/);
		expectNoLeak(result, args);
	});

	it('wall 3: agents turned off by the owner says so, offers to ask, and never a grant link', async () => {
		const readArgs = { project_id: PROJECT.O.id };
		const read = await call('onto.project.get', readArgs);
		const wall = accessNeeded(read);
		expect(wall).toMatchObject({
			wall: 'owner_turned_agents_off',
			who_can_fix: 'owner',
			project_id: PROJECT.O.id,
			need: 'agents_read',
			next: {
				tool: 'request_project_access',
				args: { project_id: PROJECT.O.id, need: 'agents_read' },
				ask_your_person_first: true
			}
		});
		expect(wall).not.toHaveProperty('project_name');
		// DJ's only name is his email, so he is "the owner" here.
		expect(wall).not.toHaveProperty('owner_name');
		expect(wall.say_to_user).toMatch(/^The owner turned off agents for you/);
		expect((read.error as Record<string, any>).details.grant_url).toBeUndefined();
		expectNoLeak(read, readArgs);

		const writeArgs = { project_id: PROJECT.O.id, title: 'x' };
		const write = await call('onto.task.create', writeArgs);
		expect(accessNeeded(write)).toMatchObject({
			wall: 'owner_turned_agents_off',
			need: 'agents_write'
		});
		expectNoLeak(write, writeArgs);
		expectNoWritesTo(READ_ONLY_OR_HIDDEN);
	});

	it('wall 5: a viewer’s agent is told to ask the owner to make them an editor', async () => {
		const result = await call('onto.task.create', { project_id: PROJECT.S.id, title: 'x' });
		expect(accessNeeded(result)).toMatchObject({
			wall: 'viewer_only',
			who_can_fix: 'owner',
			project_name: 'DJ Readable',
			need: 'edit',
			next: {
				tool: 'request_project_access',
				args: { project_id: PROJECT.S.id, need: 'edit' }
			}
		});
		expectNoWritesTo(READ_ONLY_OR_HIDDEN);
	});

	it('wall 5 also catches an edit routed past the permission-request path', async () => {
		const result = await call('onto.task.update', { task_id: uid('S', 'task', 1), title: 'x' });
		expect(failed(result)).toBe(true);
		expect(accessNeeded(result)).toMatchObject({ wall: 'viewer_only', need: 'edit' });
		expect(JSON.stringify(result)).not.toMatch(/not enabled for this BuildOS deployment/);
		expectNoWritesTo(READ_ONLY_OR_HIDDEN);
	});

	it('wall 4: agents on Read asks for changes; standing approval clears it, Off still wins', async () => {
		samMembership('W').agent_access = 'read';
		await rescope();
		const refused = await call('onto.task.create', { project_id: PROJECT.W.id, title: 'x' });
		expect(accessNeeded(refused)).toMatchObject({
			wall: 'owner_allows_read_only',
			who_can_fix: 'owner',
			project_name: 'DJ Writable',
			need: 'agents_write'
		});

		db.table('project_agent_settings').push({
			project_id: PROJECT.W.id,
			editor_agents_write: true,
			updated_at: NOW
		});
		await rescope();
		const allowed = await call('onto.task.create', { project_id: PROJECT.W.id, title: 'x' });
		expect(failed(allowed), JSON.stringify(allowed).slice(0, 400)).toBe(false);

		samMembership('W').agent_access = 'off';
		await rescope();
		const off = await call('onto.task.create', { project_id: PROJECT.W.id, title: 'x' });
		expect(accessNeeded(off)).toMatchObject({ wall: 'owner_turned_agents_off' });
	});

	it('wall 2: a read-only grant on a read+write connection links to "allow changes"', async () => {
		const grant = db
			.table('external_agent_project_permissions')
			.find((row) => row.project_id === PROJECT.A.id);
		grant!.access_mode = 'read_only';
		await rescope();
		const result = await call('onto.task.create', { project_id: PROJECT.A.id, title: 'x' });
		expect(accessNeeded(result)).toMatchObject({
			wall: 'connection_read_only',
			who_can_fix: 'you',
			project_name: 'Sam Alpha',
			next: { open_url: `${GRANT_PAGE}?project=${PROJECT.A.id}&need=write` }
		});
	});

	it('wall 2: a read-only connection calling a write tool gets the same link', async () => {
		await rescope('read_only');
		const result = await call('onto.task.create', { project_id: PROJECT.A.id, title: 'x' });
		expect(accessNeeded(result)).toMatchObject({
			wall: 'connection_read_only',
			who_can_fix: 'you',
			project_id: PROJECT.A.id,
			next: { open_url: `${GRANT_PAGE}?project=${PROJECT.A.id}&need=write` }
		});
		expect(accessNeeded(result).say_to_user).toMatch(/can only read/);
		expectNoWritesTo(['A', ...READ_ONLY_OR_HIDDEN]);
	});

	it('wall 6: outside the guest lane explains itself and asks nobody', async () => {
		const result = await call('onto.task.update', { task_id: uid('W', 'task', 1), title: 'x' });
		const wall = accessNeeded(result);
		expect(wall).toMatchObject({
			wall: 'outside_guest_lane',
			who_can_fix: 'nobody',
			project_name: 'DJ Writable',
			next: null
		});
		expect(wall.say_to_user).toMatch(/assign it to you/);

		const archive = await call('onto.task.update', {
			task_id: uid('W', 'task', 2),
			archived: true
		});
		expect(accessNeeded(archive).say_to_user).toMatch(/can't archive or restore/);
		expectNoWritesTo(['W', ...READ_ONLY_OR_HIDDEN]);
	});

	it('wall 7: the daily cap pauses and says the owner was told', async () => {
		const recent = new Date().toISOString();
		for (let n = 0; n < 50; n += 1) {
			db.table('onto_project_logs').push({
				id: `fb000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
				project_id: PROJECT.W.id,
				external_agent_caller_id: CALLER,
				created_at: recent
			});
		}
		const result = await call('onto.task.create', { project_id: PROJECT.W.id, title: 'x' });
		expect(accessNeeded(result)).toMatchObject({
			wall: 'daily_limit',
			who_can_fix: 'nobody',
			next: null
		});
		expect(accessNeeded(result).say_to_user).toMatch(/paused until tomorrow/);
	});

	it('the shared-projects toggle lets shared projects in without a grant; agents-off stays out', async () => {
		db.tables.external_agent_project_permissions = db
			.table('external_agent_project_permissions')
			.filter((row) => row.project_id !== PROJECT.S.id && row.project_id !== PROJECT.W.id);
		await rescope();
		expect(scope.project_ids).not.toContain(PROJECT.S.id);

		db.table('external_agent_callers')[0]!.include_shared_projects = true;
		await rescope();
		expect(scope.project_ids).toEqual(expect.arrayContaining([PROJECT.S.id, PROJECT.W.id]));
		expect(scope.write_project_ids).toContain(PROJECT.W.id);
		expect(scope.write_project_ids).not.toContain(PROJECT.S.id);
		expect(scope.project_ids).not.toContain(PROJECT.O.id);
		expect(scope.owner_blocked_project_ids).toEqual([PROJECT.O.id]);
	});
});

describe('asking the owner and checking back (tasker 140)', () => {
	const people = (toolName: string, args: Record<string, unknown>) =>
		executeBuildosAgentGatewayTool({
			credential: { kind: 'key', caller_id: CALLER, token_hash: 'hash' },
			admin: db,
			userId: USER.sam,
			callerId: CALLER,
			scope,
			toolName,
			arguments: args,
			connectorOrigin: 'https://build-os.com'
		});

	it('check_project_access names the wall and its one step, and hides what it must', async () => {
		const blocked = await people('check_project_access', { project_id: PROJECT.O.id });
		expect(blocked.result).toMatchObject({
			status: 'needs_owner',
			access_needed: { wall: 'owner_turned_agents_off', need: 'agents_write' }
		});
		const mine = await people('check_project_access', { project_id: PROJECT.U.id });
		expect(mine.result).toMatchObject({
			status: 'needs_you',
			access_needed: { next: { open_url: `${GRANT_PAGE}?project=${PROJECT.U.id}` } }
		});
		const ready = await people('check_project_access', { project_id: PROJECT.W.id });
		expect(ready.result).toMatchObject({ status: 'ready', can_write: true });
		const stranger = await people('check_project_access', { project_id: PROJECT.X.id });
		expect(stranger.result).toMatchObject({ status: 'not_found' });
		for (const result of [blocked, mine, stranger]) {
			expect(JSON.stringify(result)).not.toMatch(/SECRET|@example\.com/);
		}
	});

	it('request_project_access asks as this person and connection; check then says waiting', async () => {
		db.rpcs.create_project_upgrade_request = (args) => {
			db.table('people_requests').push({
				id: 'fr000000-0000-4000-8000-000000000001',
				from_user_id: args.p_user_id,
				to_user_id: USER.dj,
				kind: 'upgrade',
				status: 'pending',
				created_at: NOW,
				expires_at: '2999-01-01T00:00:00.000Z',
				requested_items: [{ project_id: PROJECT.O.id, need: 'agents_write' }]
			});
			return {
				data: { status: 'pending', request_id: 'fr000000-0000-4000-8000-000000000001' },
				error: null
			};
		};
		const sent = await people('request_project_access', {
			project_id: PROJECT.O.id,
			need: 'agents_write',
			note: 'Need to update the launch task'
		});
		expect(sent.result).toMatchObject({ status: 'sent' });
		const rpc = db.rpcCalls.find((entry) => entry.name === 'create_project_upgrade_request');
		expect(rpc?.args).toMatchObject({
			p_project_ids: [PROJECT.O.id],
			p_need: 'agents_write',
			p_user_id: USER.sam,
			p_caller_id: CALLER
		});
		expect(JSON.stringify(sent)).not.toMatch(/SECRET|@example\.com/);

		const waiting = await people('check_project_access', { project_id: PROJECT.O.id });
		expect(waiting.result).toMatchObject({ status: 'waiting_on_owner' });
	});

	it('request_project_access never takes another person or a non-UUID project', async () => {
		const bad = await people('request_project_access', {
			project_id: 'not-a-uuid',
			need: 'agents_write'
		});
		expect(failed(bad)).toBe(true);
		const tool = getBuildosAgentGatewayTools(scope).find(
			(entry) => entry.name === 'request_project_access'
		);
		expect(Object.keys(tool?.inputSchema?.properties ?? {})).not.toContain('user_id');
	});
});
