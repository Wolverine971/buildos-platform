// apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts

import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

export type PromptEvalReplayRequest = {
	message: string;
	contextType?: ChatContextType;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
};

export type PromptEvalScenario = {
	slug: string;
	version: string;
	title: string;
	description: string;
	category: 'overview' | 'workflow' | 'calendar' | 'safety';
	replayRequest?: PromptEvalReplayRequest;
	expectedFirstLane?: 'overview' | 'skill_first' | 'direct_exact_op' | 'unknown';
	expectedFirstOps?: string[];
	expectedFirstSkills?: string[];
	requiredObservedOps?: string[];
	requiredObservedSkillPaths?: string[];
	requiredEventTypes?: string[];
	maxValidationFailures?: number;
	requirePromptSnapshot?: boolean;
	requireAssistantAnswer?: boolean;
	requireCompletedStatus?: boolean;
	forbiddenAssistantPatterns?: string[];
};

const DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS = [
	'No, wait',
	'args need',
	'tool_exec(',
	'< xai:function_call',
	'Correct that.',
	'Actually, for tool_exec'
];

const SCENARIOS: PromptEvalScenario[] = [
	{
		slug: 'workspace.my_projects_status',
		version: '1',
		title: 'Workspace Status Overview',
		description:
			'Checks that a broad portfolio status question routes through the workspace overview lane instead of generic search/list churn.',
		category: 'overview',
		replayRequest: {
			message: 'What is happening with my projects?',
			contextType: 'global'
		},
		expectedFirstLane: 'overview',
		expectedFirstOps: ['util.workspace.overview'],
		requiredObservedOps: ['util.workspace.overview'],
		requiredEventTypes: ['prompt_snapshot_created', 'done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'project.named_status',
		version: '1',
		title: 'Named Project Status Overview',
		description:
			'Checks that a named-project status question resolves through the project overview path with no validation churn.',
		category: 'overview',
		replayRequest: {
			message: "What's going on with 9takes?",
			contextType: 'global'
		},
		expectedFirstLane: 'overview',
		expectedFirstOps: ['util.project.overview'],
		requiredObservedOps: ['util.project.overview'],
		requiredEventTypes: ['prompt_snapshot_created', 'done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'workflow.audit.project_health',
		version: '1',
		title: 'Project Health Audit',
		description:
			'Checks that an audit-style prompt uses the workflow audit skill rather than staying at a generic overview only.',
		category: 'workflow',
		replayRequest: {
			message: 'Audit the health of 9takes',
			contextType: 'global'
		},
		requiredObservedOps: ['util.project.overview'],
		requiredObservedSkillPaths: ['workflow.audit.skill'],
		requiredEventTypes: ['skill_loaded', 'done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'workflow.forecast.project_slip',
		version: '1',
		title: 'Project Slip Forecast',
		description:
			'Checks that a forecast prompt loads the forecast skill and completes without validation thrash.',
		category: 'workflow',
		replayRequest: {
			message: 'Forecast what is likely to slip in 9takes',
			contextType: 'global'
		},
		requiredObservedOps: ['util.project.overview'],
		requiredObservedSkillPaths: ['workflow.forecast.skill'],
		requiredEventTypes: ['skill_loaded', 'done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'calendar.read.tomorrow',
		version: '1',
		title: 'Calendar Read',
		description:
			'Checks that a basic calendar-read question uses the calendar lane and avoids missing-parameter errors.',
		category: 'calendar',
		replayRequest: {
			message: 'What is on my calendar tomorrow?',
			contextType: 'global'
		},
		requiredObservedSkillPaths: ['cal.skill'],
		requiredObservedOps: ['cal.event.list'],
		requiredEventTypes: ['done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'calendar.move_named_event',
		version: '1',
		title: 'Calendar Event Move',
		description:
			'Checks that a reschedule prompt loads the calendar skill and reaches a calendar update op without required-id failures.',
		category: 'calendar',
		replayRequest: {
			message: 'Move my 9takes review to Friday at 2pm',
			contextType: 'global'
		},
		requiredObservedSkillPaths: ['cal.skill'],
		requiredObservedOps: ['cal.event.update'],
		requiredEventTypes: ['skill_loaded', 'done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'safety.no_missing_id_thrash',
		version: '1',
		title: 'No Missing-ID Thrash',
		description:
			'Checks that a turn does not spiral into repeated missing-parameter validation failures or leak scratchpad text.',
		category: 'safety',
		replayRequest: {
			message: 'Move my 9takes review to Friday at 2pm',
			contextType: 'global'
		},
		requiredEventTypes: ['done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	}
];

export function listPromptEvalScenarios(): PromptEvalScenario[] {
	return [...SCENARIOS];
}

export function getPromptEvalScenario(slug: string | null | undefined): PromptEvalScenario | null {
	if (typeof slug !== 'string') return null;
	const normalized = slug.trim();
	if (!normalized) return null;
	return SCENARIOS.find((scenario) => scenario.slug === normalized) ?? null;
}

export function isPromptEvalScenarioReplayable(
	scenario: PromptEvalScenario | null | undefined
): boolean {
	return Boolean(scenario?.replayRequest?.message?.trim());
}
