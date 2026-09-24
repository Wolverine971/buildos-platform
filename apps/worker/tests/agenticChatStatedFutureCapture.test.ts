// apps/worker/tests/agenticChatStatedFutureCapture.test.ts
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/turn/execution-input';
import { AGENTIC_CHAT_INPUT_ARTIFACT_VERSION } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAgenticChatStatedFutureCaptureAdapter } from '../src/workers/agentic-chat/effects/stated-future-capture';

const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const PROJECT_ID = '70000000-0000-4000-8000-000000000007';
const EXECUTION_GENERATION = 2;

const executionInput: AgenticChatWorkerExecutionInputV1 = {
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
		inputArtifactId: 'a0000000-0000-4000-8000-00000000000a',
		userMessageId: 'b0000000-0000-4000-8000-00000000000b'
	},
	streamRunId: 'stream-stated-future-1',
	clientTurnId: 'client-stated-future-1',
	requestPayload: {
		clientTurnId: 'client-stated-future-1',
		streamRunId: 'stream-stated-future-1',
		message: "I closed the old task. Now I'm waiting to hear back from legal.",
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
		createdAt: '2026-08-13T14:00:00.000Z',
		retainUntil: '2026-08-20T14:00:00.000Z',
		contentHash: '0'.repeat(64)
	},
	timingBaseline: {
		admittedAt: '2026-08-13T13:59:55.000Z',
		startedAt: '2026-08-13T13:59:56.000Z',
		workerStartedAt: '2026-08-13T13:59:57.000Z',
		executionStartedAt: '2026-08-13T13:59:58.000Z',
		historyCutoffAt: '2026-08-13T13:59:56.000Z',
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
};

describe('SupabaseAgenticChatStatedFutureCaptureAdapter', () => {
	// The forward-carry floor was triggered by a regex over the user's words. It
	// is retired until a structured signal exists; the port must neither read
	// the message nor touch the database, even on the phrasing it used to match.
	it.each([
		"I closed the old task. Now I'm waiting to hear back from legal.",
		"That's done, blocked on the vendor. Next step is the permit.",
		'What is on my plate today?'
	])('never reads the message or writes for %j', async (message) => {
		const rpc = vi.fn();
		const control = { reserve: vi.fn(), begin: vi.fn(), reconcile: vi.fn() };
		const adapter = new SupabaseAgenticChatStatedFutureCaptureAdapter(
			{ rpc },
			control as never
		);
		await expect(
			adapter.capture({
				executionInput: {
					...executionInput,
					requestPayload: { ...executionInput.requestPayload, message }
				},
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).resolves.toEqual({ status: 'skipped', reason: 'no_structured_signal' });
		expect(rpc).not.toHaveBeenCalled();
		expect(control.reserve).not.toHaveBeenCalled();
	});
});
