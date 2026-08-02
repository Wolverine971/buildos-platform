// apps/web/src/lib/services/agentic-chat-v2/turn-run-conflicts.test.ts
import { describe, expect, it } from 'vitest';
import {
	isActiveTurnUniqueViolation,
	isPostgresUniqueViolation,
	isRunningTurnUniqueViolation
} from './turn-run-conflicts';

describe('turn run conflict classification', () => {
	it('recognizes the running-turn partial unique index as expected contention', () => {
		expect(
			isRunningTurnUniqueViolation({
				code: '23505',
				message:
					'duplicate key value violates unique constraint "uq_chat_turn_runs_one_running_per_session"'
			})
		).toBe(true);
	});

	it('checks the constraint field when Supabase exposes it separately', () => {
		expect(
			isRunningTurnUniqueViolation({
				code: '23505',
				constraint: 'uq_chat_turn_runs_one_running_per_session'
			})
		).toBe(true);
	});

	it('recognizes the queued/running replacement index during rollout', () => {
		const error = {
			code: '23505',
			constraint: 'uq_chat_turn_runs_one_active_per_session'
		};

		expect(isActiveTurnUniqueViolation(error)).toBe(true);
		expect(isRunningTurnUniqueViolation(error)).toBe(true);
	});

	it('does not treat unrelated unique violations as active turn conflicts', () => {
		expect(
			isPostgresUniqueViolation({
				code: '23505',
				message:
					'duplicate key value violates unique constraint "uq_chat_turn_runs_stream_run_id"'
			})
		).toBe(true);
		expect(
			isRunningTurnUniqueViolation({
				code: '23505',
				message:
					'duplicate key value violates unique constraint "uq_chat_turn_runs_stream_run_id"'
			})
		).toBe(false);
	});

	it('ignores non-unique database errors', () => {
		expect(
			isRunningTurnUniqueViolation({
				code: '23503',
				message: 'insert or update on table violates foreign key constraint'
			})
		).toBe(false);
	});
});
