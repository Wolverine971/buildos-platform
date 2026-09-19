// apps/worker/src/workers/freshness-radar/context.ts
//
// Stage [1] of a scan (plan section 1): info window -> exclusions ->
// candidates -> prefilter (<=24) -> date mentions -> facts. Reads only through
// FreshnessDataPort, so the live worker and the read-only backtest build the
// exact same context from the same code.

import { createHash } from 'node:crypto';
import type { FreshnessSubjectSnapshot } from '@buildos/shared-types';
import type { AutoApplyGate, SuppressionReason } from './combine';
import {
	type FreshnessDateMention,
	type SourcedSentence,
	civilDateInZone,
	civilDaysBetween,
	collectDateMentions,
	relativeAgePhrase,
	splitSentences,
	storedCivilDate
} from './dates';
import type {
	FreshnessDataPort,
	FreshnessDocumentRow,
	FreshnessEdgeRow,
	FreshnessGoalRow,
	FreshnessInboxRow,
	FreshnessMilestoneRow,
	FreshnessSuggestionRow,
	FreshnessTaskRow
} from './dataPort';
import type { FreshnessPolicyV1 } from './freshnessPolicy';
import {
	type FreshnessCandidate,
	type PrefilteredCandidate,
	prefilterCandidates
} from './prefilter';
import type {
	JevEntityView,
	JevInboxItemView,
	JevNewInformation,
	JevProjectState,
	JevTrackSubjectView
} from './questions';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const START_HERE_DOCUMENT_TYPE_KEY = 'document.context.project';

const OPEN_TASK_STATES = new Set(['todo', 'in_progress', 'blocked']);
const OPEN_GOAL_STATES = new Set(['draft', 'active']);
const OPEN_MILESTONE_STATES = new Set(['pending', 'in_progress']);
const RETIRABLE_SUGGESTION_KINDS = new Set(['doc_org', 'doc_outdated', 'drift', 'task_conflict']);
const INJECTED_SOURCES = new Set(['agent_run', 'freshness_radar']);

export type FreshnessWindowMessage = {
	id: string;
	sessionId: string;
	createdAt: string;
	text: string;
	truncated: boolean;
};

export type FreshnessTrackSubject = {
	candidate: FreshnessCandidate & { kind: 'goal' | 'milestone' };
	facts: string[];
	linkedTaskCount: number;
	hasTarget: boolean;
	targetAt: string | null;
	previousGauge: string | null;
};

export type FreshnessInboxSubject = {
	row: FreshnessInboxRow;
	suggestion: FreshnessSuggestionRow | null;
	view: JevInboxItemView;
	eligibleForRetire: boolean;
	currentlyPossiblyStale: boolean;
	snapshot: FreshnessSubjectSnapshot;
};

export type FreshnessScanContext = {
	projectId: string;
	userId: string;
	userActorId: string | null;
	timeZone: string | null;
	now: string;
	today: string;
	project: JevProjectState;
	window: {
		start: string;
		cursorAt: string | null;
		sessionIds: string[];
		messageIds: string[];
		chars: number;
		truncated: boolean;
		firstMessageAt: string | null;
		newestMessageAt: string | null;
	};
	messages: FreshnessWindowMessage[];
	/** Newest message first, so grounding evidence quotes the latest mention. */
	sentences: SourcedSentence[];
	newInformation: JevNewInformation[];
	dateMentions: FreshnessDateMention[];
	candidatesTotal: number;
	excludedCount: number;
	prefiltered: PrefilteredCandidate[];
	entityViews: Map<string, JevEntityView>;
	changedInWindow: Set<string>;
	trackSubjects: FreshnessTrackSubject[];
	inboxSubjects: FreshnessInboxSubject[];
	suppressed: Map<string, SuppressionReason>;
	gate: Omit<AutoApplyGate, 'enabled'>;
	/** Entity lookup for snapshots and card titles (all loaded, open or not). */
	entitiesByKey: Map<string, FreshnessCandidate>;
	skipReason: string | null;
};

export function sha256(value: string | null | undefined): string | null {
	if (value === null || value === undefined) return null;
	return createHash('sha256').update(value).digest('hex');
}

export function entityKey(kind: string, id: string): string {
	return `${kind}:${id}`;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function sameInstant(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return !a && !b;
	const left = Date.parse(a);
	const right = Date.parse(b);
	return Number.isFinite(left) && Number.isFinite(right) ? left === right : a === b;
}

function isAfterIso(a: string | null | undefined, b: string | null | undefined): boolean {
	if (!a || !b) return false;
	return Date.parse(a) > Date.parse(b);
}

// ---------------------------------------------------------------------------
// Candidate normalization
// ---------------------------------------------------------------------------

function fromTask(row: FreshnessTaskRow, timeZone: string | null): FreshnessCandidate {
	return {
		kind: 'task',
		id: row.id,
		title: row.title,
		description: row.description,
		state: row.state_key,
		startAt: row.start_at,
		dueAt: row.due_at,
		targetDate: null,
		startCivil: storedCivilDate(row.start_at, timeZone),
		dueCivil: storedCivilDate(row.due_at, timeZone),
		targetCivil: null,
		updatedAt: row.updated_at ?? row.created_at,
		createdAt: row.created_at,
		partOf: null,
		summary: null,
		props: asRecord(row.props)
	};
}

function fromGoal(row: FreshnessGoalRow, timeZone: string | null): FreshnessCandidate {
	return {
		kind: 'goal',
		id: row.id,
		title: row.name,
		description: row.description ?? row.goal,
		state: row.state_key,
		startAt: null,
		dueAt: null,
		targetDate: row.target_date,
		startCivil: null,
		dueCivil: null,
		targetCivil: storedCivilDate(row.target_date, timeZone),
		updatedAt: row.updated_at ?? row.created_at,
		createdAt: row.created_at,
		partOf: null,
		summary: null,
		props: asRecord(row.props)
	};
}

function fromMilestone(row: FreshnessMilestoneRow, timeZone: string | null): FreshnessCandidate {
	return {
		kind: 'milestone',
		id: row.id,
		title: row.title,
		description: row.description ?? row.milestone,
		state: row.state_key,
		startAt: null,
		dueAt: row.due_at,
		targetDate: null,
		startCivil: null,
		dueCivil: storedCivilDate(row.due_at, timeZone),
		targetCivil: null,
		updatedAt: row.updated_at ?? row.created_at,
		createdAt: row.created_at,
		partOf: null,
		summary: null,
		props: asRecord(row.props)
	};
}

function fromDocument(row: FreshnessDocumentRow): FreshnessCandidate {
	return {
		kind: 'document',
		id: row.id,
		title: row.title,
		description: row.description,
		state: row.state_key,
		startAt: null,
		dueAt: null,
		targetDate: null,
		startCivil: null,
		dueCivil: null,
		targetCivil: null,
		updatedAt: row.updated_at ?? row.created_at,
		createdAt: row.created_at,
		partOf: null,
		summary: row.description,
		props: asRecord(row.props)
	};
}

/** The fields the ledger snapshots (and outcome labeling compares later). */
export function candidateSnapshot(candidate: FreshnessCandidate): FreshnessSubjectSnapshot {
	// Documents snapshot their description only: the content head is loaded just
	// for prefiltered survivors, and content edits show up in subject_updated_at.
	const details = candidate.description;
	return {
		state_key: candidate.state ?? null,
		...(candidate.kind === 'task' || candidate.kind === 'milestone'
			? { due_at: candidate.dueAt ?? null }
			: {}),
		...(candidate.kind === 'task' ? { start_at: candidate.startAt ?? null } : {}),
		...(candidate.kind === 'goal' ? { target_date: candidate.targetDate ?? null } : {}),
		title_sha256: sha256(candidate.title) ?? '',
		details_sha256: sha256(details ?? null)
	};
}

export function snapshotsMatch(
	a: Partial<FreshnessSubjectSnapshot> | null | undefined,
	b: FreshnessSubjectSnapshot
): boolean {
	if (!a) return false;
	return (
		(a.state_key ?? null) === (b.state_key ?? null) &&
		(a.due_at ?? null) === (b.due_at ?? null) &&
		(a.start_at ?? null) === (b.start_at ?? null) &&
		(a.target_date ?? null) === (b.target_date ?? null) &&
		(a.title_sha256 ?? null) === (b.title_sha256 ?? null) &&
		(a.details_sha256 ?? null) === (b.details_sha256 ?? null)
	);
}

// ---------------------------------------------------------------------------
// Graph helpers
// ---------------------------------------------------------------------------

type Graph = {
	neighbors: Map<string, Set<string>>;
};

function buildGraph(edges: readonly FreshnessEdgeRow[], tasks: readonly FreshnessTaskRow[]): Graph {
	const neighbors = new Map<string, Set<string>>();
	const link = (a: string, b: string) => {
		if (a === b) return;
		if (!neighbors.has(a)) neighbors.set(a, new Set());
		if (!neighbors.has(b)) neighbors.set(b, new Set());
		neighbors.get(a)!.add(b);
		neighbors.get(b)!.add(a);
	};
	for (const edge of edges) {
		link(entityKey(edge.src_kind, edge.src_id), entityKey(edge.dst_kind, edge.dst_id));
	}
	for (const task of tasks) {
		const props = asRecord(task.props);
		if (typeof props.goal_id === 'string')
			link(entityKey('task', task.id), entityKey('goal', props.goal_id));
		if (typeof props.supporting_milestone_id === 'string') {
			link(entityKey('task', task.id), entityKey('milestone', props.supporting_milestone_id));
		}
	}
	return { neighbors };
}

function neighborsOfKind(graph: Graph, key: string, kind: string): string[] {
	return [...(graph.neighbors.get(key) ?? [])]
		.filter((neighbor) => neighbor.startsWith(`${kind}:`))
		.map((neighbor) => neighbor.slice(kind.length + 1))
		.sort();
}

function isRecurring(props: Record<string, unknown>): boolean {
	return Object.entries(props).some(
		([key, value]) =>
			/recurr|rrule/i.test(key) &&
			value !== null &&
			value !== undefined &&
			value !== false &&
			value !== ''
	);
}

// ---------------------------------------------------------------------------
// Info window
// ---------------------------------------------------------------------------

function windowStartFor(now: Date, lastCursor: string | null, policy: FreshnessPolicyV1): string {
	const config = policy.window;
	if (!lastCursor || !Number.isFinite(Date.parse(lastCursor))) {
		return new Date(now.getTime() - config.firstScanLookbackHours * HOUR_MS).toISOString();
	}
	const floor = now.getTime() - config.maxLookbackDays * DAY_MS;
	// Keep Postgres microseconds in the exclusive query bound. A Date round-trip
	// truncates them and makes the previous scan's last message look new again.
	return Date.parse(lastCursor) >= floor ? lastCursor : new Date(floor).toISOString();
}

export function selectWindowMessages(params: {
	messages: ReadonlyArray<{
		id: string;
		session_id: string;
		content: string;
		created_at: string;
		metadata: Record<string, unknown> | null;
	}>;
	excludedMessageIds: ReadonlySet<string>;
	policy: FreshnessPolicyV1;
}): { messages: FreshnessWindowMessage[]; truncated: boolean } {
	const config = params.policy.window;
	let truncated = false;
	// Newest first.
	const eligible = [...params.messages]
		.filter((message) => {
			const source = asRecord(message.metadata).source;
			if (typeof source === 'string' && INJECTED_SOURCES.has(source)) return false;
			if (params.excludedMessageIds.has(message.id)) return false;
			return (message.content ?? '').trim().length >= config.minMessageChars;
		})
		.sort(
			(a, b) =>
				Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id)
		);

	// The 3 most recent sessions (by their newest message).
	const sessionOrder: string[] = [];
	for (const message of eligible) {
		if (!sessionOrder.includes(message.session_id)) sessionOrder.push(message.session_id);
	}
	const keptSessions = new Set(sessionOrder.slice(0, config.maxSessions));
	if (sessionOrder.length > keptSessions.size) truncated = true;

	const selected: FreshnessWindowMessage[] = [];
	let chars = 0;
	for (const message of eligible) {
		if (!keptSessions.has(message.session_id)) continue;
		if (selected.length >= config.maxMessages) {
			truncated = true;
			break;
		}
		const full = message.content.trim();
		const head = Array.from(full).slice(0, config.maxMessageChars).join('');
		const clipped = head.length < full.length;
		if (chars + head.length > config.maxChars) {
			truncated = true;
			break; // oldest messages drop first
		}
		chars += head.length;
		if (clipped) truncated = true;
		selected.push({
			id: message.id,
			sessionId: message.session_id,
			createdAt: message.created_at,
			text: head,
			truncated: clipped
		});
	}
	return { messages: selected, truncated };
}

function saidPhrase(createdAt: string, now: Date, timeZone: string | null): string {
	const civil = civilDateInZone(createdAt, timeZone) ?? createdAt.slice(0, 10);
	const phrase = relativeAgePhrase(createdAt, now, timeZone);
	return phrase ? `${civil} (${phrase})` : civil;
}

// ---------------------------------------------------------------------------
// Track facts (R2) and inbox facts (R3)
// ---------------------------------------------------------------------------

function trackFacts(params: {
	subject: FreshnessCandidate;
	graph: Graph;
	tasksById: ReadonlyMap<string, FreshnessTaskRow>;
	milestonesById: ReadonlyMap<string, FreshnessMilestoneRow>;
	today: string;
	timeZone: string | null;
	now: Date;
}): { facts: string[]; linkedTaskCount: number; hasTarget: boolean } {
	const key = entityKey(params.subject.kind, params.subject.id);
	const taskIds = neighborsOfKind(params.graph, key, 'task').filter((id) =>
		params.tasksById.has(id)
	);
	const tasks = taskIds
		.map((id) => params.tasksById.get(id)!)
		.filter((task) => !task.archived_at);
	const facts: string[] = [];
	if (tasks.length) {
		const count = (state: string) => tasks.filter((task) => task.state_key === state).length;
		const parts = [
			count('done') ? `${count('done')} done` : null,
			count('in_progress') ? `${count('in_progress')} in progress` : null,
			count('blocked') ? `${count('blocked')} blocked` : null,
			count('todo') ? `${count('todo')} not started` : null
		].filter(Boolean);
		facts.push(
			`${tasks.length} linked task${tasks.length === 1 ? '' : 's'}: ${parts.join(', ')}`
		);
		const pastDue = tasks.filter((task) => {
			if (task.state_key === 'done') return false;
			const due = storedCivilDate(task.due_at, params.timeZone);
			return due !== null && due < params.today;
		}).length;
		if (pastDue) {
			facts.push(
				`${pastDue} unfinished linked task${pastDue === 1 ? ' is' : 's are'} past due`
			);
		}
	} else {
		facts.push('No linked tasks');
	}
	if (params.subject.kind === 'goal') {
		const milestones = neighborsOfKind(params.graph, key, 'milestone')
			.map((id) => params.milestonesById.get(id))
			.filter((row): row is FreshnessMilestoneRow => Boolean(row));
		if (milestones.length) {
			const completed = milestones.filter((row) => row.state_key === 'completed').length;
			facts.push(`${completed} of ${milestones.length} linked milestones completed`);
		}
	}
	const target = params.subject.targetCivil ?? params.subject.dueCivil;
	if (target) {
		const days = civilDaysBetween(params.today, target);
		facts.push(
			days >= 0
				? `Target ${target} (${days} day${days === 1 ? '' : 's'} away)`
				: `Target ${target} (${-days} day${days === -1 ? '' : 's'} ago)`
		);
	} else {
		facts.push('No target date');
	}
	const changed = relativeAgePhrase(params.subject.updatedAt, params.now, params.timeZone);
	if (changed) facts.push(`Last changed ${changed}`);
	return { facts, linkedTaskCount: tasks.length, hasTarget: Boolean(target) };
}

function sourceLabel(row: FreshnessInboxRow, suggestion: FreshnessSuggestionRow | null): string {
	if (row.source_type === 'project_suggestion') {
		return suggestion?.kind === 'audit_recommendation'
			? 'project audit recommendation'
			: 'project review suggestion';
	}
	if (row.source_type === 'project_review') return 'project manager brief';
	if (row.source_type === 'project_audit') return 'project audit';
	if (row.source_type === 'agent_run') return 'agent proposal';
	if (row.source_type === 'calendar_suggestion') return 'calendar suggestion';
	return row.source_type.replace(/_/g, ' ');
}

function inboxFacts(params: {
	suggestion: FreshnessSuggestionRow | null;
	tasksById: ReadonlyMap<string, FreshnessTaskRow>;
	documentsById: ReadonlyMap<string, FreshnessDocumentRow>;
	now: Date;
	timeZone: string | null;
}): string[] {
	const facts: string[] = [];
	const operations = Array.isArray(params.suggestion?.operations)
		? (params.suggestion!.operations as Array<{ args?: Record<string, unknown> }>)
		: [];
	const seen = new Set<string>();
	for (const operation of operations) {
		const args = asRecord(operation?.args);
		const taskId = typeof args.task_id === 'string' ? args.task_id : null;
		const documentId = typeof args.document_id === 'string' ? args.document_id : null;
		if (taskId && !seen.has(`task:${taskId}`)) {
			seen.add(`task:${taskId}`);
			const task = params.tasksById.get(taskId);
			if (!task || task.archived_at) facts.push('Its target task no longer exists');
			else if (task.state_key === 'done')
				facts.push(`Target task "${task.title}" is now done`);
			else {
				const changed = relativeAgePhrase(
					task.updated_at ?? task.created_at,
					params.now,
					params.timeZone
				);
				facts.push(
					`Target task "${task.title}" is ${task.state_key.replace('_', ' ')}${changed ? `, last changed ${changed}` : ''}`
				);
			}
		}
		if (documentId && !seen.has(`document:${documentId}`)) {
			seen.add(`document:${documentId}`);
			const document = params.documentsById.get(documentId);
			if (!document) facts.push('Its target document no longer exists');
			else {
				const changed = relativeAgePhrase(
					document.updated_at ?? document.created_at,
					params.now,
					params.timeZone
				);
				facts.push(
					`Target document "${document.title}"${changed ? ` last changed ${changed}` : ''}`
				);
			}
		}
		if (facts.length >= 4) break;
	}
	return facts;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export async function buildFreshnessScanContext(params: {
	port: FreshnessDataPort;
	projectId: string;
	userId: string;
	/** Sessions to include even without a project context row (the trigger session). */
	extraSessionIds: readonly string[];
	now: Date;
	policy: FreshnessPolicyV1;
}): Promise<FreshnessScanContext> {
	const { port, projectId, userId, now, policy } = params;
	const nowIso = now.toISOString();

	const [project, timeZone, userActorId, lastCursor] = await Promise.all([
		port.loadProject(projectId),
		port.loadUserTimezone(userId),
		port.loadUserActorId(userId),
		port.loadLastScanCursor(projectId, userId)
	]);
	const today = civilDateInZone(now, timeZone) ?? nowIso.slice(0, 10);
	const windowStart = windowStartFor(now, lastCursor, policy);

	const empty = (skipReason: string): FreshnessScanContext => ({
		projectId,
		userId,
		userActorId,
		timeZone,
		now: nowIso,
		today,
		project: { name: project?.name ?? '', summary: project?.description ?? null },
		window: {
			start: windowStart,
			cursorAt: null,
			sessionIds: [],
			messageIds: [],
			chars: 0,
			truncated: false,
			firstMessageAt: null,
			newestMessageAt: null
		},
		messages: [],
		sentences: [],
		newInformation: [],
		dateMentions: [],
		candidatesTotal: 0,
		excludedCount: 0,
		prefiltered: [],
		entityViews: new Map(),
		changedInWindow: new Set(),
		trackSubjects: [],
		inboxSubjects: [],
		suppressed: new Map(),
		gate: {
			changedInWindow: new Set(),
			newestWindowMessageAt: null,
			calendarLinkedTaskIds: new Set(),
			recurringTaskIds: new Set(),
			assignedToOthersTaskIds: new Set(),
			recentlyUndone: new Set(),
			projectAutoApplied24h: 0
		},
		entitiesByKey: new Map(),
		skipReason
	});

	if (!project || project.deleted_at || project.archived_at) return empty('project_unavailable');

	// Sessions S: the user's project-context sessions, sessions that wrote to the
	// project in the window, and the trigger session when it hinted this project.
	const [contextSessions, logs] = await Promise.all([
		port.loadProjectContextSessionIds(projectId, userId),
		port.loadProjectLogs(projectId, windowStart)
	]);
	const loggedSessions = logs
		.map((log) => log.chat_session_id)
		.filter((id): id is string => typeof id === 'string');
	const sessionIds = await port.filterUserSessionIds(
		[...contextSessions, ...loggedSessions, ...params.extraSessionIds],
		userId
	);

	const [rawMessages, turnInfo] = await Promise.all([
		port.loadUserMessages(sessionIds, windowStart, nowIso),
		port.loadTurns(sessionIds, new Date(Date.parse(windowStart) - HOUR_MS).toISOString())
	]);
	const excludedMessageIds = new Set<string>();
	for (const turn of turnInfo.turns) {
		if (!turn.user_message_id) continue;
		if (turn.status === 'queued' || turn.status === 'running')
			excludedMessageIds.add(turn.user_message_id);
		if (turnInfo.workflowTurnIds.has(turn.id)) excludedMessageIds.add(turn.user_message_id);
	}
	const selection = selectWindowMessages({
		messages: rawMessages.filter((message) => message.role === 'user'),
		excludedMessageIds,
		policy
	});
	const messages = selection.messages;
	const newestMessageAt = messages[0]?.createdAt ?? null;
	const firstMessageAt = messages.at(-1)?.createdAt ?? null;
	const chronological = [...messages].reverse();
	const sentences: SourcedSentence[] = messages.flatMap((message) =>
		splitSentences(message.text).map((text) => ({
			messageId: message.id,
			sessionId: message.sessionId,
			text
		}))
	);
	const base = empty('');
	const windowInfo = {
		start: windowStart,
		cursorAt: newestMessageAt,
		sessionIds: [...new Set(messages.map((message) => message.sessionId))],
		messageIds: chronological.map((message) => message.id),
		chars: messages.reduce((total, message) => total + message.text.length, 0),
		truncated: selection.truncated,
		firstMessageAt,
		newestMessageAt
	};
	const newInformation: JevNewInformation[] = chronological.map((message) => ({
		said: saidPhrase(message.createdAt, now, timeZone),
		text: message.text
	}));
	const dateMentions = collectDateMentions(sentences, today, policy.jev.maxDateMentions);

	// Entities.
	const [entities, edges] = await Promise.all([
		port.loadProjectEntities(projectId),
		port.loadEdges(projectId)
	]);
	const tasksById = new Map(entities.tasks.map((row) => [row.id, row]));
	const milestonesById = new Map(entities.milestones.map((row) => [row.id, row]));
	const documentsById = new Map(entities.documents.map((row) => [row.id, row]));
	const graph = buildGraph(edges, entities.tasks);

	const entitiesByKey = new Map<string, FreshnessCandidate>();
	const all: FreshnessCandidate[] = [
		...entities.tasks.map((row) => fromTask(row, timeZone)),
		...entities.goals.map((row) => fromGoal(row, timeZone)),
		...entities.milestones.map((row) => fromMilestone(row, timeZone)),
		...entities.documents.map((row) => fromDocument(row))
	];
	const titleByKey = new Map(
		all.map((candidate) => [entityKey(candidate.kind, candidate.id), candidate.title])
	);
	for (const candidate of all) {
		const key = entityKey(candidate.kind, candidate.id);
		if (candidate.kind === 'task' || candidate.kind === 'milestone') {
			const parents = [
				...neighborsOfKind(graph, key, 'milestone').map((id) => entityKey('milestone', id)),
				...neighborsOfKind(graph, key, 'goal').map((id) => entityKey('goal', id))
			].filter((parent) => parent !== key);
			candidate.partOf =
				parents.map((parent) => titleByKey.get(parent)).find(Boolean) ?? null;
		}
		entitiesByKey.set(key, candidate);
	}

	const rawRowsByKey = new Map<string, { archived_at: string | null; type_key?: string | null }>([
		...entities.tasks.map((row) => [entityKey('task', row.id), row] as const),
		...entities.goals.map((row) => [entityKey('goal', row.id), row] as const),
		...entities.milestones.map((row) => [entityKey('milestone', row.id), row] as const),
		...entities.documents.map((row) => [entityKey('document', row.id), row] as const)
	]);
	const isOpen = (candidate: FreshnessCandidate): boolean => {
		const raw = rawRowsByKey.get(entityKey(candidate.kind, candidate.id));
		if (raw?.archived_at) return false;
		if (candidate.kind === 'task') return OPEN_TASK_STATES.has(candidate.state);
		if (candidate.kind === 'goal') return OPEN_GOAL_STATES.has(candidate.state);
		if (candidate.kind === 'milestone') return OPEN_MILESTONE_STATES.has(candidate.state);
		if (raw?.type_key === START_HERE_DOCUMENT_TYPE_KEY) return false;
		return candidate.state !== 'archived';
	};
	const open = all.filter(isOpen);

	// Exclusions: changed in the window by these sessions or the user, created in
	// the window, or updated after the newest window message.
	const sessionSet = new Set(sessionIds);
	const changedInWindow = new Set<string>();
	for (const log of logs) {
		if (
			(log.chat_session_id && sessionSet.has(log.chat_session_id)) ||
			log.changed_by === userId
		) {
			changedInWindow.add(entityKey(log.entity_type, log.entity_id));
		}
	}
	const eligible = open.filter((candidate) => {
		const key = entityKey(candidate.kind, candidate.id);
		if (changedInWindow.has(key)) return false;
		if (isAfterIso(candidate.createdAt, windowStart)) return false;
		if (newestMessageAt && isAfterIso(candidate.updatedAt, newestMessageAt)) return false;
		return true;
	});

	// Suppression (plan section 1 step 2): marked "not out of date" or dismissed
	// within 14 days while the entity is unchanged since.
	const priorFlags = await port.loadPriorFlags(
		projectId,
		userId,
		new Date(
			now.getTime() -
				Math.max(policy.autoApply.undoCooldownDays, policy.suppression.notStaleDays) *
					DAY_MS
		).toISOString()
	);
	const suppressed = new Map<string, SuppressionReason>();
	const suppressionFloor = now.getTime() - policy.suppression.notStaleDays * DAY_MS;
	const recentlyUndone = new Set<string>();
	for (const flag of priorFlags) {
		const key = entityKey(flag.subject_kind, flag.subject_id);
		if (flag.status === 'undone' && flag.undone_at) {
			const args = asRecord(asRecord(flag.proposed_operation).args);
			for (const field of ['state_key', 'due_at', 'target_date', 'start_at']) {
				if (field in args) recentlyUndone.add(`${flag.subject_id}:${field}`);
			}
		}
		const decidedAt = Date.parse(flag.outcome_at ?? flag.created_at);
		if (!Number.isFinite(decidedAt) || decidedAt < suppressionFloor) continue;
		const reason: SuppressionReason | null =
			flag.outcome_source === 'user_marked_not_stale'
				? 'marked_not_stale'
				: flag.status === 'dismissed'
					? 'dismissed'
					: null;
		if (!reason || suppressed.has(key)) continue;
		const current = entitiesByKey.get(key);
		const documentUnchanged =
			current?.kind !== 'document' || sameInstant(flag.subject_updated_at, current.updatedAt);
		if (
			current &&
			documentUnchanged &&
			snapshotsMatch(asRecord(flag.subject_snapshot), candidateSnapshot(current))
		) {
			suppressed.set(key, reason);
		}
	}

	const linkedToChanged = new Set<string>();
	for (const changed of changedInWindow) {
		for (const neighbor of graph.neighbors.get(changed) ?? []) linkedToChanged.add(neighbor);
	}
	const windowText = messages.map((message) => message.text).join('\n');
	const prefiltered = messages.length
		? prefilterCandidates({
				candidates: eligible,
				windowText,
				dateMentions,
				linkedToChanged,
				today,
				policy
			})
		: [];

	// Document summaries: description, or the head of content for the survivors.
	const needContent = prefiltered
		.filter((entry) => entry.candidate.kind === 'document' && !entry.candidate.description)
		.map((entry) => entry.candidate.id);
	const heads = needContent.length
		? await port.loadDocumentContentHeads(needContent, policy.prefilter.docSummaryChars)
		: new Map<string, string>();
	const entityViews = new Map<string, JevEntityView>();
	for (const { candidate } of prefiltered) {
		if (candidate.kind === 'document') {
			candidate.summary =
				(candidate.description ?? heads.get(candidate.id) ?? null)?.slice(
					0,
					policy.prefilter.docSummaryChars
				) ?? null;
		}
		entityViews.set(
			entityKey(candidate.kind, candidate.id),
			entityView(candidate, now, timeZone, policy)
		);
	}

	// Auto-apply gate facts for task candidates only.
	const taskIds = prefiltered
		.filter((entry) => entry.candidate.kind === 'task')
		.map((entry) => entry.candidate.id);
	const [legacyCalendar, assignees, autoApplied24h] = await Promise.all([
		port.loadCalendarEventTaskIds(taskIds),
		port.loadTaskAssignees(taskIds),
		port.countAutoApplied(projectId, new Date(now.getTime() - DAY_MS).toISOString())
	]);
	const calendarLinkedTaskIds = new Set(legacyCalendar);
	const recurringTaskIds = new Set<string>();
	const assignedToOthersTaskIds = new Set<string>();
	for (const id of taskIds) {
		// onto tasks link calendar events through has_event edges to onto_events.
		if (neighborsOfKind(graph, entityKey('task', id), 'event').length)
			calendarLinkedTaskIds.add(id);
		if (isRecurring(asRecord(tasksById.get(id)?.props))) recurringTaskIds.add(id);
		const assigned = assignees.get(id) ?? [];
		if (assigned.some((actorId) => actorId !== userActorId)) assignedToOthersTaskIds.add(id);
	}

	// Track subjects (R2): prefiltered goals/milestones first, then soonest target.
	const openTrack = open.filter(
		(candidate): candidate is FreshnessCandidate & { kind: 'goal' | 'milestone' } =>
			candidate.kind === 'goal' || candidate.kind === 'milestone'
	);
	const prefilterRank = new Map(
		prefiltered.map((entry) => [
			entityKey(entry.candidate.kind, entry.candidate.id),
			entry.features.rank
		])
	);
	const trackOrder = [...openTrack].sort((a, b) => {
		const rankA = prefilterRank.get(entityKey(a.kind, a.id)) ?? Number.MAX_SAFE_INTEGER;
		const rankB = prefilterRank.get(entityKey(b.kind, b.id)) ?? Number.MAX_SAFE_INTEGER;
		if (rankA !== rankB) return rankA - rankB;
		const targetA = a.targetCivil ?? a.dueCivil ?? '9999-12-31';
		const targetB = b.targetCivil ?? b.dueCivil ?? '9999-12-31';
		return targetA.localeCompare(targetB) || a.id.localeCompare(b.id);
	});
	const trackSelected = messages.length ? trackOrder.slice(0, policy.jev.maxTrackSubjects) : [];
	const previousGauges = await port.loadPreviousGauges(
		projectId,
		userId,
		trackSelected.map((candidate) => candidate.id)
	);
	const trackSubjects: FreshnessTrackSubject[] = trackSelected.map((candidate) => {
		const facts = trackFacts({
			subject: candidate,
			graph,
			tasksById,
			milestonesById,
			today,
			timeZone,
			now
		});
		return {
			candidate,
			...facts,
			targetAt: candidate.kind === 'goal' ? candidate.targetDate : candidate.dueAt,
			previousGauge: previousGauges.get(candidate.id) ?? null
		};
	});

	// Inbox subjects (R3).
	const inboxRows = messages.length ? await port.loadInboxItems(projectId) : [];
	const suggestionIds = inboxRows
		.filter((row) => row.source_type === 'project_suggestion')
		.map((row) => row.source_ref_id);
	const suggestions = await port.loadSuggestions(suggestionIds);
	const inboxSubjects: FreshnessInboxSubject[] = [];
	for (const row of inboxRows) {
		if (inboxSubjects.length >= policy.jev.maxInboxItems) break;
		if (row.audience !== 'project_members' && row.audience !== 'user') continue;
		if (row.snoozed_until && Date.parse(row.snoozed_until) > now.getTime()) continue;
		if (firstMessageAt && isAfterIso(row.created_at, firstMessageAt)) continue;
		const suggestion =
			row.source_type === 'project_suggestion'
				? (suggestions.get(row.source_ref_id) ?? null)
				: null;
		if (suggestion?.kind === 'freshness_update') continue; // never judge our own bundle
		const eligibleForRetire =
			row.source_type === 'project_suggestion' &&
			row.audience === 'project_members' &&
			suggestion?.status === 'pending' &&
			RETIRABLE_SUGGESTION_KINDS.has(suggestion.kind);
		inboxSubjects.push({
			row,
			suggestion,
			view: {
				title: row.title,
				summary: row.summary,
				source: sourceLabel(row, suggestion),
				created: relativeAgePhrase(row.created_at, now, timeZone),
				current_facts: inboxFacts({ suggestion, tasksById, documentsById, now, timeZone })
			},
			eligibleForRetire,
			currentlyPossiblyStale: row.freshness_state === 'possibly_stale',
			snapshot: {
				state_key: row.status,
				title_sha256: sha256(row.title) ?? '',
				details_sha256: sha256(row.summary),
				source_type: row.source_type,
				source_ref_id: row.source_ref_id
			}
		});
	}

	const skipReason = !messages.length
		? 'no_window_text'
		: !prefiltered.length && !trackSubjects.length && !inboxSubjects.length
			? 'no_candidates'
			: null;

	return {
		...base,
		skipReason,
		window: windowInfo,
		messages,
		sentences,
		newInformation,
		dateMentions,
		candidatesTotal: open.length,
		excludedCount: open.length - eligible.length,
		prefiltered,
		entityViews,
		changedInWindow,
		trackSubjects,
		inboxSubjects,
		suppressed,
		gate: {
			changedInWindow,
			newestWindowMessageAt: newestMessageAt,
			calendarLinkedTaskIds,
			recurringTaskIds,
			assignedToOthersTaskIds,
			recentlyUndone,
			projectAutoApplied24h: autoApplied24h
		},
		entitiesByKey
	};
}

export function entityView(
	candidate: FreshnessCandidate,
	now: Date,
	timeZone: string | null,
	policy: FreshnessPolicyV1
): JevEntityView {
	const view: JevEntityView = {
		kind: candidate.kind,
		title: candidate.title,
		state: candidate.state,
		last_changed: relativeAgePhrase(candidate.updatedAt, now, timeZone)
	};
	if (candidate.dueCivil) view.due = candidate.dueCivil;
	if (candidate.startCivil) view.start = candidate.startCivil;
	if (candidate.targetCivil) view.target = candidate.targetCivil;
	if (candidate.kind === 'document') {
		if (candidate.summary)
			view.summary = candidate.summary.slice(0, policy.prefilter.docSummaryChars);
	} else if (candidate.description) {
		view.details = Array.from(candidate.description.replace(/\s+/g, ' ').trim())
			.slice(0, policy.prefilter.detailsChars)
			.join('');
	}
	if (candidate.partOf) view.part_of = candidate.partOf;
	return view;
}

export function trackSubjectView(subject: FreshnessTrackSubject): JevTrackSubjectView {
	const target = subject.candidate.targetCivil ?? subject.candidate.dueCivil;
	return {
		kind: subject.candidate.kind,
		title: subject.candidate.title,
		state: subject.candidate.state,
		...(target ? { target } : {}),
		facts: subject.facts
	};
}
