// apps/web/src/lib/services/admin/failed-jobs/failed-jobs.ts
//
// The rules behind /admin/jobs: which failed background jobs may be run again,
// how they are named in plain words, and how they are grouped. Plain functions
// with no database or framework imports, so the page, the endpoint, and the
// tests all share one copy of the allow-list.

/** One failed `queue_jobs` row, trimmed to what the page needs. */
export type FailedJobRow = {
	id: string;
	job_type: string;
	user_id: string | null;
	error_message: string | null;
	attempts: number | null;
	created_at: string;
	updated_at: string | null;
	completed_at: string | null;
	/** `metadata->>'briefDate'` (YYYY-MM-DD); only daily brief jobs carry it. */
	brief_date: string | null;
	/** `metadata->>'timezone'` (IANA name); only daily brief jobs carry it. */
	brief_timezone: string | null;
};

// Failed rows are kept 30 days; the longest window reaches all of them.
export const FAILED_JOB_DAY_CHOICES = [1, 3, 7, 30] as const;
export const FAILED_JOB_DEFAULT_DAYS = 1;

/** The most jobs one "Run again" request may name. */
export const MAX_REQUEUE_JOB_IDS = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Job types that are safe to run a second time: each one either writes the same
 * result again or checks its own state before doing anything.
 */
export const ALWAYS_SAFE_TO_RERUN: ReadonlySet<string> = new Set([
	'embed_onto_entity',
	'extract_task_entities',
	'pick_project_emoji',
	'classify_chat_session',
	'capture_chat_checkpoint',
	'build_project_context_snapshot',
	'workspace_suggest',
	'generate_brief_audio'
]);

/** Safe only while the brief is still today's (see `rerunDecision`). */
export const DAILY_BRIEF_JOB_TYPE = 'generate_daily_brief';

const JOB_TYPE_LABELS: Record<string, string> = {
	embed_onto_entity: 'Search index updates',
	extract_task_entities: 'Reading names and details from tasks',
	pick_project_emoji: 'Project emoji picks',
	classify_chat_session: 'Chat titles and summaries',
	capture_chat_checkpoint: 'Chat progress notes',
	build_project_context_snapshot: 'Project summaries for chat',
	workspace_suggest: 'Workspace grouping suggestions',
	generate_brief_audio: 'Daily brief audio',
	generate_daily_brief: 'Daily briefs',
	send_notification: 'Notifications',
	send_sms: 'Text messages',
	schedule_daily_sms: 'Daily text scheduling',
	agentic_chat_turn: 'Chat replies',
	agent_run: 'Agent runs',
	buildos_project_loop: 'Project reviews',
	consolidation_run: 'Project consolidation',
	sync_calendar: 'Calendar sync',
	user_data_export: 'Data exports',
	transcribe_voice_note: 'Voice note transcripts',
	extract_onto_asset_ocr: 'Reading text from images',
	project_activity_batch_flush: 'Project activity updates',
	table_ai_fill: 'Table AI fill',
	freshness_radar_scan: 'Freshness checks',
	run_cycle: 'Cycles'
};

/** The job type in plain words; an unknown type falls back to its slug with spaces. */
export function jobTypeLabel(jobType: string): string {
	const known = JOB_TYPE_LABELS[jobType];
	if (known) return known;
	const words = jobType.replace(/_/g, ' ').trim();
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unknown job';
}

export type RerunBlockReason = 'could_repeat' | 'old_brief' | 'brief_date_unknown';

export type RerunDecision = { allowed: true } | { allowed: false; reason: RerunBlockReason };

const RERUN_BLOCK_CLAUSES: Record<RerunBlockReason, string> = {
	could_repeat: 'it could send something twice or repeat a change',
	old_brief:
		'the brief is for an earlier day, so running it would rebuild and re-send an old brief',
	brief_date_unknown:
		'the job does not say which day its brief is for, so it could re-send an old one'
};

/** One line, for the founder, on why a job (or part of a group) has no Run again. */
export function rerunBlockedLine(reason: RerunBlockReason, blocked = 1, total = 1): string {
	const clause = RERUN_BLOCK_CLAUSES[reason];
	if (blocked >= total) return `No Run again here: ${clause}.`;
	return `No Run again for ${blocked} of these ${total}: ${clause}.`;
}

/** Today's date (YYYY-MM-DD) in a timezone; an unknown timezone falls back to UTC. */
export function localDateString(now: Date, timezone: string | null | undefined): string {
	const format = (timeZone: string) =>
		new Intl.DateTimeFormat('en-CA', {
			timeZone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(now);
	if (timezone) {
		try {
			return format(timezone);
		} catch {
			// Not an IANA name this runtime knows.
		}
	}
	return format('UTC');
}

/**
 * Whether one failed job may be run again. The endpoint and the page both call
 * this, so a job the page shows without a button is also refused by the server.
 */
export function rerunDecision(
	job: Pick<FailedJobRow, 'job_type' | 'brief_date' | 'brief_timezone'>,
	now: Date = new Date()
): RerunDecision {
	if (ALWAYS_SAFE_TO_RERUN.has(job.job_type)) return { allowed: true };
	if (job.job_type === DAILY_BRIEF_JOB_TYPE) {
		const briefDate = job.brief_date?.trim();
		if (!briefDate || !/^\d{4}-\d{2}-\d{2}$/.test(briefDate)) {
			return { allowed: false, reason: 'brief_date_unknown' };
		}
		return briefDate === localDateString(now, job.brief_timezone)
			? { allowed: true }
			: { allowed: false, reason: 'old_brief' };
	}
	return { allowed: false, reason: 'could_repeat' };
}

/** Ids from a request body: valid UUIDs only, lower-cased, no repeats. */
export function parseRequeueJobIds(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	const ids = new Set<string>();
	for (const entry of value) {
		if (typeof entry !== 'string' || !UUID.test(entry)) return null;
		ids.add(entry.toLowerCase());
	}
	return [...ids];
}

/** Split the rows a request named into the ones that may run again and the ones that may not. */
export function partitionRequeueRows(
	rows: Array<Pick<FailedJobRow, 'id' | 'job_type' | 'brief_date' | 'brief_timezone'>>,
	now: Date = new Date()
): { allowedIds: string[]; blocked: Array<{ id: string; reason: RerunBlockReason }> } {
	const allowedIds: string[] = [];
	const blocked: Array<{ id: string; reason: RerunBlockReason }> = [];
	for (const row of rows) {
		const decision = rerunDecision(row, now);
		if (decision.allowed) allowedIds.push(row.id);
		else blocked.push({ id: row.id, reason: decision.reason });
	}
	return { allowedIds, blocked };
}

/** Jobs of the automated test account are noise on this page. */
export function isTestAccountEmail(email: string | null | undefined): boolean {
	return !!email && email.trim().toLowerCase().endsWith('@example.com');
}

/** When the job gave up: the final failure stamps `completed_at`. */
export function failedAt(
	row: Pick<FailedJobRow, 'completed_at' | 'updated_at' | 'created_at'>
): string {
	return row.completed_at ?? row.updated_at ?? row.created_at;
}

export const NO_ERROR_MESSAGE = 'No error message was saved.';

/** Error text can be a whole provider response; the page shows the start of it. */
const ERROR_MESSAGE_DISPLAY_LIMIT = 600;

export function displayErrorMessage(message: string | null | undefined): string {
	const text = message?.trim();
	if (!text) return NO_ERROR_MESSAGE;
	return text.length > ERROR_MESSAGE_DISPLAY_LIMIT
		? `${text.slice(0, ERROR_MESSAGE_DISPLAY_LIMIT).trimEnd()}…`
		: text;
}

/**
 * A key that treats two messages as the same error when they differ only by an
 * id or a number ("timed out after 299980ms" vs "...300112ms"). It only folds
 * ids and digits; it does not read meaning into the text.
 */
function errorKey(message: string): string {
	return message
		.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>')
		.replace(/\d+/g, '<n>')
		.replace(/\s+/g, ' ')
		.trim();
}

/** The error seen most often, with how many jobs hit it. Ties go to the most recent. */
export function mostCommonError(
	jobs: Array<{ errorMessage: string; failedAt: string }>
): { message: string; count: number } | null {
	if (!jobs.length) return null;
	const byKey = new Map<string, { message: string; count: number; latest: string }>();
	for (const job of jobs) {
		const key = errorKey(job.errorMessage);
		const entry = byKey.get(key);
		if (!entry) {
			byKey.set(key, { message: job.errorMessage, count: 1, latest: job.failedAt });
		} else {
			entry.count += 1;
			if (job.failedAt > entry.latest) {
				entry.latest = job.failedAt;
				entry.message = job.errorMessage;
			}
		}
	}
	let best: { message: string; count: number; latest: string } | null = null;
	for (const entry of byKey.values()) {
		if (
			!best ||
			entry.count > best.count ||
			(entry.count === best.count && entry.latest > best.latest)
		) {
			best = entry;
		}
	}
	return best ? { message: best.message, count: best.count } : null;
}

export type FailedJobView = {
	id: string;
	failedAt: string;
	/** Whose job it was; null when the account is gone or was never set. */
	userEmail: string | null;
	isTestAccount: boolean;
	errorMessage: string;
	attempts: number;
	canRerun: boolean;
	/** Why there is no Run again, in plain words; null when there is one. */
	blockedMessage: string | null;
};

export type FailedJobGroup = {
	jobType: string;
	label: string;
	count: number;
	firstFailedAt: string;
	lastFailedAt: string;
	topError: { message: string; count: number } | null;
	/** Newest first. */
	jobs: FailedJobView[];
	rerunnableIds: string[];
	/** The one line shown when some or all of the group has no Run again. */
	blockedMessage: string | null;
};

export type FailedJobsSummary = {
	groups: FailedJobGroup[];
	/** Jobs shown (after the test-account filter). */
	total: number;
	rerunnable: number;
	/** Test-account jobs left out because the toggle is off. */
	hiddenTestJobs: number;
};

const ISO = (value: string) => new Date(value).toISOString();

/**
 * Group failed rows by job type. Groups are ordered by how many failed, then by
 * the most recent failure.
 */
export function buildFailedJobGroups(
	rows: FailedJobRow[],
	options: {
		emails: Record<string, string>;
		includeTestAccounts: boolean;
		now?: Date;
	}
): FailedJobsSummary {
	const now = options.now ?? new Date();
	const byType = new Map<string, FailedJobView[]>();
	const blockedReasons = new Map<string, Set<RerunBlockReason>>();
	let hiddenTestJobs = 0;

	for (const row of rows) {
		const userEmail = row.user_id ? (options.emails[row.user_id] ?? null) : null;
		const isTestAccount = isTestAccountEmail(userEmail);
		if (isTestAccount && !options.includeTestAccounts) {
			hiddenTestJobs += 1;
			continue;
		}
		const decision = rerunDecision(row, now);
		const view: FailedJobView = {
			id: row.id,
			failedAt: ISO(failedAt(row)),
			userEmail,
			isTestAccount,
			errorMessage: displayErrorMessage(row.error_message),
			attempts: row.attempts ?? 0,
			canRerun: decision.allowed,
			blockedMessage: decision.allowed ? null : rerunBlockedLine(decision.reason)
		};
		const list = byType.get(row.job_type);
		if (list) list.push(view);
		else byType.set(row.job_type, [view]);
		if (!decision.allowed) {
			const reasons = blockedReasons.get(row.job_type) ?? new Set<RerunBlockReason>();
			reasons.add(decision.reason);
			blockedReasons.set(row.job_type, reasons);
		}
	}

	const groups: FailedJobGroup[] = [];
	for (const [jobType, jobs] of byType) {
		jobs.sort((a, b) => (a.failedAt < b.failedAt ? 1 : a.failedAt > b.failedAt ? -1 : 0));
		const reasons = blockedReasons.get(jobType);
		const rerunnableIds = jobs.filter((job) => job.canRerun).map((job) => job.id);
		// One line per group: the old-brief wording when that is the cause, else the general one.
		const reason: RerunBlockReason | null = !reasons
			? null
			: reasons.has('old_brief')
				? 'old_brief'
				: reasons.has('brief_date_unknown')
					? 'brief_date_unknown'
					: 'could_repeat';
		groups.push({
			jobType,
			label: jobTypeLabel(jobType),
			count: jobs.length,
			firstFailedAt: jobs[jobs.length - 1]!.failedAt,
			lastFailedAt: jobs[0]!.failedAt,
			topError: mostCommonError(jobs),
			jobs,
			rerunnableIds,
			blockedMessage: reason
				? rerunBlockedLine(reason, jobs.length - rerunnableIds.length, jobs.length)
				: null
		});
	}
	groups.sort(
		(a, b) =>
			b.count - a.count ||
			(a.lastFailedAt < b.lastFailedAt ? 1 : a.lastFailedAt > b.lastFailedAt ? -1 : 0)
	);

	const total = groups.reduce((sum, group) => sum + group.count, 0);
	const rerunnable = groups.reduce((sum, group) => sum + group.rerunnableIds.length, 0);
	return { groups, total, rerunnable, hiddenTestJobs };
}

export function windowLabel(days: number): string {
	return days === 1 ? 'the last 24 hours' : `the last ${days} days`;
}

const jobCount = (count: number) => (count === 1 ? '1 job' : `${count} jobs`);

/** The answer to "did anything fail?", as a headline and a line of detail. */
export function failedJobsAnswer(
	summary: Pick<FailedJobsSummary, 'total' | 'rerunnable' | 'hiddenTestJobs'>,
	days: number
): { failed: boolean; headline: string; detail: string } {
	const hidden = summary.hiddenTestJobs
		? `${jobCount(summary.hiddenTestJobs)} from the test account ${summary.hiddenTestJobs === 1 ? 'is' : 'are'} hidden.`
		: '';
	if (!summary.total) {
		return {
			failed: false,
			headline: `Nothing failed in ${windowLabel(days)}.`,
			detail: hidden || 'Every background job finished or is still retrying.'
		};
	}
	const rerun =
		summary.rerunnable === 0
			? 'None of them can be run again safely.'
			: summary.rerunnable === summary.total
				? summary.total === 1
					? 'It can be run again.'
					: 'All of them can be run again.'
				: `${summary.rerunnable} of them can be run again.`;
	return {
		failed: true,
		headline: `${jobCount(summary.total)} failed in ${windowLabel(days)}.`,
		detail: [rerun, hidden].filter(Boolean).join(' ')
	};
}

export function failedJobDaysFromParam(value: string | null): number {
	const days = Number(value);
	return (FAILED_JOB_DAY_CHOICES as readonly number[]).includes(days)
		? days
		: FAILED_JOB_DEFAULT_DAYS;
}
