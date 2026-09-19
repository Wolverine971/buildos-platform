// apps/web/src/lib/components/agent/agent-chat-workflow.test.ts
import { describe, expect, it } from 'vitest';
import { readDurableChatWorkflowProgress, workflowMessageTurnId } from './agent-chat-workflow';
import { workflowProjectionFixture } from './agent-chat-workflow.fixture';

describe('durable chat workflow reader', () => {
	it('accepts the shared projection shape', () => {
		const projection = workflowProjectionFixture();
		expect(readDurableChatWorkflowProgress(projection)).toEqual(projection);
	});

	it('copies only public projection fields at every nesting level', () => {
		const projection = workflowProjectionFixture();
		projection.steps[1]!.acceptedFinding = {
			summary: 'The venue needs confirming.',
			evidence: [{ kind: 'project_record', id: 'task-1', version: 'v1', label: 'Venue task' }]
		};
		const stored = structuredClone(projection) as any;
		stored.rawContext = 'private context';
		stored.steps[0].assignment = 'private assignment';
		stored.steps[1].acceptedFinding.rawResponse = 'private response';
		stored.steps[1].acceptedFinding.evidence[0].record = 'private full record';
		stored.answer.privateReasoning = 'private reasoning';
		stored.transport.processingToken = 'private token';
		stored.transport.providerActivity.request = 'private request';
		stored.transport.delivery.authToken = 'private delivery token';
		const publicProjection = readDurableChatWorkflowProgress(stored);
		expect(publicProjection).toEqual(projection);
		expect(JSON.stringify(publicProjection)).not.toContain('private');
		expect(stored.steps[0].assignment).toBe('private assignment');
	});

	it.each([
		{ phase: 'imagined' },
		{ terminalOutcome: 'success' },
		{ steps: [] },
		{ answer: { status: 'accepted' } },
		{ transport: {} },
		{
			steps: [
				{
					...workflowProjectionFixture().steps[0],
					acceptedFinding: { summary: 'Unsafe shape', evidence: 'not-an-array' }
				},
				...workflowProjectionFixture().steps.slice(1)
			]
		}
	])('rejects malformed projections without crashing restore', (overrides) => {
		expect(
			readDurableChatWorkflowProgress({ ...workflowProjectionFixture(), ...overrides })
		).toBeNull();
	});

	it('uses only a validated admission identity for user rows without an answer', () => {
		const id = 'd4000000-0000-4000-8000-000000000001';
		expect(
			workflowMessageTurnId({
				review_intent: 'project_review',
				idempotency_key: `chat-turn:${id}:user`
			})
		).toBe(id);
		expect(
			workflowMessageTurnId({
				review_intent: 'project_review',
				idempotency_key: 'chat-turn:bad-id:user'
			})
		).toBeNull();
		expect(workflowMessageTurnId({ idempotency_key: `chat-turn:${id}:user` })).toBeNull();
	});
});
