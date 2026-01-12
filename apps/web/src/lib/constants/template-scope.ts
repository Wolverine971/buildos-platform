// apps/web/src/lib/constants/template-scope.ts

/**
 * Template Scope Definitions
 *
 * Defines the ontology scopes and their naming conventions.
 * Based on the family-based taxonomy defined in TYPE_KEY_TAXONOMY.md
 *
 * Pattern: {data_type}.{family}[.{variant}]
 * Abstract bases: {data_type}.base and {data_type}.{family}.base
 */

export type TemplateScopeCategory = 'autonomous' | 'project_derived';

export type TemplateScopeDefinition = {
	slug: string;
	label: string;
	description: string;
	category: TemplateScopeCategory;
	typeKeyPattern: string;
	typeKeyRegex: RegExp;
	families?: string[];
	facetUsage?: string;
	llmCue: string;
	exampleBrainDump?: string;
};

const scope = (
	slug: string,
	definition: Omit<TemplateScopeDefinition, 'slug'>
): TemplateScopeDefinition => ({ slug, ...definition });

export const TEMPLATE_SCOPE_DEFINITIONS: Record<string, TemplateScopeDefinition> = {
	project: scope('project', {
		label: 'Project',
		description:
			'Top-level workspaces that orchestrate domains, deliverables, and phased execution.',
		category: 'autonomous',
		typeKeyPattern: 'project.{domain}.{deliverable}[.{variant}]',
		typeKeyRegex: /^project\.[a-z_]+\.[a-z_]+(\.[a-z_]+)?$/,
		facetUsage: 'context / scale / stage',
		llmCue: 'Declare the domain (actor), deliverable (work product), and optional variant that make this project reusable across realms. The type_key must start with "project." prefix.',
		exampleBrainDump:
			'Example: Autonomous launch playbook for a startup copywriting platform aimed at fintech founders, including onboarding and activation KPIs.'
	}),
	plan: scope('plan', {
		label: 'Plan',
		description:
			'Reusable orchestration playbooks that describe phases, gates, and sequencing across projects.',
		category: 'autonomous',
		typeKeyPattern: 'plan.{family}[.{variant}]',
		typeKeyRegex: /^plan\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['timebox', 'pipeline', 'campaign', 'roadmap', 'process', 'phase'],
		facetUsage: 'context / scale / stage',
		llmCue: 'Identify the plan family (timebox, pipeline, campaign, roadmap, process, or phase) and variant. Explain the workflow the plan governs, the persona that runs it, and how it progresses from start to finish.',
		exampleBrainDump:
			'Example: A sprint plan for a 2-week development cycle → plan.timebox.sprint. A marketing launch campaign → plan.campaign.marketing.'
	}),
	task: scope('task', {
		label: 'Task',
		description:
			'Actionable work items classified by work mode. 8 base work modes with optional specializations.',
		category: 'autonomous',
		typeKeyPattern: 'task.{work_mode}[.{specialization}]',
		typeKeyRegex: /^task\.[a-z_]+(\.[a-z_]+)?$/,
		families: [
			'execute',
			'create',
			'refine',
			'research',
			'review',
			'coordinate',
			'admin',
			'plan'
		],
		facetUsage: 'context / scale',
		llmCue: 'Identify the work mode (execute, create, refine, research, review, coordinate, admin, plan). Default to task.execute if unsure. Only add specialization for reusable workflow patterns (meeting, standup, deploy, checklist).',
		exampleBrainDump:
			'Example: A meeting task → task.coordinate.meeting. A code review → task.review. Writing new content → task.create.'
	}),
	document: scope('document', {
		label: 'Document',
		description:
			'Internal knowledge artifacts: context, knowledge, decisions, specs, references, and intake forms.',
		category: 'autonomous',
		typeKeyPattern: 'document.{family}[.{variant}]',
		typeKeyRegex: /^document\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['context', 'knowledge', 'decision', 'spec', 'reference', 'intake'],
		facetUsage: 'context / stage',
		llmCue: 'Identify the document family: context (big picture), knowledge (research/findings), decision (meeting notes/RFCs), spec (requirements/technical), reference (handbooks/SOPs), intake (discovery forms). Detail the knowledge captured and reuse scenario.',
		exampleBrainDump:
			'Example: Project context doc → document.context.project. Research notes → document.knowledge.research. Meeting notes → document.decision.meeting_notes.'
	}),
	goal: scope('goal', {
		label: 'Goal',
		description:
			'Objectives and outcomes classified by measurement type: outcome (binary), metric (numeric), behavior (frequency), learning (skill).',
		category: 'autonomous',
		typeKeyPattern: 'goal.{family}[.{variant}]',
		typeKeyRegex: /^goal\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['outcome', 'metric', 'behavior', 'learning'],
		facetUsage: 'context / scale',
		llmCue: 'Identify the goal family based on measurement: outcome (binary completion), metric (numeric target), behavior (frequency/consistency), learning (skill progression). Define the measurable outcome and success criteria.',
		exampleBrainDump:
			'Example: "Launch v1" → goal.outcome.project. "10k MAU" → goal.metric.usage. "Post 3x/week" → goal.behavior.cadence. "Learn React" → goal.learning.skill.'
	}),
	risk: scope('risk', {
		label: 'Risk',
		description:
			'Risk tracking templates classified by category: technical, schedule, resource, budget, scope, external, quality.',
		category: 'project_derived',
		typeKeyPattern: 'risk.{family}[.{variant}]',
		typeKeyRegex: /^risk\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['technical', 'schedule', 'resource', 'budget', 'scope', 'external', 'quality'],
		facetUsage: 'context',
		llmCue: 'Identify the risk family: technical (architecture/security), schedule (timing/deadlines), resource (people/skills), budget (money), scope (creep/ambiguity), external (market/regulatory), quality (bugs/UX). Explain the mitigation metadata.',
		exampleBrainDump:
			'Example: Security risk → risk.technical.security. Dependency timing → risk.schedule.dependency. Missing expertise → risk.resource.skill_gap.'
	}),
	event: scope('event', {
		label: 'Event',
		description:
			'Calendar-bound time slots classified by type: work (focus sessions), collab (meetings), marker (deadlines/reminders).',
		category: 'autonomous',
		typeKeyPattern: 'event.{family}[.{variant}]',
		typeKeyRegex: /^event\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['work', 'collab', 'marker'],
		facetUsage: 'context',
		llmCue: 'Identify the event family: work (individual focus/time blocks), collab (meetings/coordination), marker (deadlines/reminders/holds). Specify the variant for specific event types.',
		exampleBrainDump:
			'Example: Deep work session → event.work.focus_block. Team standup → event.collab.meeting.standup. Project deadline → event.marker.deadline.'
	}),
	requirement: scope('requirement', {
		label: 'Requirement',
		description: 'Constraints and needs inherited from a parent project.',
		category: 'project_derived',
		typeKeyPattern: 'requirement.{type}[.{category}]',
		typeKeyRegex: /^requirement\.[a-z_]+(\.[a-z_]+)?$/,
		families: ['functional', 'non_functional', 'constraint', 'assumption', 'dependency'],
		facetUsage: 'context',
		llmCue: 'Tie requirements back to the parent project type; only diverge when schema or validation differs.',
		exampleBrainDump:
			'Example: Compliance requirement for SOC2 evidence capture across all onboarding projects, noting traceability fields.'
	}),
	milestone: scope('milestone', {
		label: 'Milestone',
		description: 'Lifecycle checkpoints that align with the parent project FSM.',
		category: 'project_derived',
		typeKeyPattern: 'Inherits project lifecycle',
		typeKeyRegex: /^milestone\.[a-z_]+(\.[a-z_]+)?$/,
		facetUsage: 'stage',
		llmCue: 'Describe the inflection point inside the project FSM and required entry/exit criteria.',
		exampleBrainDump:
			'Example: Design handoff milestone between product discovery and build, listing acceptance signals.'
	}),
	metric: scope('metric', {
		label: 'Metric',
		description: 'Measurement templates tied to project context but sometimes generalized.',
		category: 'project_derived',
		typeKeyPattern: 'Inherit measurement intent',
		typeKeyRegex: /^metric\.[a-z_]+(\.[a-z_]+)?$/,
		facetUsage: 'scale',
		llmCue: 'Capture what is being measured, units, sampling cadence, and why it matters inside the project.',
		exampleBrainDump:
			'Example: Activation rate metric for onboarding projects, including formula, leading indicators, and response plan.'
	})
};

/**
 * Get template scope definition by slug
 */
export function getTemplateScopeDefinition(scope?: string | null): TemplateScopeDefinition | null {
	if (!scope) return null;
	return TEMPLATE_SCOPE_DEFINITIONS[scope] ?? null;
}

/**
 * Get all autonomous scopes (entities with independent type_key taxonomy)
 */
export function getAutonomousScopes(): TemplateScopeDefinition[] {
	return Object.values(TEMPLATE_SCOPE_DEFINITIONS).filter((s) => s.category === 'autonomous');
}

/**
 * Get all project-derived scopes (entities that inherit from project context)
 */
export function getProjectDerivedScopes(): TemplateScopeDefinition[] {
	return Object.values(TEMPLATE_SCOPE_DEFINITIONS).filter(
		(s) => s.category === 'project_derived'
	);
}

/**
 * Validate a type_key against its scope's pattern
 */
export function isValidTypeKeyForScope(typeKey: string, scope: string): boolean {
	const scopeDef = TEMPLATE_SCOPE_DEFINITIONS[scope];
	if (!scopeDef) return false;
	return scopeDef.typeKeyRegex.test(typeKey);
}

/**
 * Get families for a given scope
 */
export function getFamiliesForScope(scope: string): string[] {
	const scopeDef = TEMPLATE_SCOPE_DEFINITIONS[scope];
	return scopeDef?.families ?? [];
}
