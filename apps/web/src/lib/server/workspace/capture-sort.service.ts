// apps/web/src/lib/server/workspace/capture-sort.service.ts
//
// Runs smart capture's second step (see capture-sort-core.ts): read the note that was
// just saved, ask a fast model what it is, then carry that out through the same routes
// the app uses everywhere else (task and doc create, task update, doc delete, Organize
// move), so calendar sync, history, logs and the doc tree behave as usual. Every change
// is recorded in a receipt the person can undo from the toast.
import type { Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveUserCivilTimezone } from '@buildos/shared-agent-ops';
import { ensureWorkspaceProjectId } from '@buildos/shared-agent-ops/ontology/ontology-projects.service';
import { fetchProjectSummaries } from '$lib/services/ontology/ontology-projects.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import { isActiveFacing } from '$lib/config/project-states';
import {
	NOTE_TYPE_KEY,
	type LooseEntity,
	type LooseItem
} from '$lib/components/workspace/workspace-model';
import {
	CAPTURE_SORT_OPERATION,
	CAPTURE_SORT_SYSTEM_PROMPT,
	buildCaptureSortPrompt,
	buildSortContext,
	checkCaptureSortAnswer,
	civilToday,
	planCaptureSort,
	type SortContext,
	type SortedItem,
	type SortedUpdate
} from './capture-sort-core';
import {
	captureLooseItem,
	moveItems,
	toLooseDoc,
	toLooseTask,
	undoMoveBatch,
	WorkspaceError
} from './workspace.service';

type Client = SupabaseClient<Database>;
type Fetch = typeof fetch;

/** Only a fresh capture is sorted, once. Older notes are the person's to file. */
const SORT_WINDOW_MS = 30 * 60 * 1000;
/** A runaway client can't turn capture into a spend leak. */
const SORT_DAILY_CAP = 150;
const SORT_MAX_COST_USD = 0.005;
const TASK_QUERY_LIMIT = 400;

export type SortReceipt = {
	document_id: string;
	move_batch: string | null;
	created: { entity: LooseEntity; id: string }[];
	updates: {
		task_id: string;
		action: 'complete' | 'reschedule';
		before: { state_key: string; due_at: string | null };
	}[];
	removed_note: { text: string } | null;
};

export type CaptureSortResult = {
	outcome: 'kept' | 'moved' | 'sorted' | 'partial' | 'skipped';
	/** Plain lines for the toast: what happened, where. */
	lines: string[];
	/** New loose items now in the Workspace. */
	added: LooseItem[];
	/** Loose items that left the Workspace (the original note). */
	removed_ids: string[];
	receipt: SortReceipt | null;
};

type DocRow = {
	id: string;
	project_id: string;
	title: string | null;
	type_key: string | null;
	content: string | null;
	description: string | null;
	props: unknown;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
};

const skipped = (line?: string): CaptureSortResult => ({
	outcome: 'skipped',
	lines: line ? [line] : [],
	added: [],
	removed_ids: [],
	receipt: null
});

function shortDate(date: string): string {
	const parsed = new Date(`${date.slice(0, 10)}T12:00:00Z`);
	return Number.isNaN(parsed.getTime())
		? date
		: parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function callRoute(
	fetchFn: Fetch,
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown
): Promise<{ ok: boolean; data: Record<string, any> | null; error: string | null }> {
	try {
		const response = await fetchFn(url, {
			method,
			headers: { 'Content-Type': 'application/json', 'X-Change-Source': 'workspace' },
			body: JSON.stringify(body ?? {})
		});
		const payload = (await response.json().catch(() => null)) as Record<string, any> | null;
		if (!response.ok) {
			const error =
				(typeof payload?.error === 'string' && payload.error) ||
				payload?.error?.message ||
				`${method} ${url} failed (${response.status})`;
			return { ok: false, data: null, error };
		}
		return { ok: true, data: (payload?.data ?? payload) as Record<string, any>, error: null };
	} catch (error) {
		return { ok: false, data: null, error: error instanceof Error ? error.message : 'failed' };
	}
}

async function markNote(session: Client, doc: DocRow, sorted: string) {
	const props =
		doc.props && typeof doc.props === 'object' && !Array.isArray(doc.props)
			? (doc.props as Record<string, unknown>)
			: {};
	const { error } = await session
		.from('onto_documents')
		.update({ props: { ...props, sorted, sorted_at: new Date().toISOString() } as never })
		.eq('id', doc.id);
	if (error) console.warn('[Workspace sort] could not mark the note:', error.message);
}

/**
 * Takes the note for this sort, so a retry that lands while the model call runs (a phone on a
 * bad connection resending) cannot sort it twice. Postgres re-checks the WHERE clause on the
 * locked row, so only one request wins. An unexpected error lets the sort go ahead, as before.
 */
async function claimNote(session: Client, doc: DocRow): Promise<boolean> {
	const props =
		doc.props && typeof doc.props === 'object' && !Array.isArray(doc.props)
			? (doc.props as Record<string, unknown>)
			: {};
	const { data, error } = await session
		.from('onto_documents')
		.update({
			props: { ...props, sorted: 'sorting', sorted_at: new Date().toISOString() } as never
		})
		.eq('id', doc.id)
		.is('props->>sorted', null)
		.select('id');
	if (error) {
		console.warn('[Workspace sort] could not claim the note:', error.message);
		return true;
	}
	return Array.isArray(data) && data.length > 0;
}

async function sortsToday(admin: Client, userId: string): Promise<number> {
	const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
	const { count, error } = await admin
		.from('llm_usage_logs')
		.select('id', { count: 'exact', head: true })
		.eq('user_id', userId)
		.eq('operation_type', CAPTURE_SORT_OPERATION)
		.gte('created_at', since);
	if (error) return 0;
	return count ?? 0;
}

async function loadSortContext(input: {
	session: Client;
	userId: string;
	actorId: string;
	workspaceId: string;
}): Promise<SortContext> {
	const { session, userId, actorId, workspaceId } = input;
	const [summaries, timezone] = await Promise.all([
		fetchProjectSummaries(session as never, actorId),
		resolveUserCivilTimezone(session as never, userId)
	]);
	const projects = summaries
		.filter(
			(project) =>
				project.kind !== 'workspace' &&
				(project.access_level === 'admin' || project.access_level === 'write') &&
				isActiveFacing(project.state_key)
		)
		.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
	const projectIds = [workspaceId, ...projects.map((project) => project.id)];
	const { data: taskRows, error } = await session
		.from('onto_tasks')
		.select('id, title, project_id, state_key, due_at, updated_at')
		.in('project_id', projectIds)
		.is('deleted_at', null)
		.is('archived_at', null)
		.neq('state_key', 'done')
		.order('updated_at', { ascending: false })
		.limit(TASK_QUERY_LIMIT);
	if (error) console.warn('[Workspace sort] open tasks did not load:', error.message);
	const zone = timezone ?? 'UTC';
	const { today, weekday } = civilToday(new Date(), zone);
	return buildSortContext({
		workspaceId,
		projects: projects.map((project) => ({
			id: project.id,
			name: project.name,
			description: project.description ?? null
		})),
		tasks: (taskRows ?? []).map((task) => ({
			id: task.id,
			title: task.title,
			project_id: task.project_id,
			state_key: task.state_key,
			due_at: task.due_at
		})),
		today,
		weekday,
		timezone: zone
	});
}

function describeItem(item: SortedItem, projectName: string | null): string {
	const due = item.due ? ` · due ${shortDate(item.due)}` : '';
	const kind = item.kind === 'task' ? 'Task' : 'Note';
	return projectName
		? `${kind} in ${projectName}: ${item.title}${due}`
		: `${kind}: ${item.title}${due}`;
}

function describeUpdate(update: SortedUpdate, projectName: string | null): string {
	const where = projectName ?? 'Workspace';
	return update.action === 'complete'
		? `Done in ${where}: ${update.title}`
		: `Moved to ${shortDate(update.due ?? '')} in ${where}: ${update.title}`;
}

/**
 * Sorts a note the person just captured. The note is already saved, so any failure here
 * leaves it exactly as it was.
 */
export async function sortCapturedNote(input: {
	session: Client;
	admin: Client;
	userId: string;
	actorId: string;
	documentId: string;
	fetch: Fetch;
	source?: string;
}): Promise<CaptureSortResult> {
	const { session, admin, userId, actorId, documentId } = input;
	const workspaceId = await ensureWorkspaceProjectId(session as never);
	const { data: docData, error: docError } = await session
		.from('onto_documents')
		.select(
			'id, project_id, title, type_key, content, description, props, created_at, updated_at, deleted_at'
		)
		.eq('id', documentId)
		.maybeSingle();
	const doc = docData as DocRow | null;
	if (docError || !doc || doc.deleted_at) return skipped();
	const props = (doc.props ?? {}) as Record<string, unknown>;
	if (
		doc.project_id !== workspaceId ||
		doc.type_key !== NOTE_TYPE_KEY ||
		props.sorted ||
		Date.now() - Date.parse(doc.created_at) > SORT_WINDOW_MS
	) {
		return skipped();
	}
	const text = (doc.content ?? '').trim();
	if (!text) return skipped();
	if ((await sortsToday(admin, userId)) >= SORT_DAILY_CAP) {
		return skipped('Saved as a note. Sorting is paused for today.');
	}
	if (!(await claimNote(session, doc))) return skipped();

	const context = await loadSortContext({ session, userId, actorId, workspaceId });
	let raw: unknown = null;
	try {
		raw = await new SmartLLMService({
			supabase: admin,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Workspace'
		}).getJSONResponse<Record<string, unknown>>({
			systemPrompt: CAPTURE_SORT_SYSTEM_PROMPT,
			userPrompt: buildCaptureSortPrompt(text, context),
			userId,
			projectId: workspaceId,
			profile: 'fast',
			temperature: 0.1,
			maxTokens: 900,
			timeoutMs: 20_000,
			validation: { retryOnParseError: true, maxRetries: 1 },
			operationType: CAPTURE_SORT_OPERATION,
			spendLimit: { maxCostUsd: SORT_MAX_COST_USD },
			metadata: { document_id: doc.id, source: input.source ?? 'workspace' }
		});
	} catch (error) {
		console.warn(
			'[Workspace sort] model call failed; the note stays as it is:',
			error instanceof Error ? error.message : error
		);
		await markNote(session, doc, 'unsorted');
		return { ...skipped(), outcome: 'kept' };
	}

	const checked = checkCaptureSortAnswer(raw, context);
	const plan = planCaptureSort(checked);
	const projectName = new Map(context.projects.map((project) => [project.id, project.name]));
	const nameOf = (projectId: string | null) =>
		projectId && projectId !== workspaceId ? (projectName.get(projectId) ?? null) : null;

	if (plan.kind === 'keep') {
		await markNote(session, doc, 'kept');
		return { outcome: 'kept', lines: [], added: [], removed_ids: [], receipt: null };
	}

	if (plan.kind === 'move') {
		try {
			const receipt = await moveItems({
				session,
				admin,
				userId,
				sourceId: workspaceId,
				destinationId: plan.projectId,
				items: [{ entity: 'document', id: doc.id }]
			});
			await markNote(session, doc, 'moved');
			return {
				outcome: 'moved',
				lines: [`Note filed in ${nameOf(plan.projectId) ?? 'a project'}`],
				added: [],
				removed_ids: [doc.id],
				receipt: {
					document_id: doc.id,
					move_batch: receipt.batch_id,
					created: [],
					updates: [],
					removed_note: null
				}
			};
		} catch (error) {
			console.warn('[Workspace sort] move failed; keeping the note:', error);
			await markNote(session, doc, 'kept');
			return { outcome: 'kept', lines: [], added: [], removed_ids: [], receipt: null };
		}
	}

	// Replace the note with what was found in it.
	const receipt: SortReceipt = {
		document_id: doc.id,
		move_batch: null,
		created: [],
		updates: [],
		removed_note: null
	};
	const lines: string[] = [];
	const added: LooseItem[] = [];
	let failures = 0;
	const source = input.source ?? 'workspace';

	for (const item of plan.items) {
		const projectId = item.projectId ?? workspaceId;
		if (item.kind === 'task') {
			const created = await callRoute(input.fetch, '/api/onto/tasks/create', 'POST', {
				project_id: projectId,
				title: item.title,
				description: item.details || undefined,
				due_at: item.due ?? undefined,
				state_key: 'todo',
				props: { captured_via: source, sorted_from: doc.id }
			});
			const task = created.data?.task;
			if (!created.ok || !task?.id) {
				failures += 1;
				console.warn('[Workspace sort] task create failed:', created.error);
				continue;
			}
			receipt.created.push({ entity: 'task', id: task.id });
			if (projectId === workspaceId) added.push(toLooseTask(task));
		} else {
			const created = await callRoute(input.fetch, '/api/onto/documents/create', 'POST', {
				project_id: projectId,
				title: item.title,
				content: item.details || item.title,
				type_key: NOTE_TYPE_KEY,
				state_key: 'draft',
				props: { captured_via: source, sorted_from: doc.id }
			});
			const document = created.data?.document;
			if (!created.ok || !document?.id) {
				failures += 1;
				console.warn('[Workspace sort] note create failed:', created.error);
				continue;
			}
			receipt.created.push({ entity: 'document', id: document.id });
			if (projectId === workspaceId) added.push(toLooseDoc(document));
		}
		lines.push(describeItem(item, nameOf(item.projectId)));
	}

	for (const update of plan.updates) {
		const body = update.action === 'complete' ? { state_key: 'done' } : { due_at: update.due };
		const changed = await callRoute(
			input.fetch,
			`/api/onto/tasks/${update.taskId}`,
			'PATCH',
			body
		);
		if (!changed.ok) {
			failures += 1;
			console.warn('[Workspace sort] task update failed:', changed.error);
			continue;
		}
		receipt.updates.push({
			task_id: update.taskId,
			action: update.action,
			before: update.before
		});
		lines.push(describeUpdate(update, nameOf(update.projectId)));
	}

	const nothingDone = !receipt.created.length && !receipt.updates.length;
	if (failures || nothingDone) {
		// Something didn't land: keep the original so nothing the person wrote is lost.
		await markNote(session, doc, nothingDone ? 'kept' : 'partial');
		return {
			outcome: nothingDone ? 'kept' : 'partial',
			lines,
			added,
			removed_ids: [],
			receipt: nothingDone ? null : receipt
		};
	}

	const removed = await callRoute(input.fetch, `/api/onto/documents/${doc.id}`, 'DELETE', {});
	if (!removed.ok) {
		await markNote(session, doc, 'partial');
		return { outcome: 'partial', lines, added, removed_ids: [], receipt };
	}
	receipt.removed_note = { text };
	return { outcome: 'sorted', lines, added, removed_ids: [doc.id], receipt };
}

/** Puts things back the way they were typed: removes what sorting created, restores task
 * states and dates, and brings the original note back (or moves it home again). Every
 * step runs as the person, so a receipt can only touch what they can already edit. */
export async function undoCaptureSort(input: {
	session: Client;
	admin: Client;
	userId: string;
	actorId: string;
	fetch: Fetch;
	receipt: SortReceipt;
}): Promise<{ restored: LooseItem | null; removed_ids: string[]; failed: number }> {
	const { session, admin, userId, actorId, receipt } = input;
	let failed = 0;
	let restored: LooseItem | null = null;

	if (receipt.move_batch) {
		const ok = await undoMoveBatch({ session, admin, userId, batchId: receipt.move_batch });
		if (!ok)
			throw new WorkspaceError('That note has changed since; it stays where it is.', 409);
		const { data } = await session
			.from('onto_documents')
			.select('id, title, type_key, content, description, created_at, updated_at')
			.eq('id', receipt.document_id)
			.maybeSingle();
		restored = data ? toLooseDoc(data as never) : null;
		return { restored, removed_ids: [], failed };
	}

	for (const created of receipt.created) {
		const url =
			created.entity === 'task'
				? `/api/onto/tasks/${created.id}`
				: `/api/onto/documents/${created.id}`;
		const removed = await callRoute(input.fetch, url, 'DELETE', {});
		if (!removed.ok) failed += 1;
	}
	for (const update of receipt.updates) {
		// Send back only the field sorting changed.
		const body =
			update.action === 'complete'
				? { state_key: update.before.state_key }
				: { due_at: update.before.due_at };
		const changed = await callRoute(
			input.fetch,
			`/api/onto/tasks/${update.task_id}`,
			'PATCH',
			body
		);
		if (!changed.ok) failed += 1;
	}
	if (receipt.removed_note?.text) {
		const result = await captureLooseItem({
			session,
			userId,
			actorId,
			capture: { kind: 'note', text: receipt.removed_note.text, source: 'undo' }
		});
		restored = result.item;
		const { data } = await session
			.from('onto_documents')
			.select('props')
			.eq('id', result.item.id)
			.maybeSingle();
		const props = (data?.props ?? {}) as Record<string, unknown>;
		// The restored note is the person's words again: never sort it a second time.
		await session
			.from('onto_documents')
			.update({ props: { ...props, sorted: 'undone' } as never })
			.eq('id', result.item.id);
	}
	return {
		restored,
		removed_ids: receipt.created.map((created) => created.id),
		failed
	};
}
