// apps/web/src/lib/tests/agentic-e2e/scenarios/workspace-chat/fixture.ts
//
// Shared fixture for the Workspace chat battery (tasker/146). The Workspace is the
// user's kind='workspace' project that holds loose notes, docs and tasks; Workspace
// chat is the `global` context with an opening view (recent chats, pressing work,
// projects, the Workspace shelf) and three Workspace tools whose results are cards.
//
// Every case starts from a fresh, known Workspace: the harness account's Workspace row
// is hard-deleted (its loose items and suggestions cascade) and recreated through the
// same `ensure_workspace_project_for_user` RPC the server uses. A new Workspace id also
// changes the global context invalidation token, so the turn can never be served a
// materialized snapshot from an earlier case. Because that reset is destructive, it
// refuses any account that is not a dedicated `agentic-e2e…@example.com` harness user,
// and this battery must not run concurrently with another harness run on the same
// account.
//
// Scoring stays structural: tool names, proposal-card envelopes (rail, status, kind,
// payload ids) and database rows. A user-supplied reference code (e.g. KILN-482) is
// checked for verbatim preservation in the saved note, the same data-fidelity check
// Cedar House applies to its sentinel; nothing here classifies prose by keyword.
import {
	PROPOSAL_CARD_RAIL,
	PROPOSAL_CARD_READY_STATUS
} from '@buildos/shared-agent-ops/chat-cards/proposal-card';
import { addDocumentToTree } from '$lib/services/ontology/doc-structure.service';
import type { ProjectSpec } from '$lib/types/onto';
import type { ScenarioContext, SeedResult, TurnResult } from '../../harness/types';
import { harnessProjectName, seedProject } from '../../harness/seed';
import {
	getToolExecutions,
	listDocuments,
	listTasks,
	type DocumentRow,
	type TaskRow
} from '../../harness/telemetry';
import { HARNESS_TIMEZONE, zonedEndOfDay } from '../../harness/timezone';
import { excludeSystemDocuments } from '../../harness/assertions';
import { includesNormalized } from '../cedar-house/guards';

export const WORKSPACE_NOTE_TYPE_KEY = 'document.note';
export const WORKSPACE_FILE_TOOL = 'propose_workspace_filing';
export const WORKSPACE_PROJECT_TOOL = 'propose_workspace_project';
export const WORKSPACE_CARD_TOOLS = [WORKSPACE_FILE_TOOL, WORKSPACE_PROJECT_TOOL] as const;
/** Tools that move loose items or make a project without the user's click. */
export const CARD_BYPASS_TOOLS = [
	'create_onto_project',
	'move_onto_task',
	'move_document_in_tree'
] as const;

/** Only dedicated harness users (local `agentic-e2e@…`, production `agentic-e2e-harness@…`). */
export const WORKSPACE_RESET_ACCOUNT = /^agentic-e2e(?:-[a-z0-9-]+)?@example\.com$/;

// --- Oracle -------------------------------------------------------------------

/** The decoy/target project. Fixed at module scope so prompts can name it. */
export const BAKERY_PROJECT_LABEL = 'Harbor Bakery Launch';
export const BAKERY_DESCRIPTION =
	'Synthetic QA project: opening a small neighborhood bakery on Harbor Street. ' +
	'Lease, equipment, opening-week menu.';

export const POTTERY_NOTE = {
	title: 'Pottery class idea',
	body: 'Weekend pottery class for beginners: 6 seats at $45 each. Ask the Elm Street community center first.'
};
export const DESK_NOTE = {
	title: 'Standing desk options',
	body: 'Compare two standing desks for the home office, budget about $400.'
};
export const FLOUR_NOTE = {
	title: 'Flour supplier price list',
	body: 'Miller & Daughters quote: $38 per 50 lb bag of bread flour; they deliver on Tuesdays.'
};
export const GARDEN_NOTES = [
	{
		slug: 'gardenLayout',
		title: 'Community garden: plot layout',
		body: 'Twelve raised beds along the south fence, a tool shed by the gate, two hose bibs.'
	},
	{
		slug: 'gardenVolunteers',
		title: 'Community garden: volunteer sign-up sheet',
		body: 'Saturday work crews, 9 to noon. Need names, phone numbers, and which Saturdays.'
	},
	{
		slug: 'gardenGrant',
		title: 'Community garden: city grant deadline',
		body: 'The city neighborhood-greening grant closes November 30. Need a budget and two letters of support.'
	}
] as const;
export const PASSPORT_TASK_TITLE = 'Renew passport';

// --- Safety -------------------------------------------------------------------

/** Refuse destructive Workspace resets on anything but a dedicated harness account. */
export async function assertHarnessAccount(ctx: ScenarioContext): Promise<void> {
	const { data, error } = await ctx.db.admin
		.from('users')
		.select('email')
		.eq('id', ctx.db.userId)
		.maybeSingle();
	const email = (data as { email?: string | null } | null)?.email ?? '';
	if (error || !WORKSPACE_RESET_ACCOUNT.test(email)) {
		throw new Error(
			'[seed] the Workspace chat battery resets the Workspace and runs only as a dedicated ' +
				`agentic-e2e…@example.com harness account (${error?.message ?? 'another account'})`
		);
	}
}

// --- Seeding ------------------------------------------------------------------

/**
 * Hard-delete the harness account's Workspace (loose docs, tasks and suggestions
 * cascade) and create a fresh one through the server's own RPC. Returns its id.
 */
export async function resetHarnessWorkspace(ctx: ScenarioContext): Promise<string> {
	await assertHarnessAccount(ctx);
	const { error: deleteError } = await ctx.db.admin
		.from('onto_projects')
		.delete()
		.eq('created_by', ctx.db.actorId)
		.eq('kind', 'workspace');
	if (deleteError)
		throw new Error(`[seed] could not clear the Workspace: ${deleteError.message}`);
	const { data, error } = await ctx.db.admin.rpc('ensure_workspace_project_for_user', {
		p_user_id: ctx.db.userId
	});
	if (error || typeof data !== 'string' || !data) {
		throw new Error(`[seed] could not create the Workspace: ${error?.message ?? 'no id'}`);
	}
	return data.toLowerCase();
}

/** A loose note shaped like the Workspace's own quick capture (captureLooseItem). */
export async function seedLooseNote(
	ctx: ScenarioContext,
	workspaceId: string,
	note: { title: string; body: string }
): Promise<string> {
	const { data, error } = await ctx.db.admin
		.from('onto_documents')
		.insert({
			project_id: workspaceId,
			title: note.title,
			type_key: WORKSPACE_NOTE_TYPE_KEY,
			state_key: 'draft',
			content: note.body,
			props: { body_markdown: note.body, captured_via: 'agentic-e2e' },
			created_by: ctx.db.actorId
		} as never)
		.select('id')
		.single();
	const id = (data as { id?: string } | null)?.id;
	if (error || !id) throw new Error(`[seed] loose note failed: ${error?.message ?? 'no id'}`);
	try {
		await addDocumentToTree(
			ctx.db.admin as never,
			workspaceId,
			id,
			{ title: note.title, description: null },
			ctx.db.actorId
		);
	} catch (treeError) {
		// The capture path treats the tree as best effort too; the shelf reads rows.
		console.warn(`[seed] could not add loose note to the Workspace tree: ${String(treeError)}`);
	}
	return id.toLowerCase();
}

/** A loose Workspace task, optionally due at the end of a New York civil day. */
export async function seedLooseTask(
	ctx: ScenarioContext,
	workspaceId: string,
	task: { title: string; dueDate?: string }
): Promise<string> {
	const { data, error } = await ctx.db.admin
		.from('onto_tasks')
		.insert({
			project_id: workspaceId,
			title: task.title,
			type_key: 'task.default',
			state_key: 'todo',
			priority: 3,
			created_by: ctx.db.actorId,
			props: { captured_via: 'agentic-e2e' },
			...(task.dueDate ? { due_at: zonedEndOfDay(task.dueDate) } : {})
		} as never)
		.select('id')
		.single();
	const id = (data as { id?: string } | null)?.id;
	if (error || !id) throw new Error(`[seed] loose task failed: ${error?.message ?? 'no id'}`);
	return id.toLowerCase();
}

export interface BakeryTaskSpec {
	slug: string;
	title: string;
	dueDate?: string;
}

export function bakeryProjectSpec(
	name: string,
	tasks: readonly BakeryTaskSpec[] = []
): ProjectSpec {
	return {
		project: {
			name,
			type_key: 'project.business.product_launch',
			description: BAKERY_DESCRIPTION
		},
		entities: tasks.map((task) => ({
			temp_id: task.slug,
			kind: 'task' as const,
			title: task.title,
			type_key: 'task.default',
			state_key: 'todo',
			priority: 2,
			props: { fixture_marker: 'workspace-chat' },
			...(task.dueDate ? { due_at: zonedEndOfDay(task.dueDate) } : {})
		})),
		relationships: []
	};
}

/** Non-Workspace projects the harness actor owns right now. */
export async function listOwnedProjectIds(ctx: ScenarioContext): Promise<string[]> {
	const { data, error } = await ctx.db.admin
		.from('onto_projects')
		.select('id')
		.eq('created_by', ctx.db.actorId)
		.neq('kind', 'workspace')
		.is('deleted_at', null);
	if (error) throw new Error(`[assert] could not list projects: ${error.message}`);
	return ((data ?? []) as Array<{ id: string }>).map((row) => row.id.toLowerCase()).sort();
}

export interface WorkspaceSeed extends SeedResult {
	projectId: string;
	notes: {
		seededAt: string;
		workspaceId: string;
		projectName: string;
		/** Owned non-Workspace project ids after seeding: the "no new project" baseline. */
		projectIdsBefore: string[];
		projectDocIds: string[];
		projectTaskIds: string[];
		seededSessionIds: string[];
		[key: string]: unknown;
	};
}

/**
 * A fresh Workspace with the given loose items plus one ordinary project. Loose
 * items are keyed by slug in `entityIds`; `workspace` is the Workspace id.
 */
export async function seedWorkspaceCase(
	ctx: ScenarioContext,
	options: {
		projectName: string;
		projectTasks?: readonly BakeryTaskSpec[];
		looseNotes?: ReadonlyArray<{ slug: string; title: string; body: string }>;
		looseTasks?: ReadonlyArray<{ slug: string; title: string; dueDate?: string }>;
	}
): Promise<WorkspaceSeed> {
	const seededAt = new Date().toISOString();
	const workspaceId = await resetHarnessWorkspace(ctx);
	const entityIds: Record<string, string> = { workspace: workspaceId };
	for (const note of options.looseNotes ?? []) {
		entityIds[note.slug] = await seedLooseNote(ctx, workspaceId, note);
	}
	for (const task of options.looseTasks ?? []) {
		entityIds[task.slug] = await seedLooseTask(ctx, workspaceId, task);
	}
	const { projectId } = await seedProject(
		ctx,
		bakeryProjectSpec(options.projectName, options.projectTasks ?? [])
	);
	const [projectDocs, projectTasks] = await Promise.all([
		listDocuments(ctx.db.admin, projectId),
		listTasks(ctx.db.admin, projectId)
	]);
	for (const task of options.projectTasks ?? []) {
		const row = projectTasks.find((candidate) => candidate.title === task.title);
		if (!row) throw new Error(`[seed] project task "${task.title}" was not created`);
		entityIds[task.slug] = row.id.toLowerCase();
	}
	return {
		projectId,
		entityIds,
		notes: {
			seededAt,
			workspaceId,
			projectName: options.projectName,
			projectIdsBefore: await listOwnedProjectIds(ctx),
			projectDocIds: projectDocs.map((doc) => doc.id.toLowerCase()).sort(),
			projectTaskIds: projectTasks.map((task) => task.id.toLowerCase()).sort(),
			seededSessionIds: []
		}
	};
}

/**
 * A finished earlier Workspace chat, so the opening view's "recent conversations"
 * holds a known, unrelated thread. The session row is created now (so the deployed
 * battery's cleanup, which deletes this run's sessions, also finds it); its messages
 * are back-dated, which is what `last_message_at` and the opening view read.
 */
export async function seedPriorWorkspaceChat(
	ctx: ScenarioContext,
	chat: { userMessage: string; assistantMessage: string; hoursAgo: number }
): Promise<string> {
	const { data, error } = await ctx.db.admin
		.from('chat_sessions')
		.insert({
			user_id: ctx.db.userId,
			context_type: 'global',
			chat_type: 'general',
			status: 'active'
		} as never)
		.select('id')
		.single();
	const sessionId = (data as { id?: string } | null)?.id;
	if (error || !sessionId) {
		throw new Error(`[seed] prior chat session failed: ${error?.message ?? 'no id'}`);
	}
	const at = Date.now() - chat.hoursAgo * 3_600_000;
	const { error: messageError } = await ctx.db.admin.from('chat_messages').insert([
		{
			session_id: sessionId,
			user_id: ctx.db.userId,
			role: 'user',
			message_type: 'user_message',
			content: chat.userMessage,
			created_at: new Date(at).toISOString()
		},
		{
			session_id: sessionId,
			user_id: ctx.db.userId,
			role: 'assistant',
			message_type: 'assistant_message',
			content: chat.assistantMessage,
			created_at: new Date(at + 60_000).toISOString()
		}
	] as never);
	if (messageError) throw new Error(`[seed] prior chat messages failed: ${messageError.message}`);
	return sessionId;
}

/**
 * Case cleanup beyond the seeded project (the runner deletes that): seeded chats,
 * any project the agent created during the case, and the Workspace itself (it is
 * recreated on next use). Harness account only.
 */
export async function teardownWorkspaceCase(ctx: ScenarioContext, seed: SeedResult): Promise<void> {
	await assertHarnessAccount(ctx);
	const notes = seed.notes as Partial<WorkspaceSeed['notes']>;
	for (const sessionId of notes.seededSessionIds ?? []) {
		await ctx.db.admin
			.from('chat_sessions')
			.delete()
			.eq('id', sessionId)
			.eq('user_id', ctx.db.userId);
	}
	if (notes.seededAt) {
		const before = new Set(notes.projectIdsBefore ?? []);
		const created = (await listOwnedProjectIds(ctx)).filter((id) => !before.has(id));
		if (created.length) {
			await ctx.db.admin
				.from('onto_projects')
				.delete()
				.eq('created_by', ctx.db.actorId)
				.in('id', created);
		}
	}
	await ctx.db.admin
		.from('onto_projects')
		.delete()
		.eq('created_by', ctx.db.actorId)
		.eq('kind', 'workspace');
}

// --- Reading results ------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

/** The ready card envelope however deep the transport nested it (the browser's rule). */
export function findReadyProposalCard(value: unknown, depth = 0): Record<string, unknown> | null {
	if (depth > 5) return null;
	const record = asRecord(value);
	if (!record) return null;
	if (record.card_rail === PROPOSAL_CARD_RAIL && record.status === PROPOSAL_CARD_READY_STATUS)
		return record;
	return (
		findReadyProposalCard(record.result, depth + 1) ??
		findReadyProposalCard(record.data, depth + 1)
	);
}

export interface WorkspaceCardView {
	kind: string;
	payload: Record<string, unknown>;
	itemKeys: string[];
}

function cardView(envelope: Record<string, unknown>): WorkspaceCardView {
	const payload = asRecord(asRecord(envelope.client_action)?.payload) ?? {};
	const items = Array.isArray(payload.items) ? payload.items : [];
	return {
		kind: String(envelope.kind ?? ''),
		payload,
		itemKeys: items
			.map((item) => asRecord(item))
			.filter((item): item is Record<string, unknown> => item !== null)
			.map((item) => `${String(item.entity)}:${String(item.id).toLowerCase()}`)
			.sort()
	};
}

/**
 * Ready cards a tool showed this turn: from the live `tool_result` events, else
 * from the durable `chat_tool_executions` rows (the browser restores from either).
 */
export async function readyCardsForTool(
	turn: TurnResult,
	ctx: ScenarioContext,
	toolName: string
): Promise<WorkspaceCardView[]> {
	const fromStream = turn.toolResults
		.filter((result) => result.tool_name === toolName)
		.map((result) => findReadyProposalCard(result))
		.filter((card): card is Record<string, unknown> => card !== null);
	if (fromStream.length) return fromStream.map(cardView);
	if (!turn.streamRunId) return [];
	const executions = await getToolExecutions(ctx.db.admin, turn.streamRunId);
	return executions
		.filter((execution) => execution.tool_name === toolName)
		.map((execution) => findReadyProposalCard(execution.result))
		.filter((card): card is Record<string, unknown> => card !== null)
		.map(cardView);
}

/** A compact view of what a proposal tool returned, for failure messages. */
export function describeToolResults(turn: TurnResult, toolName: string): string {
	return (
		turn.toolResults
			.filter((result) => result.tool_name === toolName)
			.map((result) => JSON.stringify(result).slice(0, 400))
			.join(' | ') || '(no result on the stream)'
	);
}

export function documentKey(id: string): string {
	return `document:${id.toLowerCase()}`;
}

// --- Assertions -----------------------------------------------------------------

/** No proposal card tool ran: a read or a save must not put a card in front of the user. */
export function assertNoWorkspaceCards(turn: TurnResult, why: string): void {
	const called = turn.toolCalls
		.map((call) => call.function.name)
		.filter((name) => (WORKSPACE_CARD_TOOLS as readonly string[]).includes(name));
	if (called.length) {
		throw new Error(`[assert] ${why}, but the agent called [${called.join(', ')}]`);
	}
}

/** None of the tools that would move loose items or create a project without a click. */
export function assertNoCardBypass(turn: TurnResult): void {
	const called = turn.toolCalls
		.map((call) => call.function.name)
		.filter((name) => (CARD_BYPASS_TOOLS as readonly string[]).includes(name));
	if (called.length) {
		throw new Error(
			`[assert] graduating or filing loose items is card-only, but the agent called ` +
				`[${called.join(', ')}]`
		);
	}
}

export async function assertNoNewProjects(
	ctx: ScenarioContext,
	seed: WorkspaceSeed
): Promise<void> {
	const before = new Set(seed.notes.projectIdsBefore);
	const created = (await listOwnedProjectIds(ctx)).filter((id) => !before.has(id));
	if (created.length) {
		throw new Error(
			`[assert] the agent created ${created.length} project(s) [${created.join(', ')}]; ` +
				'Workspace chat must never create a project on its own'
		);
	}
}

/** The seeded project gained no docs or tasks, and none of its docs carries `sentinel`. */
export async function assertProjectUntouched(
	ctx: ScenarioContext,
	seed: WorkspaceSeed,
	sentinel?: string
): Promise<void> {
	const [docs, tasks] = await Promise.all([
		listDocuments(ctx.db.admin, seed.projectId),
		listTasks(ctx.db.admin, seed.projectId)
	]);
	const docIds = docs.map((doc) => doc.id.toLowerCase()).sort();
	const taskIds = tasks.map((task) => task.id.toLowerCase()).sort();
	if (JSON.stringify(docIds) !== JSON.stringify(seed.notes.projectDocIds)) {
		throw new Error(
			`[assert] ${seed.notes.projectName} documents changed: before=` +
				`${JSON.stringify(seed.notes.projectDocIds)} after=${JSON.stringify(docIds)} ` +
				`[${docs.map((doc) => doc.title).join(', ')}]`
		);
	}
	if (JSON.stringify(taskIds) !== JSON.stringify(seed.notes.projectTaskIds)) {
		throw new Error(
			`[assert] ${seed.notes.projectName} tasks changed: ` +
				`[${tasks.map((task) => task.title).join(', ')}]`
		);
	}
	if (sentinel) {
		const carrier = docs.find((doc) =>
			includesNormalized(`${doc.title}\n${doc.content ?? ''}`, sentinel)
		);
		if (carrier) {
			throw new Error(
				`[assert] the Workspace note (${sentinel}) was written into project doc "${carrier.title}"`
			);
		}
	}
}

export interface WorkspaceContents {
	docs: DocumentRow[];
	tasks: TaskRow[];
}

export async function readWorkspace(
	ctx: ScenarioContext,
	workspaceId: string
): Promise<WorkspaceContents> {
	const [docs, tasks] = await Promise.all([
		listDocuments(ctx.db.admin, workspaceId),
		listTasks(ctx.db.admin, workspaceId)
	]);
	return { docs: excludeSystemDocuments(docs), tasks };
}

/**
 * Exactly one new loose note landed in the Workspace, carrying the user's reference
 * code verbatim, and nothing else was added there. Returns the note row.
 */
export async function assertSingleWorkspaceNote(
	ctx: ScenarioContext,
	seed: WorkspaceSeed,
	sentinel: string
): Promise<DocumentRow> {
	const { docs, tasks } = await readWorkspace(ctx, seed.notes.workspaceId);
	const carriers = docs.filter((doc) =>
		includesNormalized(`${doc.title}\n${doc.content ?? ''}`, sentinel)
	);
	if (carriers.length !== 1 || docs.length !== 1) {
		throw new Error(
			`[assert] expected exactly one Workspace note carrying ${sentinel}; the Workspace holds ` +
				`${docs.length} doc(s) [${docs.map((doc) => `${doc.title} (${doc.type_key})`).join(', ')}], ` +
				`${carriers.length} with the reference`
		);
	}
	if (tasks.length) {
		throw new Error(
			`[assert] a note request also created Workspace task(s): ` +
				`[${tasks.map((task) => task.title).join(', ')}]`
		);
	}
	const note = carriers[0]!;
	if (note.type_key !== WORKSPACE_NOTE_TYPE_KEY) {
		// Placement is the contract; the type only changes the shelf label (note vs doc).
		console.warn(
			`[agentic-e2e] Workspace note saved as ${note.type_key}, not ${WORKSPACE_NOTE_TYPE_KEY}`
		);
	}
	return note;
}

/**
 * Fingerprint of everything in the Workspace and the seeded project: which rows
 * exist, where they live, their state and title. `updated_at` is left out on
 * purpose: background jobs the seed's inserts queue (embeddings, task entity
 * extraction) touch rows without any chat write.
 */
export async function workspaceAndProjectFingerprint(
	ctx: ScenarioContext,
	seed: WorkspaceSeed
): Promise<string> {
	const [workspace, projectDocs, projectTasks] = await Promise.all([
		readWorkspace(ctx, seed.notes.workspaceId),
		listDocuments(ctx.db.admin, seed.projectId),
		listTasks(ctx.db.admin, seed.projectId)
	]);
	return [...workspace.docs, ...workspace.tasks, ...projectDocs, ...projectTasks]
		.map((row) => `${row.id}:${row.project_id}:${row.state_key}:${row.title}`)
		.sort()
		.join('|');
}

// --- Dates ------------------------------------------------------------------------

/** New York civil date `offsetDays` from today, the clock the harness user's prompt uses. */
export function harnessCivilDate(offsetDays = 0, now = new Date()): string {
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: HARNESS_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(now);
	const date = new Date(`${today}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + offsetDays);
	return date.toISOString().slice(0, 10);
}

/** "Friday, October 23, 2026" for a civil date, for judge rubrics. */
export function readableDate(civilDate: string): string {
	return new Date(`${civilDate}T12:00:00.000Z`).toLocaleDateString('en-US', {
		timeZone: 'UTC',
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
}

export function bakeryProjectName(): string {
	return harnessProjectName(BAKERY_PROJECT_LABEL);
}
