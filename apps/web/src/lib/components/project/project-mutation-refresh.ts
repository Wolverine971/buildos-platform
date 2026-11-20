// apps/web/src/lib/components/project/project-mutation-refresh.ts
import type { DataMutation, DataMutationSummary } from '$lib/components/agent/agent-chat.types';
import type { Task } from '$lib/types/onto';
import { mutationAffectsProject } from '$lib/stores/projectDataMutations';
import {
	pickProjectStartHereDocument,
	START_HERE_DOCUMENT_TYPE_KEY
} from '@buildos/shared-agent-ops/ontology/start-here';
import {
	createCompleteProjectTasksCoverage,
	getProjectTaskAsOfMs,
	getProjectTaskBoardBucket
} from '$lib/utils/project-task-board';
import {
	PROJECT_ACTIVE_TASK_BUCKET_KEYS,
	type ProjectActiveTaskBucketKey
} from '$lib/types/project-full-data';
import {
	fetchProjectDocument,
	fetchProjectDocumentTree,
	fetchProjectEvents,
	fetchProjectGoal,
	fetchProjectMilestone,
	fetchProjectPlan,
	fetchProjectRisk,
	fetchProjectTask,
	fetchProjectTaskBucket,
	type OntoEventWithSync,
	type ProjectDocumentTree,
	type ProjectFullData
} from './project-page-data-controller';

export type ProjectMutationPatch = ProjectFullData & { documentTree?: ProjectDocumentTree };

/** Null means the receipt is too broad/old to safely infer a targeted refresh. */
export function collectProjectMutations(
	projectId: string,
	summaries: DataMutationSummary[]
): DataMutation[] | null {
	const mutations = new Map<string, DataMutation>();
	for (const summary of summaries) {
		if (!mutationAffectsProject(summary, projectId)) continue;
		if (!summary.mutations?.length) return null;
		for (const mutation of summary.mutations) {
			if (mutation.projectIds.length && !mutation.projectIds.includes(projectId)) continue;
			// Project creation and relationship writes can affect many collections.
			if (!mutation.entityKind || mutation.entityKind === 'project') return null;
			if (!mutation.entityId && !['document', 'event'].includes(mutation.entityKind))
				return null;
			mutations.set(`${mutation.entityKind}:${mutation.entityId}`, mutation);
		}
	}
	return [...mutations.values()];
}

function replaceRecords<T extends { id: string; project_id: string; deleted_at?: string | null }>(
	previous: T[],
	changes: Array<{ id: string; record: T | null }>,
	projectId: string
): T[] {
	const byId = new Map(previous.map((record) => [record.id, record]));
	for (const { id, record } of changes) {
		if (!record || record.deleted_at || record.project_id !== projectId) byId.delete(id);
		else byId.set(id, record);
	}
	return [...byId.values()];
}

const timeOf = (value: string | null | undefined) => (value ? Date.parse(value) : null);

/**
 * True when an edit left alone everything its bucket is ordered by ahead of `updated_at`
 * (see compareProjectTasksForBucket, which mirrors the server). Such a task keeps its place
 * or moves up, so the rows loaded for the bucket are still its first rows.
 */
function keepsItsPlace(bucket: ProjectActiveTaskBucketKey, old: Task, record: Task): boolean {
	const priority = (task: Task) => (typeof task.priority === 'number' ? task.priority : 5);
	if (priority(old) !== priority(record)) return false;
	const sameDates =
		bucket === 'done'
			? timeOf(old.completed_at) === timeOf(record.completed_at)
			: timeOf(old.due_at) === timeOf(record.due_at) &&
				timeOf(old.start_at) === timeOf(record.start_at);
	return sameDates && (timeOf(record.updated_at) ?? 0) >= (timeOf(old.updated_at) ?? 0);
}

async function refreshTasks(
	projectId: string,
	mutations: DataMutation[],
	snapshot: ProjectFullData,
	loadEvents: () => Promise<OntoEventWithSync[]>
): Promise<ProjectMutationPatch> {
	const previous = snapshot.tasks ?? [];
	const coverage = snapshot.tasks_coverage ?? createCompleteProjectTasksCoverage(previous);
	const asOfMs = getProjectTaskAsOfMs(coverage.as_of);
	const changes = await Promise.all(
		mutations.map(async (mutation) => ({
			id: mutation.entityId!,
			record:
				mutation.operation === 'delete' ? null : await fetchProjectTask(mutation.entityId!)
		}))
	);
	let tasks = replaceRecords(previous, changes, projectId);
	const scheduled = changes.some(({ id, record }, index) => {
		const old = previous.find((task) => task.id === id);
		return (
			old?.start_at ||
			old?.due_at ||
			record?.start_at ||
			record?.due_at ||
			(!old && ['update', 'delete'].includes(mutations[index]?.operation ?? ''))
		);
	});
	const patch: ProjectMutationPatch = {};
	if (scheduled) patch.events = await loadEvents();
	if (coverage.complete) {
		return {
			...patch,
			tasks,
			tasks_coverage: createCompleteProjectTasksCoverage(tasks, asOfMs)
		};
	}

	// Offset pagination only stays valid when each bucket remains a contiguous
	// server-ordered prefix. What a change costs depends on what it did to a bucket:
	//  - a fully loaded bucket has every row here already: it is recounted, with no request;
	//  - a loaded task that only LEFT a partly loaded bucket leaves the rest a contiguous
	//    prefix: the rows that take its place are read, not the whole bucket;
	//  - a task edited without touching what its bucket is ordered by keeps its place or
	//    moves up (a newer `updated_at` is the last tie-break), so the prefix is unchanged;
	//  - anything else (a task entered a partly loaded bucket, or its order changed) refills
	//    that bucket without shrinking its loaded pages.
	// Untouched rows keep their object identity in all but the refill, so the board and the
	// lists re-render only what changed.
	const refill = new Set<ProjectActiveTaskBucketKey>();
	const recount = new Set<ProjectActiveTaskBucketKey>();
	const left = new Map<ProjectActiveTaskBucketKey, number>();
	const activeBucket = (task: Task | null | undefined): ProjectActiveTaskBucketKey | null => {
		if (!task || task.project_id !== projectId) return null;
		const bucket = getProjectTaskBoardBucket(task, asOfMs);
		return bucket === 'archived' ? null : bucket;
	};
	for (const { id, record } of changes) {
		const old = previous.find((task) => task.id === id);
		const from = activeBucket(old);
		const to = activeBucket(record);
		if (from && from !== to) {
			if (coverage.buckets[from].complete) recount.add(from);
			else left.set(from, (left.get(from) ?? 0) + 1);
		}
		if (to) {
			if (coverage.buckets[to].complete) recount.add(to);
			else if (from !== to || !keepsItsPlace(to, old!, record!)) refill.add(to);
		}
		if (!old) {
			// The old bucket of an off-screen task is unknown. Only incomplete
			// buckets can contain it; keep their counts and offsets authoritative.
			for (const bucket of PROJECT_ACTIVE_TASK_BUCKET_KEYS) {
				if (!coverage.buckets[bucket].complete) refill.add(bucket);
			}
		}
	}
	const nextBuckets = { ...coverage.buckets };
	await Promise.all([
		...[...refill].map(async (bucket) => {
			const target = Math.max(
				coverage.limit_per_bucket ?? 20,
				coverage.buckets[bucket].returned
			);
			const records: Task[] = [];
			let total = 0;
			let hasMore = false;
			do {
				const page = await fetchProjectTaskBucket({
					projectId,
					bucket,
					offset: records.length,
					limit: Math.min(100, target - records.length),
					asOf: coverage.as_of
				});
				records.push(...page.tasks);
				total = page.total;
				hasMore = page.hasMore;
				if (!page.tasks.length) break;
			} while (hasMore && records.length < target);
			tasks = [
				...tasks.filter((task) => getProjectTaskBoardBucket(task, asOfMs) !== bucket),
				...records
			];
			nextBuckets[bucket] = { returned: records.length, total, complete: !hasMore };
		}),
		...[...left]
			.filter(([bucket]) => !refill.has(bucket))
			.map(async ([bucket, count]) => {
				const kept = Math.max(0, coverage.buckets[bucket].returned - count);
				const page = await fetchProjectTaskBucket({
					projectId,
					bucket,
					offset: kept,
					limit: count,
					asOf: coverage.as_of
				});
				const have = new Set(tasks.map((task) => task.id));
				tasks = [...tasks, ...page.tasks.filter((task) => !have.has(task.id))];
				nextBuckets[bucket] = {
					returned: kept + page.tasks.length,
					total: page.total,
					complete: !page.hasMore
				};
			})
	]);
	for (const bucket of recount) {
		if (refill.has(bucket)) continue;
		const total = tasks.filter(
			(task) => getProjectTaskBoardBucket(task, asOfMs) === bucket
		).length;
		nextBuckets[bucket] = { returned: total, total, complete: true };
	}
	return {
		...patch,
		tasks,
		tasks_coverage: {
			...coverage,
			buckets: nextBuckets,
			total: PROJECT_ACTIVE_TASK_BUCKET_KEYS.reduce(
				(sum, key) => sum + nextBuckets[key].total,
				0
			),
			returned: PROJECT_ACTIVE_TASK_BUCKET_KEYS.reduce(
				(sum, key) => sum + nextBuckets[key].returned,
				0
			),
			complete: PROJECT_ACTIVE_TASK_BUCKET_KEYS.every((key) => nextBuckets[key].complete)
		}
	};
}

/** Fetch only affected records/collections using existing authenticated read APIs. */
export async function fetchProjectMutationPatch(
	projectId: string,
	mutations: DataMutation[],
	snapshot: ProjectFullData
): Promise<ProjectMutationPatch> {
	const patch: ProjectMutationPatch = {};
	const jobs: Promise<void>[] = [];
	let eventRequest: Promise<OntoEventWithSync[]> | undefined;
	const loadEvents = () => (eventRequest ??= fetchProjectEvents(projectId));
	const taskMutations = mutations.filter((mutation) => mutation.entityKind === 'task');
	if (taskMutations.length)
		jobs.push(
			refreshTasks(projectId, taskMutations, snapshot, loadEvents).then((data) => {
				Object.assign(patch, data);
			})
		);
	if (mutations.some((mutation) => mutation.entityKind === 'document')) {
		jobs.push(
			(async () => {
				const tree = await fetchProjectDocumentTree(projectId);
				patch.documentTree = tree;
				const documents = [
					...Object.values(tree.documents),
					...tree.unlinked,
					...tree.archived
				];
				const context = pickProjectStartHereDocument(
					documents.filter(
						(document) =>
							!document.deleted_at &&
							document.state_key !== 'archived' &&
							document.type_key === START_HERE_DOCUMENT_TYPE_KEY
					)
				);
				const previousContext = snapshot.context_document;
				patch.context_document = !context
					? null
					: previousContext?.id === context.id &&
						  previousContext.content &&
						  previousContext.updated_at === context.updated_at &&
						  !mutations.some(
								(mutation) =>
									mutation.entityKind === 'document' &&
									(!mutation.entityId || mutation.entityId === context.id)
						  )
						? previousContext
						: await fetchProjectDocument(context.id);
			})()
		);
	}
	if (mutations.some((mutation) => mutation.entityKind === 'event')) {
		jobs.push(
			loadEvents().then((events) => {
				patch.events = events;
			})
		);
	}
	async function refreshCollection<
		T extends { id: string; project_id: string; deleted_at?: string | null }
	>(
		kind: DataMutation['entityKind'],
		previous: T[],
		fetchRecord: (id: string) => Promise<T>
	): Promise<T[]> {
		const changes = await Promise.all(
			mutations
				.filter((mutation) => mutation.entityKind === kind)
				.map(async (mutation) => ({
					id: mutation.entityId!,
					record:
						mutation.operation === 'delete'
							? null
							: await fetchRecord(mutation.entityId!)
				}))
		);
		return replaceRecords(previous, changes, projectId);
	}
	if (mutations.some((mutation) => mutation.entityKind === 'goal'))
		jobs.push(
			refreshCollection('goal', snapshot.goals ?? [], fetchProjectGoal).then((rows) => {
				patch.goals = rows;
			})
		);
	if (mutations.some((mutation) => mutation.entityKind === 'plan'))
		jobs.push(
			refreshCollection('plan', snapshot.plans ?? [], fetchProjectPlan).then((rows) => {
				patch.plans = rows;
			})
		);
	if (mutations.some((mutation) => mutation.entityKind === 'milestone'))
		jobs.push(
			refreshCollection('milestone', snapshot.milestones ?? [], fetchProjectMilestone).then(
				(rows) => {
					patch.milestones = rows;
				}
			)
		);
	if (mutations.some((mutation) => mutation.entityKind === 'risk'))
		jobs.push(
			refreshCollection('risk', snapshot.risks ?? [], fetchProjectRisk).then((rows) => {
				patch.risks = rows;
			})
		);
	await Promise.all(jobs);
	return patch;
}

/** Coalesce same-tick requests and drain writes received during an in-flight read. */
export function createProjectRefreshQueue(
	refresh: (summaries: DataMutationSummary[] | null) => Promise<void>,
	onError: (error: unknown) => void
) {
	let pending: DataMutationSummary[] = [];
	let fullRefresh = false;
	let running: Promise<void> | null = null;
	let disposed = false;
	let failed: DataMutationSummary[] | null | undefined;
	function enqueue(summary?: DataMutationSummary, retryOnly = false): Promise<void> {
		if (disposed) return Promise.resolve();
		if (failed === null) fullRefresh = true;
		else if (failed) pending.unshift(...failed);
		failed = undefined;
		if (summary) pending.push(summary);
		else if (!retryOnly) fullRefresh = true;
		if (!running) {
			running = Promise.resolve().then(async () => {
				try {
					while (!disposed && (fullRefresh || pending.length)) {
						const batch = fullRefresh ? null : pending;
						fullRefresh = false;
						pending = [];
						try {
							await refresh(batch);
						} catch (error) {
							// Keep the failed receipt for an explicit retry or the next
							// mutation, without spinning on a broken connection.
							if (pending.length || fullRefresh) {
								if (batch === null) fullRefresh = true;
								else pending.unshift(...batch);
							} else failed = batch;
							onError(error);
						}
					}
				} finally {
					running = null;
				}
			});
		}
		return running;
	}
	return {
		enqueue,
		retry: () => enqueue(undefined, true),
		whenIdle: () => running ?? Promise.resolve(),
		dispose() {
			disposed = true;
			pending = [];
		}
	};
}
