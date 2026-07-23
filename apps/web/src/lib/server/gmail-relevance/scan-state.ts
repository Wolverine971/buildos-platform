// apps/web/src/lib/server/gmail-relevance/scan-state.ts

export const EMAIL_RELEVANCE_SCAN_RUN_STATES = [
	'pending',
	'running',
	'paused',
	'completed',
	'partial',
	'cancelled',
	'quota_stopped',
	'failed',
	'expired'
] as const;

export const EMAIL_RELEVANCE_SCAN_CONNECTION_STATES = [
	'pending',
	'leased',
	'retry_wait',
	'completed',
	'cancelled',
	'quota_stopped',
	'failed',
	'expired'
] as const;

export const EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES = [
	'invalid_manifest',
	'phase_a_disabled',
	'user_not_allowed',
	'ownership_mismatch',
	'connection_unavailable',
	'profile_unavailable',
	'idempotency_conflict',
	'manifest_expired',
	'paused',
	'cancelled',
	'lease_conflict',
	'lease_expired',
	'stale_checkpoint',
	'stale_processing_token',
	'policy_unavailable',
	'accounting_unavailable',
	'budget_exceeded',
	'settlement_conflict',
	'synthetic_retryable',
	'retry_exhausted',
	'connection_disconnected',
	'project_unavailable',
	'internal_error'
] as const;

export const EMAIL_RELEVANCE_SCAN_RETRYABLE_ERROR_CODES = ['synthetic_retryable'] as const;

export type EmailRelevanceScanRunState = (typeof EMAIL_RELEVANCE_SCAN_RUN_STATES)[number];
export type EmailRelevanceScanConnectionState =
	(typeof EMAIL_RELEVANCE_SCAN_CONNECTION_STATES)[number];
export type EmailRelevanceScanSafeErrorCode =
	(typeof EMAIL_RELEVANCE_SCAN_SAFE_ERROR_CODES)[number];

export const EMAIL_RELEVANCE_SCAN_RUN_TERMINAL_STATES = [
	'completed',
	'partial',
	'cancelled',
	'quota_stopped',
	'failed',
	'expired'
] as const satisfies readonly EmailRelevanceScanRunState[];

export const EMAIL_RELEVANCE_SCAN_CONNECTION_TERMINAL_STATES = [
	'completed',
	'cancelled',
	'quota_stopped',
	'failed',
	'expired'
] as const satisfies readonly EmailRelevanceScanConnectionState[];

const RUN_TERMINAL_STATE_SET = new Set<EmailRelevanceScanRunState>(
	EMAIL_RELEVANCE_SCAN_RUN_TERMINAL_STATES
);
const CONNECTION_TERMINAL_STATE_SET = new Set<EmailRelevanceScanConnectionState>(
	EMAIL_RELEVANCE_SCAN_CONNECTION_TERMINAL_STATES
);

const RUN_TRANSITIONS: Record<EmailRelevanceScanRunState, Set<EmailRelevanceScanRunState>> = {
	pending: new Set(['running', 'cancelled', 'quota_stopped', 'failed', 'expired']),
	running: new Set([
		'paused',
		'completed',
		'partial',
		'cancelled',
		'quota_stopped',
		'failed',
		'expired'
	]),
	paused: new Set([
		'running',
		'completed',
		'partial',
		'cancelled',
		'quota_stopped',
		'failed',
		'expired'
	]),
	completed: new Set(),
	partial: new Set(),
	cancelled: new Set(),
	quota_stopped: new Set(),
	failed: new Set(),
	expired: new Set()
};

const CONNECTION_TRANSITIONS: Record<
	EmailRelevanceScanConnectionState,
	Set<EmailRelevanceScanConnectionState>
> = {
	pending: new Set(['leased', 'cancelled', 'quota_stopped', 'failed', 'expired']),
	leased: new Set([
		'pending',
		'retry_wait',
		'completed',
		'cancelled',
		'quota_stopped',
		'failed',
		'expired'
	]),
	retry_wait: new Set(['leased', 'cancelled', 'quota_stopped', 'failed', 'expired']),
	completed: new Set(),
	cancelled: new Set(),
	quota_stopped: new Set(),
	failed: new Set(),
	expired: new Set()
};

export function isEmailRelevanceScanRunTerminal(state: EmailRelevanceScanRunState): boolean {
	return RUN_TERMINAL_STATE_SET.has(state);
}

export function isEmailRelevanceScanConnectionTerminal(
	state: EmailRelevanceScanConnectionState
): boolean {
	return CONNECTION_TERMINAL_STATE_SET.has(state);
}

export function canTransitionEmailRelevanceScanRun(
	from: EmailRelevanceScanRunState,
	to: EmailRelevanceScanRunState
): boolean {
	return RUN_TRANSITIONS[from].has(to);
}

export function canTransitionEmailRelevanceScanConnection(
	from: EmailRelevanceScanConnectionState,
	to: EmailRelevanceScanConnectionState
): boolean {
	return CONNECTION_TRANSITIONS[from].has(to);
}

export function deriveEmailRelevanceScanRunState(input: {
	current_state: 'pending' | 'running' | 'paused';
	connection_states: EmailRelevanceScanConnectionState[];
	pause_requested: boolean;
	cancel_requested: boolean;
	manifest_expired: boolean;
}): EmailRelevanceScanRunState {
	if (input.connection_states.length === 0) {
		return 'failed';
	}

	const completedCount = input.connection_states.filter((state) => state === 'completed').length;
	const allTerminal = input.connection_states.every(isEmailRelevanceScanConnectionTerminal);

	if (allTerminal) {
		if (completedCount === input.connection_states.length) return 'completed';
		if (completedCount > 0) return 'partial';
		if (
			input.cancel_requested ||
			input.connection_states.every((state) => state === 'cancelled')
		) {
			return 'cancelled';
		}
		if (
			input.manifest_expired ||
			input.connection_states.some((state) => state === 'expired')
		) {
			return 'expired';
		}
		if (input.connection_states.some((state) => state === 'quota_stopped')) {
			return 'quota_stopped';
		}
		if (input.connection_states.some((state) => state === 'failed')) {
			return 'failed';
		}
		return 'cancelled';
	}

	if (input.pause_requested && input.current_state !== 'pending') return 'paused';
	if (
		input.current_state !== 'pending' ||
		input.connection_states.some((state) => state === 'leased' || state === 'retry_wait')
	) {
		return 'running';
	}
	return 'pending';
}

export function nextEmailRelevanceScanFailureState(input: {
	error_code: EmailRelevanceScanSafeErrorCode;
	attempt: number;
	max_attempts: number;
}): 'retry_wait' | 'failed' | 'pending' | 'no_op' {
	if (
		input.error_code === 'stale_checkpoint' ||
		input.error_code === 'stale_processing_token' ||
		input.error_code === 'lease_conflict'
	) {
		return 'no_op';
	}
	if (input.error_code === 'lease_expired') {
		return 'pending';
	}
	const retryable = (
		EMAIL_RELEVANCE_SCAN_RETRYABLE_ERROR_CODES as readonly EmailRelevanceScanSafeErrorCode[]
	).includes(input.error_code);
	return retryable && input.attempt < input.max_attempts ? 'retry_wait' : 'failed';
}
