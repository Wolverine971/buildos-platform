// apps/web/src/lib/server/activity-timeline.service.ts
//
// Builds the /notifications activity timeline: one continuous reverse-chronological
// feed unioned at read time from the tables that already record what happened.
// There is no materialised activity table on purpose — a read-time union means the
// full history (including everything logged before this feature existed) is
// available immediately, with no migration or backfill.
//
// PAGINATION
// Keyset, not offset. Each source is fetched independently with `created_at <= cursor`
// and its own limit, then merged. Because a source can be saturated (it returned a
// full page and may have more rows just past its horizon), the merged page is cut at
// the newest "oldest returned row" across all saturated sources — anything older than
// that watermark could be missing siblings, so it waits for the next page. That makes
// the union lossless and duplicate-free across pages.

import type { TypedSupabaseClient } from '@buildos/supabase-client';

import type { ServerTiming } from '$lib/server/server-timing';
import { enrichLogsForDisplay } from '$lib/server/project-logs-enrich';
import {
	ensureActorId,
	fetchProjectSummaries
} from '$lib/services/ontology/ontology-projects.service';
import type {
	ActivityActor,
	ActivityChild,
	ActivityEntry,
	ActivityLane,
	ActivityStat,
	ActivityStatus,
	ActivityTimelinePage
} from '$lib/types/activity-timeline';

/** Rows pulled per source per page. Merged, then cut at the saturation watermark. */
const FETCH_PER_SOURCE = 40;
/** Project logs are the highest-volume source and collapse hard, so they get more. */
const LOG_FETCH_LIMIT = 200;
/** Default entries returned to the client after grouping. */
const DEFAULT_PAGE_SIZE = 30;
/** Consecutive edits by the same actor in the same project within this window group. */
const LOG_GROUP_WINDOW_MS = 45 * 60 * 1000;

interface SourceResult {
	entries: ActivityEntry[];
	/** Oldest `created_at` this source returned, when it came back full. */
	saturatedAt: string | null;
	/** Source name when the query failed, so the page can report degradation. */
	failed?: string;
}

const EMPTY_SOURCE: SourceResult = { entries: [], saturatedAt: null };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asCount(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * First usable timestamp, preferring "finished" over "created". Several source
 * tables allow a null `created_at`; an entry with no time cannot be placed on the
 * timeline at all, so it falls back to now rather than being dropped.
 */
function occurredAt(...candidates: (string | null | undefined)[]): string {
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.length > 0) return candidate;
	}
	return new Date().toISOString();
}

/**
 * Applies `created_at <= cursor` when paginating. Inclusive on purpose: the page
 * boundary excludes rows at exactly the watermark, so the next page must include them.
 */
function applyCursor<T>(query: T, cursor: string | null): T {
	if (!cursor) return query;
	return (query as any).lte('created_at', cursor) as T;
}

function saturation(rows: { created_at: string | null }[] | null, limit: number): string | null {
	if (!rows || rows.length < limit) return null;
	const oldest = rows[rows.length - 1]?.created_at;
	return oldest ?? null;
}

function pluralize(count: number, singular: string, plural?: string): string {
	return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/** "task" -> "tasks", with the note/document alias the rest of the product uses. */
function entityLabel(entityType: string, count: number): string {
	const normalized = entityType === 'note' ? 'document' : entityType;
	return pluralize(count, normalized);
}

function titleCaseAction(action: string): string {
	return action.replace(/_/g, ' ');
}

/**
 * Background runs record "failures" that are not events the user did anything to
 * cause and cannot act on: the feature was switched off, or the run collapsed into
 * an already-active run for the same project. In production these are the large
 * majority of failed rows, so surfacing them turns the feed into false alarms.
 * The work they represent is either absent or already on the timeline under the
 * run that actually executed.
 */
const BENIGN_FAILURE_PATTERNS = [/^feature_disabled/i, /^deduplicated onto/i];

function isBenignFailure(errorMessage: string | null | undefined): boolean {
	if (!errorMessage) return false;
	return BENIGN_FAILURE_PATTERNS.some((pattern) => pattern.test(errorMessage.trim()));
}

/** Internals that must never reach the feed: constraint names, ids, stack-ish text. */
const OPAQUE_ERROR_PATTERNS = [
	/violates .*constraint/i,
	/relation ".*" does not exist/i,
	/\bqueue_jobs\b/i,
	/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
	/\bat [\w./]+:\d+:\d+/
];

/**
 * Error text is written for operators, not users. Anything that leaks internals or
 * runs long is replaced with a plain-language fallback; short, legible messages
 * (an LLM timeout, say) are kept because they genuinely explain what happened.
 */
function humanizeFailure(raw: string | null | undefined, fallback: string): string {
	const text = raw?.trim();
	if (!text) return fallback;
	if (text.length > 180) return fallback;
	if (OPAQUE_ERROR_PATTERNS.some((pattern) => pattern.test(text))) return fallback;
	return text;
}

// =====================================================
// SOURCE: notification deliveries (the actual pings)
// =====================================================

const EVENT_COPY: Record<string, { title: string; lane?: ActivityLane }> = {
	'brief.completed': { title: 'Daily brief ready' },
	'brief.failed': { title: 'Daily brief failed' },
	'task.assigned': { title: 'Task assigned to you' },
	'task.due_soon': { title: 'Task due soon' },
	'entity.tagged': { title: 'You were tagged' },
	'comment.mentioned': { title: 'You were mentioned' },
	'project.invite.accepted': { title: 'Invite accepted' },
	'project.activity.batched': { title: 'Teammate updates' },
	'project.activity.changed': { title: 'Teammate update' },
	'project.phase_scheduled': { title: 'Phase scheduled' },
	'calendar.sync_failed': { title: 'Calendar sync failed' },
	'payment.warning': { title: 'Billing needs attention' },
	'user.trial_reminder': { title: 'Trial ending soon' },
	billing_ops_anomaly: { title: 'Billing anomaly' },
	'user.signup': { title: 'New signup' },
	'user.trial_expired': { title: 'Trial expired' },
	'payment.failed': { title: 'Payment failed' },
	'error.critical': { title: 'Critical error' }
};

function notificationStatus(eventType: string, statuses: string[]): ActivityStatus {
	if (eventType.endsWith('.failed') || eventType === 'payment.failed') return 'error';
	if (statuses.every((s) => s === 'failed' || s === 'bounced')) return 'error';
	if (statuses.some((s) => s === 'failed' || s === 'bounced')) return 'warn';
	if (statuses.every((s) => s === 'pending')) return 'pending';
	return 'ok';
}

async function fetchNotifications(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('notification_deliveries')
			.select(
				`id, channel, status, created_at, payload, event_id,
				 notification_events!inner ( id, event_type, event_source, payload, created_at )`
			)
			.eq('recipient_user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] notification_deliveries failed', error);
		return { ...EMPTY_SOURCE, failed: 'notifications' };
	}

	const rows = data ?? [];

	// One event fans out to several channel deliveries; collapse to one entry so the
	// timeline reads as "this happened", not "this was emailed AND texted AND pushed".
	const byEvent = new Map<
		string,
		{ row: (typeof rows)[number]; channels: Set<string>; statuses: string[] }
	>();
	for (const row of rows) {
		const key = row.event_id ?? `row:${row.id}`;
		const existing = byEvent.get(key);
		if (existing) {
			existing.channels.add(row.channel);
			existing.statuses.push(row.status);
		} else {
			byEvent.set(key, {
				row,
				channels: new Set([row.channel]),
				statuses: [row.status]
			});
		}
	}

	const entries: ActivityEntry[] = [];
	for (const [key, { row, channels, statuses }] of byEvent) {
		const event = row.notification_events as any;
		const eventType: string = event?.event_type ?? 'unknown';
		const deliveryPayload = isRecord(row.payload) ? row.payload : {};
		const eventPayload = isRecord(event?.payload) ? event.payload : {};

		const projectId =
			asString(eventPayload.project_id) ?? asString((eventPayload as any).projectId);
		const projectName =
			(projectId ? projectNameById.get(projectId) : null) ??
			asString(eventPayload.project_name);

		const stats: ActivityStat[] = [];
		const channelList = Array.from(channels).sort();
		stats.push({
			label: 'Sent via',
			value: channelList.map((c) => (c === 'in_app' ? 'in-app' : c)).join(', ')
		});

		if (eventType === 'brief.completed') {
			const today = asCount(eventPayload.todays_task_count);
			const overdue = asCount(eventPayload.overdue_task_count);
			const projects = asCount(eventPayload.project_count);
			if (today !== null) stats.push({ label: 'Today', value: today });
			if (overdue) stats.push({ label: 'Overdue', value: overdue });
			if (projects !== null) stats.push({ label: 'Projects', value: projects });
		} else if (eventType === 'project.activity.batched') {
			const count = asCount(eventPayload.event_count);
			if (count !== null) stats.push({ label: 'Updates', value: count });
		}

		entries.push({
			id: `notification:${key}`,
			lane: 'ping',
			kind: 'notification',
			occurred_at: occurredAt(row.created_at, event?.created_at),
			title:
				asString(deliveryPayload.title) ?? EVENT_COPY[eventType]?.title ?? 'Notification',
			body: asString(deliveryPayload.body),
			project_id: projectId,
			project_name: projectName,
			actor: 'system',
			actor_label: 'BuildOS',
			status: notificationStatus(eventType, statuses),
			stats,
			href: projectId ? `/projects/${projectId}` : null,
			children: [],
			count: statuses.length
		});
	}

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// SOURCE: project audits (the "agent ran an audit" story)
// =====================================================

const AUDIT_TRIGGER_COPY: Record<string, string> = {
	scheduled: 'scheduled pass',
	burst: 'burst of activity',
	critical_change: 'a critical change',
	manual: 'you asked for it'
};

async function fetchProjectAudits(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('project_audits')
			.select(
				'id, project_id, status, trigger_reason, audit_depth, delivery_confidence, summary, top_findings, generated_suggestion_count, unresolved_suggestion_count, error_message, created_at, finished_at'
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] project_audits failed', error);
		return { ...EMPTY_SOURCE, failed: 'audits' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const projectName = row.project_id ? (projectNameById.get(row.project_id) ?? null) : null;
		const unresolved = asCount(row.unresolved_suggestion_count) ?? 0;
		const generated = asCount(row.generated_suggestion_count) ?? 0;

		const stats: ActivityStat[] = [];
		if (row.delivery_confidence && row.delivery_confidence !== 'unknown') {
			stats.push({ label: 'Confidence', value: row.delivery_confidence });
		}
		if (generated) stats.push({ label: 'Findings', value: generated });
		if (unresolved) stats.push({ label: 'Unresolved', value: unresolved });
		if (row.audit_depth === 'deep') stats.push({ label: 'Depth', value: 'deep' });

		const findings = Array.isArray(row.top_findings) ? row.top_findings : [];
		const children: ActivityChild[] = findings.slice(0, 4).map((finding, index) => {
			const record = isRecord(finding) ? finding : {};
			return {
				id: `${row.id}:finding:${index}`,
				label: asString(record.title) ?? asString(record.summary) ?? `Finding ${index + 1}`,
				detail: asString(record.summary),
				at: row.finished_at ?? row.created_at
			};
		});

		let status: ActivityStatus = 'ok';
		if (row.status === 'failed') status = 'error';
		else if (row.status === 'queued' || row.status === 'running') status = 'pending';
		else if (unresolved > 0 || row.delivery_confidence === 'red') status = 'warn';

		const triggerCopy = AUDIT_TRIGGER_COPY[row.trigger_reason] ?? row.trigger_reason;

		return {
			id: `audit:${row.id}`,
			lane: 'agent',
			kind: 'project_audit',
			occurred_at: occurredAt(row.finished_at, row.created_at),
			title: projectName ? `Project audit — ${projectName}` : 'Project audit',
			body:
				row.status === 'failed'
					? humanizeFailure(row.error_message, 'The audit could not be completed.')
					: (row.summary ?? null),
			project_id: row.project_id,
			project_name: projectName,
			actor: 'agent',
			actor_label: `Audit agent · ${triggerCopy}`,
			status,
			stats,
			href: row.project_id ? `/projects/${row.project_id}` : null,
			children,
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// SOURCE: project review passes (buildos_project_loop)
// =====================================================

async function fetchLoopRuns(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('project_loop_runs')
			.select(
				'id, project_id, status, trigger_reason, summary, suggestion_count, error_message, created_at, finished_at'
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] project_loop_runs failed', error);
		return { ...EMPTY_SOURCE, failed: 'reviews' };
	}

	const rows = data ?? [];

	// Drop runs that "failed" for reasons the user neither caused nor can act on.
	// They still count toward saturation, so pagination stays correct.
	const visible = rows.filter(
		(row) => !(row.status === 'failed' && isBenignFailure(row.error_message))
	);

	// A nightly sweep fires one run per project. Left ungrouped that's 15 near-identical
	// cards at 3am, which buries everything else — so a sweep collapses into one entry.
	const buckets = new Map<string, typeof visible>();
	for (const row of visible) {
		const at = new Date(row.created_at).getTime();
		const bucketKey = `${row.trigger_reason}:${row.status}:${Math.floor(at / LOG_GROUP_WINDOW_MS)}`;
		const bucket = buckets.get(bucketKey);
		if (bucket) bucket.push(row);
		else buckets.set(bucketKey, [row]);
	}

	const entries: ActivityEntry[] = [];
	for (const [bucketKey, bucket] of buckets) {
		const newest = bucket[0];
		if (!newest) continue;
		const suggestionTotal = bucket.reduce(
			(sum, row) => sum + (asCount(row.suggestion_count) ?? 0),
			0
		);
		const failed = newest.status === 'failed';
		const waiting = newest.status === 'waiting_review';

		const projectNames = bucket
			.map((row) => (row.project_id ? projectNameById.get(row.project_id) : null))
			.filter((name): name is string => Boolean(name));
		const uniqueNames = Array.from(new Set(projectNames));

		const stats: ActivityStat[] = [];
		if (bucket.length > 1) stats.push({ label: 'Projects', value: uniqueNames.length });
		if (suggestionTotal) stats.push({ label: 'Suggestions', value: suggestionTotal });
		stats.push({ label: 'Trigger', value: titleCaseAction(newest.trigger_reason) });

		const children: ActivityChild[] = bucket.slice(0, 8).map((row) => ({
			id: `loop:${row.id}`,
			label: row.project_id ? (projectNameById.get(row.project_id) ?? 'Project') : 'Project',
			detail:
				row.status === 'failed'
					? humanizeFailure(row.error_message, 'Review pass could not finish')
					: (row.summary ??
						(row.suggestion_count
							? pluralize(row.suggestion_count, 'suggestion')
							: 'No changes suggested')),
			at: occurredAt(row.finished_at, row.created_at),
			project_id: row.project_id
		}));

		let title: string;
		if (bucket.length > 1) {
			title = failed
				? `Review pass failed on ${pluralize(bucket.length, 'project')}`
				: `Reviewed ${pluralize(uniqueNames.length || bucket.length, 'project')}`;
		} else {
			const name = uniqueNames[0];
			title = failed
				? `Review pass failed${name ? ` — ${name}` : ''}`
				: `Project review${name ? ` — ${name}` : ''}`;
		}

		entries.push({
			id: `loop-bucket:${bucketKey}:${newest.id}`,
			lane: 'agent',
			kind: 'loop_run',
			occurred_at: occurredAt(newest.finished_at, newest.created_at),
			title,
			body: failed
				? humanizeFailure(
						newest.error_message,
						'The review pass could not finish. It will retry on the next pass.'
					)
				: bucket.length === 1
					? newest.summary
					: suggestionTotal
						? `${pluralize(suggestionTotal, 'suggestion')} waiting across your projects.`
						: 'No changes suggested.',
			project_id: bucket.length === 1 ? newest.project_id : null,
			project_name: bucket.length === 1 ? (uniqueNames[0] ?? null) : null,
			actor: 'agent',
			actor_label: 'Review agent',
			status: failed ? 'error' : waiting ? 'warn' : 'ok',
			stats,
			href:
				bucket.length === 1 && newest.project_id ? `/projects/${newest.project_id}` : null,
			children: bucket.length > 1 ? children : [],
			count: bucket.length
		});
	}

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// SOURCE: durable agent runs
// =====================================================

const AGENT_RUN_WARN = new Set(['partial', 'needs_input', 'proposal_ready', 'paused']);
const AGENT_RUN_ERROR = new Set(['failed', 'cancelled']);

async function fetchAgentRuns(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('agent_runs')
			.select(
				'id, project_id, label, goal, status, trigger, run_template, context_type, error, created_at, completed_at'
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] agent_runs failed', error);
		return { ...EMPTY_SOURCE, failed: 'agent runs' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const projectName = row.project_id ? (projectNameById.get(row.project_id) ?? null) : null;
		const status: ActivityStatus = AGENT_RUN_ERROR.has(row.status)
			? 'error'
			: AGENT_RUN_WARN.has(row.status)
				? 'warn'
				: row.status === 'running' || row.status === 'queued'
					? 'pending'
					: 'ok';

		const stats: ActivityStat[] = [{ label: 'Status', value: titleCaseAction(row.status) }];
		if (row.trigger) stats.push({ label: 'Started by', value: titleCaseAction(row.trigger) });
		if (row.run_template === 'deep_research') {
			stats.push({ label: 'Type', value: 'deep research' });
		}

		return {
			id: `agent-run:${row.id}`,
			lane: 'agent',
			kind: 'agent_run',
			occurred_at: occurredAt(row.completed_at, row.created_at),
			title: row.label || 'Agent run',
			body:
				row.status === 'failed'
					? humanizeFailure(row.error, row.goal ?? 'The agent run failed.')
					: row.goal,
			project_id: row.project_id,
			project_name: projectName,
			actor: 'agent',
			actor_label: 'Agent run',
			status,
			stats,
			href: row.project_id ? `/projects/${row.project_id}` : null,
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// SOURCE: entity changes (onto_project_logs), grouped
// =====================================================

interface ResolvedLogActor {
	lane: ActivityLane;
	actor: ActivityActor;
	label: string;
}

function resolveLogActor(
	log: {
		changed_by: string | null;
		change_source: string | null;
		external_agent_caller_name: string | null;
		changed_by_name: string | null;
	},
	userId: string
): ResolvedLogActor {
	if (log.external_agent_caller_name) {
		return { lane: 'agent', actor: 'external_agent', label: log.external_agent_caller_name };
	}
	if (log.change_source === 'agent_call') {
		return { lane: 'agent', actor: 'external_agent', label: 'Connected agent' };
	}
	if (log.change_source === 'chat') {
		return { lane: 'you', actor: 'chat', label: 'BuildOS chat' };
	}
	if (log.change_source === 'brain_dump') {
		return { lane: 'you', actor: 'you', label: 'Brain dump' };
	}
	if (log.changed_by === userId) {
		return { lane: 'you', actor: 'you', label: 'You' };
	}
	if (log.changed_by_name) {
		return { lane: 'you', actor: 'teammate', label: log.changed_by_name };
	}
	return { lane: 'system', actor: 'system', label: 'BuildOS' };
}

/** "Updated 6 tasks and 2 documents" from the per-entity-type tallies. */
function describeChanges(counts: Map<string, number>): string {
	const parts = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map(([type, count]) => entityLabel(type, count));
	if (parts.length === 0) return 'Made changes';
	if (parts.length === 1) return parts[0]!;
	if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

async function fetchProjectLogs(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const projectIds = Array.from(projectNameById.keys());
	if (projectIds.length === 0) return EMPTY_SOURCE;

	const { data, error } = await applyCursor(
		supabase
			.from('onto_project_logs')
			.select(
				'id, project_id, entity_type, entity_id, action, before_data, after_data, changed_by, changed_by_actor_id, external_agent_caller_id, agent_call_session_id, change_source, created_at'
			)
			.in('project_id', projectIds)
			// Edge (relationship) rows are structural plumbing, not user-legible activity.
			.neq('entity_type', 'edge')
			.order('created_at', { ascending: false })
			.limit(LOG_FETCH_LIMIT),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] onto_project_logs failed', error);
		return { ...EMPTY_SOURCE, failed: 'project changes' };
	}

	const rows = data ?? [];
	if (rows.length === 0) return EMPTY_SOURCE;

	const enriched = await enrichLogsForDisplay(supabase, rows);

	// Walk newest-first and start a new group whenever the project, the actor, or the
	// 45-minute working window changes. This is what turns "I edited 6 tasks" from six
	// rows into one line you can expand.
	interface LogGroup {
		key: string;
		projectId: string;
		actor: ResolvedLogActor;
		logs: typeof enriched;
		newestAt: string;
	}

	const groups: LogGroup[] = [];
	for (const log of enriched) {
		const actor = resolveLogActor(log, userId);
		const at = new Date(log.created_at).getTime();
		const current = groups[groups.length - 1];
		const oldestInCurrent = current?.logs[current.logs.length - 1];
		const sameBucket =
			current &&
			oldestInCurrent &&
			current.projectId === log.project_id &&
			current.actor.label === actor.label &&
			new Date(oldestInCurrent.created_at).getTime() - at <= LOG_GROUP_WINDOW_MS;

		if (sameBucket) {
			current.logs.push(log);
		} else {
			groups.push({
				key: `${log.project_id}:${actor.label}:${log.id}`,
				projectId: log.project_id,
				actor,
				logs: [log],
				newestAt: log.created_at
			});
		}
	}

	const entries = groups.map((group): ActivityEntry => {
		const projectName = projectNameById.get(group.projectId) ?? null;

		// Collapse repeat edits to the same entity, then tally by entity type.
		const byEntity = new Map<
			string,
			{ log: (typeof group.logs)[number]; occurrences: number }
		>();
		for (const log of group.logs) {
			const key = `${log.entity_type}:${log.entity_id}`;
			const existing = byEntity.get(key);
			if (existing) existing.occurrences += 1;
			else byEntity.set(key, { log, occurrences: 1 });
		}

		const typeCounts = new Map<string, number>();
		for (const { log } of byEntity.values()) {
			const normalized = log.entity_type === 'note' ? 'document' : log.entity_type;
			typeCounts.set(normalized, (typeCounts.get(normalized) ?? 0) + 1);
		}

		const actions = new Set(group.logs.map((log) => log.action));
		const soleAction = actions.size === 1 ? Array.from(actions)[0] : null;
		const verb = soleAction ? titleCaseAction(soleAction) : 'changed';

		const children: ActivityChild[] = Array.from(byEntity.values())
			.slice(0, 12)
			.map(({ log, occurrences }) => ({
				id: `log:${log.id}`,
				label: log.entity_name || `Untitled ${log.entity_type}`,
				detail: `${titleCaseAction(log.action)} · ${log.entity_type === 'note' ? 'document' : log.entity_type}`,
				at: log.created_at,
				entity_type: log.entity_type,
				entity_id: log.entity_id,
				project_id: log.project_id,
				occurrences
			}));

		const title = `${verb.charAt(0).toUpperCase()}${verb.slice(1)} ${describeChanges(typeCounts)}${
			projectName ? ` in ${projectName}` : ''
		}`;

		return {
			id: `changes:${group.key}`,
			lane: group.actor.lane,
			kind: 'entity_changes',
			occurred_at: group.newestAt,
			title,
			body: null,
			project_id: group.projectId,
			project_name: projectName,
			actor: group.actor.actor,
			actor_label: group.actor.label,
			status: 'ok',
			stats: [],
			href: `/projects/${group.projectId}`,
			children,
			count: group.logs.length
		};
	});

	return { entries, saturatedAt: saturation(rows, LOG_FETCH_LIMIT) };
}

// =====================================================
// SOURCE: chat sessions, brain dumps, voice notes
// =====================================================

async function fetchChatSessions(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null,
	projectNameById: Map<string, string>
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('chat_sessions')
			.select(
				'id, title, auto_title, summary, context_type, entity_id, message_count, tool_call_count, status, created_at, last_message_at'
			)
			.eq('user_id', userId)
			.is('archived_at', null)
			.gt('message_count', 0)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] chat_sessions failed', error);
		return { ...EMPTY_SOURCE, failed: 'chats' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const projectId = row.context_type === 'project' ? row.entity_id : null;
		const projectName = projectId ? (projectNameById.get(projectId) ?? null) : null;

		const stats: ActivityStat[] = [];
		const messages = asCount(row.message_count);
		const tools = asCount(row.tool_call_count);
		if (messages) stats.push({ label: 'Messages', value: messages });
		if (tools) stats.push({ label: 'Tool calls', value: tools });

		return {
			id: `chat:${row.id}`,
			lane: 'you',
			kind: 'chat_session',
			occurred_at: occurredAt(row.created_at),
			title: row.title || row.auto_title || 'Agentic chat',
			body: row.summary,
			project_id: projectId,
			project_name: projectName,
			actor: 'you',
			actor_label: projectName ? `Chat · ${projectName}` : 'Chat',
			status: 'ok',
			stats,
			href: projectId ? `/projects/${projectId}` : null,
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

async function fetchBraindumps(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('onto_braindumps')
			.select('id, title, summary, topics, status, error_message, created_at, processed_at')
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] onto_braindumps failed', error);
		return { ...EMPTY_SOURCE, failed: 'brain dumps' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const topics = Array.isArray(row.topics) ? row.topics.filter(Boolean) : [];
		return {
			id: `braindump:${row.id}`,
			lane: 'you',
			kind: 'braindump',
			occurred_at: occurredAt(row.processed_at, row.created_at),
			title: row.title || 'Brain dump',
			body:
				row.status === 'failed' ? (row.error_message ?? 'Processing failed') : row.summary,
			project_id: null,
			project_name: null,
			actor: 'you',
			actor_label: 'Brain dump',
			status:
				row.status === 'failed' ? 'error' : row.status === 'processed' ? 'ok' : 'pending',
			stats: topics.length ? [{ label: 'Topics', value: topics.slice(0, 3).join(', ') }] : [],
			href: '/history',
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

async function fetchVoiceNotes(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('voice_notes')
			.select(
				'id, transcript, transcription_status, transcription_error, duration_seconds, created_at'
			)
			.eq('user_id', userId)
			.is('deleted_at', null)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] voice_notes failed', error);
		return { ...EMPTY_SOURCE, failed: 'voice notes' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const failed = row.transcription_status === 'failed';
		const seconds = asCount(row.duration_seconds);
		return {
			id: `voice:${row.id}`,
			lane: 'you',
			kind: 'voice_note',
			occurred_at: occurredAt(row.created_at),
			title: failed ? 'Voice note failed to transcribe' : 'Voice note captured',
			body: failed
				? (row.transcription_error ?? null)
				: row.transcript
					? row.transcript.slice(0, 240)
					: null,
			project_id: null,
			project_name: null,
			actor: 'you',
			actor_label: 'Voice note',
			status: failed ? 'error' : row.transcription_status === 'completed' ? 'ok' : 'pending',
			stats: seconds ? [{ label: 'Length', value: `${Math.round(seconds)}s` }] : [],
			href: '/history',
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// SOURCE: system jobs (brief + audio failures, calendar analysis)
// =====================================================

async function fetchBriefFailures(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null
): Promise<SourceResult> {
	// Successful briefs already arrive as a `brief.completed` ping, so only the
	// silent failures — generation and audio narration — are added here.
	const { data, error } = await applyCursor(
		supabase
			.from('ontology_daily_briefs')
			.select(
				'id, brief_date, generation_status, generation_error, audio_status, audio_error, created_at'
			)
			.eq('user_id', userId)
			.or('generation_status.eq.failed,audio_status.eq.failed')
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] ontology_daily_briefs failed', error);
		return { ...EMPTY_SOURCE, failed: 'briefs' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const generationFailed = row.generation_status === 'failed';
		return {
			id: `brief:${row.id}`,
			lane: 'system',
			kind: 'brief',
			occurred_at: occurredAt(row.created_at),
			title: generationFailed
				? 'Daily brief failed to generate'
				: 'Brief audio failed to generate',
			body: generationFailed ? row.generation_error : row.audio_error,
			project_id: null,
			project_name: null,
			actor: 'system',
			actor_label: 'Daily brief',
			status: 'error',
			stats: row.brief_date ? [{ label: 'For', value: row.brief_date }] : [],
			href: '/briefs',
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

async function fetchCalendarAnalyses(
	supabase: TypedSupabaseClient,
	userId: string,
	cursor: string | null
): Promise<SourceResult> {
	const { data, error } = await applyCursor(
		supabase
			.from('calendar_analyses')
			.select(
				'id, status, events_analyzed, projects_suggested, projects_created, tasks_created, error_message, created_at, completed_at'
			)
			.eq('user_id', userId)
			.order('created_at', { ascending: false })
			.limit(FETCH_PER_SOURCE),
		cursor
	);

	if (error) {
		console.error('[ActivityTimeline] calendar_analyses failed', error);
		return { ...EMPTY_SOURCE, failed: 'calendar analysis' };
	}

	const rows = data ?? [];
	const entries = rows.map((row): ActivityEntry => {
		const stats: ActivityStat[] = [];
		const analyzed = asCount(row.events_analyzed);
		const suggested = asCount(row.projects_suggested);
		const created = asCount(row.projects_created);
		if (analyzed) stats.push({ label: 'Events', value: analyzed });
		if (suggested) stats.push({ label: 'Suggested', value: suggested });
		if (created) stats.push({ label: 'Created', value: created });

		const failed = row.status === 'failed';
		return {
			id: `calendar-analysis:${row.id}`,
			lane: 'system',
			kind: 'calendar_analysis',
			occurred_at: occurredAt(row.completed_at, row.created_at),
			title: failed ? 'Calendar analysis failed' : 'Analyzed your calendar',
			body: failed
				? (row.error_message ?? null)
				: suggested
					? `Found ${pluralize(suggested, 'possible project')} in your calendar.`
					: null,
			project_id: null,
			project_name: null,
			actor: 'system',
			actor_label: 'Calendar',
			status: failed ? 'error' : 'ok',
			stats,
			href: '/projects',
			children: [],
			count: 1
		};
	});

	return { entries, saturatedAt: saturation(rows, FETCH_PER_SOURCE) };
}

// =====================================================
// PUBLIC API
// =====================================================

export interface LoadActivityTimelineOptions {
	supabase: TypedSupabaseClient;
	userId: string;
	/** ISO timestamp; returns entries at or older than this. */
	before?: string | null;
	limit?: number;
	/** When set, only entries in these lanes are returned. */
	lanes?: ActivityLane[] | null;
	timing?: ServerTiming;
}

export async function loadActivityTimeline({
	supabase,
	userId,
	before = null,
	limit = DEFAULT_PAGE_SIZE,
	lanes = null,
	timing
}: LoadActivityTimelineOptions): Promise<ActivityTimelinePage> {
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	const cursor = before && Number.isFinite(Date.parse(before)) ? before : null;
	const laneFilter = lanes && lanes.length > 0 ? new Set(lanes) : null;

	const actorId = await measure('activity.actor', () => ensureActorId(supabase, userId));
	const projects = await measure('activity.projects', () =>
		fetchProjectSummaries(supabase, actorId, timing)
	);
	const projectNameById = new Map(projects.map((project) => [project.id, project.name]));

	// A lane filter lets us skip whole queries rather than fetch-then-discard.
	const wants = (lane: ActivityLane) => !laneFilter || laneFilter.has(lane);

	const results = await measure('activity.sources', () =>
		Promise.all([
			wants('ping')
				? fetchNotifications(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			wants('agent')
				? fetchProjectAudits(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			wants('agent')
				? fetchLoopRuns(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			wants('agent')
				? fetchAgentRuns(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			// Project logs span the `you` and `agent` lanes (source decides), so they
			// are fetched whenever either is visible and filtered after mapping.
			wants('you') || wants('agent')
				? fetchProjectLogs(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			wants('you')
				? fetchChatSessions(supabase, userId, cursor, projectNameById)
				: EMPTY_SOURCE,
			wants('you') ? fetchBraindumps(supabase, userId, cursor) : EMPTY_SOURCE,
			wants('you') ? fetchVoiceNotes(supabase, userId, cursor) : EMPTY_SOURCE,
			wants('system') ? fetchBriefFailures(supabase, userId, cursor) : EMPTY_SOURCE,
			wants('system') ? fetchCalendarAnalyses(supabase, userId, cursor) : EMPTY_SOURCE
		])
	);

	const degraded = results
		.map((result) => result.failed)
		.filter((name): name is string => Boolean(name));

	// Watermark: the newest "oldest row" among sources that came back full. Anything
	// older than this could still have unseen siblings, so it belongs to a later page.
	let watermark: string | null = null;
	for (const result of results) {
		if (!result.saturatedAt) continue;
		if (!watermark || result.saturatedAt > watermark) watermark = result.saturatedAt;
	}

	let merged = results.flatMap((result) => result.entries);
	if (laneFilter) merged = merged.filter((entry) => laneFilter.has(entry.lane));

	merged.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());

	let page = watermark
		? merged.filter((entry) => new Date(entry.occurred_at) > new Date(watermark))
		: merged;

	// The cursor is inclusive (`lte`) so rows sharing a timestamp are never dropped
	// between pages. The cost is that the boundary entry can repeat, which the client
	// resolves by keying on entry id — cheaper than losing activity at a tie.
	let nextCursor: string | null;
	if (page.length > limit) {
		page = page.slice(0, limit);
		nextCursor = page[page.length - 1]?.occurred_at ?? watermark;
	} else {
		// No watermark means every source was exhausted — this is the end of the feed.
		nextCursor = watermark;
	}

	return {
		entries: page,
		nextCursor,
		// Deliberately independent of `page.length`: a lane filter can empty a page
		// while older matching activity still exists behind the watermark.
		hasMore: Boolean(nextCursor),
		degraded
	};
}
