// apps/web/src/lib/services/agentic-chat/project-domain-profiles.ts
// Shared implementation for web admission and worker context preparation.
export {
	AGENT_WORKSPACE_PROP,
	LIVING_REFERENCE_MODE,
	type AgentWorkspaceMetadata,
	type ProjectDomainProfile,
	FICTION_STORY_PROFILE,
	resolveProjectDomainProfile,
	looksLikeLivingWorkspaceCommission,
	looksLikeFictionStoryCraftTurn,
	resolveProjectDomainRuntimeSkillId,
	readAgentWorkspaceMetadata,
	resolveAgentWorkspaceFromContextData,
	applyProjectCreationProfileDefaults,
	hasExplicitProjectScheduleSignal,
	validateProjectCreationMilestoneGrounding,
	validateFictionOperationalScaffoldingGrounding,
	validateFictionCharacterSourceCoverage,
	validateFictionStructureSourceCoverage,
	validateProjectCreationProfileGrounding,
	renderProjectCreationProfileGuidance
} from '@buildos/agentic-chat-runtime/context';
