// apps/worker/tests/agenticChatResearchCapture.test.ts
import { AGENTIC_CHAT_INPUT_ARTIFACT_VERSION } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAgenticChatResearchCaptureAdapter } from '../src/workers/agentic-chat/researchCapture';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const PROJECT_ID = '70000000-0000-4000-8000-000000000007';
const DOCUMENT_ID = '80000000-0000-4000-8000-000000000008';
const EXECUTION_GENERATION = 2;

const executionInput = {
	claim: {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '50000000-0000-4000-8000-000000000005',
		executionGeneration: EXECUTION_GENERATION,
		status: 'running',
		inputArtifactId: '90000000-0000-4000-8000-000000000009',
		userMessageId: 'a0000000-0000-4000-8000-00000000000a'
	},
	streamRunId: 'stream-research-1',
	clientTurnId: 'client-research-1',
	requestPayload: {
		clientTurnId: 'client-research-1',
		streamRunId: 'stream-research-1',
		message: 'Research durable evidence.',
		context: { type: 'project', entityId: PROJECT_ID, projectId: PROJECT_ID }
	},
	artifact: {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'fixture',
			systemPrompt: 'fixture',
			promptSections: [],
			toolSurface: {},
			sessionSnapshot: { summary: null, agent_metadata: {} },
			contextUsageSnapshot: {
				estimatedTokens: 1,
				tokenBudget: 10,
				usagePercent: 10,
				tokensRemaining: 9,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
		},
		createdAt: '2026-08-13T13:00:00.000Z',
		retainUntil: '2026-08-20T13:00:00.000Z',
		contentHash: '0'.repeat(64)
	},
	timingBaseline: {
		admittedAt: '2026-08-13T12:59:55.000Z',
		startedAt: '2026-08-13T12:59:56.000Z',
		workerStartedAt: '2026-08-13T12:59:57.000Z',
		executionStartedAt: '2026-08-13T12:59:58.000Z',
		historyCutoffAt: '2026-08-13T12:59:56.000Z',
		requestPrewarmedContext: false,
		cacheSource: 'not_requested',
		cacheAgeSeconds: null,
		historyStrategy: 'raw_history',
		historyCompressed: false,
		rawHistoryCount: 0,
		historyForModelCount: 0,
		preparedPromptId: null,
		preparedPromptHit: false,
		preparedPromptMissReason: null,
		preparedSurfaceProfile: null
	}
} as const;

function evidenceReceipt(outcome = 'eligible') {
	return {
		outcome,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: EXECUTION_GENERATION,
		stream_run_id: executionInput.streamRunId,
		captured_at: '2026-08-13T14:01:00.000Z',
		calls: [
			{
				name: 'web_search',
				args: { query: 'durable evidence' },
				result: {
					answer: 'Durable evidence wins.',
					results: [{ url: 'https://example.com/a' }]
				}
			},
			{
				name: 'util.web.visit',
				args: { url: 'https://example.com/b' },
				result: { error: 'upstream timeout' }
			}
		]
	};
}

describe('SupabaseAgenticChatResearchCaptureAdapter', () => {
	it('renders exact shared output from durable name-only evidence and applies one stable effect', async () => {
		const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
			if (name === 'load_agentic_chat_research_capture_evidence') {
				return { data: evidenceReceipt(), error: null };
			}
			return {
				data: {
					outcome: 'appended',
					effect_id: args.p_effect_id,
					turn_run_id: TURN_RUN_ID,
					queue_job_id: QUEUE_JOB_ID,
					session_id: SESSION_ID,
					user_id: USER_ID,
					execution_generation: EXECUTION_GENERATION,
					project_id: PROJECT_ID,
					stream_run_id: executionInput.streamRunId,
					canonical_argument_hash: args.p_canonical_argument_hash,
					document_id: DOCUMENT_ID,
					rotated: 0,
					failure_code: null
				},
				error: null
			};
		});
		const adapter = new SupabaseAgenticChatResearchCaptureAdapter({ rpc });

		await expect(
			adapter.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({
			status: 'appended',
			effectId: expect.stringMatching(/^[0-9a-f-]{36}$/),
			documentId: DOCUMENT_ID,
			rotated: 0
		});
		expect(rpc).toHaveBeenNthCalledWith(1, 'load_agentic_chat_research_capture_evidence', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_queue_job_id: QUEUE_JOB_ID,
			p_processing_token: PROCESSING_TOKEN,
			p_execution_generation: EXECUTION_GENERATION
		});
		expect(rpc).toHaveBeenNthCalledWith(
			2,
			'apply_agentic_chat_research_capture',
			expect.objectContaining({
				p_project_id: PROJECT_ID,
				p_stream_run_id: executionInput.streamRunId,
				p_rendered_entry:
					'## 2026-08-13 · Research durable evidence.\n<!-- run:stream-research-1 -->\n\n- Queries: durable evidence\n- Visited: https://example.com/a , https://example.com/b\n- Findings: Durable evidence wins.',
				p_description: 'Auto-captured research. Latest: Research durable evidence.'
			})
		);
		const applyArgs = rpc.mock.calls[1]![1];
		expect(applyArgs.p_canonical_argument_hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it('does not apply for non-eligible or cancelled evidence', async () => {
		for (const outcome of ['not_eligible', 'cancel_requested'] as const) {
			const rpc = vi.fn(async () => ({ data: evidenceReceipt(outcome), error: null }));
			const adapter = new SupabaseAgenticChatResearchCaptureAdapter({ rpc });
			await expect(
				adapter.capture({
					executionInput,
					processingToken: PROCESSING_TOKEN,
					signal: new AbortController().signal
				})
			).resolves.toEqual({ status: 'skipped', reason: outcome });
			expect(rpc).toHaveBeenCalledOnce();
		}
	});

	it('skips projectless turns before SQL and rejects cross-bound receipts', async () => {
		const rpc = vi.fn();
		const adapter = new SupabaseAgenticChatResearchCaptureAdapter({ rpc });
		await expect(
			adapter.capture({
				executionInput: {
					...executionInput,
					requestPayload: {
						...executionInput.requestPayload,
						context: { type: 'global', entityId: null, projectId: null }
					}
				},
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({ status: 'skipped', reason: 'no_project' });
		expect(rpc).not.toHaveBeenCalled();

		const malformed = new SupabaseAgenticChatResearchCaptureAdapter({
			rpc: vi.fn(async () => ({
				data: { ...evidenceReceipt(), turn_run_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
				error: null
			}))
		});
		await expect(
			malformed.capture({
				executionInput,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).rejects.toThrow('evidence receipt scope is inconsistent');
	});
});
