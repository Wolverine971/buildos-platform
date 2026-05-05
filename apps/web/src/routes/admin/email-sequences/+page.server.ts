// apps/web/src/routes/admin/email-sequences/+page.server.ts
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import { fail } from '@sveltejs/kit';
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
	type RetargetingPilotMetricRow,
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
	sequenceKey: SequenceKey;
	email: string;
	name: string | null;
	userId: string;
	status: string;
	stepKey: string | null;
	variantKey: string | null;
	nextSendAt: string | null;
	dueLabel: string;
	batchId: string | null;
	reason: string;
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
		return asCopyOption({
			sequenceKey: BUILDOS_WELCOME_SEQUENCE_KEY,
			stepKey: variant.step,
			variantKey: content.branchKey,
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

function buildWelcomeRecipients(enrollments: WelcomeEnrollmentRow[]): RecipientRow[] {
	return enrollments
		.filter((row) => row.next_step_number != null)
		.map((row) => {
			const step = stepForWelcomeNumber(row.next_step_number);
			const branchKey =
				typeof row.metadata?.branch_key === 'string'
					? row.metadata.branch_key
					: typeof row.metadata?.last_branch_key === 'string'
						? row.metadata.last_branch_key
						: null;

			return {
				sequenceKey: BUILDOS_WELCOME_SEQUENCE_KEY as SequenceKey,
				email: row.recipient_email,
				name: null,
				userId: row.user_id,
				status: row.status,
				stepKey: step,
				variantKey: branchKey,
				nextSendAt: row.next_send_at,
				dueLabel: row.next_send_at ? 'Scheduled' : 'No schedule',
				batchId: null,
				reason:
					branchKey ??
					(step
						? 'Branch is computed at send time from current user state.'
						: 'No next step.')
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

function addHours(iso: string, hours: number): string | null {
	const parsed = Date.parse(iso);
	if (Number.isNaN(parsed)) {
		return null;
	}

	return new Date(parsed + hours * 60 * 60 * 1000).toISOString();
}

function buildRetargetingRecipient(row: RetargetingPilotMetricRow, now: Date): RecipientRow | null {
	if (row.holdout || row.manual_stop || row.reply_status !== 'none') {
		return null;
	}

	if (!row.touch_1_sent_at) {
		return {
			sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
			email: row.email,
			name: row.name,
			userId: row.user_id,
			status: 'ready',
			stepKey: 'touch_1',
			variantKey: row.variant || RETARGETING_DEFAULT_VARIANT,
			nextSendAt: null,
			dueLabel: 'Manual send now',
			batchId: row.batch_id,
			reason: 'Unsent non-holdout member.'
		};
	}

	if (!row.touch_2_sent_at && !row.first_post_send_activity_at) {
		const dueAt = addHours(row.touch_1_sent_at, 72);
		return {
			sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
			email: row.email,
			name: row.name,
			userId: row.user_id,
			status: dueAt && Date.parse(dueAt) <= now.getTime() ? 'ready' : 'waiting',
			stepKey: 'touch_2',
			variantKey: row.variant || RETARGETING_DEFAULT_VARIANT,
			nextSendAt: dueAt,
			dueLabel: '72h after Touch 1',
			batchId: row.batch_id,
			reason: 'Touch 1 sent and no tracked post-send activity.'
		};
	}

	if (!row.touch_3_sent_at && !row.first_post_send_action_at && (row.any_open || row.any_click)) {
		const dueAt = addHours(row.touch_1_sent_at, 24 * 7);
		return {
			sequenceKey: RETARGETING_EMAIL_SEQUENCE_KEY,
			email: row.email,
			name: row.name,
			userId: row.user_id,
			status: dueAt && Date.parse(dueAt) <= now.getTime() ? 'ready' : 'waiting',
			stepKey: 'touch_3',
			variantKey: row.variant || RETARGETING_DEFAULT_VARIANT,
			nextSendAt: dueAt,
			dueLabel: '7d after Touch 1',
			batchId: row.batch_id,
			reason: 'Opened or clicked but no tracked product action.'
		};
	}

	return null;
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

export const load: PageServerLoad = async ({ url }) => {
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
				.in('status', ['active', 'paused', 'processing', 'errored'])
				.order('next_send_at', { ascending: true, nullsFirst: false })
				.limit(250)
		: { data: [] };

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

	let retargetingMetricRows: RetargetingPilotMetricRow[] = [];
	let retargetingError: string | null = null;
	if (cohortOptions.length > 0) {
		try {
			const service = new RetargetingPilotService(adminSupabase);
			retargetingMetricRows = await service.getMetricRows({
				campaignId: selectedCampaignId,
				cohortId: selectedCohortId
			});
		} catch (error) {
			retargetingError =
				error instanceof Error ? error.message : 'Failed to load retargeting members';
		}
	}

	const retargetingRecipients = retargetingMetricRows
		.filter((row) => !selectedBatchId || row.batch_id === selectedBatchId)
		.map((row) => buildRetargetingRecipient(row, new Date()))
		.filter((row): row is RecipientRow => Boolean(row))
		.sort((left, right) => {
			const leftTime = left.nextSendAt ? Date.parse(left.nextSendAt) : 0;
			const rightTime = right.nextSendAt ? Date.parse(right.nextSendAt) : 0;
			return leftTime - rightTime;
		});

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
				(welcomeEnrollmentsData || []) as WelcomeEnrollmentRow[]
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
