// apps/web/src/routes/admin/welcome-sequence/+page.server.ts
export const config = {
	maxDuration: 60,
	memory: 1024
};

import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { EmailService } from '$lib/services/email-service';
import {
	BUILDOS_WELCOME_SEQUENCE_KEY,
	EmailSequenceRpcClient,
	buildLegacyWelcomeSequenceMirrorPayload,
	type LegacyWelcomeSequenceRowForMirror
} from '$lib/server/email-sequence-rpcs';
import {
	buildWelcomeEmailContent,
	type WelcomeEmailContent
} from '$lib/server/welcome-sequence.content';
import {
	determineNextWelcomeAction,
	WELCOME_SEQUENCE_STEPS,
	type WelcomeSequenceProductState,
	type WelcomeSequenceProgress,
	type WelcomeSequenceStep
} from '$lib/server/welcome-sequence.logic';

type ShadowEnrollmentRow = Record<string, unknown> & {
	user_id: string;
	sequence_id: string;
};

type UserEmailRow = {
	id: string;
	email: string | null;
};

type EmailSequenceStepRow = {
	step_number: number;
	step_key: string;
	delay_days_after_previous: number;
	absolute_day_offset: number;
	send_window_start_hour: number;
	send_window_end_hour: number;
	send_on_weekends: boolean;
	status: string;
	metadata: Record<string, unknown> | null;
};

type SequenceEventRow = {
	event_type: string;
	step_number: number | null;
	branch_key: string | null;
	created_at: string;
};

type SequenceEnrollmentRow = {
	id: string;
	user_id: string;
	recipient_email: string;
	status: string;
	current_step_number: number;
	next_step_number: number | null;
	next_send_at: string | null;
	last_sent_at: string | null;
	processing_started_at: string | null;
	failure_count: number | null;
	exit_reason: string | null;
	last_error: string | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

type EmailLogRow = {
	status: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
	sent_at: string | null;
};

type EmailRow = {
	id: string;
	status: string;
	template_data: Record<string, unknown> | null;
	created_at: string | null;
	sent_at: string | null;
	tracking_enabled: boolean;
};

type EmailTrackingEventRow = {
	email_id: string;
	event_type: string;
	created_at: string | null;
	timestamp: string | null;
};

type SuppressionRow = {
	reason: string;
	source: string | null;
	created_at: string | null;
};

type CronLogRow = {
	status: string;
	executed_at: string;
	error_message: string | null;
};

type DiffField =
	| 'shadow_row'
	| 'recipient_email'
	| 'status'
	| 'current_step_number'
	| 'next_step_number'
	| 'next_send_at'
	| 'last_sent_at'
	| 'exit_reason';

type DiffEntry = {
	field: DiffField;
	expected: unknown;
	actual: unknown;
};

const COMPARISON_FIELDS = [
	'recipient_email',
	'status',
	'current_step_number',
	'next_step_number',
	'next_send_at',
	'last_sent_at',
	'exit_reason'
] as const;

const DATE_FIELDS = new Set<DiffField>(['next_send_at', 'last_sent_at']);
const COPY_SOURCE_PATH =
	'/Users/djwayne/buildos-platform/apps/web/src/lib/server/welcome-sequence.content.ts';
const PREVIEW_STARTED_AT = '2026-03-01T10:00:00.000Z';

const EMPTY_ADMIN_OPERATIONAL_STATE = {
	queueRows: [] as Array<SequenceEnrollmentRow & { branchPreview: string | null }>,
	alerts: [] as Array<{ severity: 'P1' | 'P2' | 'P3'; message: string; detail: string }>,
	engagement: null as ReturnType<typeof computeEngagementStats> | null
};

function getBaseUrl(): string {
	return PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
}

function normalizeLimit(rawLimit: string | null): number {
	const parsed = Number.parseInt(rawLimit || '', 10);
	if (!Number.isFinite(parsed)) {
		return 100;
	}

	return Math.max(1, Math.min(parsed, 500));
}

function normalizeDays(rawDays: string | null): number {
	const parsed = Number.parseInt(rawDays || '', 10);
	if (!Number.isFinite(parsed)) {
		return 30;
	}

	return Math.max(1, Math.min(parsed, 365));
}

function normalizeStep(rawStep: string | null): WelcomeSequenceStep {
	return WELCOME_SEQUENCE_STEPS.includes(rawStep as WelcomeSequenceStep)
		? (rawStep as WelcomeSequenceStep)
		: 'email_1';
}

function parseBoolean(value: string | null, fallback: boolean): boolean {
	if (value == null) {
		return fallback;
	}

	return value === 'true' || value === 'on' || value === '1';
}

function parseNumber(value: string | null, fallback: number): number {
	const parsed = Number.parseInt(value || '', 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

function comparableValue(field: DiffField, value: unknown): unknown {
	if (value == null) {
		return null;
	}

	if (!DATE_FIELDS.has(field) || typeof value !== 'string') {
		return value;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
}

function collectDiffs(
	expected: Record<string, unknown> | null,
	actual: ShadowEnrollmentRow | null
): DiffEntry[] {
	if (!expected) {
		return [
			{
				field: 'recipient_email',
				expected: 'known email',
				actual: null
			}
		];
	}

	if (!actual) {
		return [
			{
				field: 'shadow_row',
				expected: 'present',
				actual: 'missing'
			}
		];
	}

	return COMPARISON_FIELDS.flatMap((field) => {
		const expectedValue = comparableValue(field, expected[field]);
		const actualValue = comparableValue(field, actual[field]);

		return expectedValue === actualValue
			? []
			: [
					{
						field,
						expected: expectedValue,
						actual: actualValue
					}
				];
	});
}

function createPreviewState(
	overrides: Partial<WelcomeSequenceProductState> = {}
): WelcomeSequenceProductState {
	return {
		userId: 'preview-user',
		email: 'builder@example.com',
		name: 'Alex Builder',
		createdAt: PREVIEW_STARTED_AT,
		timezone: 'America/New_York',
		onboardingIntent: 'plan',
		onboardingCompleted: false,
		projectCount: 0,
		latestProjectId: null,
		emailDailyBriefEnabled: false,
		smsChannelEnabled: false,
		calendarConnected: false,
		lastVisit: null,
		...overrides
	};
}

function createPreviewProgress(
	step: WelcomeSequenceStep,
	overrides: Partial<WelcomeSequenceProgress> = {}
): WelcomeSequenceProgress {
	const sentAt: WelcomeSequenceProgress['sentAt'] = {};
	for (const currentStep of WELCOME_SEQUENCE_STEPS) {
		if (currentStep === step) {
			break;
		}
		sentAt[currentStep] = PREVIEW_STARTED_AT;
	}

	return {
		startedAt: PREVIEW_STARTED_AT,
		status: 'active',
		sentAt,
		skippedAt: {},
		...overrides
	};
}

function buildPreview(
	step: WelcomeSequenceStep,
	state: WelcomeSequenceProductState,
	baseUrl: string,
	progressOverrides: Partial<WelcomeSequenceProgress> = {}
) {
	const progress = createPreviewProgress(step, progressOverrides);
	const now = new Date('2026-03-12T15:00:00.000Z');
	const action = determineNextWelcomeAction(progress, state, now);
	const content =
		action.action === 'send' && action.step
			? buildWelcomeEmailContent(action.step, progress, state, baseUrl)
			: null;

	return {
		step,
		action: action.action,
		branchKey: action.branchKey ?? content?.branchKey ?? null,
		reason: action.reason,
		content
	};
}

function buildLocalPreviews(baseUrl: string) {
	return [
		{
			label: 'Email 1',
			description: 'Immediate signup welcome.',
			...buildPreview('email_1', createPreviewState(), baseUrl)
		},
		{
			label: 'Email 2 - no project',
			description: 'Sent on day 1 when the user has not created a project.',
			...buildPreview('email_2', createPreviewState(), baseUrl)
		},
		{
			label: 'Email 2 - already created project',
			description:
				'Sent on day 1 when the user already has a project. Nudges a second project, calendar, or briefs.',
			...buildPreview(
				'email_2',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project'
				}),
				baseUrl
			)
		},
		{
			label: 'Email 3 - no project',
			description: 'Sent on day 3 when no project exists.',
			...buildPreview('email_3', createPreviewState(), baseUrl)
		},
		{
			label: 'Email 3 - finish setup',
			description: 'Sent when a project exists but onboarding is incomplete.',
			...buildPreview(
				'email_3',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project'
				}),
				baseUrl
			)
		},
		{
			label: 'Email 3 - reopen project',
			description: 'Sent when a project exists and onboarding is complete.',
			...buildPreview(
				'email_3',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project',
					onboardingCompleted: true
				}),
				baseUrl
			)
		},
		{
			label: 'Email 4 - finish setup',
			description: 'Sent when onboarding is still incomplete.',
			...buildPreview(
				'email_4',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project'
				}),
				baseUrl
			)
		},
		{
			label: 'Email 4 - follow-through missing',
			description:
				'Sent when onboarding is complete but no follow-through channel is active.',
			...buildPreview(
				'email_4',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project',
					onboardingCompleted: true
				}),
				baseUrl
			)
		},
		{
			label: 'Email 4 - follow-through ready',
			description: 'Skipped when a follow-through channel is already active.',
			...buildPreview(
				'email_4',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project',
					onboardingCompleted: true,
					emailDailyBriefEnabled: true
				}),
				baseUrl
			)
		},
		{
			label: 'Email 5 - general check-in',
			description: 'Sent when no clear return visit has been seen.',
			...buildPreview('email_5', createPreviewState(), baseUrl)
		},
		{
			label: 'Email 5 - returning check-in',
			description: 'Sent when the user has returned for another session.',
			...buildPreview(
				'email_5',
				createPreviewState({
					projectCount: 1,
					latestProjectId: 'preview-project',
					lastVisit: '2026-03-02T02:00:00.000Z'
				}),
				baseUrl
			)
		}
	];
}

function buildSandboxPreview(url: URL, baseUrl: string) {
	const input = buildPreviewInput({
		get: (key) => url.searchParams.get(key)
	});

	return buildSandboxPreviewFromInput(input, baseUrl);
}

function buildPreviewInput(source: { get(key: string): FormDataEntryValue | string | null }) {
	const getString = (key: string): string | null => {
		const value = source.get(key);
		return typeof value === 'string' ? value : null;
	};
	const rawStep = source.get('preview_step') ?? source.get('test_step');
	const step = normalizeStep(typeof rawStep === 'string' ? rawStep : null);
	const projectCount = parseNumber(getString('project_count'), step === 'email_1' ? 0 : 1);
	const onboardingCompleted = parseBoolean(getString('onboarding_completed'), step === 'email_5');
	const returned = parseBoolean(getString('returned'), step === 'email_5');
	const emailDailyBriefEnabled = parseBoolean(getString('email_daily_brief_enabled'), false);
	const smsChannelEnabled = parseBoolean(getString('sms_channel_enabled'), false);
	const calendarConnected = parseBoolean(getString('calendar_connected'), false);
	const rawName = source.get('preview_name');
	const rawIntent = source.get('onboarding_intent');

	return {
		step,
		projectCount,
		onboardingCompleted,
		returned,
		emailDailyBriefEnabled,
		smsChannelEnabled,
		calendarConnected,
		name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'Alex Builder',
		onboardingIntent:
			typeof rawIntent === 'string' && rawIntent.trim() ? rawIntent.trim() : 'plan'
	};
}

function buildSandboxPreviewFromInput(
	input: ReturnType<typeof buildPreviewInput>,
	baseUrl: string
) {
	const state = createPreviewState({
		name: input.name,
		onboardingIntent: input.onboardingIntent === 'none' ? null : input.onboardingIntent,
		projectCount: input.projectCount,
		latestProjectId: input.projectCount > 0 ? 'preview-project' : null,
		onboardingCompleted: input.onboardingCompleted,
		emailDailyBriefEnabled: input.emailDailyBriefEnabled,
		smsChannelEnabled: input.smsChannelEnabled,
		calendarConnected: input.calendarConnected,
		lastVisit: input.returned ? '2026-03-02T02:00:00.000Z' : null
	});

	return {
		input,
		preview: buildPreview(input.step, state, baseUrl)
	};
}

function buildPreviewStateFromInput(
	input: ReturnType<typeof buildPreviewInput>,
	recipientEmail: string
): WelcomeSequenceProductState {
	return createPreviewState({
		email: recipientEmail,
		name: input.name,
		onboardingIntent: input.onboardingIntent === 'none' ? null : input.onboardingIntent,
		projectCount: input.projectCount,
		latestProjectId: input.projectCount > 0 ? 'preview-project' : null,
		onboardingCompleted: input.onboardingCompleted,
		emailDailyBriefEnabled: input.emailDailyBriefEnabled,
		smsChannelEnabled: input.smsChannelEnabled,
		calendarConnected: input.calendarConnected,
		lastVisit: input.returned ? '2026-03-02T02:00:00.000Z' : null
	});
}

function isTestSendMetadata(metadata: Record<string, unknown> | null | undefined): boolean {
	return metadata?.test_send === true || metadata?.campaign === 'welcome-sequence-test';
}

function parseDateMs(value: string | null | undefined): number | null {
	if (!value) {
		return null;
	}

	const parsed = Date.parse(value);
	return Number.isNaN(parsed) ? null : parsed;
}

function metricRate(numerator: number, denominator: number): number {
	if (denominator <= 0) {
		return 0;
	}

	return numerator / denominator;
}

function countBy<T extends string>(values: T[]): Record<string, number> {
	return values.reduce<Record<string, number>>((acc, value) => {
		acc[value] = (acc[value] ?? 0) + 1;
		return acc;
	}, {});
}

function computeSequenceStats(input: {
	enrollments: SequenceEnrollmentRow[];
	events: SequenceEventRow[];
	emailLogs: EmailLogRow[];
	now: Date;
}) {
	const dueNow = input.enrollments.filter((row) => {
		if (row.status !== 'active' || !row.next_send_at) {
			return false;
		}
		const parsed = Date.parse(row.next_send_at);
		return !Number.isNaN(parsed) && parsed <= input.now.getTime();
	}).length;

	const stepStats = WELCOME_SEQUENCE_STEPS.map((step, index) => {
		const stepNumber = index + 1;
		const eventsForStep = input.events.filter((event) => event.step_number === stepNumber);
		const logsForStep = input.emailLogs.filter(
			(log) => !isTestSendMetadata(log.metadata) && log.metadata?.sequence_step === step
		);

		return {
			step,
			stepNumber,
			sent: eventsForStep.filter((event) => event.event_type === 'sent').length,
			skipped: eventsForStep.filter((event) => event.event_type === 'skipped').length,
			failed: eventsForStep.filter((event) => event.event_type === 'failed').length,
			retried: eventsForStep.filter((event) => event.event_type === 'retried').length,
			loggedSent: logsForStep.filter((log) => log.status === 'sent').length,
			loggedFailed: logsForStep.filter((log) => log.status !== 'sent').length
		};
	});

	return {
		totalEnrollments: input.enrollments.length,
		dueNow,
		statusCounts: countBy(input.enrollments.map((row) => row.status)),
		exitReasonCounts: countBy(
			input.enrollments
				.map((row) => row.exit_reason)
				.filter((value): value is string => Boolean(value))
		),
		eventCounts: countBy(input.events.map((event) => event.event_type)),
		branchCounts: countBy(
			input.events
				.map((event) => event.branch_key)
				.filter((value): value is string => Boolean(value))
		),
		emailLogCounts: countBy(
			input.emailLogs
				.filter((log) => !isTestSendMetadata(log.metadata))
				.map((log) => log.status)
		),
		stepStats
	};
}

function computeEngagementStats(input: {
	emails: EmailRow[];
	trackingEvents: EmailTrackingEventRow[];
	suppressions: SuppressionRow[];
}) {
	const productionEmails = input.emails.filter(
		(email) => !isTestSendMetadata(email.template_data)
	);
	const trackingEventsByType = countBy(input.trackingEvents.map((event) => event.event_type));
	const openedEmailIds = new Set(
		input.trackingEvents
			.filter((event) => event.event_type === 'opened')
			.map((event) => event.email_id)
	);
	const clickedEmailIds = new Set(
		input.trackingEvents
			.filter((event) => event.event_type === 'clicked')
			.map((event) => event.email_id)
	);

	return {
		emails: productionEmails.length,
		tracked: productionEmails.filter((email) => email.tracking_enabled).length,
		opens: trackingEventsByType.opened ?? 0,
		clicks: trackingEventsByType.clicked ?? 0,
		unsubscribes: trackingEventsByType.unsubscribed ?? 0,
		uniqueOpened: openedEmailIds.size,
		uniqueClicked: clickedEmailIds.size,
		openRate: metricRate(openedEmailIds.size, productionEmails.length),
		clickRate: metricRate(clickedEmailIds.size, productionEmails.length),
		suppressions: input.suppressions.length,
		suppressionReasons: countBy(input.suppressions.map((suppression) => suppression.reason)),
		suppressionSources: countBy(
			input.suppressions
				.map((suppression) => suppression.source)
				.filter((source): source is string => Boolean(source))
		)
	};
}

function buildQueueRows(enrollments: SequenceEnrollmentRow[]) {
	return enrollments
		.map((row) => ({
			...row,
			branchPreview:
				typeof row.metadata?.branch_key === 'string'
					? row.metadata.branch_key
					: typeof row.metadata?.last_branch_key === 'string'
						? row.metadata.last_branch_key
						: null
		}))
		.sort((left, right) => {
			const leftNextSend = parseDateMs(left.next_send_at) ?? Number.POSITIVE_INFINITY;
			const rightNextSend = parseDateMs(right.next_send_at) ?? Number.POSITIVE_INFINITY;

			if (leftNextSend !== rightNextSend) {
				return leftNextSend - rightNextSend;
			}

			const leftUpdated = parseDateMs(left.updated_at) ?? 0;
			const rightUpdated = parseDateMs(right.updated_at) ?? 0;
			return rightUpdated - leftUpdated;
		})
		.slice(0, 100);
}

function buildAlerts(input: {
	enrollments: SequenceEnrollmentRow[];
	events: SequenceEventRow[];
	suppressions: SuppressionRow[];
	cronLogs: CronLogRow[];
	now: Date;
}) {
	const last24hMs = input.now.getTime() - 24 * 60 * 60 * 1000;
	const events24h = input.events.filter((event) => {
		const createdAtMs = parseDateMs(event.created_at);
		return createdAtMs != null && createdAtMs >= last24hMs;
	});
	const email1Events24h = events24h.filter((event) => event.step_number === 1);
	const email1Sent24h = email1Events24h.filter((event) => event.event_type === 'sent').length;
	const email1Failed24h = email1Events24h.filter((event) => event.event_type === 'failed').length;
	const email1Attempts24h = email1Sent24h + email1Failed24h;
	const sent24h = events24h.filter((event) => event.event_type === 'sent').length;
	const suppressions24h = input.suppressions.filter((suppression) => {
		const createdAtMs = parseDateMs(suppression.created_at);
		return createdAtMs != null && createdAtMs >= last24hMs;
	}).length;
	const erroredEnrollments = input.enrollments.filter((row) => row.status === 'errored').length;
	const stuckProcessing = input.enrollments.filter((row) => {
		if (row.status !== 'processing') {
			return false;
		}
		const processingStartedAtMs = parseDateMs(row.processing_started_at);
		return (
			processingStartedAtMs != null &&
			processingStartedAtMs < input.now.getTime() - 2 * 60 * 60 * 1000
		);
	}).length;
	const consecutiveCronFailures =
		input.cronLogs.slice(0, 2).length === 2 &&
		input.cronLogs
			.slice(0, 2)
			.every((log) => log.status === 'failed' || log.status === 'error');
	const alerts: Array<{ severity: 'P1' | 'P2' | 'P3'; message: string; detail: string }> = [];

	if (email1Attempts24h > 0 && metricRate(email1Sent24h, email1Attempts24h) < 0.9) {
		alerts.push({
			severity: 'P1',
			message: 'Email 1 delivery rate below 90%',
			detail: `${email1Sent24h}/${email1Attempts24h} Email 1 attempts succeeded in the last 24 hours.`
		});
	}

	if (consecutiveCronFailures) {
		alerts.push({
			severity: 'P1',
			message: 'Welcome cron failed twice in a row',
			detail: 'The two most recent cron_logs rows for welcome_sequence have failed/error status.'
		});
	}

	if (erroredEnrollments > 10) {
		alerts.push({
			severity: 'P2',
			message: 'Errored enrollments above threshold',
			detail: `${erroredEnrollments} welcome enrollments are currently errored.`
		});
	}

	if (stuckProcessing > 0) {
		alerts.push({
			severity: 'P2',
			message: 'Processing enrollment stuck over 2 hours',
			detail: `${stuckProcessing} processing enrollment${stuckProcessing === 1 ? '' : 's'} exceeded the reaper window.`
		});
	}

	if (sent24h > 0 && metricRate(suppressions24h, sent24h) > 0.1) {
		alerts.push({
			severity: 'P3',
			message: 'Suppression rate above 10%',
			detail: `${suppressions24h} suppressions against ${sent24h} sends in the last 24 hours.`
		});
	}

	return alerts;
}

function normalizeTestRecipient(value: FormDataEntryValue | null): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		return null;
	}

	return normalized;
}

function getStepNumber(step: WelcomeSequenceStep): number {
	return WELCOME_SEQUENCE_STEPS.indexOf(step) + 1;
}

function buildTestSendMetadata(
	content: WelcomeEmailContent,
	adminUserId: string,
	extra: Record<string, unknown> = {}
): Record<string, unknown> {
	return {
		test_send: true,
		category: 'welcome_sequence',
		campaign: 'welcome-sequence-test',
		campaign_type: 'lifecycle',
		sequence_key: BUILDOS_WELCOME_SEQUENCE_KEY,
		sequence_name: 'buildos-welcome-sequence',
		sequence_step: content.step,
		step_number: getStepNumber(content.step),
		branch_key: content.branchKey,
		cta_label: content.ctaLabel,
		cta_url: content.ctaUrl,
		sent_by_admin: adminUserId,
		...extra
	};
}

async function sendTestWelcomeEmail({
	emailService,
	recipientEmail,
	content,
	subjectPrefix,
	metadata
}: {
	emailService: EmailService;
	recipientEmail: string;
	content: WelcomeEmailContent;
	subjectPrefix: string;
	metadata: Record<string, unknown>;
}) {
	const result = await emailService.sendEmail({
		to: recipientEmail,
		subject: `${subjectPrefix}${content.subject}`,
		body: content.body,
		html: content.html,
		from: 'dj',
		trackingEnabled: false,
		metadata
	});

	if (!result.success) {
		throw new Error(result.error || `Failed to send ${content.step} test email`);
	}

	return result;
}

async function getAdminActionUser(
	safeGetSession: App.Locals['safeGetSession'],
	supabase: App.Locals['supabase']
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403; message: string }> {
	const { user } = await safeGetSession();

	if (!user) {
		return { ok: false, status: 401, message: 'Unauthorized' };
	}

	const { data: dbUser, error } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (error || !dbUser?.is_admin) {
		return { ok: false, status: 403, message: 'Admin access required' };
	}

	return { ok: true, userId: user.id };
}

export const load: PageServerLoad = async ({ url }) => {
	const limit = normalizeLimit(url.searchParams.get('limit'));
	const days = normalizeDays(url.searchParams.get('days'));
	const baseUrl = getBaseUrl();
	const localPreviews = buildLocalPreviews(baseUrl);
	const sandbox = buildSandboxPreview(url, baseUrl);
	const supabase = createAdminSupabaseClient();

	const { data: sequence, error: sequenceError } = await (supabase as any)
		.from('email_sequences')
		.select('id, key, metadata')
		.eq('key', BUILDOS_WELCOME_SEQUENCE_KEY)
		.maybeSingle();

	if (sequenceError) {
		return {
			limit,
			days,
			copySourcePath: COPY_SOURCE_PATH,
			localPreviews,
			sandbox,
			...EMPTY_ADMIN_OPERATIONAL_STATE,
			statsError: sequenceError.message,
			stats: null,
			steps: [],
			setupError: sequenceError.message,
			sequence: null,
			summary: {
				total: 0,
				matched: 0,
				mismatched: 0,
				missing: 0
			},
			rows: []
		};
	}

	if (!sequence?.id) {
		return {
			limit,
			days,
			copySourcePath: COPY_SOURCE_PATH,
			localPreviews,
			sandbox,
			...EMPTY_ADMIN_OPERATIONAL_STATE,
			statsError: null,
			stats: null,
			steps: [],
			setupError: null,
			sequence: null,
			summary: {
				total: 0,
				matched: 0,
				mismatched: 0,
				missing: 0
			},
			rows: []
		};
	}

	const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
	const [
		{ data: stepsData, error: stepsError },
		{ data: enrollmentStatsData, error: enrollmentStatsError },
		{ data: eventsData, error: eventsError },
		{ data: emailLogsData, error: emailLogsError },
		{ data: emailRowsData, error: emailRowsError },
		{ data: suppressionData, error: suppressionError },
		{ data: cronLogsData, error: cronLogsError }
	] = await Promise.all([
		(supabase as any)
			.from('email_sequence_steps')
			.select(
				'step_number, step_key, delay_days_after_previous, absolute_day_offset, send_window_start_hour, send_window_end_hour, send_on_weekends, status, metadata'
			)
			.eq('sequence_id', sequence.id)
			.order('step_number', { ascending: true }),
		(supabase as any)
			.from('email_sequence_enrollments')
			.select(
				'id, user_id, recipient_email, status, current_step_number, next_step_number, next_send_at, last_sent_at, processing_started_at, failure_count, exit_reason, last_error, metadata, created_at, updated_at'
			)
			.eq('sequence_id', sequence.id),
		(supabase as any)
			.from('email_sequence_events')
			.select('event_type, step_number, branch_key, created_at')
			.eq('sequence_id', sequence.id)
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(5000),
		(supabase as any)
			.from('email_logs')
			.select('status, metadata, created_at, sent_at')
			.contains('metadata', { campaign: 'welcome-sequence' })
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(5000),
		(supabase as any)
			.from('emails')
			.select('id, status, template_data, created_at, sent_at, tracking_enabled')
			.eq('category', 'welcome_sequence')
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(5000),
		(supabase as any)
			.from('email_suppressions')
			.select('reason, source, created_at')
			.in('scope', ['lifecycle', 'all'])
			.gte('created_at', since)
			.order('created_at', { ascending: false })
			.limit(5000),
		(supabase as any)
			.from('cron_logs')
			.select('status, executed_at, error_message')
			.eq('job_name', 'welcome_sequence')
			.order('executed_at', { ascending: false })
			.limit(5000)
	]);

	const statsError = [
		stepsError?.message,
		enrollmentStatsError?.message,
		eventsError?.message,
		emailLogsError?.message,
		emailRowsError?.message,
		suppressionError?.message,
		cronLogsError?.message
	]
		.filter(Boolean)
		.join('; ');

	const steps = ((stepsData || []) as EmailSequenceStepRow[]).map((step) => ({
		...step,
		copyStoredInSupabase: false
	}));
	const stats = statsError
		? null
		: computeSequenceStats({
				enrollments: (enrollmentStatsData || []) as SequenceEnrollmentRow[],
				events: (eventsData || []) as SequenceEventRow[],
				emailLogs: (emailLogsData || []) as EmailLogRow[],
				now: new Date()
			});
	const queueRows = buildQueueRows((enrollmentStatsData || []) as SequenceEnrollmentRow[]);
	const emailRows = ((emailRowsData || []) as EmailRow[]).filter(
		(email) => !isTestSendMetadata(email.template_data)
	);
	const emailIds = emailRows.map((email) => email.id);
	const trackingEventsResult =
		emailIds.length > 0
			? await (supabase as any)
					.from('email_tracking_events')
					.select('email_id, event_type, created_at, timestamp')
					.in('email_id', emailIds)
					.limit(10000)
			: { data: [], error: null };
	const trackingEvents = (trackingEventsResult.data || []) as EmailTrackingEventRow[];
	const suppressions = (suppressionData || []) as SuppressionRow[];
	const cronLogs = (cronLogsData || []) as CronLogRow[];
	const engagement =
		statsError || trackingEventsResult.error
			? null
			: computeEngagementStats({
					emails: emailRows,
					trackingEvents,
					suppressions
				});
	const alerts =
		statsError || trackingEventsResult.error
			? []
			: buildAlerts({
					enrollments: (enrollmentStatsData || []) as SequenceEnrollmentRow[],
					events: (eventsData || []) as SequenceEventRow[],
					suppressions,
					cronLogs,
					now: new Date()
				});

	const { data: legacyData, error: legacyError } = await (supabase as any)
		.from('welcome_email_sequences')
		.select('*')
		.order('started_at', { ascending: false })
		.limit(limit);

	if (legacyError) {
		return {
			limit,
			days,
			copySourcePath: COPY_SOURCE_PATH,
			localPreviews,
			sandbox,
			queueRows,
			alerts,
			engagement,
			statsError,
			stats,
			steps,
			setupError: legacyError.message,
			sequence,
			summary: {
				total: 0,
				matched: 0,
				mismatched: 0,
				missing: 0
			},
			rows: []
		};
	}

	const legacyRows = (legacyData || []) as LegacyWelcomeSequenceRowForMirror[];
	const userIds = Array.from(new Set(legacyRows.map((row) => row.user_id).filter(Boolean)));
	const usersById = new Map<string, UserEmailRow>();
	const enrollmentsByUserId = new Map<string, ShadowEnrollmentRow>();

	if (userIds.length > 0) {
		const [
			{ data: userData, error: userError },
			{ data: enrollmentData, error: enrollmentError }
		] = await Promise.all([
			(supabase as any).from('users').select('id, email').in('id', userIds),
			(supabase as any)
				.from('email_sequence_enrollments')
				.select('*')
				.eq('sequence_id', sequence.id)
				.in('user_id', userIds)
		]);

		if (userError) {
			return {
				limit,
				days,
				copySourcePath: COPY_SOURCE_PATH,
				localPreviews,
				sandbox,
				queueRows,
				alerts,
				engagement,
				statsError,
				stats,
				steps,
				setupError: userError.message,
				sequence,
				summary: {
					total: legacyRows.length,
					matched: 0,
					mismatched: 0,
					missing: legacyRows.length
				},
				rows: []
			};
		}

		if (enrollmentError) {
			return {
				limit,
				days,
				copySourcePath: COPY_SOURCE_PATH,
				localPreviews,
				sandbox,
				queueRows,
				alerts,
				engagement,
				statsError,
				stats,
				steps,
				setupError: enrollmentError.message,
				sequence,
				summary: {
					total: legacyRows.length,
					matched: 0,
					mismatched: 0,
					missing: legacyRows.length
				},
				rows: []
			};
		}

		for (const user of (userData || []) as UserEmailRow[]) {
			usersById.set(user.id, user);
		}

		for (const enrollment of (enrollmentData || []) as ShadowEnrollmentRow[]) {
			enrollmentsByUserId.set(enrollment.user_id, enrollment);
		}
	}

	const rows = legacyRows.map((legacyRow) => {
		const email = usersById.get(legacyRow.user_id)?.email ?? '';
		const expected = buildLegacyWelcomeSequenceMirrorPayload(legacyRow, email, sequence.id);
		const actual = enrollmentsByUserId.get(legacyRow.user_id) ?? null;
		const diffs = collectDiffs(expected, actual);

		return {
			userId: legacyRow.user_id,
			email,
			legacyStatus: legacyRow.status,
			legacyStartedAt: legacyRow.started_at,
			expectedStatus: expected?.status ?? null,
			actualStatus: actual?.status ?? null,
			expectedNextStep: expected?.next_step_number ?? null,
			actualNextStep: actual?.next_step_number ?? null,
			diffCount: diffs.length,
			diffs
		};
	});

	const missing = rows.filter((row) =>
		row.diffs.some((diff) => diff.field === 'shadow_row')
	).length;
	const mismatched = rows.filter((row) => row.diffCount > 0).length;

	return {
		limit,
		days,
		copySourcePath: COPY_SOURCE_PATH,
		localPreviews,
		sandbox,
		queueRows,
		alerts,
		engagement,
		statsError,
		stats,
		steps,
		setupError: null,
		sequence,
		summary: {
			total: rows.length,
			matched: rows.length - mismatched,
			mismatched,
			missing
		},
		rows
	};
};

export const actions: Actions = {
	sendNextNow: async ({ request, locals: { safeGetSession, supabase } }) => {
		const adminUser = await getAdminActionUser(safeGetSession, supabase);
		if (!adminUser.ok) {
			return fail(adminUser.status, { error: adminUser.message });
		}

		const formData = await request.formData();
		const enrollmentId = formData.get('enrollment_id');

		if (typeof enrollmentId !== 'string' || !enrollmentId.trim()) {
			return fail(400, { error: 'Missing enrollment id' });
		}

		try {
			const rpcClient = new EmailSequenceRpcClient(createAdminSupabaseClient());
			const updated = await rpcClient.adminSendNextStepNow(enrollmentId.trim());

			if (!updated) {
				return fail(404, {
					error: 'No active, paused, or errored enrollment with a next step was updated.'
				});
			}

			return {
				action: 'sendNextNow',
				success: true,
				message: 'Queued the next welcome step for immediate send.'
			};
		} catch (error) {
			console.error('[WelcomeSequenceAdmin] Failed to queue next step now:', error);
			return fail(500, {
				error:
					error instanceof Error
						? error.message
						: 'Failed to queue the next welcome step.'
			});
		}
	},

	testSend: async ({ request, locals: { safeGetSession, supabase } }) => {
		const adminUser = await getAdminActionUser(safeGetSession, supabase);
		if (!adminUser.ok) {
			return fail(adminUser.status, { error: adminUser.message });
		}

		const formData = await request.formData();
		const recipientEmail = normalizeTestRecipient(formData.get('test_recipient'));

		if (!recipientEmail) {
			return fail(400, { error: 'Enter a valid test recipient email address.' });
		}

		const input = buildPreviewInput({ get: (key) => formData.get(key) });
		const preview = buildPreview(
			input.step,
			buildPreviewStateFromInput(input, recipientEmail),
			getBaseUrl()
		);

		if (!preview.content || preview.action !== 'send') {
			return fail(400, {
				error: 'The selected preview state does not render a sendable email.'
			});
		}

		try {
			const emailService = new EmailService(createAdminSupabaseClient());
			await sendTestWelcomeEmail({
				emailService,
				recipientEmail,
				content: preview.content,
				subjectPrefix: '[TEST] ',
				metadata: buildTestSendMetadata(preview.content, adminUser.userId, {
					admin_action: 'test_send_single'
				})
			});

			return {
				action: 'testSend',
				success: true,
				message: `Sent ${preview.content.step} test email to ${recipientEmail}.`
			};
		} catch (error) {
			console.error('[WelcomeSequenceAdmin] Failed to send test email:', error);
			return fail(500, {
				error:
					error instanceof Error
						? error.message
						: 'Failed to send the welcome test email.'
			});
		}
	},

	testFullSequence: async ({ request, locals: { safeGetSession, supabase } }) => {
		const adminUser = await getAdminActionUser(safeGetSession, supabase);
		if (!adminUser.ok) {
			return fail(adminUser.status, { error: adminUser.message });
		}

		const formData = await request.formData();
		const recipientEmail = normalizeTestRecipient(formData.get('test_recipient'));

		if (!recipientEmail) {
			return fail(400, { error: 'Enter a valid test recipient email address.' });
		}

		const input = buildPreviewInput({ get: (key) => formData.get(key) });
		const state = buildPreviewStateFromInput(input, recipientEmail);
		const emailService = new EmailService(createAdminSupabaseClient());
		const baseUrl = getBaseUrl();
		let sent = 0;

		try {
			for (const [index, step] of WELCOME_SEQUENCE_STEPS.entries()) {
				const content = buildWelcomeEmailContent(
					step,
					createPreviewProgress(step),
					state,
					baseUrl
				);

				await sendTestWelcomeEmail({
					emailService,
					recipientEmail,
					content,
					subjectPrefix: `[TEST ${index + 1}/${WELCOME_SEQUENCE_STEPS.length}] `,
					metadata: buildTestSendMetadata(content, adminUser.userId, {
						admin_action: 'test_send_full_sequence',
						test_sequence_index: index + 1,
						test_sequence_total: WELCOME_SEQUENCE_STEPS.length
					})
				});
				sent += 1;
			}

			return {
				action: 'testFullSequence',
				success: true,
				message: `Sent ${sent} welcome sequence test emails to ${recipientEmail}.`
			};
		} catch (error) {
			console.error('[WelcomeSequenceAdmin] Failed to send full test sequence:', error);
			return fail(500, {
				error:
					error instanceof Error
						? error.message
						: 'Failed to send the full welcome test sequence.'
			});
		}
	}
};
