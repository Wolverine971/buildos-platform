// apps/web/src/routes/api/agent/stream/services/stream-handler.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgentSSEMessage, ChatSession, ChatMessage } from '@buildos/shared-types';
import type { StreamRequest } from '../types';
import { StreamHandler } from './stream-handler';

// Track SSE messages and close calls
const messages: AgentSSEMessage[] = [];
let closed = false;

const sendMessageMock = vi.fn(async (msg: AgentSSEMessage) => {
	messages.push(msg);
});

const closeMock = vi.fn(async () => {
	closed = true;
});

vi.mock('$lib/utils/sse-response', () => ({
	SSEResponse: {
		createChatStream: () => ({
			sendMessage: sendMessageMock,
			close: closeMock,
			response: new Response(null)
		})
	}
}));

vi.mock('$lib/services/chat-compression-service', () => ({
	ChatCompressionService: class {
		async getContextUsageSnapshot() {
			return {
				estimatedTokens: 10,
				tokenBudget: 2500,
				usagePercent: 1,
				tokensRemaining: 2490,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			};
		}
	}
}));

vi.mock('$lib/services/agentic-chat', () => ({
	createAgentChatOrchestrator: () => ({
		// Throw immediately to hit error path before any done event is emitted
		streamConversation: async function* () {
			throw new Error('orchestrator failure');
		}
	})
}));

describe('StreamHandler error semantics', () => {
	it('sends error then done before closing the stream', async () => {
		messages.length = 0;
		closed = false;
		sendMessageMock.mockClear();
		closeMock.mockClear();

		const supabase = {} as any;
		const handler = new StreamHandler(supabase);

		const session = { id: 'sess_1' } as unknown as ChatSession;
		const request: StreamRequest = {
			message: 'hello',
			context_type: 'global'
		};

		handler.createAgentStream({
			supabase,
			fetch,
			request,
			session,
			ontologyContext: null,
			metadata: {},
			conversationHistory: [] as ChatMessage[],
			userId: 'user_1',
			actorId: 'actor_1'
		});

		// Allow async orchestration to run
		await new Promise((resolve) => setTimeout(resolve, 0));
		await new Promise((resolve) => setTimeout(resolve, 0));

		const errorAndDone = messages
			.filter((m) => m.type === 'error' || m.type === 'done')
			.map((m) => m.type);

		expect(errorAndDone).toEqual(['error', 'done']);
		expect(closed).toBe(true);
	});
});
