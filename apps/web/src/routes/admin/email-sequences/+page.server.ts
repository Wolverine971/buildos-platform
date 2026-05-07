// apps/web/src/routes/admin/email-sequences/+page.server.ts
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	buildEmailCopyTokens,
	deleteEmailCopyOverride,
	listEmailCopyOverrides,
	renderEmailCopyOverride,
	upsertEmailCopyOverride,
	type EmailContentWithCopy,
	type EmailSequenceCopyOverride
} from '$lib/server/email-sequence-copy-overrides';
import {
	BUILDOS_WELCOME_SEQUENCE_KEY,
	type EmailSequenceEnrollmentStatus
} from '$lib/server/email-sequence-rpcs';
import {
	buildWelcomeEmailContent,
	type WelcomeEmailContent
} from '$lib/server/welcome-sequence.content';
import {
	WELCOME_SEQUENCE_STEPS,
	type WelcomeSequenceProductState,
	type WelcomeSequenceProgress,
	type WelcomeSequenceStep
} from '$lib/server/welcome-sequence.logic';
import {
	buildRetargetingEmailContent,
	RETARGETING_DEFAULT_CAMPAIGN_ID,
	RETARGETING_DEFAULT_VARIANT,
	RETARGETING_EMAIL_SEQUENCE_KEY,
	RETARGETING_STEPS,
	type RetargetingPilotStep,
	type RetargetingVariant
} from '$lib/server/retargeting-pilot.logic';
import { RetargetingPilotService } from '$lib/server/retargeting-pilot.service';

type SequenceKey = typeof BUILDOS_WELCOME_SEQUENCE_KEY | typeof RETARGETING_EMAIL_SEQUENCE_KEY;
type CopyStatus = 'source' | 'override';

type CopyOption = {
	sequenceKey: SequenceKey;
	stepKey: string;
	variantKey: string;
	sequencePosition: number;
	stepLabel: string;
	triggerLabel: string;
	triggerDetail: string;
	label: string;
	description: string;
	status: CopyStatus;
	subject: string;
	body: string;
	sourceSubject: string;
	sourceBody: string;
	previewHtml: string;
	ctaLabel: string | null;
	ctaUrl: string | null;
	updatedAt: string | null;
};

type RecipientRow = {
	id: string;
	sequenceKey: SequenceKey;
	memberId: string | null;
	email: string;
	name: string | null;
	userId: string;
	status: string;
	stageLabel: string;
	stepKey: string | null;
	variantKey: string | null;
	nextSendAt: string | null;
	scheduledFor: string | null;
	dueLabel: string;
	batchId: string | null;
	reason: string;
	sentCount: number;
	openCount: number;
	clickCount: number;
	returnedAt: string | null;
	firstActionAt: string | null;
	lastActivityAt: string | null;
	holdout: boolean;
	manualStop: boolean;
	replyStatus: string | null;
	touch1SentAt: string | null;
	touch2SentAt: string | null;
	touch3SentAt: string | null;
	anyOpen: boolean;
	anyClick: boolean;
	pendingSendId: string | null;
};

type RetargetingCohortOption = {
	campaignId: string;
	cohortId: string;
	cohortFrozenAt: string;
	total: number;
	sendable: number;
	holdout: number;
	batches: string[];
};

type WelcomeEnrollmentRow = {
	id: string;
	user_id: string;
	recipient_email: string;
	status: EmailSequenceEnrollmentStatus;
	current_step_number: number;
	next_step_number: number | null;
	next_send_at: string | null;
	last_sent_at: string | null;
	metadata: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

type WelcomeSequenceEventRow = {
	enrollment_id: string | null;
	user_id: string | null;
	event_type: string;
	step_number: number | null;
	step_key: string | null;
	branch_key: string | null;
	email_id: string | null;
	created_at: string;
};

type EmailTrackingEventRow = {
	email_id: string;
	event_type: string;
	created_at: string | null;
	timestamp: string | null;
};

type WelcomeSequenceRow = {
	id: string;
	key: string;
	display_name: string;
	status: string;
};

type RetargetingMemberRow = {
	campaign_id: string;
	cohort_id: string;
	cohort_frozen_at: string;
	holdout: boolean;
	batch_id: string | null;
};

const PREVIEW_STARTED_AT = '2026-03-01T10:00:00.000Z';
const RETARGETING_PREVIEW_DEMO_URL = 'https://build-os.com/demo/reactivation-preview';

const SEQUENCES = [
	{
		key: RETARGETING_EMAIL_SEQUENCE_KEY,
		label: 'Reactivation',
		description: 'Founder-led dormant-user reactivation pilot.'
	},
	{
		key: BUILDOS_WELCOME_SEQUENCE_KEY,
		label: 'Welcome',
		description: 'New-user activation lifecycle sequence.'
	}
] as const;

const WELCOME_STEP_COPY_META: Record<
	WelcomeSequenceStep,
	{
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
	}
> = {
	email_1: {
		sequencePosition: 1,
		stepLabel: 'Email 1',
		triggerLabel: 'Immediately after account creation',
		triggerDetail: 'First queue step is due at sequence start.'
	},
	email_2: {
		sequencePosition: 2,
		stepLabel: 'Email 2',
		triggerLabel: 'Day 1 after signup',
		triggerDetail:
			'Sends during the user local 9am-5pm window; branch depends on project creation.'
	},
	email_3: {
		sequencePosition: 3,
		stepLabel: 'Email 3',
		triggerLabel: 'Day 3 after signup',
		triggerDetail:
			'Sends during the user local 9am-5pm window; branch depends on setup progress.'
	},
	email_4: {
		sequencePosition: 4,
		stepLabel: 'Email 4',
		triggerLabel: 'Day 6 after signup',
		triggerDetail:
			'Sends during the user local 9am-5pm window; skipped when follow-through channels are ready.'
	},
	email_5: {
		sequencePosition: 5,
		stepLabel: 'Email 5',
		triggerLabel: 'Day 9 after signup',
		triggerDetail:
			'Sends during the user local 9am-5pm window; branch depends on return-session activity.'
	}
};

const RETARGETING_STEP_COPY_META: Record<
	RetargetingPilotStep,
	{
		sequencePosition: number;
		stepLabel: string;
		triggerLabel: string;
		triggerDetail: string;
	}
> = {
	touch_1: {
		sequencePosition: 1,
		stepLabel: 'Touch 1',
		triggerLabel: 'Manual send when cohort member is unsent',
		triggerDetail: 'Eligible non-holdout members with no reply or manual stop.'
	},
	touch_2: {
		sequencePosition: 2,
		stepLabel: 'Touch 2',
		triggerLabel: '72 hours after Touch 1',
		triggerDetail:
			'Only when no tracked post-send activity exists; requires a demo URL at send time.'
	},
	touch_3: {
		sequencePosition: 3,
		stepLabel: 'Touch 3',
		triggerLabel: '7 days after Touch 1',
		triggerDetail: 'Only for open/click members with no tracked product action.'
	}
};

function getBaseUrl(): string {
	return PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
}

function normalizeSequenceKey(value: string | null): SequenceKey {
	return value === BUILDOS_WELCOME_SEQUENCE_KEY
		? BUILDOS_WELCOME_SEQUENCE_KEY
		: RETARGETING_EMAIL_SEQUENCE_KEY;
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

function createPreviewProgress(step: WelcomeSequenceStep): WelcomeSequenceProgress {
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
		skippedAt: {}
	};
}

function overrideKey(stepKey: string, variantKey: string): string {
	return `${stepKey}:${variantKey}`;
}

function overridesByStep(
	overrides: EmailSequenceCopyOverride[]
): Map<string, EmailSequenceCopyOverride> {
	return new Map(
		overrides.map((override) => [
			overrideKey(override.step_key, override.variant_key),
			override
		])
	);
}

function asCopyOption(input: {
	sequenceKey: SequenceKey;
	stepKey: string;
	variantKey: string;
	sequencePosition: number;
	stepLabel: string;
	triggerLabel: string;
	triggerDetail: string;
	label: string;
	description: string;
	sourceContent: EmailContentWithCopy;
	override: EmailSequenceCopyOverride | null;
	tokens: Record<string, string | number | boolean | null | undefined>;
}): CopyOption {
	const rendered = input.override
		? renderEmailCopyOverride(input.sourceContent, input.override, input.tokens)
		: input.sourceContent;

	return {
		sequenceKey: input.sequenceKey,
		stepKey: input.stepKey,
		variantKey: input.variantKey,
		sequencePosition: input.sequencePosition,
		stepLabel: input.stepLabel,
		triggerLabel: input.triggerLabel,
		triggerDetail: input.triggerDetail,
		label: input.label,
		description: input.description,
		status: input.override ? 'override' : 'source',
		subject: input.override?.subject ?? input.sourceContent.subject,
		body: input.override?.body ?? input.sourceContent.body,
		sourceSubject: input.sourceContent.subject,
		sourceBody: input.sourceContent.body,
		previewHtml: rendered.html,
		ctaLabel: input.sourceContent.ctaLabel ?? null,
		ctaUrl: input.sourceContent.ctaUrl ?? null,
		updatedAt: input.override?.updated_at ?? null
	};
}

function welcomeContentWithCta(content: WelcomeEmailContent): EmailContentWithCopy {
	return {
		...content,
		ctaLabel: content.ctaLabel,
		ctaUrl: content.ctaUrl
	};
}

function buildWelcomeCopyOptions(
	baseUrl: string,
	overrides: EmailSequenceCopyOverride[]
): CopyOption[] {
	const byKey = overridesByStep(overrides);
	const variants: Array<{
		step: WelcomeSequenceStep;
		variantKey: string;
		label: string;
		description: string;
		state: WelcomeSequenceProductState;
	}> = [
		{
			step: 'email_1',
			variantKey: 'welcome',
			label: 'Email 1 - welcome',
			description: 'Immediate signup welcome.',
			state: createPreviewState()
		},
		{
			step: 'email_2',
			variantKey: 'no_project',
			label: 'Email 2 - no project',
			description: 'Day 1 nudge when no project exists.',
			state: createPreviewState()
		},
		{
			step: 'email_2',
			variantKey: 'already_created_project',
			label: 'Email 2 - already created project',
			description: 'Day 1 nudge after the user created a project.',
			state: createPreviewState({ projectCount: 1, latestProjectId: 'preview-project' })
		},
		{
			step: 'email_3',
			variantKey: 'no_project',
			label: 'Email 3 - no project',
			description: 'Day 3 nudge when no project exists.',
			state: createPreviewState()
		},
		{
			step: 'email_3',
			variantKey: 'finish_setup',
			label: 'Email 3 - finish setup',
			description: 'Project exists, onboarding unfinished.',
			state: createPreviewState({ projectCount: 1, latestProjectId: 'preview-project' })
		},
		{
			step: 'email_3',
			variantKey: 'reopen_project',
			label: 'Email 3 - reopen project',
			description: 'Project exists and onboarding is complete.',
			state: createPreviewState({
				projectCount: 1,
				latestProjectId: 'preview-project',
				onboardingCompleted: true
			})
		},
		{
			step: 'email_4',
			variantKey: 'finish_setup',
			label: 'Email 4 - finish setup',
			description: 'Follow-through nudge when onboarding is unfinished.',
			state: createPreviewState({ projectCount: 1, latestProjectId: 'preview-project' })
		},
		{
			step: 'email_4',
			variantKey: 'follow_through_missing',
			label: 'Email 4 - follow-through missing',
			description: 'No brief, SMS, or calendar channel is active.',
			state: createPreviewState({
				projectCount: 1,
				latestProjectId: 'preview-project',
				onboardingCompleted: true
			})
		},
		{
			step: 'email_5',
			variantKey: 'general_check_in',
			label: 'Email 5 - general check-in',
			description: 'Personal check-in when no return visit was detected.',
			state: createPreviewState()
		},
		{
			step: 'email_5',
			variantKey: 'returning_check_in',
			label: 'Email 5 - returning check-in',
			description: 'Personal check-in after a return session.',
			state: createPreviewState({
				projectCount: 1,
				latestProjectId: 'preview-project',
				lastVisit: '2026-03-02T02:00:00.000Z'
			})
		}
	];

	return variants.map((variant) => {
		const content = buildWelcomeEmailContent(
			variant.step,
			createPreviewProgress(variant.step),
			variant.state,
			baseUrl
		);
		const key = overrideKey(variant.step, content.branchKey);
		const stepMeta = WELCOME_STEP_COPY_META[variant.step];
		return asCopyOption({
			sequenceKey: BUILDOS_WELCOME_SEQUENCE_KEY,
			stepKey: variant.step,
			variantKey: content.branchKey,
			...stepMeta,
			label: variant.label,
			description: variant.description,
			sourceContent: welcomeContentWithCta(content),
			override: byKey.get(key) ?? null,
			tokens: buildEmailCopyTokens({
				name: variant.state.name,
				email: variant.state.email,
				baseUrl,
				ctaLabel: content.ctaLabel,
				ctaUrl: content.ctaUrl
			})
		});
	});
}

function buildRetargetingCopyOptions(
	baseUrl: string,
	overrides: EmailSequenceCopyOverride[],
	campaignId: string,
	cohortId: string,
	batchId: string
): CopyOption[] {
	const byKey = overridesByStep(overrides);
	const variants: RetargetingVariant[] = ['A', 'B', 'C'];

	return RETARGETING_STEPS.flatMap((step) =>
		variants.map((variant) => {
			const stepMeta = RETARGETING_STEP_COPY_META[step];
			const content = buildRetargetingEmailContent({
				baseUrl,
				campaignId,
				cohortId,
				batchId,
				member: {
					name: 'Alex Builder',
					variant
				},
				step,
				variant,
				demoUrl: step === 'touch_2' ? RETARGETING_PREVIEW_DEMO_URL : null
			});

			const sourceContent = {
				...content,
				ctaLabel: content.primaryCtaUrl ? 'Open BuildOS' : null,
				ctaUrl: content.primaryCtaUrl
			};

			return asCopyOption({
				sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
				stepKey: step,
				variantKey: variant,
				...stepMeta,
				label: `${step.replace('_', ' ')} - variant ${variant}`,
				description:
					step === 'touch_1'
						? 'Initial dormant-user reach-out.'
						: step === 'touch_2'
							? '72-hour follow-up for non-returners; requires a real demo URL at send time.'
							: 'Selective final note for engaged non-converters.',
				sourceContent,
				override: byKey.get(overrideKey(step, variant)) ?? null,
				tokens: buildEmailCopyTokens({
					name: 'Alex Builder',
					email: 'builder@example.com',
					baseUrl,
					ctaLabel: sourceContent.ctaLabel,
					ctaUrl: sourceContent.ctaUrl,
					appUrl: content.primaryCtaUrl,
					demoUrl: content.secondaryCtaUrl
				})
			});
		})
	);
}

function stepForWelcomeNumber(stepNumber: number | null): WelcomeSequenceStep | null {
	if (!stepNumber || stepNumber < 1 || stepNumber > WELCOME_SEQUENCE_STEPS.length) {
		return null;
	}

	return WELCOME_SEQUENCE_STEPS[stepNumber - 1] ?? null;
}

function buildWelcomeRecipients(
	enrollments: WelcomeEnrollmentRow[],
	events: WelcomeSequenceEventRow[] = [],
	trackingEvents: EmailTrackingEventRow[] = []
): RecipientRow[] {
	const eventsByEnrollment = new Map<string, WelcomeSequenceEventRow[]>();
	for (const event of events) {
		if (!event.enrollment_id) {
			continue;
		}
		eventsByEnrollment.set(event.enrollment_id, [
			...(eventsByEnrollment.get(event.enrollment_id) ?? []),
			event
		]);
	}
	const trackingByEmail = new Map<string, EmailTrackingEventRow[]>();
	for (const event of trackingEvents) {
		trackingByEmail.set(event.email_id, [
			...(trackingByEmail.get(event.email_id) ?? []),
			event
		]);
	}

	return enrollments
		.map((row) => {
			const step = stepForWelcomeNumber(row.next_step_number);
			const rowEvents = eventsByEnrollment.get(row.id) ?? [];
			const sentEvents = rowEvents.filter((event) => event.event_type === 'sent');
			const sentEmailIds = new Set(
				sentEvents.map((event) => event.email_id).filter((id): id is string => Boolean(id))
			);
			const rowTrackingEvents = Array.from(sentEmailIds).flatMap(
				(emailId) => trackingByEmail.get(emailId) ?? []
			);
			const openCount = rowTrackingEvents.filter(
				(event) => event.event_type === 'opened'
			).length;
			const clickCount = rowTrackingEvents.filter(
				(event) => event.event_type === 'clicked'
			).length;
			const branchKey =
				typeof row.metadata?.branch_key === 'string'
					? row.metadata.branch_key
					: typeof row.metadata?.last_branch_key === 'string'
						? row.metadata.last_branch_key
						: null;

			return {
				id: row.id,
				sequenceKey: BUILDOS_WELCOME_SEQUENCE_KEY as SequenceKey,
				memberId: null,
				email: row.recipient_email,
				name: null,
				userId: row.user_id,
				status: row.status,
				stageLabel: step
					? `Next ${WELCOME_STEP_COPY_META[step].stepLabel}`
					: row.status === 'completed'
						? 'Completed'
						: row.status,
				stepKey: step,
				variantKey: branchKey,
				nextSendAt: row.next_send_at,
				scheduledFor: row.next_send_at,
				dueLabel: row.next_send_at ? 'Scheduled' : 'No schedule',
				batchId: null,
				reason:
					branchKey ??
					(step
						? 'Branch is computed at send time from current user state.'
						: 'No next step.'),
				sentCount: sentEvents.length || Math.max(0, row.current_step_number),
				openCount,
				clickCount,
				returnedAt: null,
				firstActionAt: null,
				lastActivityAt: row.last_sent_at,
				holdout: false,
				manualStop: false,
				replyStatus: null,
				touch1SentAt: null,
				touch2SentAt: null,
				touch3SentAt: null,
				anyOpen: false,
				anyClick: false,
				pendingSendId: null
			};
		})
		.sort((left, right) => {
			const leftTime = left.nextSendAt
				? Date.parse(left.nextSendAt)
				: Number.POSITIVE_INFINITY;
			const rightTime = right.nextSendAt
				? Date.parse(right.nextSendAt)
				: Number.POSITIVE_INFINITY;
			return leftTime - rightTime;
		});
}

function summarizeCohorts(rows: RetargetingMemberRow[]): RetargetingCohortOption[] {
	const cohorts = new Map<string, RetargetingCohortOption>();
	for (const row of rows) {
		const key = `${row.campaign_id}:${row.cohort_id}`;
		const current =
			cohorts.get(key) ??
			({
				campaignId: row.campaign_id,
				cohortId: row.cohort_id,
				cohortFrozenAt: row.cohort_frozen_at,
				total: 0,
				sendable: 0,
				holdout: 0,
				batches: []
			} satisfies RetargetingCohortOption);

		current.total += 1;
		current.holdout += row.holdout ? 1 : 0;
		current.sendable += row.holdout ? 0 : 1;
		if (row.batch_id && !current.batches.includes(row.batch_id)) {
			current.batches.push(row.batch_id);
		}
		cohorts.set(key, current);
	}

	return Array.from(cohorts.values()).sort(
		(left, right) => Date.parse(right.cohortFrozenAt) - Date.parse(left.cohortFrozenAt)
	);
}

async function requireAdmin(
	safeGetSession: App.Locals['safeGetSession'],
	supabase: App.Locals['supabase']
): Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 403; message: string }> {
	const { user } = await safeGetSession();
	if (!user) {
		return { ok: false, status: 401, message: 'Unauthorized' };
	}

	const { data, error } = await supabase
		.from('users')
		.select('is_admin')
		.eq('id', user.id)
		.single();

	if (error || !data?.is_admin) {
		return { ok: false, status: 403, message: 'Admin access required' };
	}

	return { ok: true, userId: user.id };
}

export const load: PageServerLoad = async ({ url, locals: { safeGetSession, supabase } }) => {
	const admin = await requireAdmin(safeGetSession, supabase);
	if (!admin.ok) {
		if (admin.status === 401) {
			throw redirect(303, '/auth/login');
		}
		throw redirect(303, '/');
	}

	const selectedSequenceKey = normalizeSequenceKey(url.searchParams.get('sequence'));
	const baseUrl = getBaseUrl();
	const adminSupabase = createAdminSupabaseClient();
	const [welcomeOverrides, reactivationOverrides] = await Promise.all([
		listEmailCopyOverrides(adminSupabase, BUILDOS_WELCOME_SEQUENCE_KEY).catch(() => []),
		listEmailCopyOverrides(adminSupabase, RETARGETING_EMAIL_SEQUENCE_KEY).catch(() => [])
	]);

	const { data: sequenceRows } = await adminSupabase
		.from('email_sequences')
		.select('id, key, display_name, status')
		.in('key', [BUILDOS_WELCOME_SEQUENCE_KEY, RETARGETING_EMAIL_SEQUENCE_KEY]);
	const sequencesByKey = new Map(
		((sequenceRows || []) as WelcomeSequenceRow[]).map((row) => [row.key, row])
	);
	const welcomeSequence = sequencesByKey.get(BUILDOS_WELCOME_SEQUENCE_KEY);
	const { data: welcomeEnrollmentsData } = welcomeSequence?.id
		? await adminSupabase
				.from('email_sequence_enrollments')
				.select(
					'id, user_id, recipient_email, status, current_step_number, next_step_number, next_send_at, last_sent_at, metadata, created_at, updated_at'
				)
				.eq('sequence_id', welcomeSequence.id)
				.in('status', ['active', 'paused', 'processing', 'errored', 'completed', 'exited'])
				.order('next_send_at', { ascending: true, nullsFirst: false })
				.limit(250)
		: { data: [] };
	const welcomeEnrollments = (welcomeEnrollmentsData || []) as WelcomeEnrollmentRow[];
	const welcomeEnrollmentIds = welcomeEnrollments.map((row) => row.id);
	const { data: welcomeEventData } =
		welcomeSequence?.id && welcomeEnrollmentIds.length > 0
			? await adminSupabase
					.from('email_sequence_events')
					.select(
						'enrollment_id, user_id, event_type, step_number, step_key, branch_key, email_id, created_at'
					)
					.eq('sequence_id', welcomeSequence.id)
					.in('enrollment_id', welcomeEnrollmentIds)
					.order('created_at', { ascending: false })
					.limit(5000)
			: { data: [] };
	const welcomeEvents = (welcomeEventData || []) as WelcomeSequenceEventRow[];
	const welcomeEmailIds = Array.from(
		new Set(
			welcomeEvents.map((event) => event.email_id).filter((id): id is string => Boolean(id))
		)
	);
	const { data: welcomeTrackingData } =
		welcomeEmailIds.length > 0
			? await adminSupabase
					.from('email_tracking_events')
					.select('email_id, event_type, created_at, timestamp')
					.in('email_id', welcomeEmailIds)
					.limit(10000)
			: { data: [] };
	const welcomeTrackingEvents = (welcomeTrackingData || []) as EmailTrackingEventRow[];

	const { data: retargetingMemberData } = await (adminSupabase as any)
		.from('retargeting_founder_pilot_members')
		.select('campaign_id, cohort_id, cohort_frozen_at, holdout, batch_id')
		.order('cohort_frozen_at', { ascending: false })
		.limit(5000);
	const cohortOptions = summarizeCohorts((retargetingMemberData || []) as RetargetingMemberRow[]);
	const selectedCampaignId =
		url.searchParams.get('campaign_id')?.trim() ||
		cohortOptions[0]?.campaignId ||
		RETARGETING_DEFAULT_CAMPAIGN_ID;
	const selectedCohortId =
		url.searchParams.get('cohort_id')?.trim() || cohortOptions[0]?.cohortId || 'founder-pilot';
	const selectedBatchId = url.searchParams.get('batch_id')?.trim() || '';

	let retargetingRecipients: RecipientRow[] = [];
	let retargetingError: string | null = null;
	if (cohortOptions.length > 0) {
		try {
			const service = new RetargetingPilotService(adminSupabase);
			retargetingRecipients = (await service.getMemberOperationalRows({
				campaignId: selectedCampaignId,
				cohortId: selectedCohortId,
				batchId: selectedBatchId || null
			})) as RecipientRow[];
		} catch (error) {
			retargetingError =
				error instanceof Error ? error.message : 'Failed to load retargeting members';
		}
	}

	const welcomeCopyOptions = buildWelcomeCopyOptions(baseUrl, welcomeOverrides);
	const reactivationCopyOptions = buildRetargetingCopyOptions(
		baseUrl,
		reactivationOverrides,
		selectedCampaignId,
		selectedCohortId,
		selectedBatchId || 'batch_01'
	);
	const copyOptions =
		selectedSequenceKey === BUILDOS_WELCOME_SEQUENCE_KEY
			? welcomeCopyOptions
			: reactivationCopyOptions;
	const selectedCopyKey =
		url.searchParams.get('copy') ||
		(copyOptions[0] ? overrideKey(copyOptions[0].stepKey, copyOptions[0].variantKey) : '');
	const selectedCopy =
		copyOptions.find(
			(option) => overrideKey(option.stepKey, option.variantKey) === selectedCopyKey
		) ??
		copyOptions[0] ??
		null;

	return {
		sequences: SEQUENCES,
		selectedSequenceKey,
		sequenceRows: Array.from(sequencesByKey.values()),
		welcome: {
			copyOptions: welcomeCopyOptions,
			recipients: buildWelcomeRecipients(
				welcomeEnrollments,
				welcomeEvents,
				welcomeTrackingEvents
			)
		},
		reactivation: {
			copyOptions: reactivationCopyOptions,
			recipients: retargetingRecipients,
			cohortOptions,
			selectedCampaignId,
			selectedCohortId,
			selectedBatchId,
			error: retargetingError
		},
		copyOptions,
		selectedCopy,
		tokens: [
			'{{greeting}}',
			'{{first_name}}',
			'{{name}}',
			'{{email}}',
			'{{cta_label}}',
			'{{cta_url}}',
			'{{app_url}}',
			'{{demo_url}}'
		]
	};
};

export const actions: Actions = {
	saveCopy: async ({ request, locals: { safeGetSession, supabase } }) => {
		const admin = await requireAdmin(safeGetSession, supabase);
		if (!admin.ok) {
			return fail(admin.status, { error: admin.message });
		}

		const form = await request.formData();
		const sequenceKey = String(form.get('sequence_key') ?? '');
		const stepKey = String(form.get('step_key') ?? '');
		const variantKey = String(form.get('variant_key') ?? '');
		const subject = String(form.get('subject') ?? '');
		const body = String(form.get('body') ?? '');

		try {
			await upsertEmailCopyOverride(createAdminSupabaseClient(), {
				sequenceKey,
				stepKey,
				variantKey,
				subject,
				body,
				adminUserId: admin.userId,
				metadata: {
					source: 'admin_email_sequences'
				}
			});

			return {
				success: true,
				message: 'Saved email copy override.'
			};
		} catch (error) {
			return fail(400, {
				error:
					error instanceof Error ? error.message : 'Failed to save email copy override.'
			});
		}
	},
	clearCopy: async ({ request, locals: { safeGetSession, supabase } }) => {
		const admin = await requireAdmin(safeGetSession, supabase);
		if (!admin.ok) {
			return fail(admin.status, { error: admin.message });
		}

		const form = await request.formData();
		const sequenceKey = String(form.get('sequence_key') ?? '');
		const stepKey = String(form.get('step_key') ?? '');
		const variantKey = String(form.get('variant_key') ?? '');

		try {
			await deleteEmailCopyOverride(createAdminSupabaseClient(), {
				sequenceKey,
				stepKey,
				variantKey
			});

			return {
				success: true,
				message: 'Cleared email copy override and restored source copy.'
			};
		} catch (error) {
			return fail(400, {
				error:
					error instanceof Error ? error.message : 'Failed to clear email copy override.'
			});
		}
	}
};
