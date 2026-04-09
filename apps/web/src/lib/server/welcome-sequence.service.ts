// apps/web/src/lib/server/welcome-sequence.service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { dev } from '$app/environment';
import { PUBLIC_APP_URL } from '$env/static/public';
import { EmailService } from '$lib/services/email-service';
import {
	buildWelcomeEmailContent,
	determineNextWelcomeAction,
	type WelcomeSequenceProductState,
	type WelcomeSequenceProgress,
	type WelcomeSequenceStep,
	WELCOME_SEQUENCE_STEPS,
	WELCOME_SEQUENCE_VERSION
} from './welcome-sequence.logic';

type TypedSupabaseClient = SupabaseClient<Database>;
type WelcomeSequenceStatus = 'active' | 'completed' | 'cancelled';
type SequenceTimestampKey =
	| 'email_1_sent_at'
	| 'email_1_skipped_at'
	| 'email_2_sent_at'
	| 'email_2_skipped_at'
	| 'email_3_sent_at'
	| 'email_3_skipped_at'
	| 'email_4_sent_at'
	| 'email_4_skipped_at'
	| 'email_5_sent_at'
	| 'email_5_skipped_at';

const WELCOME_STEP_CLAIM_WINDOW_MS = 10 * 60 * 1000;

function isMissingLastEvaluatedAtError(error: unknown): boolean {
	const err = error as { code?: string; message?: string; details?: string } | undefined;
	const message = `${err?.message ?? ''} ${err?.details ?? ''}`.toLowerCase();
	return (
		(err?.code === '42703' && message.includes('last_evaluated_at')) ||
		message.includes('welcome_email_sequences.last_evaluated_at') ||
		message.includes('column last_evaluated_at does not exist')
	);
}

function isMissingUpdatedAtError(error: unknown): boolean {
	const err = error as { code?: string; message?: string; details?: string } | undefined;
	const message = `${err?.message ?? ''} ${err?.details ?? ''}`.toLowerCase();
	return (
		(err?.code === '42703' && message.includes('updated_at')) ||
		message.includes('welcome_email_sequences.updated_at') ||
		message.includes('column updated_at does not exist')
	);
}

interface WelcomeSequenceRow {
	user_id: string;
	sequence_version: string;
	trigger_source: string;
	signup_method: string;
	started_at: string;
	status: WelcomeSequenceStatus;
	email_1_sent_at: string | null;
	email_1_skipped_at: string | null;
	email_2_sent_at: string | null;
	email_2_skipped_at: string | null;
	email_3_sent_at: string | null;
	email_3_skipped_at: string | null;
	email_4_sent_at: string | null;
	email_4_skipped_at: string | null;
	email_5_sent_at: string | null;
	email_5_skipped_at: string | null;
	last_evaluated_at?: string | null;
	completed_at: string | null;
	created_at: string;
	updated_at?: string | null;
}

interface WelcomeSequenceStartInput {
	userId: string;
	signupMethod: 'email' | 'google_oauth' | 'unknown';
	triggerSource?: string;
}

interface WelcomeSequenceSeedState {
	userId: string;
	createdAt: string;
}

interface WelcomeSequenceRunResult {
	evaluated: number;
	sent: number;
	skipped: number;
	completed: number;
	cancelled: number;
	errors: Array<{ userId: string; error: string }>;
}

function stepTimestampField(
	step: WelcomeSequenceStep,
	outcome: 'sent' | 'skipped'
): SequenceTimestampKey {
	return `${step}_${outcome}_at` as SequenceTimestampKey;
}

function toProgress(row: WelcomeSequenceRow): WelcomeSequenceProgress {
	return {
		startedAt: row.started_at,
		status: row.status,
		sentAt: {
			email_1: row.email_1_sent_at,
			email_2: row.email_2_sent_at,
			email_3: row.email_3_sent_at,
			email_4: row.email_4_sent_at,
			email_5: row.email_5_sent_at
		},
		skippedAt: {
			email_1: row.email_1_skipped_at,
			email_2: row.email_2_skipped_at,
			email_3: row.email_3_skipped_at,
			email_4: row.email_4_skipped_at,
			email_5: row.email_5_skipped_at
		}
	};
}

interface WelcomeProjectLookup {
	count: number;
	latestProject: { id: string; updated_at: string | null } | null;
}

function applyRowUpdate(
	row: WelcomeSequenceRow,
	updates: Partial<WelcomeSequenceRow>
): WelcomeSequenceRow {
	return {
		...row,
		...updates
	};
}

export class WelcomeSequenceService {
	private readonly emailService: EmailService;
	private readonly baseUrl: string;
	private supportsLastEvaluatedAtColumn = true;
	private supportsUpdatedAtColumn = true;

	constructor(private readonly supabase: TypedSupabaseClient) {
		this.emailService = new EmailService(supabase);
		this.baseUrl = PUBLIC_APP_URL || (dev ? 'http://localhost:5173' : 'https://build-os.com');
	}

	async startSequenceForUser(input: WelcomeSequenceStartInput): Promise<void> {
		const row = await this.ensureSequenceRow(input);
		if (!row) {
			return;
		}

		let state: WelcomeSequenceProductState | null = null;
		try {
			state = await this.loadUserState(input.userId);
		} catch (error) {
			await this.safeMarkEvaluated(input.userId, new Date().toISOString());
			throw error;
		}

		if (!state?.email) {
			return;
		}

		const hydratedRow = await this.hydrateSentStepsFromEmailLogs(row);

		const progress = toProgress(hydratedRow);
		const immediateNow = this.resolveImmediateEvaluationTime(hydratedRow.started_at);
		const action = determineNextWelcomeAction(progress, state, immediateNow);
		if (action.action !== 'send' || action.step !== 'email_1') {
			return;
		}

		try {
			await this.sendStep(
				hydratedRow,
				progress,
				state,
				action.step,
				action.branchKey || 'welcome',
				immediateNow
			);
		} catch (error) {
			await this.safeMarkEvaluated(input.userId, new Date().toISOString());
			throw error;
		}
	}

	async processDueSequences(options?: {
		limit?: number;
		now?: Date;
	}): Promise<WelcomeSequenceRunResult> {
		const limit = options?.limit ?? 200;
		const now = options?.now ?? new Date();
		const result: WelcomeSequenceRunResult = {
			evaluated: 0,
			sent: 0,
			skipped: 0,
			completed: 0,
			cancelled: 0,
			errors: []
		};

		const { data, error } = await this.sequenceTable()
			.select('*')
			.eq('status', 'active')
			.order('started_at', { ascending: true })
			.limit(limit);

		if (error) {
			throw new Error(`Failed to load welcome sequences: ${error.message}`);
		}

		const rows = (data || []) as WelcomeSequenceRow[];

		for (const originalRow of rows) {
			result.evaluated += 1;

			try {
				let row = await this.hydrateSentStepsFromEmailLogs(originalRow);
				const state = await this.loadUserState(row.user_id);

				if (!state?.email) {
					await this.updateSequenceRow(row.user_id, {
						status: 'cancelled',
						completed_at: now.toISOString(),
						last_evaluated_at: now.toISOString()
					});
					result.cancelled += 1;
					continue;
				}

				const progress = toProgress(row);
				const action = determineNextWelcomeAction(progress, state, now);

				if (action.action === 'wait') {
					await this.updateSequenceRow(row.user_id, {
						last_evaluated_at: now.toISOString()
					});
					continue;
				}

				if (action.action === 'complete') {
					await this.updateSequenceRow(row.user_id, {
						status: 'completed',
						completed_at: row.completed_at || now.toISOString(),
						last_evaluated_at: now.toISOString()
					});
					result.completed += 1;
					continue;
				}

				if (!action.step) {
					continue;
				}

				if (action.action === 'skip') {
					const skipField = stepTimestampField(action.step, 'skipped');
					row = applyRowUpdate(row, {
						[skipField]: now.toISOString(),
						last_evaluated_at: now.toISOString()
					} as Partial<WelcomeSequenceRow>);
					await this.updateSequenceRow(row.user_id, {
						[skipField]: now.toISOString(),
						last_evaluated_at: now.toISOString()
					} as Partial<WelcomeSequenceRow>);
					result.skipped += 1;
					continue;
				}

				const sent = await this.sendStep(
					row,
					progress,
					state,
					action.step,
					action.branchKey || 'unknown',
					now
				);
				if (!sent) {
					continue;
				}

				result.sent += 1;
				if (action.step === 'email_5') {
					result.completed += 1;
				}
			} catch (error) {
				await this.safeMarkEvaluated(originalRow.user_id, now.toISOString());
				result.errors.push({
					userId: originalRow.user_id,
					error: error instanceof Error ? error.message : 'Unknown error'
				});
			}
		}

		return result;
	}

	private sequenceTable() {
		return (this.supabase as any).from('welcome_email_sequences');
	}

	private markLastEvaluatedAtColumnUnavailable(error: unknown): boolean {
		if (!isMissingLastEvaluatedAtError(error)) {
			return false;
		}

		this.supportsLastEvaluatedAtColumn = false;
		return true;
	}

	private markUpdatedAtColumnUnavailable(error: unknown): boolean {
		if (!isMissingUpdatedAtError(error)) {
			return false;
		}

		this.supportsUpdatedAtColumn = false;
		return true;
	}

	private toCompatibleUpdates(updates: Partial<WelcomeSequenceRow>): Partial<WelcomeSequenceRow> {
		const compatible: Partial<WelcomeSequenceRow> = {
			...updates
		};

		if (!this.supportsLastEvaluatedAtColumn) {
			const lastEvaluatedAt = compatible.last_evaluated_at;
			delete compatible.last_evaluated_at;
			if (
				typeof lastEvaluatedAt === 'string' &&
				this.supportsUpdatedAtColumn &&
				!('updated_at' in compatible)
			) {
				compatible.updated_at = lastEvaluatedAt;
			}
		}

		if (!this.supportsUpdatedAtColumn) {
			delete compatible.updated_at;
		}

		return compatible;
	}

	private async ensureSequenceRow(
		input: WelcomeSequenceStartInput
	): Promise<WelcomeSequenceRow | null> {
		const existing = await this.getSequenceRow(input.userId);
		if (existing) {
			return existing;
		}

		const seed = await this.loadSequenceSeedState(input.userId);
		if (!seed) {
			return null;
		}

		const insertRow = {
			user_id: input.userId,
			sequence_version: WELCOME_SEQUENCE_VERSION,
			trigger_source: input.triggerSource || 'account_created',
			signup_method: input.signupMethod,
			started_at: seed.createdAt
		};

		const { data, error } = await this.sequenceTable().insert(insertRow).select('*').single();
		if (error) {
			const fallback = await this.getSequenceRow(input.userId);
			if (fallback) {
				return fallback;
			}
			throw new Error(`Failed to create welcome sequence: ${error.message}`);
		}

		return data as WelcomeSequenceRow;
	}

	private async loadSequenceSeedState(userId: string): Promise<WelcomeSequenceSeedState | null> {
		const { data, error } = await this.supabase
			.from('users')
			.select('id, created_at')
			.eq('id', userId)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to load welcome sequence seed state: ${error.message}`);
		}

		if (!data?.id || !data.created_at) {
			return null;
		}

		return {
			userId: data.id,
			createdAt: data.created_at
		};
	}

	private async getSequenceRow(userId: string): Promise<WelcomeSequenceRow | null> {
		const { data, error } = await this.sequenceTable()
			.select('*')
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to read welcome sequence: ${error.message}`);
		}

		return (data as WelcomeSequenceRow | null) || null;
	}

	private async updateSequenceRow(
		userId: string,
		updates: Partial<WelcomeSequenceRow>
	): Promise<void> {
		let compatibleUpdates = this.toCompatibleUpdates(updates);
		if (Object.keys(compatibleUpdates).length === 0) {
			return;
		}

		for (;;) {
			const { error } = await this.sequenceTable()
				.update(compatibleUpdates)
				.eq('user_id', userId);
			if (!error) {
				return;
			}

			const schemaChanged =
				this.markLastEvaluatedAtColumnUnavailable(error) ||
				this.markUpdatedAtColumnUnavailable(error);
			if (!schemaChanged) {
				throw new Error(`Failed to update welcome sequence: ${error.message}`);
			}

			compatibleUpdates = this.toCompatibleUpdates(updates);
			if (Object.keys(compatibleUpdates).length === 0) {
				return;
			}
		}
	}

	private resolveImmediateEvaluationTime(startedAt: string): Date {
		const now = new Date();
		const startedAtMs = Date.parse(startedAt);
		if (Number.isNaN(startedAtMs)) {
			return now;
		}

		return new Date(Math.max(now.getTime(), startedAtMs));
	}

	private async safeMarkEvaluated(userId: string, evaluatedAt: string): Promise<void> {
		try {
			await this.updateSequenceRow(userId, {
				last_evaluated_at: evaluatedAt
			});
		} catch (error) {
			console.error('Failed to mark welcome sequence evaluation timestamp:', {
				userId,
				evaluatedAt,
				error
			});
		}
	}

	private async claimStep(
		userId: string,
		step: WelcomeSequenceStep,
		claimedAt: string
	): Promise<boolean> {
		const sentField = stepTimestampField(step, 'sent');
		const skippedField = stepTimestampField(step, 'skipped');
		const claimCutoff = new Date(
			new Date(claimedAt).getTime() - WELCOME_STEP_CLAIM_WINDOW_MS
		).toISOString();

		for (;;) {
			const claimField = this.supportsLastEvaluatedAtColumn
				? 'last_evaluated_at'
				: this.supportsUpdatedAtColumn
					? 'updated_at'
					: null;
			if (!claimField) {
				return this.bestEffortClaimStep(userId, sentField, skippedField);
			}

			const claimPayload =
				claimField === 'last_evaluated_at'
					? { last_evaluated_at: claimedAt }
					: { updated_at: claimedAt };

			const { data, error } = await this.sequenceTable()
				.update(claimPayload)
				.eq('user_id', userId)
				.is(sentField, null)
				.is(skippedField, null)
				.or(`${claimField}.is.null,${claimField}.lt.${claimCutoff}`)
				.select('user_id')
				.maybeSingle();
			if (!error) {
				return Boolean((data as { user_id?: string } | null)?.user_id);
			}

			const schemaChanged =
				this.markLastEvaluatedAtColumnUnavailable(error) ||
				this.markUpdatedAtColumnUnavailable(error);
			if (!schemaChanged) {
				throw new Error(`Failed to claim welcome sequence step: ${error.message}`);
			}
		}
	}

	private async bestEffortClaimStep(
		userId: string,
		sentField: SequenceTimestampKey,
		skippedField: SequenceTimestampKey
	): Promise<boolean> {
		// Legacy tables without either timestamp column cannot support an atomic claim.
		const { data, error } = await this.sequenceTable()
			.select(`user_id, ${sentField}, ${skippedField}`)
			.eq('user_id', userId)
			.maybeSingle();

		if (error) {
			throw new Error(
				`Failed to read welcome sequence for best-effort claim: ${error.message}`
			);
		}

		const row = data as ({ user_id?: string } & Partial<WelcomeSequenceRow>) | null;
		if (!row?.user_id) {
			return false;
		}

		return row[sentField] == null && row[skippedField] == null;
	}

	private async loadUserState(userId: string): Promise<WelcomeSequenceProductState | null> {
		const { data: user, error: userError } = await this.supabase
			.from('users')
			.select(
				'id, email, name, created_at, last_visit, onboarding_completed_at, onboarding_intent, timezone'
			)
			.eq('id', userId)
			.maybeSingle();

		if (userError) {
			throw new Error(`Failed to load welcome user: ${userError.message}`);
		}

		if (!user?.email) {
			return null;
		}

		const actorId = await this.resolveActorIdForUser(userId, user);

		const [
			projectLookup,
			briefPrefsResult,
			notificationPrefsResult,
			smsPrefsResult,
			calendarTokensResult
		] = await Promise.all([
			this.loadWelcomeProjects(userId, actorId),
			this.supabase
				.from('user_brief_preferences')
				.select('is_active')
				.eq('user_id', userId)
				.maybeSingle(),
			this.supabase
				.from('user_notification_preferences')
				.select('should_email_daily_brief, should_sms_daily_brief')
				.eq('user_id', userId)
				.maybeSingle(),
			this.supabase
				.from('user_sms_preferences')
				.select(
					'phone_verified, opted_out, morning_kickoff_enabled, event_reminders_enabled'
				)
				.eq('user_id', userId)
				.maybeSingle(),
			this.supabase
				.from('user_calendar_tokens')
				.select('user_id', { count: 'exact', head: true })
				.eq('user_id', userId)
		]);

		if (briefPrefsResult.error) {
			throw new Error(
				`Failed to load brief preferences for welcome sequence: ${briefPrefsResult.error.message}`
			);
		}
		if (notificationPrefsResult.error) {
			throw new Error(
				`Failed to load notification preferences for welcome sequence: ${notificationPrefsResult.error.message}`
			);
		}
		if (smsPrefsResult.error) {
			throw new Error(
				`Failed to load SMS preferences for welcome sequence: ${smsPrefsResult.error.message}`
			);
		}
		if (calendarTokensResult.error) {
			throw new Error(
				`Failed to load calendar connection for welcome sequence: ${calendarTokensResult.error.message}`
			);
		}

		const briefActive = briefPrefsResult.data?.is_active === true;
		const emailDailyBriefEnabled =
			briefActive && notificationPrefsResult.data?.should_email_daily_brief === true;
		const smsChannelEnabled =
			smsPrefsResult.data?.phone_verified === true &&
			smsPrefsResult.data?.opted_out !== true &&
			(notificationPrefsResult.data?.should_sms_daily_brief === true ||
				smsPrefsResult.data?.morning_kickoff_enabled === true ||
				smsPrefsResult.data?.event_reminders_enabled === true);

		return {
			userId: user.id,
			email: user.email,
			name: user.name,
			createdAt: user.created_at,
			timezone: user.timezone,
			onboardingIntent: user.onboarding_intent,
			onboardingCompleted: Boolean(user.onboarding_completed_at),
			projectCount: projectLookup.count,
			latestProjectId: projectLookup.latestProject?.id ?? null,
			emailDailyBriefEnabled,
			smsChannelEnabled,
			calendarConnected: (calendarTokensResult.count ?? 0) > 0,
			lastVisit: user.last_visit
		};
	}

	private async resolveActorIdForUser(
		userId: string,
		user?: { name?: string | null; email?: string | null } | null
	): Promise<string> {
		const { data: actorId, error: actorError } = await this.supabase.rpc(
			'ensure_actor_for_user',
			{
				p_user_id: userId
			}
		);

		if (!actorError && actorId) {
			return actorId as string;
		}

		let resolvedUser = user ?? null;
		if (!resolvedUser) {
			const { data: fallbackUser, error: fallbackUserError } = await this.supabase
				.from('users')
				.select('name, email')
				.eq('id', userId)
				.maybeSingle();

			if (fallbackUserError) {
				throw new Error(
					`Failed to resolve actor for welcome sequence: ${fallbackUserError.message}`
				);
			}

			resolvedUser = fallbackUser;
		}

		const fallbackName =
			resolvedUser?.name?.trim() || resolvedUser?.email?.trim() || 'BuildOS User';

		const { data: createdActor, error: createdActorError } = await (this.supabase as any)
			.from('onto_actors')
			.upsert(
				{
					user_id: userId,
					kind: 'human',
					name: fallbackName,
					email: resolvedUser?.email ?? null
				},
				{ onConflict: 'user_id' }
			)
			.select('id')
			.single();

		if (createdActorError || !createdActor?.id) {
			throw new Error(
				`Failed to resolve actor for welcome sequence: ${createdActorError?.message || actorError?.message || 'unknown actor error'}`
			);
		}

		return createdActor.id as string;
	}

	private async loadWelcomeProjects(
		userId: string,
		actorId: string
	): Promise<WelcomeProjectLookup> {
		const ownerIds = Array.from(new Set([actorId, userId].filter(Boolean)));
		const projects = new Map<string, { id: string; updated_at: string | null }>();

		for (const ownerId of ownerIds) {
			const { data, error } = await this.supabase
				.from('onto_projects')
				.select('id, updated_at')
				.eq('created_by', ownerId)
				.is('deleted_at', null)
				.order('updated_at', { ascending: false });

			if (error) {
				throw new Error(`Failed to load projects for welcome sequence: ${error.message}`);
			}

			for (const project of data || []) {
				if (!project?.id || projects.has(project.id)) {
					continue;
				}

				projects.set(project.id, {
					id: project.id,
					updated_at: project.updated_at ?? null
				});
			}
		}

		const sortedProjects = Array.from(projects.values()).sort((left, right) => {
			const leftTs = left.updated_at ? Date.parse(left.updated_at) : Number.NEGATIVE_INFINITY;
			const rightTs = right.updated_at
				? Date.parse(right.updated_at)
				: Number.NEGATIVE_INFINITY;
			return rightTs - leftTs;
		});

		return {
			count: sortedProjects.length,
			latestProject: sortedProjects[0] ?? null
		};
	}

	private async hydrateSentStepsFromEmailLogs(
		row: WelcomeSequenceRow
	): Promise<WelcomeSequenceRow> {
		const needsHydration = WELCOME_SEQUENCE_STEPS.some(
			(step) => !row[stepTimestampField(step, 'sent')]
		);
		if (!needsHydration) {
			return row;
		}

		const { data, error } = await this.supabase
			.from('email_logs')
			.select('sent_at, metadata')
			.eq('user_id', row.user_id)
			.eq('status', 'sent')
			.contains('metadata', {
				campaign: 'welcome-sequence'
			});

		if (error || !data?.length) {
			return row;
		}

		const updates: Partial<WelcomeSequenceRow> = {};
		for (const log of data) {
			const metadata = log.metadata as Record<string, unknown> | null;
			const step = metadata?.sequence_step;
			if (
				typeof step !== 'string' ||
				!WELCOME_SEQUENCE_STEPS.includes(step as WelcomeSequenceStep)
			) {
				continue;
			}

			const sentField = stepTimestampField(step as WelcomeSequenceStep, 'sent');
			if (!row[sentField] && !updates[sentField] && typeof log.sent_at === 'string') {
				updates[sentField] = log.sent_at;
			}
		}

		if (Object.keys(updates).length === 0) {
			return row;
		}

		await this.updateSequenceRow(row.user_id, updates);
		return applyRowUpdate(row, updates);
	}

	private async sendStep(
		row: WelcomeSequenceRow,
		progress: WelcomeSequenceProgress,
		state: WelcomeSequenceProductState,
		step: WelcomeSequenceStep,
		branchKey: string,
		now: Date = new Date()
	): Promise<boolean> {
		const nowIso = now.toISOString();
		const claimed = await this.claimStep(row.user_id, step, nowIso);
		if (!claimed) {
			return false;
		}

		const content = buildWelcomeEmailContent(step, progress, state, this.baseUrl);
		const sentField = stepTimestampField(step, 'sent');
		const metadata = {
			category: 'welcome_sequence',
			campaign: 'welcome-sequence',
			campaign_type: 'lifecycle',
			sequence_name: 'buildos-welcome-sequence',
			sequence_step: step,
			sequence_version: WELCOME_SEQUENCE_VERSION,
			branch_key: branchKey,
			cta_label: content.ctaLabel,
			cta_url: content.ctaUrl,
			trigger_source: row.trigger_source,
			signup_method: row.signup_method,
			onboarding_intent: state.onboardingIntent,
			onboarding_completed: state.onboardingCompleted,
			project_count: state.projectCount,
			email_daily_brief_enabled: state.emailDailyBriefEnabled,
			sms_channel_enabled: state.smsChannelEnabled,
			calendar_connected: state.calendarConnected
		};

		const sendResult = await this.emailService.sendEmail({
			to: state.email,
			subject: content.subject,
			body: content.body,
			html: content.html,
			from: 'dj',
			userId: state.userId,
			createdBy: state.userId,
			metadata
		});

		if (!sendResult.success) {
			throw new Error(sendResult.error || `Failed to send ${step}`);
		}

		const updates: Partial<WelcomeSequenceRow> = {
			[sentField]: nowIso,
			last_evaluated_at: nowIso
		} as Partial<WelcomeSequenceRow>;

		if (step === 'email_5') {
			updates.status = 'completed';
			updates.completed_at = nowIso;
		}

		await this.updateSequenceRow(row.user_id, updates);
		return true;
	}
}
