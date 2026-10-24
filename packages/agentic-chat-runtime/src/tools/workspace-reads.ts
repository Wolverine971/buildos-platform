// packages/agentic-chat-runtime/src/tools/workspace-reads.ts
//
// The Workspace tools (tasker 146, Phase 2). The Workspace is the user's private
// holding ground for loose notes, docs and tasks: an onto_projects row with
// kind 'workspace' (one per person; docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md).
// A background job (`workspace_suggest`) writes `workspace_suggestions`: "file" (this
// loose item belongs in project X) and "graduate" (these look like a new project).
//
// - `list_workspace_suggestions`: the user's open suggestions, items resolved to titles.
// - `propose_workspace_filing` / `propose_workspace_project`: a proposal card. Nothing
//   here writes: the agent suggests and never files, and only the user's click on the
//   card moves items or creates a project (the web runs the Workspace's Organize mover
//   under the user's own session; apps/web/src/lib/server/proposal-cards).
//
// The Workspace is found from the acting user's actor (`created_by`), never from model
// arguments, and every item must be live in that Workspace. The worker reads with a
// service-role client, so the user filters here are the only barrier: keep them.
// `loadWorkspaceItemsV1` is shared with the web's click-time re-check so both sides
// build the same card view (and so the same visibleDigest).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	NOTE_TYPE_KEY,
	WORKSPACE_NAME
} from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import {
	buildProposalCardEnvelopeV1,
	buildProposalCardNonCardResultV1,
	cleanWorkspaceCardText,
	cleanWorkspaceProjectName,
	WORKSPACE_CARD_ITEM_LIMIT,
	WORKSPACE_CARD_REASON_MAX,
	WORKSPACE_FILE_TOOL_NAME,
	WORKSPACE_PROJECT_DESCRIPTION_MAX,
	WORKSPACE_PROJECT_MIN_ITEMS,
	WORKSPACE_PROJECT_TOOL_NAME,
	workspaceItemCountLabel,
	workspaceItemKey,
	type ProposalCardKind,
	type ProposalCardNonCardResultV1,
	type WorkspaceFileProposalPayloadV1,
	type WorkspaceItemEntity,
	type WorkspaceItemKeyV1,
	type WorkspaceItemV1,
	type WorkspaceProjectProposalPayloadV1
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { AgenticChatToolAccessDeniedError } from './access-port';
import type { AgenticChatSharedReadContextV1 } from './ontology-reads';
import type { AgenticChatProposalCardContextV1, ProposalToolResultV1 } from './proposal-reads';

// The card contract's UUID shape (card-fields.ts): arguments must match it exactly,
// or the web resolver's argument check could not match the payload.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pinned docs (START HERE, the thinking log) never leave their project. */
const PINNED_DOCUMENT_TYPE_PREFIX = 'document.context.';
const SUGGESTION_LIST_LIMIT = 20;
/** Rows read before dropping the ones whose items left the Workspace. */
const SUGGESTION_SCAN_LIMIT = 40;

type Client = SupabaseClient<Database>;

/** No arguments: the Workspace comes from the turn's user, never from the model. */
export type SharedListWorkspaceSuggestionsArgs = Record<string, never>;

export interface SharedProposeWorkspaceFilingArgs {
	items: Array<{ entity: WorkspaceItemEntity; id: string }>;
	target_project_id: string;
	suggestion_id?: string;
	reason?: string;
}

export interface SharedProposeWorkspaceProjectArgs {
	name: string;
	description?: string;
	items: Array<{ entity: WorkspaceItemEntity; id: string }>;
	suggestion_id?: string;
}

export type WorkspaceRefV1 = { id: string; name: string };

export type WorkspaceItemsViewV1 = {
	/** Live loose items, in the order asked for. */
	items: WorkspaceItemV1[];
	/** Asked-for items that are not live in this Workspace (moved, deleted, archived, pinned). */
	missing: WorkspaceItemKeyV1[];
	/** Live docs nested inside a moving doc that come along with it. */
	nested_documents: number;
};

function withSignal<Q>(query: Q, signal: AbortSignal | undefined): Q {
	const candidate = query as { abortSignal?: (signal: AbortSignal) => Q };
	return signal && typeof candidate.abortSignal === 'function'
		? candidate.abortSignal(signal)
		: query;
}

type DocRow = {
	id: string;
	title: string | null;
	type_key: string | null;
	project_id: string | null;
	state_key: string | null;
	deleted_at: string | null;
	archived_at: string | null;
};
type TaskRow = {
	id: string;
	title: string | null;
	project_id: string | null;
	deleted_at: string | null;
	archived_at: string | null;
};
type TreeNode = { id?: unknown; children?: unknown };

/** The loose-item rule the Workspace shelf applies: not deleted, archived, or pinned. */
function isLiveDoc(row: DocRow | undefined, workspaceId: string): row is DocRow {
	return Boolean(
		row &&
			row.project_id?.toLowerCase() === workspaceId &&
			!row.deleted_at &&
			!row.archived_at &&
			row.state_key !== 'archived' &&
			!(row.type_key ?? '').startsWith(PINNED_DOCUMENT_TYPE_PREFIX)
	);
}

function isLiveTask(row: TaskRow | undefined, workspaceId: string): row is TaskRow {
	return Boolean(
		row && row.project_id?.toLowerCase() === workspaceId && !row.deleted_at && !row.archived_at
	);
}

function docItem(row: DocRow): WorkspaceItemV1 {
	const note = row.type_key === NOTE_TYPE_KEY;
	return {
		entity: 'document',
		id: row.id.toLowerCase(),
		kind: note ? 'note' : 'doc',
		title: row.title?.trim() || (note ? 'Untitled note' : 'Untitled doc')
	};
}

function taskItem(row: TaskRow): WorkspaceItemV1 {
	return {
		entity: 'task',
		id: row.id.toLowerCase(),
		kind: 'task',
		title: row.title?.trim() || 'Untitled task'
	};
}

/** Every doc id under the moving docs in the Workspace tree, the moving ones aside. */
function descendantDocIds(structure: unknown, moving: ReadonlySet<string>): string[] {
	const root = (structure as { root?: unknown } | null)?.root;
	const found = new Set<string>();
	const seen = new Set<string>();
	const walk = (nodes: unknown, inside: boolean) => {
		if (!Array.isArray(nodes)) return;
		for (const node of nodes as TreeNode[]) {
			const id = typeof node?.id === 'string' ? node.id.toLowerCase() : null;
			if (!id || seen.has(id)) continue;
			seen.add(id);
			const movingHere = moving.has(id);
			if (inside && !movingHere) found.add(id);
			walk(node.children, inside || movingHere);
		}
	};
	walk(root, false);
	return [...found];
}

/**
 * Reads the asked-for items and keeps the ones that are live loose items in this
 * Workspace, plus how many live docs sit inside the moving docs. Works with the
 * worker's service client and the web's user client alike: every row is checked
 * against `workspaceProjectId`, which the caller resolved for the acting user.
 */
export async function loadWorkspaceItemsV1(
	client: Client,
	input: {
		workspaceProjectId: string;
		items: readonly WorkspaceItemKeyV1[];
		countNested?: boolean;
		signal?: AbortSignal;
	}
): Promise<WorkspaceItemsViewV1> {
	const workspaceId = input.workspaceProjectId.toLowerCase();
	const docIds = input.items.filter((item) => item.entity === 'document').map((i) => i.id);
	const taskIds = input.items.filter((item) => item.entity === 'task').map((i) => i.id);
	const countNested = input.countNested !== false && docIds.length > 0;
	const none = Promise.resolve({ data: [] as unknown[], error: null });
	const [docs, tasks, project] = await Promise.all([
		docIds.length
			? withSignal(
					client
						.from('onto_documents')
						.select(
							'id, title, type_key, project_id, state_key, deleted_at, archived_at'
						)
						.in('id', docIds),
					input.signal
				)
			: none,
		taskIds.length
			? withSignal(
					client
						.from('onto_tasks')
						.select('id, title, project_id, deleted_at, archived_at')
						.in('id', taskIds),
					input.signal
				)
			: none,
		countNested
			? withSignal(
					client.from('onto_projects').select('doc_structure').eq('id', workspaceId),
					input.signal
				)
			: none
	]);
	if (docs.error) throw new Error(`Could not load the Workspace docs: ${docs.error.message}`);
	if (tasks.error) throw new Error(`Could not load the Workspace tasks: ${tasks.error.message}`);
	if (project.error)
		throw new Error(`Could not load the Workspace tree: ${project.error.message}`);

	const docRows = new Map(
		((docs.data ?? []) as DocRow[]).map((row) => [row.id.toLowerCase(), row])
	);
	const taskRows = new Map(
		((tasks.data ?? []) as TaskRow[]).map((row) => [row.id.toLowerCase(), row])
	);
	const items: WorkspaceItemV1[] = [];
	const missing: WorkspaceItemKeyV1[] = [];
	for (const ref of input.items) {
		const id = ref.id.toLowerCase();
		if (ref.entity === 'document') {
			const row = docRows.get(id);
			if (isLiveDoc(row, workspaceId)) items.push(docItem(row));
			else missing.push({ entity: 'document', id });
		} else {
			const row = taskRows.get(id);
			if (isLiveTask(row, workspaceId)) items.push(taskItem(row));
			else missing.push({ entity: 'task', id });
		}
	}

	let nested = 0;
	const movingDocs = new Set(items.filter((i) => i.entity === 'document').map((i) => i.id));
	const tree = ((project.data ?? []) as Array<{ doc_structure?: unknown }>)[0]?.doc_structure;
	const under = countNested && movingDocs.size ? descendantDocIds(tree, movingDocs) : [];
	if (under.length) {
		const { data, error } = await withSignal(
			client
				.from('onto_documents')
				.select('id, title, type_key, project_id, state_key, deleted_at, archived_at')
				.in('id', under),
			input.signal
		);
		if (error) throw new Error(`Could not load the Workspace tree: ${error.message}`);
		// Nested docs ride along whatever their type (Organize moves the subtree).
		nested = ((data ?? []) as DocRow[]).filter(
			(row) =>
				row.project_id?.toLowerCase() === workspaceId &&
				!row.deleted_at &&
				row.state_key !== 'archived'
		).length;
	}
	return { items, missing, nested_documents: nested };
}

/** The acting user's own Workspace, or null when they have none yet. */
export async function findWorkspaceProjectV1(
	context: AgenticChatSharedReadContextV1
): Promise<WorkspaceRefV1 | null> {
	const actorId = await context.access.getActorId();
	const { data, error } = await withSignal(
		context.client
			.from('onto_projects')
			.select('id, name')
			.eq('kind', 'workspace')
			.eq('created_by', actorId)
			.is('deleted_at', null)
			.limit(1),
		context.signal
	);
	if (error) throw new Error(`Could not find the Workspace: ${error.message}`);
	const row = ((data ?? []) as Array<{ id: string; name: string | null }>)[0];
	return row ? { id: row.id.toLowerCase(), name: row.name?.trim() || WORKSPACE_NAME } : null;
}

// ---------------------------------------------------------------------------
// list_workspace_suggestions

type SuggestionRow = {
	id: string;
	kind: string;
	reason: string | null;
	confidence: number | null;
	proposed_name: string | null;
	target_project_id: string | null;
	items: unknown;
	created_at: string;
};

type ProjectRow = {
	id: string;
	name: string;
	kind: string | null;
	archived_at: string | null;
	deleted_at: string | null;
	merged_into_project_id: string | null;
};

/** Item refs off a suggestion row ({kind|entity, id}); bad entries are skipped. */
function suggestionItemKeys(value: unknown): WorkspaceItemKeyV1[] {
	if (!Array.isArray(value)) return [];
	const keys: WorkspaceItemKeyV1[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		const record = entry as { entity?: unknown; kind?: unknown; id?: unknown } | null;
		const entity = record?.entity ?? record?.kind;
		const id = typeof record?.id === 'string' ? record.id.toLowerCase() : '';
		if ((entity !== 'document' && entity !== 'task') || !UUID_PATTERN.test(id)) continue;
		const key = { entity, id } as WorkspaceItemKeyV1;
		if (seen.has(workspaceItemKey(key))) continue;
		seen.add(workspaceItemKey(key));
		keys.push(key);
	}
	return keys;
}

/** Access as a boolean: a denial is an answer, any other failure is a tool failure. */
async function hasAccess(
	context: AgenticChatSharedReadContextV1,
	projectId: string,
	level: 'read' | 'write'
): Promise<boolean> {
	try {
		await context.access.assertProjectAccess(projectId, level);
		return true;
	} catch (error) {
		if (error instanceof AgenticChatToolAccessDeniedError) return false;
		throw error;
	}
}

async function loadProjects(
	context: AgenticChatSharedReadContextV1,
	ids: readonly string[]
): Promise<Map<string, ProjectRow>> {
	if (!ids.length) return new Map();
	const { data, error } = await withSignal(
		context.client
			.from('onto_projects')
			.select('id, name, kind, archived_at, deleted_at, merged_into_project_id')
			.in('id', [...ids]),
		context.signal
	);
	if (error) throw new Error(`Could not load the projects: ${error.message}`);
	return new Map(((data ?? []) as ProjectRow[]).map((row) => [row.id.toLowerCase(), row]));
}

function isOpenProject(row: ProjectRow): boolean {
	return (
		row.kind !== 'workspace' &&
		!row.deleted_at &&
		!row.archived_at &&
		!row.merged_into_project_id
	);
}

/**
 * `list_workspace_suggestions`: the user's open "file" and "graduate" suggestions for
 * their own Workspace, newest first, at most 20. Items no longer loose in the
 * Workspace are left out; a suggestion left with too few items (none to file, fewer
 * than two to start a project) or whose target the user can no longer add to is
 * skipped. Read-only: acting on one is a proposal card and the user's click.
 */
export async function listWorkspaceSuggestions(
	context: AgenticChatSharedReadContextV1,
	_args: SharedListWorkspaceSuggestionsArgs = {}
): Promise<Record<string, unknown>> {
	const workspace = await findWorkspaceProjectV1(context);
	if (!workspace) {
		return {
			workspace_project_id: null,
			suggestions: [],
			total: 0,
			message: 'The user has no Workspace yet, so there are no suggestions.'
		};
	}
	const { data, error } = await withSignal(
		context.client
			.from('workspace_suggestions')
			.select(
				'id, kind, reason, confidence, proposed_name, target_project_id, items, created_at'
			)
			// Service-role reads: these filters are the only barrier.
			.eq('user_id', context.userId)
			.eq('workspace_project_id', workspace.id)
			.eq('status', 'open')
			.in('kind', ['file', 'graduate'])
			.order('created_at', { ascending: false })
			.limit(SUGGESTION_SCAN_LIMIT),
		context.signal
	);
	if (error) throw new Error(`Could not load the Workspace suggestions: ${error.message}`);
	const rows = (data ?? []) as SuggestionRow[];

	const keysByRow = new Map(rows.map((row) => [row.id, suggestionItemKeys(row.items)]));
	const allKeys = new Map<string, WorkspaceItemKeyV1>();
	for (const keys of keysByRow.values())
		for (const key of keys) allKeys.set(workspaceItemKey(key), key);
	const targetIds = [
		...new Set(
			rows
				.filter((row) => row.kind === 'file' && row.target_project_id)
				.map((row) => row.target_project_id!.toLowerCase())
		)
	];
	const [view, writable, projects] = await Promise.all([
		allKeys.size
			? loadWorkspaceItemsV1(context.client, {
					workspaceProjectId: workspace.id,
					items: [...allKeys.values()],
					countNested: false,
					signal: context.signal
				})
			: Promise.resolve({ items: [], missing: [], nested_documents: 0 }),
		Promise.all(targetIds.map((id) => hasAccess(context, id, 'write'))),
		loadProjects(context, targetIds)
	]);
	const live = new Map(view.items.map((item) => [workspaceItemKey(item), item]));
	const canFileInto = new Set(targetIds.filter((_, index) => writable[index]));

	const suggestions: Record<string, unknown>[] = [];
	for (const row of rows) {
		const items = (keysByRow.get(row.id) ?? [])
			.map((key) => live.get(workspaceItemKey(key)))
			.filter((item): item is WorkspaceItemV1 => Boolean(item));
		const base = {
			id: row.id,
			kind: row.kind,
			reason: row.reason ?? '',
			confidence: typeof row.confidence === 'number' ? row.confidence : null
		};
		if (row.kind === 'file') {
			const targetId = row.target_project_id?.toLowerCase() ?? '';
			const target = projects.get(targetId);
			if (!items.length || !canFileInto.has(targetId) || !target || !isOpenProject(target))
				continue;
			suggestions.push({
				...base,
				target_project: { id: targetId, name: target.name },
				items,
				created_at: row.created_at
			});
		} else {
			if (items.length < WORKSPACE_PROJECT_MIN_ITEMS || !row.proposed_name) continue;
			suggestions.push({
				...base,
				proposed_name: row.proposed_name,
				items,
				created_at: row.created_at
			});
		}
	}
	const shown = suggestions.slice(0, SUGGESTION_LIST_LIMIT);
	return {
		workspace_project_id: workspace.id,
		suggestions: shown,
		total: suggestions.length,
		...(suggestions.length > shown.length ? { truncated: true } : {}),
		message: shown.length
			? `${shown.length} open Workspace ${shown.length === 1 ? 'suggestion' : 'suggestions'}. Bring one up only when it fits what the user is asking. Acting on one takes propose_workspace_filing or propose_workspace_project (with its suggestion_id) and the user's click.`
			: 'No open Workspace suggestions.'
	};
}

// ---------------------------------------------------------------------------
// The two cards.

function requireProposalContext(
	context: AgenticChatSharedReadContextV1,
	toolName: string
): AgenticChatProposalCardContextV1 {
	const proposal = context.proposal;
	if (!proposal || !UUID_PATTERN.test(proposal.toolExecutionId)) {
		throw new Error(`${toolName} is only available where chat can show its card.`);
	}
	return proposal;
}

function requiredUuid(value: unknown, field: string): string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw new Error(`${field} must be a UUID.`);
	}
	return value.toLowerCase();
}

function optionalUuid(value: unknown, field: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	return requiredUuid(value, field);
}

/** The model's `items`: min..20 {entity, id} with UUID ids, deduplicated. */
function requiredItems(value: unknown, min: number): WorkspaceItemKeyV1[] {
	if (!Array.isArray(value)) throw new Error('items must be a list of {entity, id}.');
	const keys: WorkspaceItemKeyV1[] = [];
	const seen = new Set<string>();
	for (const entry of value) {
		const record = entry as { entity?: unknown; id?: unknown } | null;
		const entity = record?.entity;
		if (entity !== 'document' && entity !== 'task') {
			throw new Error("Each item's entity must be 'document' or 'task'.");
		}
		const key: WorkspaceItemKeyV1 = { entity, id: requiredUuid(record?.id, 'Each item id') };
		if (seen.has(workspaceItemKey(key))) continue;
		seen.add(workspaceItemKey(key));
		keys.push(key);
	}
	if (keys.length < min || keys.length > WORKSPACE_CARD_ITEM_LIMIT) {
		throw new Error(`items must name ${min} to ${WORKSPACE_CARD_ITEM_LIMIT} different items.`);
	}
	return keys;
}

function nonCard(
	kind: ProposalCardKind,
	reasonCode: string,
	message: string
): ProposalCardNonCardResultV1 {
	return buildProposalCardNonCardResultV1({ kind, status: 'blocked', reasonCode, message });
}

function nowOf(proposal: AgenticChatProposalCardContextV1): Date {
	return proposal.now?.() ?? new Date();
}

/** Items that are not loose in the Workspace block the card (by id, for the model). */
function missingItemsResult(
	kind: ProposalCardKind,
	missing: readonly WorkspaceItemKeyV1[]
): ProposalCardNonCardResultV1 {
	const ids = missing.map((item) => `${item.entity} ${item.id}`).join(', ');
	return nonCard(
		kind,
		'items_not_in_workspace',
		`${missing.length === 1 ? 'This item is' : 'These items are'} not loose in the Workspace any more (filed, deleted, archived, or never there): ${ids}. Check the Workspace again. Nothing changed.`
	);
}

type SuggestionCheckRow = {
	id: string;
	kind: string;
	status: string;
	target_project_id: string | null;
	workspace_project_id: string;
};

async function openSuggestion(
	context: AgenticChatSharedReadContextV1,
	suggestionId: string,
	workspaceId: string,
	kind: 'file' | 'graduate'
): Promise<SuggestionCheckRow | null> {
	const { data, error } = await withSignal(
		context.client
			.from('workspace_suggestions')
			.select('id, kind, status, target_project_id, workspace_project_id')
			.eq('id', suggestionId)
			.eq('user_id', context.userId)
			.limit(1),
		context.signal
	);
	if (error) throw new Error(`Could not load the suggestion: ${error.message}`);
	const row = ((data ?? []) as SuggestionCheckRow[])[0];
	return row &&
		row.status === 'open' &&
		row.kind === kind &&
		row.workspace_project_id?.toLowerCase() === workspaceId
		? row
		: null;
}

const SUGGESTION_GONE =
	'That suggestion is not open any more. Propose again without suggestion_id. Nothing changed.';

/**
 * `propose_workspace_filing`: file loose Workspace items into a project the user can
 * add to. Blocked (no card) when there is no Workspace, the target is the Workspace or
 * not writable/open, an item is not loose in the Workspace, or the suggestion is not
 * an open "file" suggestion for that same project.
 */
export async function proposeWorkspaceFiling(
	context: AgenticChatSharedReadContextV1,
	args: SharedProposeWorkspaceFilingArgs
): Promise<ProposalToolResultV1<WorkspaceFileProposalPayloadV1>> {
	const proposal = requireProposalContext(context, WORKSPACE_FILE_TOOL_NAME);
	const keys = requiredItems(args?.items, 1);
	const targetId = requiredUuid(args?.target_project_id, 'target_project_id');
	const suggestionId = optionalUuid(args?.suggestion_id, 'suggestion_id');
	const reason = cleanWorkspaceCardText(args?.reason, WORKSPACE_CARD_REASON_MAX);
	const kind = 'workspace_file' as const;

	const workspace = await findWorkspaceProjectV1(context);
	if (!workspace) {
		return nonCard(
			kind,
			'no_workspace',
			'The user has no Workspace yet, so there is nothing loose to file. Nothing changed.'
		);
	}
	if (targetId === workspace.id) {
		return nonCard(
			kind,
			'target_is_workspace',
			'Those items are already in the Workspace. Name the project to file them into. Nothing changed.'
		);
	}
	const canWrite = await hasAccess(context, targetId, 'write');
	const target = canWrite ? (await loadProjects(context, [targetId])).get(targetId) : undefined;
	if (!canWrite || !target || target.deleted_at || target.kind === 'workspace') {
		return nonCard(
			kind,
			'target_not_found',
			'That project doesn’t exist or the user can’t add to it. Nothing changed.'
		);
	}
	if (!isOpenProject(target)) {
		return nonCard(
			kind,
			'target_archived',
			`${target.name} is archived or was combined into another project, so nothing can be filed into it. Nothing changed.`
		);
	}
	const view = await loadWorkspaceItemsV1(context.client, {
		workspaceProjectId: workspace.id,
		items: keys,
		signal: context.signal
	});
	if (view.missing.length) return missingItemsResult(kind, view.missing);
	if (suggestionId) {
		const suggestion = await openSuggestion(context, suggestionId, workspace.id, 'file');
		if (!suggestion) return nonCard(kind, 'suggestion_not_open', SUGGESTION_GONE);
		if (suggestion.target_project_id?.toLowerCase() !== targetId) {
			return nonCard(
				kind,
				'suggestion_target_mismatch',
				'That suggestion names a different project. Drop suggestion_id to file these somewhere else. Nothing changed.'
			);
		}
	}

	const checkedAt = nowOf(proposal);
	const payload: WorkspaceFileProposalPayloadV1 = {
		version: 1,
		workspace: { id: workspace.id, name: workspace.name },
		target: { id: targetId, name: target.name },
		items: view.items,
		nested_documents: view.nested_documents,
		suggestion_id: suggestionId,
		reason,
		checked_at: checkedAt.toISOString()
	};
	const nested = view.nested_documents
		? ` ${view.nested_documents} ${view.nested_documents === 1 ? 'doc' : 'docs'} nested inside them come along.`
		: '';
	return buildProposalCardEnvelopeV1({
		kind,
		cardId: proposal.toolExecutionId,
		sessionId: proposal.sessionId,
		proposedAt: checkedAt,
		payload,
		message: `Needs your choice: file ${workspaceItemCountLabel(view.items.length)} from the Workspace into ${target.name}. Nothing has moved yet; only the user's click on the card moves them, and they can undo it.${nested}`
	});
}

/**
 * `propose_workspace_project`: start a new project from two or more loose Workspace
 * items. Blocked (no card) without a name, without a Workspace, when an item is not
 * loose in it, or when the suggestion is not an open "graduate" suggestion.
 */
export async function proposeWorkspaceProject(
	context: AgenticChatSharedReadContextV1,
	args: SharedProposeWorkspaceProjectArgs
): Promise<ProposalToolResultV1<WorkspaceProjectProposalPayloadV1>> {
	const proposal = requireProposalContext(context, WORKSPACE_PROJECT_TOOL_NAME);
	const name = cleanWorkspaceProjectName(args?.name);
	if (!name) throw new Error('name is required: the new project’s name.');
	const keys = requiredItems(args?.items, WORKSPACE_PROJECT_MIN_ITEMS);
	const description = cleanWorkspaceCardText(
		args?.description,
		WORKSPACE_PROJECT_DESCRIPTION_MAX
	);
	const suggestionId = optionalUuid(args?.suggestion_id, 'suggestion_id');
	const kind = 'workspace_project' as const;

	const workspace = await findWorkspaceProjectV1(context);
	if (!workspace) {
		return nonCard(
			kind,
			'no_workspace',
			'The user has no Workspace yet, so there is nothing loose to start a project from. Nothing changed.'
		);
	}
	const view = await loadWorkspaceItemsV1(context.client, {
		workspaceProjectId: workspace.id,
		items: keys,
		signal: context.signal
	});
	if (view.missing.length) return missingItemsResult(kind, view.missing);
	if (suggestionId && !(await openSuggestion(context, suggestionId, workspace.id, 'graduate'))) {
		return nonCard(kind, 'suggestion_not_open', SUGGESTION_GONE);
	}

	const checkedAt = nowOf(proposal);
	const payload: WorkspaceProjectProposalPayloadV1 = {
		version: 1,
		workspace: { id: workspace.id, name: workspace.name },
		name,
		description,
		items: view.items,
		nested_documents: view.nested_documents,
		suggestion_id: suggestionId,
		checked_at: checkedAt.toISOString()
	};
	return buildProposalCardEnvelopeV1({
		kind,
		cardId: proposal.toolExecutionId,
		sessionId: proposal.sessionId,
		proposedAt: checkedAt,
		payload,
		message: `Needs your choice: start a project named ${name} from ${workspaceItemCountLabel(view.items.length)} in the Workspace. No project exists yet; only the user's click on the card creates it and moves the items, and they can undo it.`
	});
}
