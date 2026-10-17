// apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.test.ts
import { describe, expect, it } from 'vitest';
import {
	boundLastTurnContext,
	buildLastTurnContext,
	LAST_TURN_CONTEXT_MAX_CHARS
} from '@buildos/agentic-chat-runtime/context';
import { workerAdmissionRequestSchema } from './worker-admission-schema';
import { parseJsonRequest } from '$lib/utils/request-validation';

const tasks = Array.from({ length: 200 }, (_, i) => ({
	id: `da000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
	name: `Task ${i}`,
	description: 'D'.repeat(140)
}));
const legacyContext = {
	summary: 'Reviewed the inventory.',
	context_type: 'global',
	data_accessed: ['list_onto_tasks'],
	timestamp: '2026-10-16T20:46:33.791692+00:00',
	entities: { tasks, task_ids: tasks.map(({ id }) => id) }
};
const body = (lastTurnContext: unknown) => ({
	clientTurnId: 'client',
	streamRunId: 'stream',
	message: 'Continue the research.',
	context: { type: 'global', entityId: null, projectId: null },
	lastTurnContext
});

describe('worker admission continuity recovery', () => {
	it('accepts a previously issued oversized packet without changing the user message', async () => {
		expect(JSON.stringify(legacyContext).length).toBeGreaterThan(LAST_TURN_CONTEXT_MAX_CHARS);
		const parsed = await parseJsonRequest(
			new Request('http://localhost/api/agent/v2/turns', {
				method: 'POST',
				body: JSON.stringify(body(legacyContext))
			}),
			workerAdmissionRequestSchema,
			{ invalidBodyMessage: 'Invalid worker turn request' }
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error('Expected the follow-up to be admitted');
		expect(parsed.data.message).toBe('Continue the research.');
		expect(parsed.data.lastTurnContext).toEqual(boundLastTurnContext(legacyContext));
		expect(
			(parsed.data.lastTurnContext?.entities as typeof legacyContext.entities).tasks
		).toHaveLength(200);
	});

	it('round-trips current worker output through the JSON request boundary', () => {
		const context = buildLastTurnContext({
			assistantText: 'Reviewed the inventory.',
			userMessage: 'Research the tasks.',
			contextType: 'global',
			timestamp: '2026-10-16T20:46:33.791692+00:00',
			toolExecutions: [
				{
					toolCall: {
						id: 'read',
						type: 'function',
						function: { name: 'list_onto_tasks', arguments: '{}' }
					},
					result: { tool_call_id: 'read', success: true, result: { tasks } }
				}
			]
		});
		const parsed = workerAdmissionRequestSchema.parse(
			JSON.parse(JSON.stringify(body(context)))
		);
		expect(parsed.lastTurnContext).toEqual(context);
	});

	it('discards unrepairable optional recall while preserving ordinary validation', () => {
		expect(
			workerAdmissionRequestSchema.parse(body({ summary: 'x'.repeat(40_000) }))
				.lastTurnContext
		).toBeNull();
		expect(
			workerAdmissionRequestSchema.safeParse({
				...body(legacyContext),
				message: 'x'.repeat(100_001)
			}).success
		).toBe(false);
		expect(workerAdmissionRequestSchema.safeParse(body([])).success).toBe(false);
	});
});
