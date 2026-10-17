// apps/web/src/routes/api/agent/v2/turns/worker-admission-schema.test.ts
import { describe, expect, it } from 'vitest';
import { workerAdmissionRequestSchema } from './worker-admission-schema';
import { parseJsonRequest } from '$lib/utils/request-validation';

const tasks = Array.from({ length: 200 }, (_, i) => ({
	id: `da000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
	name: `Task ${i}`,
	description: 'D'.repeat(140)
}));
// What an open tab from before server-side continuity may still send: the
// 2026-10-16 Cadre packet was 35,671 characters and blocked the next message.
const oversizedClientPacket = {
	summary: 'Reviewed the inventory.',
	context_type: 'global',
	data_accessed: ['list_onto_tasks'],
	timestamp: '2026-10-16T20:46:33.791692+00:00',
	entities: { tasks, task_ids: tasks.map(({ id }) => id) }
};
const body = (lastTurnContext?: unknown) => ({
	clientTurnId: 'client',
	streamRunId: 'stream',
	message: 'Continue the research.',
	context: { type: 'global', entityId: null, projectId: null },
	...(lastTurnContext === undefined ? {} : { lastTurnContext })
});

describe('worker admission ignores client-carried continuity', () => {
	it('admits a message carrying an oversized legacy packet and drops the packet', async () => {
		expect(JSON.stringify(oversizedClientPacket).length).toBeGreaterThan(32 * 1024);
		const parsed = await parseJsonRequest(
			new Request('http://localhost/api/agent/v2/turns', {
				method: 'POST',
				body: JSON.stringify(body(oversizedClientPacket))
			}),
			workerAdmissionRequestSchema,
			{ invalidBodyMessage: 'Invalid worker turn request' }
		);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) throw new Error('Expected the follow-up to be admitted');
		expect(parsed.data.message).toBe('Continue the research.');
		expect(parsed.data.lastTurnContext).toBeUndefined();
	});

	it('drops any shape of client packet, and admits requests without one', () => {
		for (const value of [null, [], 'text', { summary: 'x'.repeat(40_000) }]) {
			const parsed = workerAdmissionRequestSchema.safeParse(body(value));
			expect(parsed.success).toBe(true);
			expect(parsed.success && parsed.data.lastTurnContext).toBeUndefined();
		}
		expect(workerAdmissionRequestSchema.safeParse(body()).success).toBe(true);
	});

	it('still validates the actual user message', () => {
		expect(
			workerAdmissionRequestSchema.safeParse({
				...body(oversizedClientPacket),
				message: 'x'.repeat(100_001)
			}).success
		).toBe(false);
	});
});
