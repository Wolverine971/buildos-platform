// apps/web/src/lib/tests/agentic-e2e/workflow-prototype.live.test.ts
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loginAndGetCookie } from './harness/auth';
import { provisionTestUser } from './harness/test-user';
import { createAgenticE2EWorkerClient } from './harness/worker-client';
import { seedCedarHouse } from './scenarios/cedar-house/fixture';
import { readDurableChatWorkflowProgress } from '$lib/components/agent/agent-chat-workflow';

// These private workflow tables are newer than the generated public Database type.
// Keep the read boundary narrow; assertions below validate the returned contracts.
type WorkflowSmokeQuery = PromiseLike<{
	data: Array<Record<string, unknown>> | null;
	error: { message: string } | null;
}> & {
	eq(column: string, value: string): WorkflowSmokeQuery;
	maybeSingle(): PromiseLike<{
		data: Record<string, unknown> | null;
		error: { message: string } | null;
	}>;
};
type WorkflowSmokeReader = {
	from(table: 'chat_turn_workflow_runs' | 'chat_turn_workflow_steps'): {
		select(columns: string): WorkflowSmokeQuery;
	};
};

// The Workflow Lab's review is the durable project review (reviewIntent: 'project_review').
// The older `/workflow` prototype lane no longer exists in the chat worker.
describe.runIf(process.env.WORKFLOW_PROTOTYPE_SMOKE === 'true')('live workflow lab review', () => {
	it('runs a real durable project review, accepts every step, and leaves project records unchanged', async () => {
		if (process.env.AGENTIC_GATE_DATABASE_ISOLATED !== 'true')
			throw new Error('Isolated database required');
		const durableV3 = process.env.AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED === 'true';
		if (!durableV3 && process.env.AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED !== 'true')
			throw new Error(
				'Set AGENTIC_CHAT_PROJECT_REVIEW_V2_ENABLED or AGENTIC_CHAT_PROJECT_REVIEW_V3_ENABLED.'
			);
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
		const { data: risk, error: riskError } = await db.admin
			.from('onto_risks')
			.insert({
				project_id: projectId,
				created_by: db.actorId,
				title: 'Permit filing fee unfunded',
				content: 'Permit filing requires a $1,200 fee that has no approved funding source.',
				state_key: 'identified',
				impact: 'high'
			})
			.select('id')
			.single();
		if (riskError) throw riskError;
		const riskId = risk.id;
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
			userId
		});
		try {
			const result = await client.runTurn({
				contextType: 'project',
				entityId: projectId,
				reviewIntent: 'project_review',
				message: durableV3
					? 'Assess the unfunded permit filing fee and count how many of all five saved tasks are overdue as of this review. Have both specialists inspect the fee risk and use the typed calculation for task timing. Include the fee evidence and the five-task count in the combined answer.'
					: 'What should we prioritize next? Have the analyst recommend the next steps and the reviewer challenge assumptions about permits and the budget, including saved risk-register entries. Give me one combined recommendation.'
			});
			const durableStates = result.rawEvents
				.map((event) => readDurableChatWorkflowProgress(event.workflow))
				.filter((value) => value !== null);
			const answerCompleteEvent = result.rawEvents.find(
				(event) =>
					readDurableChatWorkflowProgress(event.workflow)?.answer.status === 'accepted'
			);
			const answerCompleteMs = result.eventTimings.find(
				(event) => event.sequenceIndex === answerCompleteEvent?.sequence_index
			)?.observedMs;
			const after = await snapshot();
			const { data: savedMessages, error: savedError } = await db.admin
				.from('chat_messages')
				.select('metadata,content')
				.eq('session_id', result.sessionId!)
				.eq('role', 'assistant');
			if (savedError) throw savedError;
			const savedDurableWorkflow = savedMessages
				?.map((message) =>
					readDurableChatWorkflowProgress(
						(message.metadata as Record<string, unknown>)?.chat_workflow_v1
					)
				)
				.find(Boolean);
			const workflowDb = db.admin as unknown as WorkflowSmokeReader;
			const runRead = await workflowDb
				.from('chat_turn_workflow_runs')
				.select(
					'turn_run_id,policy_ref,phase,terminal_outcome,preparation_version,context_hash,context_payload'
				)
				.eq('session_id', result.sessionId!)
				.maybeSingle();
			if (runRead.error) throw runRead.error;
			const durableRun = runRead.data;
			let durableSteps: Array<Record<string, unknown>> = [];
			if (durableRun) {
				const stepRead = await workflowDb
					.from('chat_turn_workflow_steps')
					.select('step_key,status,attempts_used,quality,result')
					.eq('turn_run_id', String(durableRun.turn_run_id));
				if (stepRead.error) throw stepRead.error;
				durableSteps = stepRead.data ?? [];
			}
			writeFileSync(
				process.env.WORKFLOW_PROTOTYPE_EVIDENCE!,
				JSON.stringify(
					{
						validationMode: durableV3
							? 'durable_project_review_v3'
							: 'durable_project_review_v2',
						riskId,
						durableRun,
						durableSteps,
						projectId,
						result,
						durableStates,
						savedDurableWorkflow,
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
			expect(after).toEqual(before);
			expect(savedMessages?.some((message) => message.content === result.assistantText)).toBe(
				true
			);
			expect(durableStates.at(-1)?.steps.every((step) => step.status === 'accepted')).toBe(
				true
			);
			expect(savedDurableWorkflow).toMatchObject({
				phase: 'finished',
				terminalOutcome: 'complete',
				answer: { status: 'accepted' }
			});
			for (const key of ['project_analyst', 'risk_reviewer']) {
				expect(
					savedDurableWorkflow?.steps.find((step) => step.key === key)?.acceptedFinding
				).toBeTruthy();
			}
			expect(durableRun).toMatchObject({
				policy_ref: durableV3 ? 'internal-project-review:v3' : 'internal-project-review:v2',
				preparation_version: 'agentic_chat_project_review_preparation_v2',
				context_payload: { version: 'agentic_chat_project_review_payload_v2' }
			});
			expect(JSON.stringify(durableRun?.context_payload)).toContain(riskId);
			for (const [id, version] of [
				['project_analyst', durableV3 ? 3 : 2],
				['risk_reviewer', durableV3 ? 4 : 3]
			] as const) {
				const step = durableSteps.find((item) => item.step_key === id);
				expect(step).toMatchObject({
					status: 'accepted',
					result: {
						version: durableV3
							? 'chat_workflow_role_report_v3'
							: 'chat_workflow_role_report_v2',
						outcome: 'findings',
						specialist: { id, version }
					}
				});
				expect(JSON.stringify(step?.result)).toContain(riskId);
			}
			expect(result.assistantText).toMatch(/1,?200/);
			if (durableV3) {
				expect(result.assistantText).toContain('2 of these 5 cited tasks');
				expect(result.assistantText).not.toMatch(
					/all (five|5) tasks are (past due|overdue)/i
				);
				for (const step of durableSteps.filter((item) =>
					['project_analyst', 'risk_reviewer'].includes(String(item.step_key))
				))
					expect(step.result).toMatchObject({
						contextHash: durableRun?.context_hash
					});
			}
		} finally {
			await client.close();
		}
		// Deliberately retain this synthetic project/chat for interactive inspection.
	}, 360_000);
});
