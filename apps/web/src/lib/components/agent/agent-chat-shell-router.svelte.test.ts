// apps/web/src/lib/components/agent/agent-chat-shell-router.svelte.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	createAgentChatShellRouter,
	type AgentChatShellRouter,
	type AgentChatShellRouterDeps
} from './agent-chat-shell-router.svelte';

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
	router = createAgentChatShellRouter({
		resetConversation,
		clearMessages,
		stopVoice,
		isStreaming: () => isStreaming,
		logFocusActivity,
		...overrides
	});

	return {
		router,
		resetConversation,
		clearMessages,
		stopVoice,
		logFocusActivity,
		setStreaming(value: boolean) {
			isStreaming = value;
		}
	};
}

describe('AgentChatShellRouter', () => {
	const documentFocus: ProjectFocus = {
		focusType: 'document',
		focusEntityId: 'doc-1',
		focusEntityName: 'Launch notes',
		projectId: 'project-1',
		projectName: 'Launch'
	};

	it('keeps entity context visible after session and title events', () => {
		const { router } = createHarness();
		router.hydrateFromSession({
			contextType: 'project',
			entityId: 'project-1',
			label: 'Launch',
			projectFocus: documentFocus
		});
		router.hydrateSessionEvent({
			contextType: 'project',
			entityId: 'project-1',
			sessionTitle: 'Brainstorming next steps'
		});
		expect(router.displayContextLabel).toBe('Launch notes (Launch)');
		expect(router.resolvedProjectFocus).toEqual(documentFocus);

		router.handleFocusClear();
		expect(router.displayContextLabel).toBe('Launch');
		expect(router.resolvedProjectFocus).toMatchObject({
			focusType: 'project-wide',
			focusEntityId: null,
			projectName: 'Launch'
		});
	});

	it('applies a modal launch focus once so changing it does not reset the conversation', () => {
		const { router, resetConversation } = createHarness();
		router.initializeFromProjectFocus(documentFocus);
		expect(router.displayContextLabel).toBe('Launch notes (Launch)');
		router.handleFocusClear();
		router.initializeFromProjectFocus({ ...documentFocus, focusEntityName: 'Renamed notes' });
		expect(resetConversation).toHaveBeenCalledTimes(1);
		expect(router.resolvedProjectFocus?.focusType).toBe('project-wide');

		router.resetInitialProjectFocus();
		router.initializeFromProjectFocus(documentFocus);
		expect(resetConversation).toHaveBeenCalledTimes(2);
		expect(router.resolvedProjectFocus).toEqual(documentFocus);
	});

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
});
