// apps/web/src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loginAndGetCookie } from './harness/auth';
import { provisionTestUser } from './harness/test-user';
import { createAgenticE2EWorkerClient } from './harness/worker-client';
import { seedCedarHouse } from './scenarios/cedar-house/fixture';
import { readChatWorkflowProgress } from '@buildos/shared-types';

describe.runIf(process.env.WORKFLOW_PROTOTYPE_SMOKE === 'true')('live workflow prototype', () => {
	it('queues a real review, publishes all five steps, and leaves project records unchanged', async () => {
		if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
			throw new Error('Isolated database required');
		const baseUrl = process.env.AGENTIC_E2E_BASE_URL!;
		const email = process.env.AGENTIC_TEST_USER_EMAIL!;
		const password = process.env.AGENTIC_TEST_USER_PASSWORD!;
		const { userId, cookie } = await loginAndGetCookie({ baseUrl, email, password });
		const db = await provisionTestUser({ userId, email });
		const seed = await seedCedarHouse(
			{ baseUrl, cookie, db, executionMode: 'worker_realtime' },
			{
				name: 'Workflow lab · Cedar House demo',
				tasks: 'all',
				brief: true
			}
		);
		const projectId = seed.projectId;
		async function snapshot() {
			const tables = [
				'onto_tasks',
				'onto_documents',
				'onto_goals',
				'onto_plans',
				'onto_risks',
				'onto_milestones',
				'onto_events',
				'onto_edges'
			] as const;
			const rows = await Promise.all(
				tables.map(async (table) => {
					const { data, error } = await db.admin
						.from(table)
						.select('*')
						.eq('project_id', projectId)
						.order('id');
					if (error) throw error;
					return [table, data];
				})
			);
			const { data, error } = await db.admin
				.from('onto_projects')
				.select('*')
				.eq('id', projectId)
				.single();
			if (error) throw error;
			return { project: data, rows };
		}
		const before = await snapshot();
		const client = await createAgenticE2EWorkerClient({
			baseUrl,
			cookie,
			email,
			password,
			userId,
			admin: db.admin
		});
		try {
			const result = await client.runTurn({
				contextType: 'project',
				entityId: projectId,
				message:
					'/workflow What should we prioritize next? Have the analyst recommend the next steps and the reviewer challenge assumptions about permits and the budget. Give me one combined recommendation.'
			});
			const states = result.rawEvents
				.map((event) => readChatWorkflowProgress(event.workflow))
				.filter((value) => value !== null);
			const answerCompleteEvent = result.rawEvents.find(
				(event) =>
					readChatWorkflowProgress(event.workflow)?.steps[4]?.status === 'completed'
			);
			const answerCompleteMs = result.eventTimings.find(
				(event) => event.sequenceIndex === answerCompleteEvent?.sequence_index
			)?.observedMs;
			const after = await snapshot();
			const { data: savedMessages, error: savedError } = await db.admin
				.from('chat_messages')
				.select('metadata')
				.eq('session_id', result.sessionId!)
				.eq('role', 'assistant');
			if (savedError) throw savedError;
			const savedWorkflow = savedMessages
				?.map((message) =>
					readChatWorkflowProgress(
						(message.metadata as Record<string, unknown>)?.chat_workflow_v1
					)
				)
				.find(Boolean);
			writeFileSync(
				process.env.WORKFLOW_PROTOTYPE_EVIDENCE!,
				JSON.stringify(
					{
						projectId,
						result,
						states,
						savedWorkflow,
						answerCompleteMs,
						unchanged: JSON.stringify(before) === JSON.stringify(after)
					},
					null,
					2
				)
			);
			expect(result.errors).toEqual([]);
			expect(result.completed).toBe(true);
			expect(result.finishedReason).toBe('stop');
			expect(result.assistantText.length).toBeGreaterThan(100);
			expect(result.assistantText).toMatch(/permit/i);
			expect(result.timing.ttftMs).not.toBeNull();
			expect(answerCompleteMs).toBeDefined();
			expect(result.timing.ttftMs!).toBeLessThan(answerCompleteMs!);
			expect(result.toolCalls).toEqual([]);
			expect(states.at(-1)?.steps.every((step) => step.status === 'completed')).toBe(true);
			expect(states.at(-1)?.steps[2]?.result).toBeTruthy();
			expect(states.at(-1)?.steps[3]?.result).toBeTruthy();
			expect(after).toEqual(before);
			expect(savedWorkflow?.steps[2]?.result).toBeTruthy();
			expect(savedWorkflow?.steps[3]?.result).toBeTruthy();
		} finally {
			await client.close();
		}
		// Deliberately retain this synthetic project/chat for interactive inspection.
	}, 360_000);
});
