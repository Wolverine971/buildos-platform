// apps/web/src/lib/components/agent/agent-chat-shell-router.svelte.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	createAgentChatShellRouter,
	type AgentChatShellRouter,
	type AgentChatShellRouterDeps
} from './agent-chat-shell-router.svelte';

function jsonResponse(body: unknown, ok = true): Response {
	return {
		ok,
		status: ok ? 200 : 400,
		statusText: ok ? 'OK' : 'Bad Request',
		json: vi.fn().mockResolvedValue(body)
	} as unknown as Response;
}

function createHarness(
	overrides: Partial<AgentChatShellRouterDeps> & { isStreaming?: boolean } = {}
) {
	let router!: AgentChatShellRouter;
	let isStreaming = overrides.isStreaming ?? false;
	const resetConversation = vi.fn((options?: { preserveContext?: boolean }) => {
		router.resetConversationState(options);
	});
	const clearMessages = vi.fn();
	const stopVoice = vi.fn();
	const logFocusActivity = vi.fn();
	const fetchImpl =
		overrides.fetchImpl ??
		(vi.fn().mockResolvedValue(
			jsonResponse({
				success: true,
				data: {
					projects: [
						{
							id: 'project-1',
							name: 'Project One',
							description: 'Main project'
						}
					]
				}
			})
		) as unknown as typeof fetch);

	router = createAgentChatShellRouter({
		resetConversation,
		clearMessages,
		stopVoice,
		isStreaming: () => isStreaming,
		logFocusActivity,
		fetchImpl,
		logError: vi.fn(),
		...overrides
	});

	return {
		router,
		resetConversation,
		clearMessages,
		stopVoice,
		logFocusActivity,
		fetchImpl,
		setStreaming(value: boolean) {
			isStreaming = value;
		}
	};
}

describe('AgentChatShellRouter', () => {
	it('routes a project context selection through the project action selector', () => {
		const h = createHarness();

		h.router.handleContextSelect({
			contextType: 'project',
			entityId: 'project-1',
			label: 'Project One'
		});

		expect(h.resetConversation).toHaveBeenCalledWith();
		expect(h.router.selectedContextType).toBe('project');
		expect(h.router.selectedEntityId).toBe('project-1');
		expect(h.router.selectedContextLabel).toBe('Project One');
		expect(h.router.projectFocus).toMatchObject({
			focusType: 'project-wide',
			projectId: 'project-1',
			projectName: 'Project One'
		});
		expect(h.router.showContextSelection).toBe(false);
		expect(h.router.showProjectActionSelector).toBe(true);
	});

	it('auto-selects the single helper and advances agent-to-agent to project selection', () => {
		const h = createHarness();

		h.router.handleContextSelect({
			contextType: 'agent_to_agent',
			label: 'Agent handoff'
		});

		expect(h.router.agentToAgentMode).toBe(true);
		expect(h.router.agentToAgentStep).toBe('project');
		expect(h.router.selectedAgentId).toBe('actionable_insight_agent');
		expect(h.router.selectedContextType).toBe(null);
		expect(h.router.selectedContextLabel).toBe('Agent handoff');
		expect(h.fetchImpl).toHaveBeenCalledWith(
			'/api/onto/projects',
			expect.objectContaining({ method: 'GET' })
		);
	});

	it('exits the single-helper wizard from project step back to context selection', () => {
		const h = createHarness();
		h.router.agentToAgentMode = true;
		h.router.agentToAgentStep = 'project';
		h.router.selectedAgentId = 'actionable_insight_agent';
		h.router.showContextSelection = false;

		h.router.handleBackNavigation();

		expect(h.stopVoice).toHaveBeenCalled();
		expect(h.resetConversation).toHaveBeenCalledWith({ preserveContext: false });
		expect(h.router.agentToAgentMode).toBe(false);
		expect(h.router.agentToAgentStep).toBe(null);
		expect(h.router.showContextSelection).toBe(true);
	});

	it('focus selection from the project action selector enters focused project chat', () => {
		const h = createHarness();
		const focus: ProjectFocus = {
			focusType: 'task',
			projectId: 'project-1',
			projectName: 'Project One',
			focusEntityId: 'task-1',
			focusEntityName: 'Launch task'
		};
		h.router.showProjectActionSelector = true;

		h.router.handleFocusSelection(focus);

		expect(h.logFocusActivity).toHaveBeenCalledWith('Focus updated', focus);
		expect(h.clearMessages).toHaveBeenCalledTimes(1);
		expect(h.router.selectedContextType).toBe('project');
		expect(h.router.selectedContextLabel).toBe('Project One');
		expect(h.router.showProjectActionSelector).toBe(false);
		expect(h.router.showFocusSelector).toBe(false);
		expect(h.router.showContextSelection).toBe(false);
	});

	it('validates and starts an agent-to-agent chat loop from wizard state', () => {
		const h = createHarness();

		expect(h.router.beginAgentToAgentChat()).toBe('Select a helper to start.');

		h.router.selectedAgentId = 'actionable_insight_agent';
		h.router.selectedContextType = 'project';
		h.router.selectedEntityId = 'project-1';
		h.router.agentGoal = 'Find the next action';
		h.router.agentTurnBudget = 3;

		expect(h.router.beginAgentToAgentChat()).toBe(null);
		expect(h.resetConversation).toHaveBeenLastCalledWith({ preserveContext: true });
		expect(h.router.agentLoopActive).toBe(true);
		expect(h.router.agentToAgentMode).toBe(true);
		expect(h.router.agentToAgentStep).toBe('chat');
		expect(h.router.agentTurnsRemaining).toBe(3);
	});
});
