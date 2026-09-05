// apps/web/src/lib/services/agentic-chat-v2/turn-persistence.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ChatToolCall, ChatToolResult, Database } from '@buildos/shared-types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
	buildToolMessageSnapshotsForReconciliation,
	buildToolResultEventPayload,
	buildToolResultSummaries,
	persistIncrementalToolExecutionRow,
	persistToolExecutionRows,
	resolveStableToolCallId
} from './turn-persistence';

function toolCall(id: string, name: string, args: Record<string, unknown> = {}): ChatToolCall {
	return {
		id,
		type: 'function',
		function: { name, arguments: JSON.stringify(args) }
	};
}

function toolResult(
	toolCallId: string,
	result: Record<string, unknown>,
	success = true
): ChatToolResult {
	return { tool_call_id: toolCallId, result, success };
}

function createTelemetryClient() {
	type StoredRow = Database['public']['Tables']['chat_tool_executions']['Insert'];
	const rows = new Map<string, StoredRow>();
	const insert = vi.fn(async (payload: StoredRow[]) => {
		for (const row of payload) {
			const key = `${row.turn_run_id}:${row.provider_tool_call_id}`;
			if (rows.has(key)) return { error: new Error(`duplicate ${key}`) };
			rows.set(key, { ...row });
		}
		return { error: null };
	});
	const upsert = vi.fn(
		async (
			payload: StoredRow[],
			options: { onConflict?: string } = {}
		): Promise<{ error: null }> => {
			for (const row of payload) {
				rows.set(`${row.turn_run_id}:${row.provider_tool_call_id}`, { ...row });
			}
			expect(options.onConflict).toBe('turn_run_id,provider_tool_call_id');
			return { error: null };
		}
	);
	const from = vi.fn(() => ({ insert, upsert }));
	return {
		client: { from } as unknown as SupabaseClient<Database>,
		rows,
		insert,
		upsert
	};
}

describe('tool execution telemetry correlation', () => {
	it('reconciles an incremental mutation with a reordered final list by tool-call ID', async () => {
		const telemetry = createTelemetryClient();
		const turnRunId = 'd41fa86b-84e6-4b2f-9639-f94f334c8e81';
		const readCall = toolCall('call-read', 'search_project', { query: 'launch' });
		const writeCall = toolCall('call-write', 'create_onto_task', { title: 'Ship it' });
		const readResult = toolResult('call-read', { results: [] });
		// A mismatched executor result ID must not replace the original provider ID.
		const writeResult = toolResult('executor-internal-id', {
			task: { id: 'task-1', title: 'Ship it' }
		});
		expect(buildToolResultEventPayload(writeCall, writeResult)).toMatchObject({
			tool_call_id: 'call-write'
		});

		await persistIncrementalToolExecutionRow({
			supabase: telemetry.client,
			sessionId: 'session-1',
			turnRunId,
			toolCall: writeCall,
			result: writeResult,
			sequenceIndex: 17
		});
		expect(telemetry.rows.get(`${turnRunId}:call-write`)).toMatchObject({
			message_id: null,
			sequence_index: 17,
			provider_tool_call_id: 'call-write'
		});

		await persistToolExecutionRows({
			supabase: telemetry.client,
			sessionId: 'session-1',
			messageId: 'message-1',
			turnRunId,
			executions: [
				{ toolCall: readCall, result: readResult },
				{ toolCall: writeCall, result: writeResult }
			],
			contextType: 'project'
		});

		expect(telemetry.rows).toHaveLength(2);
		expect(telemetry.rows.get(`${turnRunId}:call-write`)).toMatchObject({
			message_id: 'message-1',
			sequence_index: 2,
			provider_tool_call_id: 'call-write'
		});
		expect(telemetry.rows.get(`${turnRunId}:call-read`)).toMatchObject({
			message_id: 'message-1',
			sequence_index: 1,
			provider_tool_call_id: 'call-read'
		});
		expect(telemetry.upsert).toHaveBeenCalledTimes(2);
	});

	it('coalesces duplicate callbacks for one stable tool-call ID', async () => {
		const telemetry = createTelemetryClient();
		const turnRunId = 'd41fa86b-84e6-4b2f-9639-f94f334c8e81';
		const call = toolCall('call-write', 'update_onto_task', { task_id: 'task-1' });

		await persistToolExecutionRows({
			supabase: telemetry.client,
			sessionId: 'session-1',
			messageId: 'message-1',
			turnRunId,
			executions: [
				{ toolCall: call, result: toolResult('call-write', { status: 'running' }) },
				{ toolCall: call, result: toolResult('call-write', { status: 'updated' }) }
			],
			contextType: 'project'
		});

		expect(telemetry.rows).toHaveLength(1);
		expect(telemetry.rows.get(`${turnRunId}:call-write`)).toMatchObject({
			sequence_index: 2,
			result: { status: 'updated' }
		});
		expect(telemetry.upsert.mock.calls[0]?.[0]).toHaveLength(1);
	});

	it('rejects one stable ID reused for different tool executions', async () => {
		const telemetry = createTelemetryClient();

		await expect(
			persistToolExecutionRows({
				supabase: telemetry.client,
				sessionId: 'session-1',
				messageId: 'message-1',
				turnRunId: 'd41fa86b-84e6-4b2f-9639-f94f334c8e81',
				executions: [
					{
						toolCall: toolCall('call-reused', 'create_onto_task', {
							title: 'First'
						}),
						result: toolResult('call-reused', { task: { id: 'task-1' } })
					},
					{
						toolCall: toolCall('call-reused', 'delete_onto_task', {
							task_id: 'task-2'
						}),
						result: toolResult('call-reused', { deleted: true })
					}
				],
				contextType: 'project'
			})
		).rejects.toThrow('was reused for different tool executions');
		expect(telemetry.upsert).not.toHaveBeenCalled();
	});

	it('matches reordered reconciliation summaries by stable tool-call ID', () => {
		const executions = [
			{
				toolCall: toolCall('call-search', 'search_project'),
				result: toolResult('call-search', { results: [] })
			},
			{
				toolCall: toolCall('call-update', 'update_onto_task'),
				result: toolResult('call-update', { task: { id: 'task-1' } })
			}
		];
		const summaries = buildToolResultSummaries(executions).reverse();
		const snapshots = buildToolMessageSnapshotsForReconciliation(executions, summaries);

		expect(summaries.map((summary) => summary.tool_call_id)).toEqual([
			'call-update',
			'call-search'
		]);
		expect(JSON.parse(snapshots[0]!.content)).toMatchObject({
			tool_name: 'search_project',
			summary: 'Executed search_project.'
		});
		expect(JSON.parse(snapshots[1]!.content)).toMatchObject({
			tool_name: 'update_onto_task',
			summary: 'Executed update_onto_task.'
		});
	});

	it('rejects missing or malformed IDs instead of synthesizing an ordinal identity', () => {
		expect(() =>
			resolveStableToolCallId(toolCall('', 'create_onto_task'), {
				tool_call_id: '',
				success: true,
				result: null
			})
		).toThrow('missing a stable tool-call ID');
		expect(() =>
			resolveStableToolCallId(toolCall(' call-with-whitespace ', 'create_onto_task'))
		).toThrow('missing a stable tool-call ID');
		expect(() =>
			resolveStableToolCallId(toolCall('x'.repeat(513), 'create_onto_task'))
		).toThrow('missing a stable tool-call ID');
	});
});
