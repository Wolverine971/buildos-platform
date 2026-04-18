// apps/web/src/routes/admin/welcome-sequence/+page.server.ts
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	BUILDOS_WELCOME_SEQUENCE_KEY,
	buildLegacyWelcomeSequenceMirrorPayload,
	type LegacyWelcomeSequenceRowForMirror
} from '$lib/server/email-sequence-rpcs';
import { buildWelcomeEmailContent } from '$lib/server/welcome-sequence.content';
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
	status: string;
	current_step_number: number;
	next_step_number: number | null;
	next_send_at: string | null;
	failure_count: number | null;
	exit_reason: string | null;
};

type EmailLogRow = {
	status: string;
	metadata: Record<string, unknown> | null;
	created_at: string;
	sent_at: string | null;
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
	const step = normalizeStep(url.searchParams.get('preview_step'));
	const projectCount = parseNumber(
		url.searchParams.get('project_count'),
		step === 'email_1' ? 0 : 1
	);
	const onboardingCompleted = parseBoolean(
		url.searchParams.get('onboarding_completed'),
		step === 'email_5'
	);
	const returned = parseBoolean(url.searchParams.get('returned'), step === 'email_5');
	const emailDailyBriefEnabled = parseBoolean(
		url.searchParams.get('email_daily_brief_enabled'),
		false
	);
	const smsChannelEnabled = parseBoolean(url.searchParams.get('sms_channel_enabled'), false);
	const calendarConnected = parseBoolean(url.searchParams.get('calendar_connected'), false);
	const name = url.searchParams.get('preview_name') || 'Alex Builder';
	const onboardingIntent = url.searchParams.get('onboarding_intent') || 'plan';

	const state = createPreviewState({
		name,
		onboardingIntent: onboardingIntent === 'none' ? null : onboardingIntent,
		projectCount,
		latestProjectId: projectCount > 0 ? 'preview-project' : null,
		onboardingCompleted,
		emailDailyBriefEnabled,
		smsChannelEnabled,
		calendarConnected,
		lastVisit: returned ? '2026-03-02T02:00:00.000Z' : null
	});

	return {
		input: {
			step,
			projectCount,
			onboardingCompleted,
			returned,
			emailDailyBriefEnabled,
			smsChannelEnabled,
			calendarConnected,
			name,
			onboardingIntent
		},
		preview: buildPreview(step, state, baseUrl)
	};
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
		const logsForStep = input.emailLogs.filter((log) => log.metadata?.sequence_step === step);

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
		emailLogCounts: countBy(input.emailLogs.map((log) => log.status)),
		stepStats
	};
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
		{ data: emailLogsData, error: emailLogsError }
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
				'status, current_step_number, next_step_number, next_send_at, failure_count, exit_reason'
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
			.limit(5000)
	]);

	const statsError = [
		stepsError?.message,
		enrollmentStatsError?.message,
		eventsError?.message,
		emailLogsError?.message
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
