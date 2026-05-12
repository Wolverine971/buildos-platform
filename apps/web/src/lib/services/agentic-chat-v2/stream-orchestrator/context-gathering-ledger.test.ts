// apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/context-gathering-ledger.test.ts
import { describe, expect, it } from 'vitest';
import type { ChatToolCall, ChatToolResult } from '@buildos/shared-types';
import { ContextGatheringLedger } from './context-gathering-ledger';
import type { FastToolExecution } from './shared';

const projectId = '4cfdbed1-840a-4fe4-9751-77c7884daa70';
const documentId = '3e9432fb-90e1-4404-a480-c73186b1337d';

function toolCall(name: string, args: Record<string, unknown>, id = name): ChatToolCall {
	return {
		id,
		type: 'function',
		function: {
			name,
			arguments: JSON.stringify(args)
		}
	};
}

function execution(
	name: string,
	args: Record<string, unknown>,
	resultPayload: unknown,
	id = name
): FastToolExecution {
	const call = toolCall(name, args, id);
	const result: ChatToolResult = {
		tool_call_id: call.id,
		result: resultPayload,
		success: true
	};
	return { toolCall: call, result };
}

describe('ContextGatheringLedger', () => {
	it('escalates from narrowing to saturated to must_synthesize on low-novelty reads', () => {
		const ledger = new ContextGatheringLedger();

		const first = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'search_project',
					{ project_id: projectId, query: 'Rod Chamberlin' },
					{ results: [{ id: documentId, type: 'document', title: 'Rod notes' }] },
					'search_project:first'
				)
			],
			roundPattern: { readOps: ['x.search.project'], hasWriteOps: false },
			toolRounds: 1,
			maxToolRounds: 8,
			modelPayloadChars: 300
		});
		expect(first.status.status).toBe('open');
		expect(first.message).toBeNull();

		const second = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'get_onto_document_details',
					{ document_id: documentId },
					{ document: { id: documentId, title: 'Rod notes' } },
					'get_onto_document_details:first'
				)
			],
			roundPattern: { readOps: ['onto.document.get'], hasWriteOps: false },
			toolRounds: 2,
			maxToolRounds: 8,
			modelPayloadChars: 400
		});
		expect(second.status.status).toBe('open');
		expect(second.message).toBeNull();
		expect(second.forceSynthesis).toBe(false);

		const third = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'search_all_projects',
					{ query: 'Beyond Exit Planning' },
					{ results: [{ id: documentId, type: 'document', title: 'Rod notes' }] },
					'search_all_projects:first'
				)
			],
			roundPattern: { readOps: ['x.search.all_projects'], hasWriteOps: false },
			toolRounds: 3,
			maxToolRounds: 8,
			modelPayloadChars: 300
		});
		expect(third.status.status).toBe('narrowing');
		expect(third.message).toContain('Context gathering: narrowing.');
		expect(third.forceSynthesis).toBe(false);

		const fourth = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'get_onto_document_details',
					{ document_id: documentId },
					{ document: { id: documentId, title: 'Rod notes' } },
					'get_onto_document_details:second'
				)
			],
			roundPattern: { readOps: ['onto.document.get'], hasWriteOps: false },
			toolRounds: 4,
			maxToolRounds: 8,
			modelPayloadChars: 400
		});
		expect(fourth.status.status).toBe('saturated');
		expect(fourth.message).toContain('Context gathering: saturated.');
		expect(fourth.forceSynthesis).toBe(false);

		const fifth = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'get_onto_document_details',
					{ document_id: documentId },
					{ document: { id: documentId, title: 'Rod notes' } },
					'get_onto_document_details:third'
				)
			],
			roundPattern: { readOps: ['onto.document.get'], hasWriteOps: false },
			toolRounds: 5,
			maxToolRounds: 8,
			modelPayloadChars: 400
		});
		expect(fifth.status.status).toBe('must_synthesize');
		expect(fifth.message).toContain('Context gathering: must synthesize.');
		expect(fifth.message).toContain('do not gather more context');
		expect(fifth.forceSynthesis).toBe(true);
	});

	it('must synthesize immediately when live context usage is over budget', () => {
		const ledger = new ContextGatheringLedger();

		const observation = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'search_project',
					{ project_id: projectId, query: 'Rod Chamberlin' },
					{ results: [{ id: documentId, type: 'document', title: 'Rod notes' }] },
					'search_project:first'
				)
			],
			roundPattern: { readOps: ['x.search.project'], hasWriteOps: false },
			toolRounds: 1,
			maxToolRounds: 8,
			modelPayloadChars: 300,
			liveContextUsage: {
				estimatedTokens: 81000,
				tokenBudget: 80000,
				usagePercent: 101,
				tokensRemaining: 0,
				status: 'over_budget',
				lastCompressedAt: null,
				lastCompression: null
			}
		});

		expect(observation.status.status).toBe('must_synthesize');
		expect(observation.status.reasons).toContain('context window is over budget');
		expect(observation.forceSynthesis).toBe(true);
	});
});
