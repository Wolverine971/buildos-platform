// apps/web/src/lib/components/admin/chat-users/chat-user-ui.ts
import type {
	AlertBadge,
	ClassificationJobSummary,
	ComparisonMetric,
	ComparisonPreference,
	ComparisonTone,
	IssueCluster,
	RedactedTimelineEvent,
	SessionMetric,
	UserDetail,
	UserMetric
} from './chat-user-types';

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});
const dateFormatter = new Intl.DateTimeFormat('en-US', {
	month: 'short',
	day: 'numeric'
});

export function formatNumber(value: number | null | undefined): string {
	return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatAverageNumber(value: number | null | undefined): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);
}

export function formatRate(value: number | null | undefined): string {
	if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
	return `${value.toFixed(1)}%`;
}

export function formatMs(value: number | null | undefined): string {
	if (value === null || value === undefined) return '-';
	if (value < 1000) return `${Math.round(value)}ms`;
	return `${(value / 1000).toFixed(1)}s`;
}

export function formatDate(value: string | null | undefined): string {
	if (!value) return '-';
	const parsed = new Date(value);
	return Number.isFinite(parsed.getTime()) ? dateTimeFormatter.format(parsed) : '-';
}

export function formatDay(value: string): string {
	const parsed = new Date(`${value}T00:00:00.000Z`);
	return Number.isFinite(parsed.getTime()) ? dateFormatter.format(parsed) : value;
}

export function eventTypeLabel(value: string): string {
	return value.replaceAll('_', ' ');
}

export function severityClass(severity: RedactedTimelineEvent['severity']): string {
	if (severity === 'error') return 'border-destructive/30 bg-destructive/10 text-destructive';
	if (severity === 'warning') return 'border-warning/30 bg-warning/10 text-warning';
	if (severity === 'success') return 'border-success/30 bg-success/10 text-success';
	return 'border-border bg-muted text-muted-foreground';
}

export function comparisonToneClass(tone: ComparisonTone): string {
	if (tone === 'bad') return 'border-destructive/30 bg-destructive/10';
	if (tone === 'warning') return 'border-warning/30 bg-warning/10';
	if (tone === 'good') return 'border-success/30 bg-success/10';
	return 'border-border bg-card';
}

export function comparisonDeltaClass(tone: ComparisonTone): string {
	if (tone === 'bad') return 'border-destructive/30 text-destructive';
	if (tone === 'warning') return 'border-warning/30 text-warning';
	if (tone === 'good') return 'border-success/30 text-success';
	return 'border-border text-muted-foreground';
}

export function alertBadgeClass(tone: AlertBadge['tone']): string {
	if (tone === 'bad') return 'border-destructive/30 bg-destructive/10 text-destructive';
	if (tone === 'warning') return 'border-warning/30 bg-warning/10 text-warning';
	return 'border-border bg-muted text-muted-foreground';
}

export function classificationJobStatusLabel(
	job: ClassificationJobSummary | null | undefined
): string | null {
	if (!job) return null;
	const status = job.status.toLowerCase();
	if (status === 'pending') return 'Job queued';
	if (status === 'processing' || status === 'retrying') return 'Job running';
	if (status === 'completed' || status === 'done') return 'Job complete';
	if (status === 'failed') return 'Job failed';
	if (status === 'cancelled' || status === 'canceled') return 'Job cancelled';
	return `Job ${job.status}`;
}

export function classificationJobStatusClass(
	job: ClassificationJobSummary | null | undefined
): string {
	const status = job?.status.toLowerCase();
	if (status === 'failed' || status === 'cancelled' || status === 'canceled') {
		return 'border-destructive/30 bg-destructive/10 text-destructive';
	}
	if (status === 'pending' || status === 'processing' || status === 'retrying') {
		return 'border-warning/30 bg-warning/10 text-warning';
	}
	if (status === 'completed' || status === 'done') {
		return 'border-success/30 bg-success/10 text-success';
	}
	return 'border-border bg-muted text-muted-foreground';
}

export function finiteNumber(value: number | null | undefined): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function averageMetric(
	users: UserMetric[],
	selector: (user: UserMetric) => number | null | undefined
): number | null {
	const values = users
		.map(selector)
		.map(finiteNumber)
		.filter((value): value is number => value !== null);
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function userErrorLoad(user: UserMetric): number {
	return (
		user.message_error_count +
		user.tool_failure_count +
		user.llm_failure_count +
		user.validation_failure_count
	);
}

export function buildUserComparison(summary: UserMetric, users: UserMetric[]): ComparisonMetric[] {
	if (users.length === 0) return [];
	return [
		compareMetric(
			'Sessions',
			summary.session_count,
			averageMetric(users, (user) => user.session_count),
			formatAverageNumber,
			'neutral',
			'Activity volume among the loaded users.'
		),
		compareMetric(
			'p95 TTFR',
			summary.ttfr_p95_ms,
			averageMetric(users, (user) => user.ttfr_p95_ms),
			formatMs,
			'lower',
			'First response timing; lower is better.'
		),
		compareMetric(
			'Slow Turns',
			summary.slow_turn_count,
			averageMetric(users, (user) => user.slow_turn_count),
			formatAverageNumber,
			'lower',
			'Turns above the selected slow threshold.'
		),
		compareMetric(
			'Tool Fail Rate',
			summary.tool_failure_rate,
			averageMetric(users, (user) => user.tool_failure_rate),
			formatRate,
			'lower',
			'Failed tool share across recorded calls.'
		),
		compareMetric(
			'Error Load',
			userErrorLoad(summary),
			averageMetric(users, userErrorLoad),
			formatAverageNumber,
			'lower',
			'Message, tool, LLM, and validation failures.'
		),
		compareMetric(
			'Created Entities',
			summary.created_entity_count,
			averageMetric(users, (user) => user.created_entity_count),
			formatAverageNumber,
			'higher',
			'Chat-attributed project records created.'
		)
	].filter((metric): metric is ComparisonMetric => metric !== null);
}

export function buildUserAlertBadges(
	user: UserMetric,
	slowThresholdMs: string | number
): AlertBadge[] {
	const badges: AlertBadge[] = [];
	const threshold = slowThresholdValue(slowThresholdMs);
	if (user.slow_turn_count >= 3 || (user.ttfr_p95_ms ?? 0) >= threshold) {
		badges.push({
			label: `${formatNumber(user.slow_turn_count)} slow`,
			tone: user.slow_turn_count >= 5 ? 'bad' : 'warning',
			title: `Slow turns above ${formatMs(threshold)}; p95 ${formatMs(user.ttfr_p95_ms)}`
		});
	}
	if (user.tool_failure_count > 0) {
		badges.push({
			label: `${formatRate(user.tool_failure_rate)} tool fail`,
			tone: user.tool_failure_rate >= 25 || user.tool_failure_count >= 5 ? 'bad' : 'warning',
			title: `${formatNumber(user.tool_failure_count)} failed tool calls from ${formatNumber(user.tool_call_count)} total`
		});
	}
	const errorCount = userErrorLoad(user);
	if (errorCount > 0) {
		badges.push({
			label: `${formatNumber(errorCount)} errors`,
			tone: errorCount >= 5 ? 'bad' : 'warning',
			title: 'Message, tool, LLM, and validation failures'
		});
	}
	if (user.running_turn_count > 0) {
		badges.push({
			label: `${formatNumber(user.running_turn_count)} running`,
			tone: 'neutral',
			title: 'Turns still marked running in this window'
		});
	}
	return badges;
}

export function buildSessionAlertBadges(session: SessionMetric): AlertBadge[] {
	const badges: AlertBadge[] = [];
	if (session.has_slow_response || session.slow_turn_count > 0) {
		badges.push({
			label: `${formatNumber(session.slow_turn_count)} slow`,
			tone: session.slow_turn_count >= 3 ? 'bad' : 'warning',
			title: `Slow session response; p95 ${formatMs(session.ttfr_p95_ms)}`
		});
	}
	if (session.tool_failure_count > 0) {
		badges.push({
			label: `${formatNumber(session.tool_failure_count)} tool fail`,
			tone: session.tool_failure_count >= 3 ? 'bad' : 'warning',
			title: 'Failed tool calls in this session'
		});
	}
	if (session.llm_failure_count > 0) {
		badges.push({
			label: `${formatNumber(session.llm_failure_count)} LLM`,
			tone: 'bad',
			title: 'LLM failures in this session'
		});
	}
	if (session.validation_failure_count > 0) {
		badges.push({
			label: `${formatNumber(session.validation_failure_count)} validation`,
			tone: 'warning',
			title: 'Validation failures in this session'
		});
	}
	if (session.classification_state !== 'classified') {
		badges.push({
			label: session.classification_state,
			tone: 'neutral',
			title: 'Classifier status for this session'
		});
	}
	if (session.classification_job) {
		const label = classificationJobStatusLabel(session.classification_job);
		const status = session.classification_job.status.toLowerCase();
		badges.push({
			label: label ?? 'Job status',
			tone:
				status === 'failed' || status === 'cancelled' || status === 'canceled'
					? 'bad'
					: status === 'completed' || status === 'done'
						? 'neutral'
						: 'warning',
			title: session.classification_job.error_message ?? 'Latest classification queue job'
		});
	}
	return badges;
}

export function buildIssueClusters(errors: UserDetail['errors']): IssueCluster[] {
	const clusters = new Map<string, IssueCluster>();
	for (const item of errors) {
		const normalized = normalizeIssueMessage(item.error_message);
		if (!normalized) continue;
		const key = `${item.source}:${normalized}`;
		const existing = clusters.get(key);
		if (!existing) {
			clusters.set(key, {
				key,
				source: item.source,
				message: item.error_message,
				severity: item.severity,
				count: 1,
				latest_at: item.created_at,
				session_id: item.session_id
			});
			continue;
		}
		existing.count += 1;
		if (new Date(item.created_at).getTime() > new Date(existing.latest_at).getTime()) {
			existing.latest_at = item.created_at;
			existing.message = item.error_message;
			existing.severity = item.severity;
			existing.session_id = item.session_id;
		}
	}
	return Array.from(clusters.values()).sort((a, b) => {
		if (b.count !== a.count) return b.count - a.count;
		return new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime();
	});
}

export function projectHref(projectId: string | null | undefined): string | null {
	const id = projectId?.trim();
	return id ? `/projects/${encodeURIComponent(id)}` : null;
}

export function entityHref(
	projectId: string | null | undefined,
	entityType: string | null | undefined,
	entityId: string | null | undefined
): string | null {
	const type = entityType?.trim().toLowerCase();
	const id = entityId?.trim();
	if (!type || !id) return null;
	if (type === 'project') return `/projects/${encodeURIComponent(id)}`;
	const projectLink = projectHref(projectId);
	if (!projectLink) return null;
	if (type === 'task') return `${projectLink}/tasks/${encodeURIComponent(id)}`;
	if (type === 'document') return `${projectLink}/documents/${encodeURIComponent(id)}`;
	return `${projectLink}?entity=${encodeURIComponent(type)}&entity_id=${encodeURIComponent(id)}`;
}

export function entityGroupKey(
	projectId: string | null | undefined,
	entityType: string,
	action: string
): string {
	return `${projectId ?? ''}\u0000${entityType}\u0000${action}`;
}

export function entityGroupKeyForAggregate(entity: UserDetail['entities'][number]): string {
	return entityGroupKey(entity.project_id, entity.entity_type, entity.action);
}

export function entityGroupKeyForChange(change: UserDetail['entity_changes'][number]): string {
	return entityGroupKey(change.project_id, change.entity_type, change.action);
}

function slowThresholdValue(slowThresholdMs: string | number): number {
	const parsed =
		typeof slowThresholdMs === 'number'
			? slowThresholdMs
			: Number.parseInt(slowThresholdMs, 10);
	return Number.isFinite(parsed) ? parsed : 10_000;
}

function formatComparisonDelta(
	delta: number | null,
	formatter: (value: number | null | undefined) => string
): string {
	if (delta === null) return 'No user data';
	if (Math.abs(delta) < 0.05) return 'Even';
	const sign = delta > 0 ? '+' : '-';
	return `${sign}${formatter(Math.abs(delta))}`;
}

function comparisonTone(
	delta: number | null,
	cohortValue: number,
	preference: ComparisonPreference
): ComparisonTone {
	if (delta === null || preference === 'neutral') return 'neutral';
	const ratio = Math.abs(delta) / Math.max(Math.abs(cohortValue), 1);
	if (ratio < 0.15) return 'neutral';
	const isBetter =
		(preference === 'lower' && delta < 0) || (preference === 'higher' && delta > 0);
	if (isBetter) return 'good';
	return ratio >= 0.75 ? 'bad' : 'warning';
}

function compareMetric(
	label: string,
	userValue: number | null | undefined,
	cohortValue: number | null,
	formatter: (value: number | null | undefined) => string,
	preference: ComparisonPreference,
	description: string
): ComparisonMetric | null {
	if (cohortValue === null) return null;
	const normalizedUserValue = finiteNumber(userValue);
	const delta = normalizedUserValue === null ? null : normalizedUserValue - cohortValue;
	const tone = comparisonTone(delta, cohortValue, preference);
	return {
		label,
		user_value: formatter(normalizedUserValue),
		cohort_value: formatter(cohortValue),
		delta: formatComparisonDelta(delta, formatter),
		tone,
		description
	};
}

function normalizeIssueMessage(message: string): string {
	return message
		.trim()
		.toLowerCase()
		.replace(
			/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
			'{id}'
		)
		.replace(/\b\d{4,}\b/g, '{n}')
		.replace(/\s+/g, ' ')
		.slice(0, 180);
}
