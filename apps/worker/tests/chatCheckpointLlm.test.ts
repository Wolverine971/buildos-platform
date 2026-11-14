// apps/worker/tests/chatCheckpointLlm.test.ts
//
// The checkpoint model port links each call's cost log to its chat and project. One
// port serves every session the job runs, so the ids arrive per call.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetJSONResponse = vi.hoisted(() => vi.fn());

vi.mock('../src/lib/services/smart-llm-service', () => ({
	SmartLLMService: vi.fn().mockImplementation(function () {
		return { getJSONResponse: mockGetJSONResponse };
	})
}));

import { createCheckpointCompleteJson } from '../src/workers/chat/checkpoint/checkpointLlm';

const call = {
	systemPrompt: 'system',
	userPrompt: 'user',
	userId: 'user-1',
	operation: 'thinking_log' as const
};

describe('createCheckpointCompleteJson', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetJSONResponse.mockResolvedValue({ passages: [] });
	});

	it('logs the session and project named on the call', async () => {
		const completeJson = createCheckpointCompleteJson();

		await completeJson({ ...call, sessionId: 'session-1', projectId: 'project-1' });
		await completeJson({
			...call,
			operation: 'start_here_synthesis',
			sessionId: 'session-2',
			projectId: 'project-2'
		});

		expect(mockGetJSONResponse.mock.calls[0]![0]).toMatchObject({
			operationType: 'chat_checkpoint_thinking_log',
			chatSessionId: 'session-1',
			projectId: 'project-1',
			userId: 'user-1',
			reasoning: { enabled: false }
		});
		expect(mockGetJSONResponse.mock.calls[1]![0]).toMatchObject({
			operationType: 'chat_checkpoint_start_here_synthesis',
			chatSessionId: 'session-2',
			projectId: 'project-2'
		});
	});

	it('falls back to the ids the port was built with', async () => {
		const completeJson = createCheckpointCompleteJson({
			sessionId: 'backfill-session',
			projectId: 'backfill-project'
		});

		await completeJson(call);

		expect(mockGetJSONResponse.mock.calls[0]![0]).toMatchObject({
			chatSessionId: 'backfill-session',
			projectId: 'backfill-project'
		});
	});
});
