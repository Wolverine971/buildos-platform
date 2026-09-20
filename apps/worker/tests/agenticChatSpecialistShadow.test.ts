// apps/worker/tests/agenticChatSpecialistShadow.test.ts
import { describe, expect, it, vi, afterEach } from 'vitest';
import { buildDocumentReadSnapshotV2 } from '@buildos/agentic-chat-runtime/specialists';
import type { AgenticChatPreparedWorkflowContextV1 } from '@buildos/shared-types';
import { JevClient } from '@buildos/smart-llm';
import {
	buildSpecialistShadowInput,
	interpretSpecialistShadow,
	selectionHash,
	specialistSelectionBundles,
	SPECIALIST_SHADOW_POLICY
} from '../src/workers/agentic-chat/workflow/specialist-selection-policy';
import { JevSpecialistSelectionShadow } from '../src/workers/agentic-chat/workflow/specialist-selection-shadow';
import { renderSpecialistShadowReport } from '../src/workers/agentic-chat/workflow/specialist-selection-report';

const context = {
	contextId: 'fd000000-0000-4000-8000-000000000001',
	contextHash: 'a'.repeat(64),
	payload: {
		data: {
			project: { name: 'Workshop', description: 'Plan a workshop' },
			documents: [{ title: 'PRIVATE TITLE', content: 'PRIVATE BODY' }],
			tasks: []
		},
		coverage: { omittedRecords: 2 }
	}
} as unknown as AgenticChatPreparedWorkflowContextV1;
const build = () =>
	buildSpecialistShadowInput({
		question: 'Read the documents and compare overlaps.',
		context,
		specialistWorkflowsEnabled: true,
		documentReadToolsEnabled: true
	});
function answer(
	probabilities = {
		generalist: 0.02,
		project_review: 0.03,
		document_inventory: 0.05,
		document_read: 0.9
	}
) {
	return {
		ok: true as const,
		answers: {
			bundle: {
				type: 'choice' as const,
				choice: 'document_read',
				confidence: 0.99,
				probabilities
			}
		},
		receipt: {
			modelRequested: SPECIALIST_SHADOW_POLICY.model,
			modelUsed: SPECIALIST_SHADOW_POLICY.model,
			requestId: 'request-1',
			inputTokens: 300,
			outputTokens: 20,
			costUsd: 0.0001,
			durationMs: 40,
			requestBytes: 3000,
			questionCount: 1,
			attempts: 1
		},
		rawResponse: { private: 'NEVER STORE RAW' }
	};
}
afterEach(() => vi.useRealTimers());
describe('Jev specialist shadow policy', () => {
	it('renders an offline comparison and keeps missing cost distinct from zero', () => {
		const input = build();
		const result = interpretSpecialistShadow(input, answer());
		const row = {
			turn_run_id: 'run-1',
			input,
			input_hash: selectionHash(input),
			result,
			result_hash: selectionHash(result)
		};
		const report = renderSpecialistShadowReport([
			row,
			{ ...row, turn_run_id: 'run-2', result: null, result_hash: null }
		]);
		expect(report).toContain('1 observed, 0 unavailable, 1 missing final receipts');
		expect(report).toContain('0/1 observed runs');
		expect(report).toContain('$0.000100 across 1 receipts; 1 have unknown cost');
		expect(report).toContain('read_project_documents');
		expect(report).not.toContain(input.request.state.question);
		expect(() => renderSpecialistShadowReport([{ ...row, input_hash: 'bad' }])).toThrow(
			'corrupt'
		);
		expect(() => renderSpecialistShadowReport([row, row])).toThrow('duplicate');
	});
	it('offers only host-enabled bundles and the exact tool-bearing version', () => {
		expect(specialistSelectionBundles({}).map((b) => b.id)).toEqual([
			'generalist',
			'project_review'
		]);
		expect(
			specialistSelectionBundles({ specialistWorkflowsEnabled: true }).map((b) => b.id)
		).toEqual(['generalist', 'project_review', 'document_inventory']);
		const input = build();
		const bundle = input.request.state.bundles.find((b) => b.id === 'document_read')!;
		expect(bundle.tools).toEqual(['read_project_documents']);
		expect(bundle.specialists[0]).toMatchObject({ id: 'document_organizer', version: 2 });
		expect(bundle.specialists.every((s) => /^[a-f0-9]{64}$/.test(s.definitionHash))).toBe(true);
		expect(input.baseline).toBe('project_review');
	});
	it('binds saved definitions and the baseline while keeping the baseline and document content out of Jev state', () => {
		const snapshot = structuredClone(buildDocumentReadSnapshotV2());
		snapshot.slots.project_analyst.definition.instructions.system = 'Historical expertise';
		const input = buildSpecialistShadowInput({
			question: 'x'.repeat(5000),
			context,
			snapshot,
			specialistWorkflowsEnabled: true,
			documentReadToolsEnabled: true
		});
		expect(input.baseline).toBe('document_read');
		expect(input.request.state.question).toHaveLength(1800);
		expect(input.request.state.questionTruncated).toBe(true);
		expect(JSON.stringify(input.request)).not.toContain('PRIVATE');
		expect(JSON.stringify(input.request)).not.toContain('baseline');
		expect(input.request.state.bundles.at(-1)?.specialists[0]?.definitionHash).toBe(
			selectionHash(snapshot.slots.project_analyst.definition)
		);
	});
	it('retains probabilities, disagreement and measured usage without raw response text', () => {
		const result = interpretSpecialistShadow(build(), answer());
		expect(result).toMatchObject({
			status: 'observed',
			selectedBundle: 'document_read',
			recommendedBundle: 'document_read',
			agreesWithBaseline: false,
			usage: { costUsd: 0.0001 }
		});
		expect(JSON.stringify(result)).not.toContain('NEVER STORE RAW');
	});
	it('does not mistake high confidence for accuracy or a decisive probability margin', () => {
		const result = interpretSpecialistShadow(
			build(),
			answer({
				generalist: 0.24,
				project_review: 0.24,
				document_inventory: 0.24,
				document_read: 0.28
			})
		);
		expect(result).toMatchObject({
			reason: 'uncertain_keep_baseline',
			confidence: 0.99,
			recommendedBundle: 'project_review'
		});
	});
	it.each(['unknown_choice', 'missing_option', 'invalid_sum', 'choice_not_top', 'nan'])(
		'fails closed on %s',
		(kind) => {
			const response = answer() as any;
			if (kind === 'unknown_choice') response.answers.bundle.choice = 'delete_everything';
			if (kind === 'missing_option') delete response.answers.bundle.probabilities.generalist;
			if (kind === 'invalid_sum') response.answers.bundle.probabilities.document_read = 0.5;
			if (kind === 'choice_not_top') response.answers.bundle.choice = 'project_review';
			if (kind === 'nan') response.answers.bundle.probabilities.document_read = NaN;
			expect(interpretSpecialistShadow(build(), response)).toMatchObject({
				status: 'unavailable',
				recommendedBundle: 'project_review'
			});
		}
	);
	it('uses the existing typed decisions client with no retry on 429', async () => {
		const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));
		const client = new JevClient({ apiKey: 'scripted', fetchImpl, retryOnce: false });
		const input = build();
		const decision = await client.decide(input.request);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		expect(interpretSpecialistShadow(input, decision)).toMatchObject({
			status: 'unavailable',
			reason: 'jev_http_429',
			usage: { attempts: 1, costUsd: null }
		});
	});
});

function prepared() {
	return {
		request: { request: { message: 'Review the project' } },
		context,
		claim: { turnRunId: 'turn', queueJobId: 'queue', executionGeneration: 1 },
		envelope: { processingToken: 'token' },
		deadlines: {
			invocationDeadlineAtMs: Date.now() + 60000,
			workflowDeadlineAt: new Date(Date.now() + 60000).toISOString()
		}
	} as any;
}
describe('bounded optional shadow observer', () => {
	it('does not ask Jev on an existing attempt or an uncertain begin response', async () => {
		for (const response of [
			{ data: { outcome: 'already_recorded' }, error: null },
			{ data: null, error: { message: 'lost' } }
		]) {
			const decide = vi.fn();
			const shadow = new JevSpecialistSelectionShadow({
				client: { rpc: async () => response },
				decider: { decide }
			});
			await shadow.observe({ prepared: prepared(), signal: new AbortController().signal });
			expect(decide).not.toHaveBeenCalled();
		}
	});
	it('bounds a client that never resolves and saves an unavailable receipt', async () => {
		vi.useFakeTimers();
		const rpc = vi.fn(async () => ({ data: { outcome: 'started' }, error: null }));
		const decide = vi.fn(() => new Promise<never>(() => {}));
		const shadow = new JevSpecialistSelectionShadow({ client: { rpc }, decider: { decide } });
		const work = shadow.observe({ prepared: prepared(), signal: new AbortController().signal });
		await vi.advanceTimersByTimeAsync(1300);
		await work;
		expect(decide).toHaveBeenCalledTimes(1);
		expect(rpc.mock.calls[1]).toMatchObject([
			'finish_agentic_chat_specialist_shadow_v1',
			{ p_result: { status: 'unavailable' } }
		]);
	});
	it('propagates parent cancellation without another attempt', async () => {
		const controller = new AbortController();
		controller.abort(new Error('cancelled'));
		const rpc = vi.fn();
		const decide = vi.fn();
		const shadow = new JevSpecialistSelectionShadow({ client: { rpc }, decider: { decide } });
		await expect(
			shadow.observe({ prepared: prepared(), signal: controller.signal })
		).rejects.toThrow('cancelled');
		expect(rpc).not.toHaveBeenCalled();
		expect(decide).not.toHaveBeenCalled();
	});
});
