// apps/web/src/lib/components/agent/agent-chat-shell-router.svelte.ts
//
// Owns AgentChatModal's shell routing state: context selection, project action,
// and focus screens. Chat/session/message lifecycle remains in the modal and
// stream controller.

import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import { CONTEXT_DESCRIPTORS } from './agent-chat.constants';
import { buildProjectWideFocus, isProjectContext } from './agent-chat-session';
import type { ProjectAction } from './agent-chat.types';

export interface AutoInitProjectConfig {
	projectId: string;
	projectName: string;
	showActionSelector?: boolean;
	initialAction?: ProjectAction;
}

export interface ContextSelectionDetail {
	contextType: ChatContextType;
	entityId?: string;
	label?: string;
}

export interface AgentChatShellRouterDeps {
	resetConversation(options?: { preserveContext?: boolean }): void;
	clearMessages(): void;
	stopVoice(): void;
	isStreaming(): boolean;
	logFocusActivity(label: string, focus: ProjectFocus): void;
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

	constructor(private readonly deps: AgentChatShellRouterDeps) {}

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

	resetConversationState(options: { preserveContext?: boolean } = {}): void {
		const { preserveContext = true } = options;
		this.showFocusSelector = false;
		this.showProjectActionSelector = false;
		if (!preserveContext) {
			this.selectedContextType = null;
			this.selectedEntityId = undefined;
			this.selectedContextLabel = null;
			this.projectFocus = null;
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
