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
			roundPattern: { readOps: ['x.search.project'], researchOps: [], hasWriteOps: false },
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
			roundPattern: { readOps: ['onto.document.get'], researchOps: [], hasWriteOps: false },
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
			roundPattern: {
				readOps: ['x.search.all_projects'],
				researchOps: [],
				hasWriteOps: false
			},
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
			roundPattern: { readOps: ['onto.document.get'], researchOps: [], hasWriteOps: false },
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
			roundPattern: { readOps: ['onto.document.get'], researchOps: [], hasWriteOps: false },
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
			roundPattern: { readOps: ['x.search.project'], researchOps: [], hasWriteOps: false },
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

	it('counts found-false reads as semantic misses instead of opened evidence', () => {
		const ledger = new ContextGatheringLedger();
		const observation = ledger.observeToolRound({
			roundExecutions: [
				execution(
					'read_document_section',
					{ document_id: documentId, section: 'missing-anchor' },
					{ found: false, available_anchors: ['overview'] }
				)
			],
			roundPattern: {
				readOps: ['onto.document.section.get'],
				researchOps: [],
				hasWriteOps: false
			},
			toolRounds: 1,
			maxToolRounds: 8,
			modelPayloadChars: 200
		});

		expect(observation.status).toMatchObject({
			status: 'narrowing',
			newEvidenceThisRound: false,
			seenEntityCount: 0,
			semanticReadMisses: 1
		});
		expect(observation.status.reasons).toContain('1 semantic read miss this round');
	});

	it('treats distinct sections from the same document as new evidence', () => {
		const ledger = new ContextGatheringLedger();
		const observe = (anchor: string, toolRounds: number) =>
			ledger.observeToolRound({
				roundExecutions: [
					execution(
						'read_document_section',
						{ document_id: documentId, anchor },
						{ found: true, content: `Content for ${anchor}` },
						`read:${anchor}:${toolRounds}`
					)
				],
				roundPattern: {
					readOps: ['onto.document.section.get'],
					researchOps: [],
					hasWriteOps: false
				},
				toolRounds,
				maxToolRounds: 8,
				modelPayloadChars: 200
			});

		expect(observe('overview', 1).status.newEvidenceThisRound).toBe(true);
		expect(observe('implementation', 2).status.newEvidenceThisRound).toBe(true);
		const repeated = observe('implementation', 3);
		expect(repeated.status.newEvidenceThisRound).toBe(false);
		expect(repeated.status.status).toBe('narrowing');
	});

	it('does not advance saturation for mixed web-research and internal-read rounds', () => {
		const ledger = new ContextGatheringLedger();
		const observations = Array.from({ length: 5 }, (_, index) =>
			ledger.observeToolRound({
				roundExecutions: [
					execution(
						'web_visit',
						{ url: `https://example.com/source-${index}` },
						{ content: `External evidence ${index}` },
						`web_visit:${index}`
					),
					execution(
						'get_onto_document_details',
						{ document_id: documentId },
						{ document: { id: documentId, title: 'Research brief' } },
						`get_onto_document_details:${index}`
					)
				],
				roundPattern: {
					readOps: ['onto.document.get'],
					researchOps: ['util.web.visit'],
					hasWriteOps: false
				},
				toolRounds: index + 1,
				maxToolRounds: 16,
				modelPayloadChars: 12000
			})
		);

		for (const observation of observations) {
			expect(observation.status.status).toBe('open');
			expect(observation.status.readRounds).toBe(0);
			expect(observation.status.lowNoveltyRounds).toBe(0);
			expect(observation.forceSynthesis).toBe(false);
		}
	});
});
