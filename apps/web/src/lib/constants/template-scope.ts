// apps/web/src/lib/constants/template-scope.ts
export type TemplateScopeCategory = 'autonomous' | 'project_derived';

export type TemplateScopeDefinition = {
	slug: string;
	label: string;
	description: string;
	category: TemplateScopeCategory;
	typeKeyPattern: string;
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
		typeKeyPattern: '{domain}.{deliverable}[.{variant}]',
		facetUsage: 'context / scale / stage',
		llmCue: 'Declare the domain (actor), deliverable (work product), and optional variant that make this project reusable across realms.',
		exampleBrainDump:
			'Example: Autonomous launch playbook for a startup copywriting platform aimed at fintech founders, including onboarding and activation KPIs.'
	}),
	plan: scope('plan', {
		label: 'Plan',
		description:
			'Reusable orchestration playbooks that describe phases, gates, and sequencing across projects.',
		category: 'autonomous',
		typeKeyPattern: 'plan.{type}[.{variant}]',
		facetUsage: 'context / scale / stage',
		llmCue: 'Explain the workflow the plan governs, the persona that runs it, and how it progresses from start to finish.',
		exampleBrainDump:
			'Example: Iterative discovery sprint for product-market fit including hypothesis logging, interview cadence, and decision checkpoints.'
	}),
	task: scope('task', {
		label: 'Task',
		description:
			'Actionable work items that can be templated when they appear across many projects.',
		category: 'autonomous',
		typeKeyPattern: 'task.{type} (optional)',
		facetUsage: 'context / scale',
		llmCue: 'Describe the atomic action, the persona executing it, and what “done” means. Only introduce a type key if the task is reusable.',
		exampleBrainDump:
			'Example: Outreach follow-up task for SDRs contacting AI agencies, including acceptance criteria and data capture fields.'
	}),
	output: scope('output', {
		label: 'Output / Deliverable',
		description:
			'Artifacts and deliverables that exit the system (chapters, briefs, dashboards, etc.).',
		category: 'autonomous',
		typeKeyPattern: 'deliverable.{type}[.{variant}]',
		facetUsage: 'context / stage',
		llmCue: 'Clarify the artifact being produced, its consumers, and what differentiates this deliverable variant.',
		exampleBrainDump:
			'Example: Competitive teardown brief for enterprise AI tools, including sections, scoring schema, and stakeholder context.'
	}),
	document: scope('document', {
		label: 'Document',
		description: 'Internal knowledge artifacts such as wikis, SOPs, or research summaries.',
		category: 'autonomous',
		typeKeyPattern: 'document.{type}',
		facetUsage: 'context / stage',
		llmCue: 'Detail the knowledge captured, structure, and reuse scenario for this document template.',
		exampleBrainDump:
			'Example: Technical architecture decision record documenting tradeoffs for AI inference clusters with required fields and reviewers.'
	}),
	goal: scope('goal', {
		label: 'Goal',
		description: 'Objectives and outcomes that teams track independently of projects.',
		category: 'autonomous',
		typeKeyPattern: 'goal.{type}',
		facetUsage: 'context / scale',
		llmCue: 'Define the measurable outcome, metrics, and thresholds that make this goal reusable.',
		exampleBrainDump:
			'Example: Churn reduction goal for B2B SaaS with leading indicators, owner, and milestone checkpoints.'
	}),
	requirement: scope('requirement', {
		label: 'Requirement',
		description: 'Constraints and needs inherited from a parent project.',
		category: 'project_derived',
		typeKeyPattern: 'Inherits project semantic (no independent key unless justified)',
		facetUsage: 'context',
		llmCue: 'Tie requirements back to the parent project type; only diverge when schema or validation differs.',
		exampleBrainDump:
			'Example: Compliance requirement for SOC2 evidence capture across all onboarding projects, noting traceability fields.'
	}),
	risk: scope('risk', {
		label: 'Risk',
		description: 'Risk tracking templates scoped to projects but optionally globalized.',
		category: 'project_derived',
		typeKeyPattern: 'risk.{type} (optional)',
		facetUsage: 'context',
		llmCue: 'Explain the recurring risk scenario and mitigation metadata; only add a type key when schema differs.',
		exampleBrainDump:
			'Example: Vendor dependency risk for AI model providers including likelihood, impact, and contingency steps.'
	}),
	milestone: scope('milestone', {
		label: 'Milestone',
		description: 'Lifecycle checkpoints that align with the parent project FSM.',
		category: 'project_derived',
		typeKeyPattern: 'Inherits project lifecycle',
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
		facetUsage: 'scale',
		llmCue: 'Capture what is being measured, units, sampling cadence, and why it matters inside the project.',
		exampleBrainDump:
			'Example: Activation rate metric for onboarding projects, including formula, leading indicators, and response plan.'
	})
};

export function getTemplateScopeDefinition(scope?: string | null): TemplateScopeDefinition | null {
	if (!scope) return null;
	return TEMPLATE_SCOPE_DEFINITIONS[scope] ?? null;
}
