// apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.test.ts
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { AgentChatOrchestrator } from './agent-chat-orchestrator';
import type { AgentChatOrchestratorDependencies } from './agent-chat-orchestrator';
import type { AgentChatRequest, StreamEvent } from '../shared/types';

function createStream(events: any[]) {
	return (async function* () {
		for (const event of events) {
			yield event;
		}
	})();
}

describe('AgentChatOrchestrator (flexible loop)', () => {
	let orchestrator: AgentChatOrchestrator;
	let deps: AgentChatOrchestratorDependencies;

	const baseRequest: AgentChatRequest = {
		userId: 'user_123',
		sessionId: 'session_123',
		userMessage: 'Hello there',
		contextType: 'project',
		entityId: 'proj_123',
		conversationHistory: []
	};

	beforeEach(() => {
		deps = {
			planOrchestrator: {
				createPlanFromIntent: vi.fn(),
				createPlan: vi.fn(),
				executePlan: vi.fn(),
				persistDraft: vi.fn(),
				reviewPlan: vi.fn()
			} as any,
			toolExecutionService: {
				executeTool: vi.fn()
			} as any,
			responseSynthesizer: {
				synthesizeComplexResponse: vi.fn()
			} as any,
			persistenceService: {
				createAgent: vi.fn().mockResolvedValue('planner_123'),
				updateAgent: vi.fn(),
				getAgent: vi.fn(),
				createPlan: vi.fn(),
				updatePlan: vi.fn(),
				getPlan: vi.fn(),
				createChatSession: vi.fn(),
				updateChatSession: vi.fn(),
				getChatSession: vi.fn(),
				saveMessage: vi.fn(),
				getMessages: vi.fn(),
				createTimingMetric: vi.fn(),
				updateTimingMetric: vi.fn()
			},
			contextService: {
				buildPlannerContext: vi.fn().mockResolvedValue({
					systemPrompt: 'You are helpful',
					conversationHistory: [],
					locationContext: 'Project summary',
					availableTools: [],
					metadata: {
						sessionId: baseRequest.sessionId,
						contextType: baseRequest.contextType,
						totalTokens: 0,
						hasOntology: false
					}
				})
			} as any,
			llmService: {
				streamText: vi.fn().mockReturnValue(
					createStream([
						{ type: 'text', content: 'Hi!' },
						{ type: 'done', usage: { total_tokens: 10 } }
					])
				)
			} as any,
			errorLogger: {
				logError: vi.fn()
			} as any
		};

		orchestrator = new AgentChatOrchestrator(deps);
	});

	it('streams assistant text and done events', async () => {
		const events: StreamEvent[] = [];
		const callback = vi.fn();

		for await (const event of orchestrator.streamConversation(baseRequest, callback)) {
			events.push(event);
		}

		expect(events.map((e) => e.type)).toEqual(['agent_state', 'text', 'agent_state', 'done']);
		expect(callback).toHaveBeenCalled();
		expect(deps.persistenceService.createAgent).toHaveBeenCalled();
		expect(deps.llmService.streamText).toHaveBeenCalled();
	});
});
