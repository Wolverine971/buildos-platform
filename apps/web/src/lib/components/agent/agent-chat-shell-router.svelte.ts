// apps/web/src/lib/components/agent/agent-chat-shell-router.svelte.ts
//
// Owns AgentChatModal's shell routing state: context selection, project action
// and focus screens, plus the agent-to-agent wizard state. Chat/session/message
// lifecycle remains in the modal and stream controller.

import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
import { buildProjectWideFocus, isProjectContext } from './agent-chat-session';
import type { AgentProjectSummary, AgentToAgentStep, ProjectAction } from './agent-chat.types';

export interface AutoInitProjectConfig {
	projectId: string;
	projectName: string;
	showActionSelector?: boolean;
	initialAction?: ProjectAction;
}

export type ContextSelectionType = ChatContextType | 'agent_to_agent';

export interface ContextSelectionDetail {
	contextType: ContextSelectionType;
	entityId?: string;
	label?: string;
}

export interface AgentChatShellRouterDeps {
	resetConversation(options?: { preserveContext?: boolean }): void;
	clearMessages(): void;
	stopVoice(): void;
	isStreaming(): boolean;
	logFocusActivity(label: string, focus: ProjectFocus): void;
	fetchImpl?: typeof fetch;
	logError?(message: string, err: unknown): void;
	hasMultipleAgentHelpers?: boolean;
	researchAgentId?: string;
}

export class AgentChatShellRouter {
	selectedContextType = $state<ChatContextType | null>(null);
	selectedEntityId = $state<string | undefined>(undefined);
	selectedContextLabel = $state<string | null>(null);
	projectFocus = $state<ProjectFocus | null>(null);
	showFocusSelector = $state(false);
	showProjectActionSelector = $state(false);
	showContextSelection = $state(true);
	contextSelectionView = $state<'primary' | 'project-selection'>('primary');
	contextSelectionRef = $state<any>(null);
	autoInitDismissed = $state(false);
	lastAutoInitProjectId = $state<string | null>(null);

	agentToAgentMode = $state(false);
	agentToAgentStep = $state<AgentToAgentStep | null>(null);
	agentGoal = $state('');
	selectedAgentId = $state<string | null>(null);
	agentLoopActive = $state(false);
	agentMessageLoading = $state(false);
	agentTurnBudget = $state(5);
	agentTurnsRemaining = $state(5);
	agentProjects = $state<AgentProjectSummary[]>([]);
	agentProjectsError = $state<string | null>(null);
	agentProjectsLoading = $state(false);

	readonly hasMultipleAgentHelpers: boolean;
	readonly researchAgentId: string;
	#fetch: typeof fetch;

	constructor(private readonly deps: AgentChatShellRouterDeps) {
		this.hasMultipleAgentHelpers = deps.hasMultipleAgentHelpers ?? false;
		this.researchAgentId = deps.researchAgentId ?? 'actionable_insight_agent';
		this.#fetch = deps.fetchImpl ?? fetch;
	}

	get contextDescriptor() {
		return this.selectedContextType ? CONTEXT_DESCRIPTORS[this.selectedContextType] : null;
	}

	get displayContextLabel(): string {
		if (!this.selectedContextType) {
			return 'Select a focus to begin';
		}
		return this.selectedContextLabel ?? this.contextDescriptor?.title ?? 'Selected focus';
	}

	get displayContextSubtitle(): string {
		if (!this.selectedContextType) {
			return 'Choose what you want to work on before starting the conversation.';
		}
		return this.contextDescriptor?.subtitle ?? '';
	}

	get defaultProjectFocus(): ProjectFocus | null {
		if (isProjectContext(this.selectedContextType) && this.selectedEntityId) {
			return buildProjectWideFocus(this.selectedEntityId, this.selectedContextLabel);
		}
		return null;
	}

	get resolvedProjectFocus(): ProjectFocus | null {
		if (!isProjectContext(this.selectedContextType)) {
			return null;
		}
		return this.projectFocus ?? this.defaultProjectFocus;
	}

	get selectedAgentLabel(): string {
		return this.selectedAgentId ? 'Actionable Insight' : 'Select a helper';
	}

	resetConversationState(options: { preserveContext?: boolean } = {}): void {
		const { preserveContext = true } = options;
		this.showFocusSelector = false;
		this.showProjectActionSelector = false;
		this.agentLoopActive = false;
		this.agentMessageLoading = false;
		this.agentTurnBudget = 5;
		this.agentTurnsRemaining = 5;

		if (!preserveContext) {
			this.selectedContextType = null;
			this.selectedEntityId = undefined;
			this.selectedContextLabel = null;
			this.projectFocus = null;
			this.agentToAgentMode = false;
			this.agentToAgentStep = null;
			this.selectedAgentId = null;
			this.agentGoal = '';
			this.agentProjects = [];
			this.agentProjectsError = null;
			this.agentProjectsLoading = false;
		}
	}

	handleBackNavigation(): void {
		if (this.deps.isStreaming()) return;
		this.deps.stopVoice();

		if (this.showContextSelection && this.contextSelectionView !== 'primary') {
			this.contextSelectionRef?.handleBackNavigation?.();
		} else if (this.showFocusSelector) {
			this.showFocusSelector = false;
		} else if (this.showProjectActionSelector) {
			this.autoInitDismissed = true;
			this.showProjectActionSelector = false;
			this.deps.resetConversation({ preserveContext: false });
			this.showContextSelection = true;
		} else if (this.agentToAgentMode && this.agentToAgentStep === 'goal') {
			this.backToAgentProjectSelection();
		} else if (this.agentToAgentMode && this.agentToAgentStep === 'project') {
			if (this.hasMultipleAgentHelpers) {
				this.backToAgentSelection();
			} else {
				this.agentToAgentMode = false;
				this.agentToAgentStep = null;
				this.changeContext();
			}
		} else if (this.agentToAgentMode && this.agentToAgentStep === 'agent') {
			this.agentToAgentMode = false;
			this.agentToAgentStep = null;
			this.changeContext();
		} else {
			this.changeContext();
		}
	}

	handleContextSelectionNavChange(view: 'primary' | 'project-selection'): void {
		this.contextSelectionView = view;
	}

	handleContextSelect(selection: ContextSelectionDetail): void {
		this.deps.resetConversation();
		this.autoInitDismissed = true;

		if (selection.contextType === 'agent_to_agent') {
			this.agentToAgentMode = true;
			this.agentToAgentStep = 'agent';
			this.selectedAgentId = null;
			this.selectedContextType = null;
			this.selectedContextLabel = selection.label ?? 'BuildOS automation';
			this.projectFocus = null;
			this.showContextSelection = false;

			if (!this.hasMultipleAgentHelpers) {
				this.selectAgentForBridge(this.researchAgentId);
			}
			return;
		}

		this.agentToAgentMode = false;
		this.agentToAgentStep = null;
		this.selectedAgentId = null;
		this.agentGoal = '';
		this.agentLoopActive = false;
		this.agentMessageLoading = false;
		this.selectedContextType = selection.contextType;
		this.selectedEntityId = selection.entityId;
		this.selectedContextLabel =
			selection.label ?? CONTEXT_DESCRIPTORS[selection.contextType]?.title ?? null;
		this.showContextSelection = false;

		if (isProjectContext(selection.contextType) && selection.entityId) {
			this.projectFocus = buildProjectWideFocus(selection.entityId, selection.label);
		} else {
			this.projectFocus = null;
			this.showFocusSelector = false;
		}

		this.showProjectActionSelector = selection.contextType === 'project';
	}

	changeContext(): void {
		if (this.deps.isStreaming()) return;
		this.deps.stopVoice();
		this.autoInitDismissed = true;
		this.deps.resetConversation({ preserveContext: false });
		this.showContextSelection = true;
		this.showProjectActionSelector = false;
	}

	openFocusSelector(): void {
		if (!isProjectContext(this.selectedContextType) || !this.selectedEntityId) return;
		this.showFocusSelector = true;
	}

	handleFocusSelection(newFocus: ProjectFocus): void {
		const isStartingFresh = this.showProjectActionSelector;
		this.projectFocus = newFocus;
		this.deps.logFocusActivity('Focus updated', newFocus);
		this.selectedContextType = 'project';
		this.selectedContextLabel = this.buildContextLabelForAction(
			'workspace',
			newFocus.projectName
		);
		this.showProjectActionSelector = false;
		this.showFocusSelector = false;
		this.showContextSelection = false;

		if (isStartingFresh) {
			this.deps.clearMessages();
		}
	}

	handleFocusClear(): void {
		const defaultFocus = this.defaultProjectFocus;
		if (!defaultFocus) return;
		this.projectFocus = defaultFocus;
		this.deps.logFocusActivity('Focus reset', defaultFocus);
	}

	applyProjectAction(
		action: ProjectAction,
		projectId: string,
		projectName?: string | null,
		options: { skipReset?: boolean } = {}
	): void {
		if (!projectId) return;
		if (!options.skipReset) {
			this.deps.resetConversation({ preserveContext: false });
		}

		const contextType = this.mapActionToContextType(action);
		const label = this.buildContextLabelForAction(action, projectName);

		this.selectedContextType = contextType;
		this.selectedEntityId = projectId;
		this.selectedContextLabel = label;
		this.projectFocus = buildProjectWideFocus(projectId, projectName ?? label);
		this.showContextSelection = false;
		this.showProjectActionSelector = false;
		this.showFocusSelector = false;
		this.agentToAgentMode = false;
		this.agentToAgentStep = null;
	}

	primeProjectContext(projectId: string, projectName: string | null | undefined): void {
		if (!projectId) return;
		this.deps.resetConversation({ preserveContext: false });
		this.selectedContextType = 'project';
		this.selectedEntityId = projectId;
		this.selectedContextLabel = this.buildContextLabelForAction('workspace', projectName);
		this.projectFocus = buildProjectWideFocus(projectId, projectName);
		this.showContextSelection = false;
		this.showProjectActionSelector = true;
		this.showFocusSelector = false;
		this.agentToAgentMode = false;
		this.agentToAgentStep = null;
	}

	handleProjectActionSelect(action: ProjectAction): void {
		if (!this.selectedEntityId) return;
		const projectName = this.projectFocus?.projectName ?? this.selectedContextLabel;
		this.applyProjectAction(action, this.selectedEntityId, projectName, { skipReset: false });
	}

	initializeFromAutoInit(config: AutoInitProjectConfig): void {
		if (!config?.projectId) return;

		const showSelector = config.showActionSelector ?? true;
		const action = config.initialAction ?? 'workspace';

		this.lastAutoInitProjectId = config.projectId;
		this.autoInitDismissed = false;

		if (showSelector && !config.initialAction) {
			this.primeProjectContext(config.projectId, config.projectName);
			return;
		}

		this.deps.resetConversation({ preserveContext: false });
		this.applyProjectAction(action, config.projectId, config.projectName, {
			skipReset: true
		});
	}

	async loadAgentProjects(force = false): Promise<void> {
		if (this.agentProjectsLoading || (!force && this.agentProjects.length > 0)) return;
		this.agentProjectsLoading = true;
		this.agentProjectsError = null;
		try {
			const response = await this.#fetch('/api/onto/projects', {
				method: 'GET',
				credentials: 'same-origin',
				cache: 'no-store',
				headers: { Accept: 'application/json' }
			});
			const payload = await response.json();
			if (!response.ok || payload?.success === false) {
				this.agentProjectsError = payload?.error || 'Failed to load projects';
				this.agentProjects = [];
				return;
			}
			const fetched = payload?.data?.projects ?? payload?.projects ?? [];
			this.agentProjects = fetched.map((project: any) => ({
				id: project.id,
				name: project.name ?? 'Untitled project',
				description: project.description ?? null
			}));
		} catch (err) {
			this.deps.logError?.('[AgentChat] Failed to load projects for agent bridge', err);
			this.agentProjectsError = 'Failed to load projects';
		} finally {
			this.agentProjectsLoading = false;
		}
	}

	selectAgentForBridge(agentId: string): void {
		this.selectedAgentId = agentId;
		this.agentToAgentStep = 'project';
		void this.loadAgentProjects(true);
	}

	selectAgentProject(project: AgentProjectSummary): void {
		this.selectedContextType = 'project';
		this.selectedEntityId = project.id;
		this.selectedContextLabel = project.name;
		this.projectFocus = buildProjectWideFocus(project.id, project.name);
		this.agentToAgentStep = 'goal';
	}

	backToAgentSelection(): void {
		this.agentToAgentStep = 'agent';
		this.agentLoopActive = false;
	}

	backToAgentProjectSelection(): void {
		this.agentToAgentStep = 'project';
		this.agentLoopActive = false;
	}

	updateAgentTurnBudget(value: number): void {
		const sanitized = Math.max(1, Math.min(50, Math.round(value)));
		this.agentTurnBudget = sanitized;
		if (!this.agentLoopActive && !this.agentMessageLoading && !this.deps.isStreaming()) {
			this.agentTurnsRemaining = sanitized;
		}
	}

	beginAgentToAgentChat(): string | null {
		if (this.deps.isStreaming() || this.agentMessageLoading) return null;
		if (!this.selectedAgentId) return 'Select a helper to start.';
		if (!this.selectedEntityId || this.selectedContextType !== 'project') {
			return 'Select a project to start.';
		}
		if (!this.agentGoal.trim()) return 'Add a goal for BuildOS to pursue.';
		if (this.agentTurnBudget <= 0) return 'Set at least 1 turn before starting.';

		const selectedTurnBudget = this.agentTurnBudget;
		this.deps.resetConversation({ preserveContext: true });
		this.agentTurnBudget = selectedTurnBudget;
		this.agentLoopActive = true;
		this.agentToAgentMode = true;
		this.agentToAgentStep = 'chat';
		this.agentTurnsRemaining = selectedTurnBudget;
		return null;
	}

	stopAgentLoop(): void {
		this.agentLoopActive = false;
	}

	setDirectContext(params: {
		contextType: ChatContextType;
		entityId?: string;
		label?: string | null;
		showContextSelection?: boolean;
		showProjectActionSelector?: boolean;
		projectFocus?: ProjectFocus | null;
	}): void {
		this.selectedContextType = params.contextType;
		this.selectedEntityId = params.entityId;
		this.selectedContextLabel =
			params.label ?? CONTEXT_DESCRIPTORS[params.contextType]?.title ?? null;
		if (params.projectFocus !== undefined) {
			this.projectFocus = params.projectFocus;
		}
		this.showContextSelection = params.showContextSelection ?? false;
		this.showProjectActionSelector = params.showProjectActionSelector ?? false;
	}

	hydrateFromSession(params: {
		contextType: ChatContextType;
		entityId?: string;
		label: string;
		projectFocus: ProjectFocus | null;
	}): void {
		this.selectedContextType = params.contextType;
		this.selectedEntityId = params.entityId;
		this.selectedContextLabel = params.label;
		this.projectFocus = params.projectFocus;
		this.showContextSelection = false;
		this.showProjectActionSelector = false;
	}

	hydrateSessionEvent(params: {
		contextType: ChatContextType;
		entityId?: string;
		sessionTitle?: string | null;
		metadataFocus?: ProjectFocus | null;
	}): void {
		if (!this.selectedContextType) {
			this.selectedContextType = params.contextType;
			this.selectedEntityId = params.entityId;
			this.selectedContextLabel =
				params.sessionTitle ||
				CONTEXT_DESCRIPTORS[params.contextType]?.title ||
				this.selectedContextLabel;
			this.showContextSelection = false;
		} else if (params.sessionTitle) {
			this.selectedContextLabel = params.sessionTitle;
		}

		if (params.contextType === 'project' && params.entityId && !this.projectFocus) {
			this.projectFocus = buildProjectWideFocus(
				params.entityId,
				params.sessionTitle ?? this.selectedContextLabel
			);
		}

		if (params.metadataFocus) {
			this.projectFocus = params.metadataFocus;
		}
	}

	setSelectedContext(params: {
		contextType: ChatContextType;
		entityId?: string;
		label: string | null;
	}): { shiftedToNewProject: boolean } {
		const shiftedToNewProject =
			isProjectContext(params.contextType) &&
			!!params.entityId &&
			(params.entityId !== this.selectedEntityId ||
				!isProjectContext(this.selectedContextType));
		this.selectedContextType = params.contextType;
		this.selectedEntityId = params.entityId;
		this.selectedContextLabel = params.label;
		return { shiftedToNewProject };
	}

	private mapActionToContextType(_action: ProjectAction): ChatContextType {
		return 'project';
	}

	private buildContextLabelForAction(
		_action: ProjectAction,
		projectName?: string | null
	): string {
		return projectName?.trim() || 'Project';
	}
}

export function createAgentChatShellRouter(deps: AgentChatShellRouterDeps): AgentChatShellRouter {
	return new AgentChatShellRouter(deps);
}
