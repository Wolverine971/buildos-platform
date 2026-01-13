// apps/web/src/lib/types/onto-taxonomy.ts
/**
 * Type Key Taxonomy for Ontology Entities
 *
 * These type_keys are used for classification and can be selected in edit modals.
 * The classification worker (ontologyClassifier.ts) auto-assigns these based on content,
 * but users can manually override via the modal selectors.
 *
 * Pattern: {entity}.{family}[.{variant}]
 */

export interface TypeKeyOption {
	value: string;
	label: string;
	description?: string;
}

/**
 * Task type_key options
 * Pattern: task.{work_mode}[.{specialization}]
 * Work modes: execute, create, refine, research, review, coordinate, admin, plan
 */
export const TASK_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'task.default', label: 'Default', description: 'General task' },
	{ value: 'task.execute', label: 'Execute', description: 'Action-oriented work' },
	{ value: 'task.create', label: 'Create', description: 'Creating new content or artifacts' },
	{ value: 'task.refine', label: 'Refine', description: 'Improving existing work' },
	{ value: 'task.research', label: 'Research', description: 'Investigation and discovery' },
	{ value: 'task.review', label: 'Review', description: 'Reviewing work or content' },
	{ value: 'task.coordinate', label: 'Coordinate', description: 'Coordination and planning' },
	{
		value: 'task.coordinate.meeting',
		label: 'Meeting',
		description: 'Scheduled meeting or call'
	},
	{ value: 'task.coordinate.standup', label: 'Standup', description: 'Daily standup meeting' },
	{ value: 'task.admin', label: 'Admin', description: 'Administrative work' },
	{ value: 'task.plan', label: 'Plan', description: 'Planning and strategy' },
	{ value: 'task.execute.deploy', label: 'Deploy', description: 'Deployment or release' },
	{ value: 'task.execute.checklist', label: 'Checklist', description: 'Checklist-based task' }
];

/**
 * Goal type_key options
 * Pattern: goal.{family}[.{variant}]
 * Families: outcome, metric, behavior, learning
 */
export const GOAL_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'goal.default', label: 'Default', description: 'General goal' },
	{ value: 'goal.outcome', label: 'Outcome', description: 'Desired result or outcome' },
	{
		value: 'goal.outcome.project',
		label: 'Project Outcome',
		description: 'Project-level outcome'
	},
	{
		value: 'goal.outcome.personal',
		label: 'Personal Outcome',
		description: 'Personal achievement'
	},
	{ value: 'goal.metric', label: 'Metric', description: 'Quantifiable target' },
	{
		value: 'goal.metric.revenue',
		label: 'Revenue Metric',
		description: 'Revenue or financial target'
	},
	{ value: 'goal.metric.growth', label: 'Growth Metric', description: 'Growth or scale target' },
	{ value: 'goal.behavior', label: 'Behavior', description: 'Behavioral change goal' },
	{ value: 'goal.learning', label: 'Learning', description: 'Learning or skill development' },
	{
		value: 'goal.learning.skill',
		label: 'Skill Development',
		description: 'Specific skill acquisition'
	}
];

/**
 * Plan type_key options
 * Pattern: plan.{family}[.{variant}]
 * Families: timebox, pipeline, campaign, roadmap, process, phase
 */
export const PLAN_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'plan.default', label: 'Default', description: 'General plan' },
	{ value: 'plan.timebox', label: 'Timebox', description: 'Time-bounded work period' },
	{ value: 'plan.timebox.sprint', label: 'Sprint', description: 'Agile sprint' },
	{ value: 'plan.timebox.week', label: 'Weekly Plan', description: 'Weekly work plan' },
	{ value: 'plan.pipeline', label: 'Pipeline', description: 'Sequential workflow' },
	{ value: 'plan.campaign', label: 'Campaign', description: 'Campaign or initiative' },
	{
		value: 'plan.campaign.marketing',
		label: 'Marketing Campaign',
		description: 'Marketing initiative'
	},
	{ value: 'plan.roadmap', label: 'Roadmap', description: 'Long-term roadmap' },
	{
		value: 'plan.roadmap.product',
		label: 'Product Roadmap',
		description: 'Product development roadmap'
	},
	{ value: 'plan.process', label: 'Process', description: 'Repeatable process' },
	{ value: 'plan.phase', label: 'Phase', description: 'Project phase' }
];

/**
 * Risk type_key options
 * Pattern: risk.{family}[.{variant}]
 * Families: technical, schedule, resource, budget, scope, external, quality
 */
export const RISK_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'risk.default', label: 'Default', description: 'General risk' },
	{ value: 'risk.technical', label: 'Technical', description: 'Technical or engineering risk' },
	{ value: 'risk.technical.security', label: 'Security', description: 'Security vulnerability' },
	{ value: 'risk.technical.performance', label: 'Performance', description: 'Performance issue' },
	{ value: 'risk.schedule', label: 'Schedule', description: 'Timeline or schedule risk' },
	{ value: 'risk.schedule.deadline', label: 'Deadline', description: 'Deadline risk' },
	{ value: 'risk.resource', label: 'Resource', description: 'Resource availability risk' },
	{ value: 'risk.budget', label: 'Budget', description: 'Budget or cost risk' },
	{ value: 'risk.scope', label: 'Scope', description: 'Scope creep risk' },
	{ value: 'risk.external', label: 'External', description: 'External dependency risk' },
	{ value: 'risk.quality', label: 'Quality', description: 'Quality or defect risk' }
];

/**
 * Milestone type_key options
 * Pattern: milestone.{variant}
 * Variants: delivery, phase_complete, review, deadline, release, launch
 */
export const MILESTONE_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'milestone.default', label: 'Default', description: 'General milestone' },
	{ value: 'milestone.delivery', label: 'Delivery', description: 'Deliverable completion' },
	{ value: 'milestone.phase_complete', label: 'Phase Complete', description: 'Phase completion' },
	{ value: 'milestone.review', label: 'Review', description: 'Review checkpoint' },
	{ value: 'milestone.deadline', label: 'Deadline', description: 'Hard deadline' },
	{ value: 'milestone.release', label: 'Release', description: 'Software or product release' },
	{ value: 'milestone.launch', label: 'Launch', description: 'Launch event' }
];

/**
 * Document type_key options
 * Pattern: document.{family}[.{variant}]
 * Families: context, knowledge, spec, reference, intake
 */
export const DOCUMENT_TYPE_KEYS: TypeKeyOption[] = [
	{ value: 'document.default', label: 'Default', description: 'General document' },
	{ value: 'document.context', label: 'Context', description: 'Context document' },
	{
		value: 'document.context.project',
		label: 'Project Context',
		description: 'Project context document'
	},
	{ value: 'document.knowledge', label: 'Knowledge', description: 'Knowledge base document' },
	{ value: 'document.knowledge.research', label: 'Research', description: 'Research document' },
	{ value: 'document.spec', label: 'Spec', description: 'Specification document' },
	{
		value: 'document.spec.technical',
		label: 'Technical Spec',
		description: 'Technical specification'
	},
	{ value: 'document.reference', label: 'Reference', description: 'Reference document' },
	{ value: 'document.intake', label: 'Intake', description: 'Intake or capture document' }
];

/**
 * Get type_key options for an entity kind
 */
export function getTypeKeysForKind(kind: string): TypeKeyOption[] {
	switch (kind) {
		case 'task':
			return TASK_TYPE_KEYS;
		case 'goal':
			return GOAL_TYPE_KEYS;
		case 'plan':
			return PLAN_TYPE_KEYS;
		case 'risk':
			return RISK_TYPE_KEYS;
		case 'milestone':
			return MILESTONE_TYPE_KEYS;
		case 'document':
			return DOCUMENT_TYPE_KEYS;
		default:
			return [];
	}
}

/**
 * Get the label for a type_key value
 */
export function getTypeKeyLabel(kind: string, typeKey: string): string {
	const options = getTypeKeysForKind(kind);
	const option = options.find((o) => o.value === typeKey);
	return option?.label || typeKey.split('.').pop() || typeKey;
}
