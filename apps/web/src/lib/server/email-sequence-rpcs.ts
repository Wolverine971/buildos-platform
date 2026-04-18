// apps/web/src/lib/server/email-sequence-rpcs.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import {
	WELCOME_SEQUENCE_STEPS,
	WELCOME_SEQUENCE_VERSION,
	type WelcomeSequenceStep
} from './welcome-sequence.logic';

type TypedSupabaseClient = SupabaseClient<Database>;
type LegacyWelcomeSequenceStatus = 'active' | 'completed' | 'cancelled';
export type EmailSequenceEnrollmentStatus =
	| 'active'
	| 'processing'
	| 'paused'
	| 'completed'
	| 'exited'
	| 'errored'
	| 'cancelled';

export const BUILDOS_WELCOME_SEQUENCE_KEY = 'buildos_welcome';

export interface LegacyWelcomeSequenceRowForMirror {
	user_id: string;
	sequence_version: string;
	trigger_source: string;
	signup_method: string;
	started_at: string;
	status: LegacyWelcomeSequenceStatus;
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

export interface EnrollUserInEmailSequenceInput {
	userId: string;
	sequenceKey: string;
	recipientEmail: string;
	signupMethod?: string;
	triggerSource?: string;
	metadata?: Record<string, unknown>;
}

export interface EmailSequenceEnrollment {
	id: string;
	sequence_id: string;
	user_id: string;
	recipient_email: string;
	status: EmailSequenceEnrollmentStatus;
	current_step_number: number;
	next_step_number: number | null;
	next_send_at: string | null;
	last_sent_at: string | null;
	last_email_id: string | null;
	processing_started_at: string | null;
	failure_count: number;
	exit_reason: string | null;
	last_error: string | null;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

interface EmailSequenceRow {
	id: string;
	key?: string;
	metadata?: Record<string, unknown> | null;
}

export type LegacyWelcomeSequenceMirrorPayload = ReturnType<
	typeof buildLegacyWelcomeSequenceMirrorPayload
>;

const STEP_NUMBERS: Record<WelcomeSequenceStep, number> = {
	email_1: 1,
	email_2: 2,
	email_3: 3,
	email_4: 4,
	email_5: 5
};

const STEP_DAY_OFFSETS: Record<WelcomeSequenceStep, number> = {
	email_1: 0,
	email_2: 1,
	email_3: 3,
	email_4: 6,
	email_5: 9
};

function normalizeEmail(email: string): string | null {
	const normalized = email.trim().toLowerCase();
	return normalized || null;
}

function stepTimestampField(
	step: WelcomeSequenceStep,
	outcome: 'sent' | 'skipped'
): keyof LegacyWelcomeSequenceRowForMirror {
	return `${step}_${outcome}_at` as keyof LegacyWelcomeSequenceRowForMirror;
}

function addDaysIso(startedAt: string, days: number): string | null {
	const startedAtMs = Date.parse(startedAt);
	if (Number.isNaN(startedAtMs)) {
		return null;
	}

	const nextSendAt = new Date(startedAtMs);
	nextSendAt.setUTCDate(nextSendAt.getUTCDate() + days);
	return nextSendAt.toISOString();
}

function latestIsoTimestamp(values: Array<string | null | undefined>): string | null {
	let latest: string | null = null;
	let latestMs = Number.NEGATIVE_INFINITY;

	for (const value of values) {
		if (!value) {
			continue;
		}

		const parsed = Date.parse(value);
		if (Number.isNaN(parsed) || parsed <= latestMs) {
			continue;
		}

		latest = value;
		latestMs = parsed;
	}

	return latest;
}

function getFinalizedStepNumber(row: LegacyWelcomeSequenceRowForMirror): number {
	let finalizedStepNumber = 0;
	for (const step of WELCOME_SEQUENCE_STEPS) {
		if (row[stepTimestampField(step, 'sent')] || row[stepTimestampField(step, 'skipped')]) {
			finalizedStepNumber = STEP_NUMBERS[step];
		}
	}

	return finalizedStepNumber;
}

function getNextStep(row: LegacyWelcomeSequenceRowForMirror): WelcomeSequenceStep | null {
	if (row.status !== 'active') {
		return null;
	}

	for (const step of WELCOME_SEQUENCE_STEPS) {
		if (!row[stepTimestampField(step, 'sent')] && !row[stepTimestampField(step, 'skipped')]) {
			return step;
		}
	}

	return null;
}

function mapLegacyStatus(
	row: LegacyWelcomeSequenceRowForMirror,
	nextStep: WelcomeSequenceStep | null
): EmailSequenceEnrollmentStatus {
	if (row.status === 'completed') {
		return 'completed';
	}

	if (row.status === 'cancelled') {
		return 'cancelled';
	}

	return nextStep ? 'active' : 'completed';
}

function exitReasonForLegacyStatus(
	row: LegacyWelcomeSequenceRowForMirror,
	status: EmailSequenceEnrollmentStatus
): string | null {
	if (status === 'completed') {
		return 'completed';
	}

	if (status === 'cancelled') {
		return row.email_1_sent_at ? 'cancelled' : 'pre_system_user';
	}

	return null;
}

export function buildLegacyWelcomeSequenceMirrorPayload(
	row: LegacyWelcomeSequenceRowForMirror,
	recipientEmail: string,
	sequenceId: string
) {
	const normalizedEmail = normalizeEmail(recipientEmail);
	if (!normalizedEmail) {
		return null;
	}

	const nextStep = getNextStep(row);
	const nextStepNumber = nextStep ? STEP_NUMBERS[nextStep] : null;
	const status = mapLegacyStatus(row, nextStep);
	const sentTimestamps = WELCOME_SEQUENCE_STEPS.map(
		(step) => row[stepTimestampField(step, 'sent')] as string | null
	);

	return {
		sequence_id: sequenceId,
		user_id: row.user_id,
		recipient_email: normalizedEmail,
		status,
		current_step_number: getFinalizedStepNumber(row),
		next_step_number: status === 'active' ? nextStepNumber : null,
		next_send_at:
			status === 'active' && nextStep
				? addDaysIso(row.started_at, STEP_DAY_OFFSETS[nextStep])
				: null,
		last_sent_at: latestIsoTimestamp(sentTimestamps),
		last_email_id: null,
		processing_started_at: null,
		failure_count: 0,
		exit_reason: exitReasonForLegacyStatus(row, status),
		last_error: null,
		metadata: {
			legacy_table: 'welcome_email_sequences',
			legacy_sequence_version: row.sequence_version,
			legacy_status: row.status,
			sequence_version: WELCOME_SEQUENCE_VERSION,
			trigger_source: row.trigger_source,
			signup_method: row.signup_method,
			started_at: row.started_at,
			last_evaluated_at: row.last_evaluated_at ?? null,
			completed_at: row.completed_at,
			legacy_updated_at: row.updated_at ?? null
		},
		created_at: row.created_at,
		updated_at: row.updated_at ?? row.last_evaluated_at ?? row.completed_at ?? row.created_at
	};
}

export class EmailSequenceRpcClient {
	constructor(private readonly supabase: TypedSupabaseClient) {}

	async enrollUserInEmailSequence(
		input: EnrollUserInEmailSequenceInput
	): Promise<EmailSequenceEnrollment | null> {
		const normalizedEmail = normalizeEmail(input.recipientEmail);
		if (!normalizedEmail) {
			return null;
		}

		const { data, error } = await (this.supabase as any).rpc('enroll_user_in_email_sequence', {
			p_user_id: input.userId,
			p_sequence_key: input.sequenceKey,
			p_recipient_email: normalizedEmail,
			p_signup_method: input.signupMethod || 'unknown',
			p_trigger_source: input.triggerSource || 'account_created',
			p_metadata: input.metadata || {}
		});

		if (error) {
			throw new Error(`Failed to enroll user in email sequence: ${error.message}`);
		}

		return (data as EmailSequenceEnrollment | null) ?? null;
	}

	async claimPendingEmailSequenceSends(
		sequenceKey: string,
		limit = 50
	): Promise<EmailSequenceEnrollment[]> {
		return (
			(await this.callRpc<EmailSequenceEnrollment[]>('claim_pending_email_sequence_sends', {
				p_sequence_key: sequenceKey,
				p_limit: limit
			})) ?? []
		);
	}

	async claimSpecificEmailSequenceSend(
		enrollmentId: string
	): Promise<EmailSequenceEnrollment | null> {
		return await this.callRpc<EmailSequenceEnrollment | null>(
			'claim_specific_email_sequence_send',
			{
				p_enrollment_id: enrollmentId
			}
		);
	}

	async completeEmailSequenceSend(input: {
		enrollmentId: string;
		emailId?: string | null;
		branchKey?: string | null;
		metadata?: Record<string, unknown>;
	}): Promise<EmailSequenceEnrollment> {
		return await this.callRpc<EmailSequenceEnrollment>('complete_email_sequence_send', {
			p_enrollment_id: input.enrollmentId,
			p_email_id: input.emailId ?? null,
			p_branch_key: input.branchKey ?? null,
			p_metadata: input.metadata ?? {}
		});
	}

	async skipEmailSequenceStep(input: {
		enrollmentId: string;
		branchKey?: string | null;
		reason?: string;
		metadata?: Record<string, unknown>;
	}): Promise<EmailSequenceEnrollment> {
		return await this.callRpc<EmailSequenceEnrollment>('skip_email_sequence_step', {
			p_enrollment_id: input.enrollmentId,
			p_branch_key: input.branchKey ?? null,
			p_reason: input.reason ?? 'skipped',
			p_metadata: input.metadata ?? {}
		});
	}

	async deferEmailSequenceStep(input: {
		enrollmentId: string;
		nextSendAt: string;
		reason?: string;
	}): Promise<EmailSequenceEnrollment> {
		return await this.callRpc<EmailSequenceEnrollment>('defer_email_sequence_step', {
			p_enrollment_id: input.enrollmentId,
			p_next_send_at: input.nextSendAt,
			p_reason: input.reason ?? 'deferred'
		});
	}

	async retryOrFailEmailSequenceSend(
		enrollmentId: string,
		errorMessage: string
	): Promise<EmailSequenceEnrollment> {
		return await this.callRpc<EmailSequenceEnrollment>('retry_or_fail_email_sequence_send', {
			p_enrollment_id: enrollmentId,
			p_error: errorMessage
		});
	}

	async exitUserFromEmailSequence(input: {
		userId: string;
		sequenceKey: string;
		reason?: string;
	}): Promise<number> {
		return await this.callRpc<number>('exit_user_from_email_sequence', {
			p_user_id: input.userId,
			p_sequence_key: input.sequenceKey,
			p_reason: input.reason ?? 'manual'
		});
	}

	async exitEmailFromEmailSequence(input: {
		email: string;
		sequenceKey: string;
		reason?: string;
	}): Promise<number> {
		const normalizedEmail = normalizeEmail(input.email);
		if (!normalizedEmail) {
			return 0;
		}

		return await this.callRpc<number>('exit_email_from_email_sequence', {
			p_email: normalizedEmail,
			p_sequence_key: input.sequenceKey,
			p_reason: input.reason ?? 'suppressed'
		});
	}

	async adminSendNextStepNow(enrollmentId: string): Promise<EmailSequenceEnrollment | null> {
		return await this.callRpc<EmailSequenceEnrollment | null>('admin_send_next_step_now', {
			p_enrollment_id: enrollmentId
		});
	}

	async mirrorLegacyWelcomeSequence(
		row: LegacyWelcomeSequenceRowForMirror,
		recipientEmail: string,
		sequenceKey = BUILDOS_WELCOME_SEQUENCE_KEY
	): Promise<unknown | null> {
		const normalizedEmail = normalizeEmail(recipientEmail);
		if (!normalizedEmail) {
			return null;
		}

		const sequence = await this.getSequence(sequenceKey);
		if (!sequence) {
			return null;
		}

		const payload = buildLegacyWelcomeSequenceMirrorPayload(row, normalizedEmail, sequence.id);
		if (!payload) {
			return null;
		}

		const { data, error } = await (this.supabase as any)
			.from('email_sequence_enrollments')
			.upsert(payload, { onConflict: 'sequence_id,user_id' })
			.select('*')
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to mirror legacy welcome sequence: ${error.message}`);
		}

		return data ?? null;
	}

	private async getSequence(sequenceKey: string): Promise<EmailSequenceRow | null> {
		const { data, error } = await (this.supabase as any)
			.from('email_sequences')
			.select('id, key, metadata')
			.eq('key', sequenceKey)
			.maybeSingle();

		if (error) {
			throw new Error(`Failed to load email sequence ${sequenceKey}: ${error.message}`);
		}

		return (data as EmailSequenceRow | null) || null;
	}

	private async callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
		const { data, error } = await (this.supabase as any).rpc(fn, args);
		if (error) {
			throw new Error(`Email sequence RPC ${fn} failed: ${error.message}`);
		}

		return data as T;
	}
}
