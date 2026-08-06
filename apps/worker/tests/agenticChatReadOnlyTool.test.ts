// apps/worker/tests/agenticChatReadOnlyTool.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1,
	AgenticChatReadOnlyToolAdapter
} from '../src/workers/agentic-chat/readOnlyTool';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

function executionInput(): AgenticChatWorkerExecutionInputV1 {
	return {
		claim: {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: '30000000-0000-4000-8000-000000000003',
			queueJobId: '50000000-0000-4000-8000-000000000005',
			sessionId: '20000000-0000-4000-8000-000000000002',
			userId: USER_ID,
			correlationId: '60000000-0000-4000-8000-000000000006',
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: '70000000-0000-4000-8000-000000000007',
			userMessageId: '80000000-0000-4000-8000-000000000008'
		},
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		requestPayload: {
			message: 'Read the project',
			context: { type: 'project', projectId: PROJECT_ID }
		},
		artifact: {} as never,
		timingBaseline: {} as never
	};
}

describe('AgenticChatReadOnlyToolAdapter', () => {
	it('exposes exactly one read schema and returns bounded project telemetry', async () => {
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).toEqual(['get_project_overview']);
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1).toMatchObject([
			{
				type: 'function',
				function: {
					name: 'get_project_overview',
					parameters: { type: 'object', additionalProperties: false }
				}
			}
		]);
		const runOp = vi.fn(async () => ({
			ok: true as const,
			op: 'onto.project.status.get',
			data: { project: { id: PROJECT_ID, name: '9takes' }, message: 'ready' }
		}));
		const ticks = [100, 112];
		const adapter = new AgenticChatReadOnlyToolAdapter({} as never, {
			now: () => ticks.shift() ?? 112,
			runOp
		});

		await expect(
			adapter.execute({
				toolName: 'get_project_overview',
				arguments: { project_id: PROJECT_ID },
				providerToolCallId: 'provider-read-1',
				executionInput: executionInput(),
				signal: new AbortController().signal
			})
		).resolves.toEqual({
			result: { message: 'ready', project: { id: PROJECT_ID, name: '9takes' } },
			executionTimeMs: 12,
			tokensConsumed: null,
			affectedEntities: [{ type: 'project', id: PROJECT_ID, name: '9takes' }],
			toolCategory: 'project_read',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		});
		expect(runOp).toHaveBeenCalledWith({
			admin: {},
			userId: USER_ID,
			projectId: PROJECT_ID,
			arguments: { project_id: PROJECT_ID },
			signal: expect.any(AbortSignal)
		});
	});

	it('aborts and rejects a hung gateway read at the configured deadline', async () => {
		let deadlineSignal: AbortSignal | null = null;
		const runOp = vi.fn(
			(input: { signal: AbortSignal }) =>
				new Promise<never>(() => {
					deadlineSignal = input.signal;
				})
		);
		const adapter = new AgenticChatReadOnlyToolAdapter({} as never, {
			runOp: runOp as never,
			timeoutMs: 10
		});

		await expect(
			adapter.execute({
				toolName: 'get_project_overview',
				arguments: { project_id: PROJECT_ID },
				providerToolCallId: 'provider-read-timeout',
				executionInput: executionInput(),
				signal: new AbortController().signal
			})
		).rejects.toMatchObject({ code: 'read_tool_timeout', failureClass: 'transient_infra' });
		expect(deadlineSignal).toMatchObject({ aborted: true });
	});

	it('fails closed on non-allowlisted tools, widened arguments, and op failures', async () => {
		const runOp = vi.fn(async () => ({
			ok: false as const,
			op: 'onto.project.status.get',
			error: { code: 'FORBIDDEN' as const, message: 'outside project scope' }
		}));
		const adapter = new AgenticChatReadOnlyToolAdapter({} as never, { runOp });
		const base = {
			providerToolCallId: 'provider-read-1',
			executionInput: executionInput(),
			signal: new AbortController().signal
		};

		await expect(
			adapter.execute({
				...base,
				toolName: 'update_onto_project',
				arguments: { project_id: PROJECT_ID }
			})
		).rejects.toMatchObject({ code: 'read_tool_not_allowlisted', failureClass: 'permanent' });
		await expect(
			adapter.execute({
				...base,
				toolName: 'get_project_overview',
				arguments: { project_id: PROJECT_ID, include_secrets: true }
			})
		).rejects.toMatchObject({ code: 'read_tool_arguments_invalid', failureClass: 'permanent' });
		expect(runOp).not.toHaveBeenCalled();

		await expect(
			adapter.execute({
				...base,
				toolName: 'get_project_overview',
				arguments: { query: '9takes' }
			})
		).rejects.toMatchObject({ code: 'read_tool_execution_failed', failureClass: 'permanent' });
		expect(runOp).toHaveBeenCalledOnce();

		const invalidContext = executionInput();
		invalidContext.requestPayload.context = { type: 'project', projectId: null };
		await expect(
			adapter.execute({
				...base,
				executionInput: invalidContext,
				toolName: 'get_project_overview',
				arguments: { query: '9takes' }
			})
		).rejects.toMatchObject({ code: 'read_tool_context_invalid', failureClass: 'permanent' });
	});

	it('rejects successful gateway payloads without the exact scoped project', async () => {
		const results = [
			{ ok: true as const, data: { message: 'missing project' } },
			{
				ok: true as const,
				data: {
					project: {
						id: '40000000-0000-4000-8000-000000000099',
						name: 'Wrong project'
					}
				}
			}
		];
		const runOp = vi.fn(async () => results.shift()!);
		const adapter = new AgenticChatReadOnlyToolAdapter({} as never, { runOp });
		const request = {
			toolName: 'get_project_overview',
			arguments: { project_id: PROJECT_ID },
			providerToolCallId: 'provider-read-1',
			executionInput: executionInput(),
			signal: new AbortController().signal
		};

		await expect(adapter.execute(request)).rejects.toMatchObject({
			code: 'read_tool_result_invalid',
			failureClass: 'unknown'
		});
		await expect(adapter.execute(request)).rejects.toMatchObject({
			code: 'read_tool_result_invalid',
			failureClass: 'unknown'
		});
		expect(runOp).toHaveBeenCalledTimes(2);
	});
});
