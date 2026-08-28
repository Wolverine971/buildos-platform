import { describe, expect, it } from 'vitest';
import type { TurnContract } from '@buildos/agentic-chat-runtime/loop';
import { compileApprovedSingleTaskScheduleMutation } from '../src/workers/agentic-chat/provider/review/contract-mutation-compiler';

const TASK_ID = '41000000-0000-4000-8000-000000000041';

function contract(overrides: Partial<TurnContract['outcomes'][number]> = {}): TurnContract {
	return {
		version: 1,
		source: 'declared',
		outcomes: [
			{
				id: 'outcome_1',
				action: 'update',
				entityKind: 'task',
				targetIds: [TASK_ID],
				requiredFields: ['due_at'],
				changes: [{ field: 'due_at', value: '2026-09-04T17:00:00-04:00' }],
				minimumSuccessfulEffects: 1,
				...overrides
			}
		]
	};
}

describe('compileApprovedSingleTaskScheduleMutation', () => {
	it('compiles one exact timestamp change into a stable update call', () => {
		const first = compileApprovedSingleTaskScheduleMutation(contract());
		const second = compileApprovedSingleTaskScheduleMutation(contract());

		expect(first).toEqual(second);
		expect(first).toMatchObject({
			id: expect.stringMatching(/^contract-compiled-task-schedule:[0-9a-f]{64}$/),
			name: 'update_onto_task',
			arguments: {
				task_id: TASK_ID,
				due_at: '2026-09-04T17:00:00-04:00'
			}
		});
		expect(first?.canonicalArguments).toBe(
			`{"due_at":"2026-09-04T17:00:00-04:00","task_id":"${TASK_ID}"}`
		);
	});

	it.each([
		['multiple targets', { targetIds: [TASK_ID, '41000000-0000-4000-8000-000000000042'] }],
		['noncanonical target', { targetIds: ['task-41'] }],
		[
			'free-text change',
			{ requiredFields: ['title'], changes: [{ field: 'title', value: 'Friday' }] }
		],
		['missing change', { changes: undefined }],
		['extra required field', { requiredFields: ['due_at', 'title'] }],
		['non-RFC3339 timestamp', { changes: [{ field: 'due_at', value: 'next Friday' }] }],
		[
			'impossible calendar timestamp',
			{ changes: [{ field: 'due_at', value: '2026-02-30T12:00:00Z' }] }
		],
		['multiple effects', { minimumSuccessfulEffects: 2 }],
		['unsupported scheduling action', { action: 'schedule' as const }],
		['unsupported completion action', { action: 'complete' as const }]
	] as const)('declines %s and leaves the acting path unchanged', (_label, overrides) => {
		expect(
			compileApprovedSingleTaskScheduleMutation(
				contract(overrides as Partial<TurnContract['outcomes'][number]>)
			)
		).toBeNull();
	});
});
