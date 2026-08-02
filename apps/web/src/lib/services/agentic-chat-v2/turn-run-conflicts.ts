// apps/web/src/lib/services/agentic-chat-v2/turn-run-conflicts.ts
const ACTIVE_TURN_CONSTRAINTS = [
	'uq_chat_turn_runs_one_running_per_session',
	'uq_chat_turn_runs_one_active_per_session'
] as const;

function readErrorField(error: unknown, field: string): string | null {
	if (!error || typeof error !== 'object') return null;
	const value = (error as Record<string, unknown>)[field];
	return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function collectPostgresErrorText(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return typeof error === 'string' ? error : '';
	}

	return [
		readErrorField(error, 'constraint'),
		readErrorField(error, 'message'),
		readErrorField(error, 'details'),
		readErrorField(error, 'hint')
	]
		.filter((value): value is string => Boolean(value))
		.join(' ')
		.toLowerCase();
}

export function isPostgresUniqueViolation(error: unknown): boolean {
	const code = readErrorField(error, 'code');
	const errorText = collectPostgresErrorText(error);
	return code === '23505' || errorText.includes('duplicate key');
}

export function isRunningTurnUniqueViolation(error: unknown): boolean {
	return isActiveTurnUniqueViolation(error);
}

/**
 * Recognize either index name during the create-new-then-drop-old rollout.
 * The legacy export above remains as a compatibility alias for older callers.
 */
export function isActiveTurnUniqueViolation(error: unknown): boolean {
	if (!isPostgresUniqueViolation(error)) return false;
	const errorText = collectPostgresErrorText(error);
	return ACTIVE_TURN_CONSTRAINTS.some((constraint) => errorText.includes(constraint));
}
