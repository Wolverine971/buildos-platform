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
		async getUsageSnapshotWithCompressionBaseline() {
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

	it('stores contact clarification metadata when candidate ids are emitted', async () => {
		const handler = new StreamHandler({} as any);
		const state = {
			assistantResponse: '',
			toolCalls: [],
			toolResults: [],
			totalTokens: 0,
			completionSent: false,
			contextShiftOccurred: false,
			effectiveContextType: 'global',
			pendingMetadataUpdates: {},
			hasPendingMetadataUpdate: false
		} as any;
		const sessionMetadata = {} as any;

		await (handler as any).handleClarifyingQuestions(
			{
				questions: ['Are these the same person?'],
				contactMetadata: { candidateIds: ['candidate_1'] }
			},
			state,
			sessionMetadata,
			'global',
			'session_1'
		);

		expect(sessionMetadata.contactClarification).toMatchObject({
			candidateIds: ['candidate_1'],
			awaitingResponse: true,
			cooldownUntil: null
		});
		expect(state.pendingMetadataUpdates.contactClarification?.candidateIds).toEqual([
			'candidate_1'
		]);
		expect(state.hasPendingMetadataUpdate).toBe(true);
	});

	it('classifies explicit contact clarification yes/no/snooze responses', () => {
		const handler = new StreamHandler({} as any);
		expect((handler as any).classifyContactClarificationResponse('yes, same person')).toBe(
			'confirmed_merge'
		);
		expect((handler as any).classifyContactClarificationResponse('no, different person')).toBe(
			'rejected'
		);
		expect((handler as any).classifyContactClarificationResponse('not sure, later')).toBe(
			'snoozed'
		);
		expect((handler as any).classifyContactClarificationResponse('maybe')).toBeNull();
	});

	it('applies cooldown when contact clarification is ignored', async () => {
		const handler = new StreamHandler({} as any);
		const state = {
			assistantResponse: '',
			toolCalls: [],
			toolResults: [],
			totalTokens: 0,
			completionSent: false,
			contextShiftOccurred: false,
			effectiveContextType: 'global',
			pendingMetadataUpdates: {},
			hasPendingMetadataUpdate: false
		} as any;
		const sessionMetadata = {
			contactClarification: {
				candidateIds: ['candidate_2'],
				awaitingResponse: true,
				askedAt: new Date().toISOString()
			}
		} as any;

		await (handler as any).processPendingContactClarification({
			state,
			sessionMetadata,
			userId: 'user_1',
			actorId: 'actor_1',
			userMessage: "Can you summarize today's priorities?",
			sessionId: 'session_1'
		});

		expect(sessionMetadata.contactClarification.cooldownUntil).toBeTypeOf('string');
		expect(sessionMetadata.contactClarification.ignoredCount).toBe(1);
		expect(state.hasPendingMetadataUpdate).toBe(true);
	});
});
