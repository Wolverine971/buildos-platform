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
	requiredObservedToolNames?: string[];
	forbiddenObservedToolNames?: string[];
	requiredObservedSkillPaths?: string[];
	requiredEventTypes?: string[];
	expectedFinishedReason?: string;
	maxValidationFailures?: number;
	requirePromptSnapshot?: boolean;
	requireAssistantAnswer?: boolean;
	requireCompletedStatus?: boolean;
	forbiddenAssistantPatterns?: string[];
};

const DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS = [
	'No, wait',
	'args need',
	'< xai:function_call',
	'Correct that.',
	'raw tool protocol',
	'<parameter name=',
	'</parameter>',
	'<tool_call',
	'<function_call',
	'<arguments>'
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
		forbiddenObservedToolNames: ['outcome_card_load', 'work_capability_load'],
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
		slug: 'workflow.outcome_card.cold_email_campaign_build',
		version: '1',
		title: 'Cold Email Campaign Outcome Card',
		description:
			'Checks that a known composite cold-email campaign request loads the outcome card before choosing deeper skills or tools.',
		category: 'workflow',
		replayRequest: {
			message: 'Build a cold email campaign for founders at AI devtools startups.',
			contextType: 'global'
		},
		requiredObservedToolNames: ['outcome_card_load'],
		requiredEventTypes: ['done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'workflow.outcome_card.youtube_growth_strategy',
		version: '1',
		title: 'YouTube Growth Strategy Outcome Card',
		description:
			'Checks that a channel-level YouTube growth request routes through the strategy outcome card instead of only generic skill search.',
		category: 'workflow',
		replayRequest: {
			message: 'I want to grow my YouTube audience and plan the next videos.',
			contextType: 'global'
		},
		requiredObservedToolNames: ['outcome_card_load'],
		requiredEventTypes: ['done_emitted'],
		maxValidationFailures: 0,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'workflow.outcome_card.ui_ux_screen_review',
		version: '1',
		title: 'UI/UX Screen Review Outcome Card',
		description:
			'Checks that a product screen review routes through the UI/UX screen review outcome card when a cross-lens quality bar would help.',
		category: 'workflow',
		replayRequest: {
			message:
				'Review this dashboard screen for UX clarity, visual hierarchy, accessibility, and concrete fixes.',
			contextType: 'global'
		},
		requiredObservedToolNames: ['outcome_card_load'],
		requiredEventTypes: ['done_emitted'],
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
		slug: 'project.create.fantasy_novel',
		version: '1',
		title: 'Fantasy Novel Project Creation',
		description:
			'Seeds the fantasy-novel audit scenario. Verifies that a stated-outcome project creation lands on onto.project.create, does not thrash validation, and never echoes internal tool-call markup into the assistant response.',
		category: 'workflow',
		replayRequest: {
			message:
				"I'm starting my first fantasy novel, 'The Last Ember'. It's about a young blacksmith named Elena who discovers she can forge magic into metal. Please create a project with a plot summary, and add these seven work items as tasks: outline first three chapters, write character backstory for Elena, design the magic system based on metal and fire, map the world of Aethermoor, research medieval blacksmithing, draft antagonist profile for the Shadow King, and plan a prophecy arc.",
			contextType: 'project_create'
		},
		expectedFirstLane: 'direct_exact_op',
		expectedFirstOps: ['onto.project.create'],
		requiredObservedOps: ['onto.project.create'],
		requiredEventTypes: ['prompt_snapshot_created', 'done_emitted'],
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
	},
	{
		slug: 'safety.supervisor_question_repeated_validation',
		version: '1',
		title: 'Supervisor Question After Repeated Validation',
		description:
			'Checks that repeated validation-style write failures are interrupted with a supervisor question and durable checkpoint instead of continuing tool retries.',
		category: 'safety',
		requiredEventTypes: [
			'supervisor_decision',
			'supervisor_question_checkpoint_created',
			'done_emitted'
		],
		expectedFinishedReason: 'supervisor_question',
		maxValidationFailures: 4,
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
		forbiddenAssistantPatterns: DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS
	},
	{
		slug: 'safety.supervisor_finalization_guard_answered',
		version: '1',
		title: 'Supervisor Finalization Guard Answered',
		description:
			'Checks that a turn with tool work but an empty or unsafe final candidate was repaired into a user-visible assistant answer.',
		category: 'safety',
		requiredEventTypes: ['supervisor_finalization_guard_applied', 'done_emitted'],
		requirePromptSnapshot: true,
		requireAssistantAnswer: true,
		requireCompletedStatus: true,
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
