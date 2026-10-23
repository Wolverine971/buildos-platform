// apps/web/src/lib/server/workspace/workspace.service.ts
//
// The Workspace (docs/specs/WORKSPACE_ARCHITECTURE_2026-10-23.md): each person's private
// holding ground for loose notes, docs and tasks. It is a project row with
// kind = 'workspace', so loose items are ordinary docs and tasks and filing them is an
// ordinary Organize move with undo. This module loads the home, captures instantly (no
// model call), and carries out what the person accepts: file items into a project,
// start a project from a group of them, or dismiss a suggestion. The agent only ever
// suggests; nothing here runs without the person's click.
import type { Database, Json } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureWorkspaceProjectId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { instantiateProject } from '$lib/services/ontology/instantiation.service';
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';
import {
	createOrMergeDocumentVersion,
	toDocumentSnapshot
} from '$lib/services/ontology/versioning.service';
import { prepareRelationshipMutationPlan } from '$lib/services/ontology/auto-organizer.service';
import { logCreateAsync } from '$lib/services/async-activity-logger';
import {
	visibleDocumentTree,
	type OrganizeMove,
	type OrganizeProject
} from '$lib/components/organize/organize-plan';
import { blockerMessage } from '$lib/components/organize/organize-api';
import { findNodeById } from '$lib/services/ontology/doc-structure.service';
import { loadOrganizeSnapshot } from '$lib/server/organize/organize-snapshot';
import {
	OrganizeError,
	previewOrApplyOrganize,
	undoOrganize
} from '$lib/server/organize/organize-service';
import {
	CAPTURE_TEXT_MAX,
	NOTE_TYPE_KEY,
	excerptOf,
	noteTitleFromText,
	type LooseEntity,
	type LooseItem,
	type WorkspaceHome,
	type WorkspaceSuggestion
} from '$lib/components/workspace/workspace-model';

type Client = SupabaseClient<Database>;

/** The shelf shows the newest of each; a long tail stays one tap away in the card. */
const LOOSE_DOC_LIMIT = 120;
const LOOSE_TASK_LIMIT = 120;
const SUGGESTION_LIMIT = 24;
/** A graduated project takes at most this many items in one step (Organize's batch cap
 * is 200 moves including nested docs). */
export const GRADUATE_MAX_ITEMS = 60;
/** A type_key for projects started from loose items when the agent offered none. */
const DEFAULT_GRADUATE_TYPE_KEY = 'project.personal.goal';
const PROJECT_TYPE_KEY = /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/;

export class WorkspaceError extends Error {
	constructor(
		message: string,
		readonly status = 400
	) {
		super(message);
	}
}

export type ItemRef = { entity: LooseEntity; id: string };

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

type DocRow = {
	id: string;
	title: string | null;
	type_key: string | null;
	content: string | null;
	description: string | null;
	created_at: string;
	updated_at: string;
};
type TaskRow = {
	id: string;
	title: string;
	description: string | null;
	state_key: string;
	start_at: string | null;
	due_at: string | null;
	created_at: string;
	updated_at: string;
};
type SuggestionRow = Database['public']['Tables']['workspace_suggestions']['Row'];

type TreeNode = { id?: unknown; children?: TreeNode[] };

/** Docs nested inside another doc stay in their folder; top-level ones are loose cards.
 * For each top-level doc, how many docs sit inside it. */
export function treeFacts(structure: unknown): {
	nested: Set<string>;
	children: Map<string, number>;
} {
	const nested = new Set<string>();
	const children = new Map<string, number>();
	const candidate = (structure as { root?: unknown } | null)?.root;
	const root: TreeNode[] = Array.isArray(candidate) ? (candidate as TreeNode[]) : [];
	const collect = (nodes: TreeNode[] | undefined): number => {
		let count = 0;
		for (const node of nodes ?? []) {
			if (typeof node?.id === 'string') nested.add(node.id);
			count += 1 + collect(node?.children);
		}
		return count;
	};
	for (const node of root) {
		if (typeof node?.id !== 'string') continue;
		const inside = collect(node.children);
		if (inside) children.set(node.id, inside);
	}
	return { nested, children };
}

export function toLooseDoc(row: DocRow, children = 0): LooseItem {
	const title = row.title?.trim() || 'Untitled note';
	const isNote = row.type_key === NOTE_TYPE_KEY;
	return {
		id: row.id,
		entity: 'document',
		kind: isNote ? 'note' : 'doc',
		title,
		excerpt: excerptOf(row.content ?? row.description, title),
		created_at: row.created_at,
		updated_at: row.updated_at,
		...(children ? { children } : {})
	};
}

export function toLooseTask(row: TaskRow): LooseItem {
	return {
		id: row.id,
		entity: 'task',
		kind: 'task',
		title: row.title,
		excerpt: excerptOf(row.description),
		created_at: row.created_at,
		updated_at: row.updated_at,
		state_key: row.state_key,
		due_at: row.due_at,
		start_at: row.start_at
	};
}

export function toSuggestion(row: SuggestionRow): WorkspaceSuggestion | null {
	if (row.kind !== 'file' && row.kind !== 'graduate' && row.kind !== 'fold') return null;
	const items = Array.isArray(row.items)
		? (row.items as unknown[]).flatMap((value) => {
				const ref = value as { kind?: unknown; entity?: unknown; id?: unknown };
				const entity = ref?.entity ?? ref?.kind;
				return (entity === 'document' || entity === 'task') && typeof ref.id === 'string'
					? [{ entity, id: ref.id } as ItemRef]
					: [];
			})
		: [];
	return {
		id: row.id,
		kind: row.kind,
		reason: row.reason,
		confidence: row.confidence,
		proposed_name: row.proposed_name,
		target_project_id: row.target_project_id,
		items,
		created_at: row.created_at
	};
}

/**
 * The signed-in person's Workspace: loose items (newest first; nested docs stay inside
 * their folder doc) and the agent's open suggestions. Creates the Workspace on first
 * visit. Reads with the session client, so RLS decides everything.
 */
export async function loadWorkspaceHome(
	session: Client,
	knownWorkspaceId?: string | null
): Promise<WorkspaceHome> {
	const workspaceId = knownWorkspaceId ?? (await ensureWorkspaceProjectId(session as never));

	const [project, docs, tasks, suggestions] = await Promise.all([
		session.from('onto_projects').select('doc_structure').eq('id', workspaceId).maybeSingle(),
		session
			.from('onto_documents')
			.select('id, title, type_key, content, description, created_at, updated_at', {
				count: 'exact'
			})
			.eq('project_id', workspaceId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'archived')
			.order('updated_at', { ascending: false })
			.limit(LOOSE_DOC_LIMIT),
		session
			.from('onto_tasks')
			.select('id, title, description, state_key, start_at, due_at, created_at, updated_at', {
				count: 'exact'
			})
			.eq('project_id', workspaceId)
			.is('deleted_at', null)
			.is('archived_at', null)
			.neq('state_key', 'done')
			.order('created_at', { ascending: false })
			.limit(LOOSE_TASK_LIMIT),
		session
			.from('workspace_suggestions')
			.select('*')
			.eq('status', 'open')
			.order('created_at', { ascending: false })
			.limit(SUGGESTION_LIMIT)
	]);
	if (docs.error) throw new WorkspaceError('Could not load your Workspace notes.', 500);
	if (tasks.error) throw new WorkspaceError('Could not load your Workspace tasks.', 500);
	if (suggestions.error) console.error('[Workspace] suggestions:', suggestions.error);

	const { nested, children } = treeFacts(project.data?.doc_structure);
	// A doc missing from the tree is shown at the top level, as the tree reader does.
	const looseDocs = ((docs.data ?? []) as DocRow[])
		.filter((row) => !nested.has(row.id))
		.map((row) => toLooseDoc(row, children.get(row.id) ?? 0));
	const looseTasks = ((tasks.data ?? []) as TaskRow[]).map(toLooseTask);

	const items = [...looseDocs, ...looseTasks].sort(
		(a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
	);
	const noteCount = looseDocs.filter((item) => item.kind === 'note').length;
	return {
		workspaceId,
		items,
		suggestions: ((suggestions.data ?? []) as SuggestionRow[])
			.map(toSuggestion)
			.filter((value): value is WorkspaceSuggestion => Boolean(value)),
		totals: {
			notes: noteCount,
			docs: Math.max(0, (docs.count ?? looseDocs.length) - noteCount),
			tasks: tasks.count ?? looseTasks.length
		}
	};
}

// ---------------------------------------------------------------------------
// Capture (instant: no model call)
// ---------------------------------------------------------------------------

export type CaptureInput = {
	kind: 'note' | 'task';
	text: string;
	/** Where it came from, for logs: the home capture bar, Today, onboarding, the PWA. */
	source?: string;
	/** Client-made key so a retried capture never saves twice (tasks). */
	idempotencyKey?: string;
};

export async function captureLooseItem(input: {
	session: Client;
	userId: string;
	actorId: string;
	capture: CaptureInput;
	changeSource?: Parameters<typeof logCreateAsync>[6];
}): Promise<{ workspaceId: string; item: LooseItem }> {
	const { session, userId, actorId, capture } = input;
	const text = capture.text.replace(/\r\n/g, '\n').trim();
	if (!text) throw new WorkspaceError('Write something first.');
	if (text.length > CAPTURE_TEXT_MAX)
		throw new WorkspaceError('That is too long for a quick capture. Save it as a doc instead.');
	const workspaceId = await ensureWorkspaceProjectId(session as never);
	const source = capture.source?.slice(0, 40) || 'workspace';

	if (capture.kind === 'task') {
		const taskId = crypto.randomUUID();
		const title = text.split('\n')[0]!.trim().slice(0, 500);
		const description = text.includes('\n') ? text.slice(text.indexOf('\n') + 1).trim() : '';
		const relationshipPlan = await prepareRelationshipMutationPlan({
			supabase: session as never,
			projectId: workspaceId,
			entity: { kind: 'task', id: taskId },
			connections: [],
			options: { mode: 'replace' },
			referencesValidated: true
		});
		const { data, error } = await session.rpc('onto_task_create_with_relationships_atomic', {
			p_task: {
				id: taskId,
				project_id: workspaceId,
				title,
				description: description || null,
				type_key: 'task.default',
				state_key: 'todo',
				priority: 3,
				created_by: actorId,
				props: { captured_via: source }
			} as Json,
			p_relationship_plan: relationshipPlan as unknown as Json,
			p_sync_assignees: false,
			p_source: 'manual',
			...(capture.idempotencyKey ? { p_idempotency_key: capture.idempotencyKey } : {})
		} as never);
		const task = (data as { task?: TaskRow } | null)?.task;
		if (error || !task) {
			console.error('[Workspace] capture task failed:', error);
			throw new WorkspaceError('Could not save that task. Try again.', 500);
		}
		logCreateAsync(
			session as never,
			workspaceId,
			'task',
			task.id,
			{ title: task.title, state_key: task.state_key, captured_via: source },
			userId,
			input.changeSource ?? 'api'
		);
		return { workspaceId, item: toLooseTask(task) };
	}

	const title = noteTitleFromText(text);
	const { data: doc, error } = await session
		.from('onto_documents')
		.insert({
			project_id: workspaceId,
			title,
			type_key: NOTE_TYPE_KEY,
			state_key: 'draft',
			content: text,
			props: { body_markdown: text, captured_via: source },
			created_by: actorId
		})
		.select('*')
		.single();
	if (error || !doc) {
		console.error('[Workspace] capture note failed:', error);
		throw new WorkspaceError('Could not save that note. Try again.', 500);
	}
	// History and the doc tree, as the document create route does. Neither may lose
	// the note itself: it is saved already.
	await Promise.allSettled([
		createOrMergeDocumentVersion({
			supabase: session as never,
			documentId: doc.id,
			actorId,
			snapshot: toDocumentSnapshot(doc as never),
			changeSource: input.changeSource ?? 'api'
		}),
		addDocumentToTree(
			session as never,
			workspaceId,
			doc.id,
			{ title: doc.title ?? null, description: null },
			actorId
		)
	]).then((results) => {
		for (const result of results)
			if (result.status === 'rejected')
				console.error('[Workspace] note follow-up failed:', result.reason);
	});
	logCreateAsync(
		session as never,
		workspaceId,
		'document',
		doc.id,
		{ title: doc.title, type_key: doc.type_key, captured_via: source },
		userId,
		input.changeSource ?? 'api'
	);
	return { workspaceId, item: toLooseDoc(doc as DocRow) };
}

// ---------------------------------------------------------------------------
// Moving items (Organize, one batch, undoable)
// ---------------------------------------------------------------------------

export type MoveReceipt = {
	batch_id: string;
	moved: number;
	/** Items that could not move and why (left where they were). */
	blocked: { entity: LooseEntity; id: string; reason: string }[];
};

/**
 * Moves loose items from one project to another in a single Organize batch: preview,
 * then apply with a fresh batch id. Docs go to the end of the destination's top level
 * (with anything nested inside them). Items Organize blocks (a recurring task, say)
 * are left out of the batch and reported back.
 */
export async function moveItems(input: {
	session: Client;
	admin: Client;
	userId: string;
	sourceId: string;
	destinationId: string;
	items: ItemRef[];
}): Promise<MoveReceipt> {
	const { session, admin, userId, sourceId, destinationId } = input;
	if (sourceId === destinationId) throw new WorkspaceError('Those items are already there.');
	const [source, destination] = await Promise.all([
		loadOrganizeSnapshot(session, sourceId).then((result) => result.project),
		loadOrganizeSnapshot(session, destinationId).then((result) => result.project)
	]);
	if (!source.can_write || !destination.can_write)
		throw new WorkspaceError('You need edit access to both places to move these.', 403);

	const moves = planMoves(source, destination, input.items);
	if (!moves.length)
		throw new WorkspaceError('Those items have already moved or were deleted.', 409);

	const project_versions = {
		[source.id]: String(source.structure.version),
		[destination.id]: String(destination.structure.version)
	};
	const preview = (await previewOrApplyOrganize({
		session,
		admin,
		userId,
		request: { moves, project_versions },
		apply: false
	})) as {
		confirmation_token: string;
		impact: { blockers: string[] }[];
	};
	const blockers = [...new Set(preview.impact.flatMap((impact) => impact.blockers ?? []))];
	if (blockers.length) {
		throw new WorkspaceError(blockers.map(blockerMessage).join(' '), 409);
	}
	const batchId = crypto.randomUUID();
	await previewOrApplyOrganize({
		session,
		admin,
		userId,
		request: {
			moves,
			project_versions,
			batch_id: batchId,
			confirmation_token: preview.confirmation_token
		},
		apply: true
	});
	return { batch_id: batchId, moved: moves.length, blocked: [] };
}

/** Organize moves for these items: docs to the end of the destination's top level
 * (a doc whose ancestor also moves rides along inside it), tasks as tasks. */
export function planMoves(
	source: OrganizeProject,
	destination: OrganizeProject,
	items: readonly ItemRef[]
): OrganizeMove[] {
	const sourceTree = visibleDocumentTree(source);
	const docIds = new Set(
		items.filter((item) => item.entity === 'document').map((item) => item.id)
	);
	const taskIds = new Set(source.tasks.map((task) => task.id));
	let position = visibleDocumentTree(destination).length;
	const moves: OrganizeMove[] = [];
	const seen = new Set<string>();
	for (const item of items) {
		const key = `${item.entity}:${item.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		if (item.entity === 'task') {
			if (!taskIds.has(item.id)) continue;
			moves.push({
				kind: 'task',
				id: item.id,
				project_id: source.id,
				destination_project_id: destination.id,
				parent_id: null,
				position: 0
			});
			continue;
		}
		if (!findNodeById(sourceTree, item.id)) continue;
		if (hasMovingAncestor(sourceTree, item.id, docIds)) continue;
		moves.push({
			kind: 'document',
			id: item.id,
			project_id: source.id,
			destination_project_id: destination.id,
			parent_id: null,
			position: position++
		});
	}
	return moves;
}

function hasMovingAncestor(
	tree: readonly { id: string; children?: unknown[] }[],
	id: string,
	moving: ReadonlySet<string>
): boolean {
	const walk = (
		nodes: readonly { id: string; children?: unknown[] }[],
		ancestors: string[]
	): string[] | null => {
		for (const node of nodes) {
			if (node.id === id) return ancestors;
			const inner = walk((node.children ?? []) as { id: string; children?: unknown[] }[], [
				...ancestors,
				node.id
			]);
			if (inner) return inner;
		}
		return null;
	};
	return (walk(tree, []) ?? []).some((ancestor) => moving.has(ancestor));
}

// ---------------------------------------------------------------------------
// Graduate: a new project from loose items (only when the person asks)
// ---------------------------------------------------------------------------

export type GraduateReceipt = {
	project_id: string;
	project_name: string;
	batch_id: string;
	moved: number;
};

export async function graduateItems(input: {
	session: Client;
	admin: Client;
	userId: string;
	name: string;
	description?: string | null;
	typeKey?: string | null;
	items: ItemRef[];
	suggestionId?: string | null;
}): Promise<GraduateReceipt> {
	const name = input.name.replace(/\s+/g, ' ').trim().slice(0, 120);
	if (!name) throw new WorkspaceError('Give the new project a name.');
	if (input.items.length < 1) throw new WorkspaceError('Choose at least one item.');
	if (input.items.length > GRADUATE_MAX_ITEMS)
		throw new WorkspaceError(`Start with at most ${GRADUATE_MAX_ITEMS} items.`);
	const workspaceId = await ensureWorkspaceProjectId(input.session as never);
	const typeKey =
		input.typeKey && PROJECT_TYPE_KEY.test(input.typeKey)
			? input.typeKey
			: DEFAULT_GRADUATE_TYPE_KEY;
	const description = input.description?.trim().slice(0, 600) || null;

	const created = await instantiateProject(
		input.session as never,
		{
			project: { name, type_key: typeKey, ...(description ? { description } : {}) },
			entities: [],
			relationships: []
		} as never,
		input.userId,
		{ activityLog: { changeSource: 'api' } } as never
	);
	const projectId = created.project_id;

	let receipt: MoveReceipt;
	try {
		receipt = await moveItems({
			session: input.session,
			admin: input.admin,
			userId: input.userId,
			sourceId: workspaceId,
			destinationId: projectId,
			items: input.items
		});
	} catch (error) {
		// Nothing moved: the new project would be an empty shell, so take it away again.
		await input.session
			.rpc('soft_delete_onto_project', { p_project_id: projectId })
			.then(({ error: deleteError }) => {
				if (deleteError) console.error('[Workspace] cleanup failed:', deleteError);
			});
		throw error;
	}

	if (input.suggestionId) {
		await markSuggestion(input.admin, input.userId, input.suggestionId, 'accepted', {
			project_id: projectId,
			batch_id: receipt.batch_id,
			moved: receipt.moved
		});
	}
	return {
		project_id: projectId,
		project_name: name,
		batch_id: receipt.batch_id,
		moved: receipt.moved
	};
}

/**
 * Undo a graduate: move the items back to the Workspace, then remove the project if
 * nothing else was added to it meanwhile (its START HERE doesn't count).
 */
/** Puts back everything one Organize batch moved. False when there is nothing left to
 * undo or something now blocks it. */
export async function undoMoveBatch(input: {
	session: Client;
	admin: Client;
	userId: string;
	batchId: string;
}): Promise<boolean> {
	const review = (await undoOrganize({
		session: input.session,
		admin: input.admin,
		userId: input.userId,
		sourceBatchId: input.batchId
	})) as { status?: string; confirmation_token?: string; impact?: { blockers: string[] }[] };
	if (review.status === 'nothing_to_undo' || !review.confirmation_token) return false;
	if ((review.impact ?? []).some((impact) => impact.blockers?.length)) return false;
	await undoOrganize({
		session: input.session,
		admin: input.admin,
		userId: input.userId,
		sourceBatchId: input.batchId,
		batchId: crypto.randomUUID(),
		confirmationToken: review.confirmation_token
	});
	return true;
}

export async function undoGraduate(input: {
	session: Client;
	admin: Client;
	userId: string;
	projectId: string;
	batchId: string;
}): Promise<{ status: 'undone' | 'items_back_project_kept' | 'nothing' }> {
	if (!(await undoMoveBatch(input))) return { status: 'nothing' };

	const [docs, tasks] = await Promise.all([
		input.session
			.from('onto_documents')
			.select('id, type_key')
			.eq('project_id', input.projectId)
			.is('deleted_at', null),
		input.session
			.from('onto_tasks')
			.select('id', { count: 'exact', head: true })
			.eq('project_id', input.projectId)
			.is('deleted_at', null)
	]);
	const otherDocs = (docs.data ?? []).filter(
		(doc) => doc.type_key !== 'document.context.project'
	).length;
	if (docs.error || tasks.error || otherDocs > 0 || (tasks.count ?? 0) > 0) {
		return { status: 'items_back_project_kept' };
	}
	const { error } = await input.session.rpc('soft_delete_onto_project', {
		p_project_id: input.projectId
	});
	if (error) {
		console.error('[Workspace] undo graduate could not remove the project:', error);
		return { status: 'items_back_project_kept' };
	}
	await input.admin
		.from('workspace_suggestions')
		.update({ status: 'dismissed', updated_at: new Date().toISOString() })
		.eq('user_id', input.userId)
		.eq('status', 'accepted')
		.contains('result', { project_id: input.projectId });
	return { status: 'undone' };
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export async function loadOwnSuggestion(
	admin: Client,
	userId: string,
	suggestionId: string
): Promise<SuggestionRow> {
	const { data, error } = await admin
		.from('workspace_suggestions')
		.select('*')
		.eq('id', suggestionId)
		.eq('user_id', userId)
		.maybeSingle();
	if (error) throw new WorkspaceError('Could not load that suggestion.', 500);
	if (!data) throw new WorkspaceError('That suggestion is gone.', 404);
	return data;
}

export async function markSuggestion(
	admin: Client,
	userId: string,
	suggestionId: string,
	status: 'accepted' | 'dismissed',
	outcome?: Record<string, unknown>
): Promise<void> {
	const existing = await loadOwnSuggestion(admin, userId, suggestionId);
	const previous =
		existing.result && typeof existing.result === 'object' && !Array.isArray(existing.result)
			? (existing.result as Record<string, unknown>)
			: {};
	const now = new Date().toISOString();
	const { error } = await admin
		.from('workspace_suggestions')
		.update({
			status,
			decided_at: now,
			updated_at: now,
			...(outcome ? { result: { ...previous, accepted: outcome } as Json } : {})
		})
		.eq('id', suggestionId)
		.eq('user_id', userId);
	if (error) throw new WorkspaceError('Could not save your answer.', 500);
}

/** The agent's proposal details kept on the row (type_key, description), if any. */
export function suggestionProposal(row: SuggestionRow): {
	type_key: string | null;
	description: string | null;
} {
	const proposal =
		row.result && typeof row.result === 'object' && !Array.isArray(row.result)
			? ((row.result as Record<string, unknown>).proposal as
					| Record<string, unknown>
					| undefined)
			: undefined;
	return {
		type_key: typeof proposal?.type_key === 'string' ? proposal.type_key : null,
		description: typeof proposal?.description === 'string' ? proposal.description : null
	};
}

/** Queue a fresh look now (the person asked). One pending run per person. */
export async function requestSuggestions(
	admin: Client,
	userId: string,
	workspaceId: string
): Promise<void> {
	const { error } = await admin.rpc('add_queue_job', {
		p_user_id: userId,
		p_job_type: 'workspace_suggest',
		p_metadata: { userId, workspaceProjectId: workspaceId, reason: 'requested' } as Json,
		p_priority: 10,
		p_scheduled_for: new Date().toISOString(),
		p_dedup_key: `workspace_suggest:${userId}`
	});
	if (error) {
		console.error('[Workspace] could not queue suggestions:', error);
		throw new WorkspaceError('Could not ask for suggestions right now.', 500);
	}
}

export function errorStatus(error: unknown): { status: number; message: string } {
	if (error instanceof WorkspaceError) return { status: error.status, message: error.message };
	if (error instanceof OrganizeError) return { status: error.status, message: error.message };
	console.error('[Workspace] unexpected error:', error);
	return { status: 500, message: 'Something went wrong. Please try again.' };
}
