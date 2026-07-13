// apps/web/src/lib/services/agentic-chat-v2/stream-request-client.test.ts
import { describe, expect, it } from 'vitest';
import { buildFastAgentStreamRequestBody } from './stream-request-client';

describe('buildFastAgentStreamRequestBody', () => {
	it('builds the canonical modal and harness wire shape', () => {
		expect(
			buildFastAgentStreamRequestBody({
				message: 'Hello',
				sessionId: 'session-1',
				contextType: 'project',
				entityId: 'project-1',
				projectFocus: { projectId: 'project-1' },
				streamRunId: 'stream-1',
				clientTurnId: 'turn-1',
				preparedPromptKey: 'prepared-1'
			})
		).toEqual({
			message: 'Hello',
			session_id: 'session-1',
			context_type: 'project',
			entity_id: 'project-1',
			attachments: [],
			projectFocus: { projectId: 'project-1' },
			lastTurnContext: null,
			stream_run_id: 'stream-1',
			client_turn_id: 'turn-1',
			voiceNoteGroupId: null,
			preparedPromptKey: 'prepared-1'
		});
	});
});
