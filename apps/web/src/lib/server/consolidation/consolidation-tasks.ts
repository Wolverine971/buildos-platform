// apps/web/src/lib/server/consolidation/consolidation-tasks.ts
//
// Apply and Undo for task consolidation (DJ's picks, 2026-10-04): merge
// duplicates into one task, gather pieces or steps in a plan, roll siblings up
// into one task in the parent project, and close tasks the evidence settles.
// Every write goes through the owner's session, the way the task, plan and
// edge routes write, and every change is recorded with what it replaced so
// Undo can put it back. Task descriptions are plain text, so checklists are
// "☐ title" lines.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import type { ConsolidationOp } from '@buildos/shared-agent-ops/consolidation';
import { prepareRelationshipMutationPlan } from '$lib/services/ontology/auto-organizer.service';
import type {
	ConsolidationReceipt,
	ConsolidationTaskReceipt
} from '$lib/components/consolidation/consolidation-types';

type Client = SupabaseClient<Database>;
type TaskChangeOp = Extract<
	ConsolidationOp,
	{ op: 'merge_tasks' | 'plan_tasks' | 'rollup_tasks' | 'close_tasks' }
>;
type Failure = ConsolidationReceipt['failures'][number];

export function isTaskChangeOp(op: ConsolidationOp): op is TaskChangeOp {
	return (
		op.op === 'merge_tasks' ||
		op.op === 'plan_tasks' ||
		op.op === 'rollup_tasks' ||
		op.op === 'close_tasks'
	);
}

type TaskRow = {
	id: string;
	project_id: string;
	title: string | null;
	description: string | null;
	state_key: string;
	completed_at: string | null;
	props: Json;
	updated_at: string;
	deleted_at: string | null;
};

const TASK_COLUMNS =
	'id, project_id, title, description, state_key, completed_at, props, updated_at, deleted_at';

async function readTasks(session: Client, ids: string[]): Promise<Map<string, TaskRow>> {
	if (!ids.length) return new Map();
	const { data, error } = await session
		.from('onto_tasks')
		.select(TASK_COLUMNS)
		.in('id', [...new Set(ids)]);
	if (error) throw new Error('Could not read the tasks.');
	return new Map((data ?? []).map((row) => [row.id, row as unknown as TaskRow]));
}

/** Tasks with live calendar events: archiving one deletes its events, which Undo can't bring back. */
async function tasksWithEvents(session: Client, ids: string[]): Promise<Set<string>> {
	if (!ids.length) return new Set();
	const { data } = await session
		.from('onto_events')
		.select('owner_entity_id')
		.eq('owner_entity_type', 'task')
		.in('owner_entity_id', ids)
		.is('deleted_at', null);
	return new Set((data ?? []).map((row) => row.owner_entity_id as string));
}

function oneLine(text: string, max: number): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	const chars = Array.from(flat);
	return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : flat;
}

function asObject(value: Json): Record<string, Json> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, Json>)
		: {};
}

export function emptyTaskReceipt(): ConsolidationTaskReceipt {
	return { changed: [], created_plans: [], created_tasks: [] };
}

type ApplyParams = {
	session: Client;
	actorId: string;
	runId: string;
	ops: readonly TaskChangeOp[];
	inFamily: (projectId: string) => boolean;
	projectName: (projectId: string) => string;
	documentTitle: (documentId: string) => string;
	/** Saves the receipt as work lands. */
	save: () => Promise<unknown>;
};

/**
 * Applies the task operations one by one. A task that is gone, archived,
 * moved out of the run's projects, or already handled earlier in this Apply
 * is left alone and listed; so is a task with calendar events that would
 * have to be archived.
 */
export async function applyTaskOps(
	params: ApplyParams,
	tasks: ConsolidationTaskReceipt,
	failures: Failure[]
): Promise<void> {
	const { session, actorId, runId, inFamily } = params;
	const ids = params.ops.flatMap((op) =>
		op.op === 'merge_tasks' ? [op.keep_id, ...op.task_ids] : op.task_ids
	);
	const rows = await readTasks(session, ids);
	const withEvents = await tasksWithEvents(session, ids);
	const handled = new Set<string>();
	const today = new Date().toISOString().slice(0, 10);
	const title = (id: string) => rows.get(id)?.title ?? 'Untitled task';
	/** Why a task is left alone, or null when it can change. */
	const leftAlone = (id: string): string | null => {
		const row = rows.get(id);
		if (!row || row.deleted_at) return 'No longer open; left alone.';
		if (!inFamily(row.project_id))
			return 'Moved out of these projects since the survey; left where it is.';
		if (handled.has(id)) return 'Already changed by another group in this Apply.';
		return null;
	};
	const skip = (id: string, message: string) => failures.push({ id, title: title(id), message });

	/** Edits one task, recording what it was so Undo can put it back. */
	const edit = async (
		id: string,
		patch: Record<string, unknown>,
		how: ConsolidationTaskReceipt['changed'][number]['how'],
		archived: boolean
	) => {
		const row = rows.get(id)!;
		// Taken before the write, so it is what the task was.
		const before = {
			description: row.description,
			state_key: row.state_key,
			completed_at: row.completed_at,
			props: row.props
		};
		const { data, error } = await session
			.from('onto_tasks')
			.update(patch as never)
			.eq('id', id)
			.eq('updated_at', row.updated_at)
			.select('updated_at')
			.maybeSingle();
		if (error || !data) throw new Error('It changed while Apply ran; try again.');
		handled.add(id);
		tasks.changed.push({
			id,
			title: title(id),
			project_id: row.project_id,
			how,
			archived,
			before,
			after_updated_at: data.updated_at
		});
		await params.save();
	};
	const archivePatch = (row: TaskRow, note: Record<string, Json>) => {
		const now = new Date().toISOString();
		return {
			deleted_at: now,
			archived_at: now,
			props: { ...asObject(row.props), consolidation: { run_id: runId, ...note } }
		};
	};

	for (const op of params.ops) {
		try {
			if (op.op === 'merge_tasks') {
				const why = leftAlone(op.keep_id);
				if (why) {
					skip(op.keep_id, why);
					continue;
				}
				const others = op.task_ids.filter((id) => {
					const reason =
						leftAlone(id) ??
						(withEvents.has(id)
							? 'Has calendar events, which archiving would delete; left open.'
							: null);
					if (reason) skip(id, reason);
					return !reason;
				});
				if (!others.length) continue;
				const keep = rows.get(op.keep_id)!;
				const lines = others.map((id) => {
					const notes = rows.get(id)?.description?.trim();
					return `☐ ${title(id)}${notes ? `\n   ${oneLine(notes, 300)}` : ''}`;
				});
				const description = [
					keep.description?.trimEnd() ?? '',
					`Merged in on ${today}:\n${lines.join('\n')}`
				]
					.filter(Boolean)
					.join('\n\n');
				await edit(op.keep_id, { description }, 'merged_into', false);
				for (const id of others)
					await edit(
						id,
						archivePatch(rows.get(id)!, { merged_into: op.keep_id }),
						'merged',
						true
					);
			} else if (op.op === 'close_tasks') {
				const evidence =
					op.how === 'done' && op.evidence_document_id
						? (
								await session
									.from('onto_documents')
									.select('id, title, created_at')
									.eq('id', op.evidence_document_id)
									.is('deleted_at', null)
									.maybeSingle()
							).data
						: null;
				for (const id of op.task_ids) {
					const why =
						leftAlone(id) ??
						(op.how === 'done' && !evidence
							? 'Its evidence doc is gone, so it was not marked done.'
							: op.how === 'archived' && withEvents.has(id)
								? 'Has calendar events, which archiving would delete; left open.'
								: null);
					if (why) {
						skip(id, why);
						continue;
					}
					const row = rows.get(id)!;
					const note =
						op.how === 'done'
							? `Closed on ${today}: ${op.note} See “${evidence!.title ?? params.documentTitle(evidence!.id)}”.`
							: `Archived on ${today}: ${op.note}`;
					const description = [row.description?.trimEnd() ?? '', note]
						.filter(Boolean)
						.join('\n\n');
					if (op.how === 'done')
						await edit(
							id,
							{
								description,
								state_key: 'done',
								completed_at: evidence!.created_at
							},
							'done',
							false
						);
					else
						await edit(
							id,
							{ description, ...archivePatch(row, { closed: op.note }) },
							'archived',
							true
						);
				}
			} else if (op.op === 'plan_tasks') {
				if (!inFamily(op.project_id)) continue;
				const members = op.task_ids.filter((id) => {
					const why =
						leftAlone(id) ??
						(rows.get(id)!.project_id !== op.project_id
							? 'Not in the plan’s project; left out.'
							: null);
					if (why) skip(id, why);
					return !why;
				});
				// A task already in a plan stays there: plans hold a task once.
				const { data: existing } = members.length
					? await session
							.from('onto_edges')
							.select('dst_id')
							.eq('rel', 'has_task')
							.eq('src_kind', 'plan')
							.in('dst_id', members)
					: { data: [] };
				const inPlan = new Set((existing ?? []).map((edge) => edge.dst_id as string));
				const free = members.filter((id) => {
					if (inPlan.has(id)) skip(id, 'Already in a plan; left there.');
					return !inPlan.has(id);
				});
				if (free.length < 2) continue;
				const planId = randomUUID();
				const description = op.sequence
					? `Steps in order:\n${free.map((id, index) => `${index + 1}. ${title(id)}`).join('\n')}`
					: `Pieces of “${title(free[0]!)}”:\n${free.map((id) => `• ${title(id)}`).join('\n')}`;
				const relationshipPlan = await prepareRelationshipMutationPlan({
					supabase: session,
					projectId: op.project_id,
					entity: { kind: 'plan', id: planId },
					connections: [],
					options: { mode: 'replace' },
					referencesValidated: true
				});
				const { error: planError } = await session.rpc('onto_plan_create_atomic', {
					p_plan: {
						id: planId,
						project_id: op.project_id,
						type_key: 'plan.default',
						name: op.name,
						state_key: 'draft',
						plan: null,
						description,
						created_by: actorId,
						props: {
							plan: null,
							description,
							start_date: null,
							end_date: null,
							consolidation: { run_id: runId }
						}
					} as Json,
					p_relationship_plan: relationshipPlan as unknown as Json
				});
				if (planError) throw new Error('Could not create the plan.');
				const created = {
					id: planId,
					name: op.name,
					project_id: op.project_id,
					edge_ids: [] as string[]
				};
				tasks.created_plans.push(created);
				await params.save();
				const edges = [
					...free.map((id, index) => ({
						src_kind: 'plan',
						src_id: planId,
						rel: 'has_task',
						dst_kind: 'task',
						dst_id: id,
						props: { order: index },
						project_id: op.project_id
					})),
					// Each step waits on the one before it.
					...(op.sequence
						? free.slice(1).map((id, index) => ({
								src_kind: 'task',
								src_id: id,
								rel: 'depends_on',
								dst_kind: 'task',
								dst_id: free[index]!,
								props: {},
								project_id: op.project_id
							}))
						: [])
				];
				const { data: inserted, error: edgeError } = await session
					.from('onto_edges')
					.insert(edges as never)
					.select('id');
				if (edgeError) throw new Error('Created the plan but could not add its tasks.');
				created.edge_ids = (inserted ?? []).map((edge) => edge.id as string);
				for (const id of free) handled.add(id);
				await params.save();
			} else if (op.op === 'rollup_tasks') {
				if (!inFamily(op.project_id)) continue;
				const members = op.task_ids.filter((id) => {
					const why = leftAlone(id);
					if (why) skip(id, why);
					return !why;
				});
				if (members.length < 2) continue;
				const taskId = randomUUID();
				const description = `Rolls up work in the sub-projects:\n${members
					.map((id) => `☐ ${title(id)} (${params.projectName(rows.get(id)!.project_id)})`)
					.join('\n')}`;
				const relationshipPlan = await prepareRelationshipMutationPlan({
					supabase: session,
					projectId: op.project_id,
					entity: { kind: 'task', id: taskId },
					connections: [],
					options: { mode: 'replace' },
					referencesValidated: true
				});
				const { error: taskError } = await session.rpc(
					'onto_task_create_with_relationships_atomic',
					{
						p_task: {
							id: taskId,
							project_id: op.project_id,
							title: op.title,
							description,
							type_key: 'task.default',
							state_key: 'todo',
							priority: 3,
							start_at: null,
							due_at: null,
							created_by: actorId,
							props: { consolidation: { run_id: runId, rolls_up: members } }
						} as Json,
						p_relationship_plan: relationshipPlan as unknown as Json,
						p_sync_assignees: false,
						p_source: 'manual'
					}
				);
				if (taskError) throw new Error('Could not create the roll-up task.');
				tasks.created_tasks.push({
					id: taskId,
					title: op.title,
					project_id: op.project_id
				});
				for (const id of members) handled.add(id);
				await params.save();
			}
		} catch (error) {
			failures.push({
				id: null,
				title:
					op.op === 'plan_tasks'
						? op.name
						: op.op === 'rollup_tasks'
							? op.title
							: title(op.op === 'merge_tasks' ? op.keep_id : op.task_ids[0]!),
				message:
					error instanceof Error ? error.message.slice(0, 200) : 'Could not change it.'
			});
		}
	}
}

/**
 * Puts tasks back, newest change first: removes created plans (their edges
 * first) and roll-up tasks, then restores each edited or archived task to what
 * it was. A task edited after Apply keeps that edit and is listed instead.
 * Progress lands in `undone`, so a retry skips what is done.
 */
export async function undoTaskChanges(params: {
	session: Client;
	tasks: ConsolidationTaskReceipt;
	undone: string[];
	left: string[];
	failures: string[];
	save: () => Promise<unknown>;
}): Promise<void> {
	const { session, tasks, undone, left, failures } = params;
	const now = () => new Date().toISOString();
	for (const plan of [...tasks.created_plans].reverse()) {
		const key = `plan:${plan.id}`;
		if (undone.includes(key)) continue;
		try {
			if (plan.edge_ids.length) {
				const { error } = await session.from('onto_edges').delete().in('id', plan.edge_ids);
				if (error) throw error;
			}
			const { error } = await session
				.from('onto_plans')
				.update({ deleted_at: now() } as never)
				.eq('id', plan.id)
				.is('deleted_at', null);
			if (error) throw error;
			undone.push(key);
			await params.save();
		} catch {
			failures.push(`${plan.name}: could not remove the plan`);
		}
	}
	for (const task of [...tasks.created_tasks].reverse()) {
		const key = `task:${task.id}`;
		if (undone.includes(key)) continue;
		try {
			const stamp = now();
			const { error } = await session
				.from('onto_tasks')
				.update({ deleted_at: stamp, archived_at: stamp } as never)
				.eq('id', task.id)
				.is('deleted_at', null);
			if (error) throw error;
			undone.push(key);
			await params.save();
		} catch {
			failures.push(`${task.title}: could not archive the roll-up task`);
		}
	}
	const rows = await readTasks(
		session,
		tasks.changed.map((item) => item.id)
	);
	for (const item of [...tasks.changed].reverse()) {
		const key = `edit:${item.id}:${item.how}`;
		if (undone.includes(key)) continue;
		const row = rows.get(item.id);
		if (!row || Date.parse(row.updated_at) !== Date.parse(item.after_updated_at)) {
			left.push(`${item.title}: changed after Apply`);
			undone.push(key);
			await params.save();
			continue;
		}
		try {
			const { error } = await session
				.from('onto_tasks')
				.update({
					description: item.before.description,
					state_key: item.before.state_key,
					completed_at: item.before.completed_at,
					props: item.before.props,
					...(item.archived ? { deleted_at: null, archived_at: null } : {})
				} as never)
				.eq('id', item.id)
				.eq('updated_at', row.updated_at);
			if (error) throw error;
			undone.push(key);
			await params.save();
		} catch {
			failures.push(`${item.title}: could not put it back`);
		}
	}
}
