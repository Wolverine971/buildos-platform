// apps/web/src/lib/services/ontology/edge-relationship-resolver.ts
/**
 * Edge Relationship Resolver
 *
 * Accepts permissive relationship inputs (LLM/UI) and resolves them into:
 * - known relationship types (including deprecated aliases), OR
 * - a sensible default relationship based on entity kinds
 *
 * This is used to avoid hard failures when an agent invents a rel string.
 */

import { VALID_RELS, type EntityKind, type RelationshipType } from './edge-direction';

export function normalizeRelationshipToken(raw: string): string {
	if (typeof raw !== 'string') return '';
	const trimmed = raw.trim();
	if (!trimmed) return '';

	// Convert basic camelCase/PascalCase to snake_case, normalize separators, and strip unsafe chars.
	const snake = trimmed
		.replace(/([a-z0-9])([A-Z])/g, '$1_$2')
		.replace(/[\s.-]+/g, '_')
		.replace(/[^a-zA-Z0-9_]/g, '_')
		.toLowerCase()
		.replace(/_+/g, '_')
		.replace(/^_+|_+$/g, '');

	return snake;
}

const DEFAULT_REL_BY_KIND_PAIR: Record<string, RelationshipType> = {
	// Task relationships
	'task-plan': 'has_task',
	'task-goal': 'supports_goal',
	'task-task': 'depends_on',
	'task-milestone': 'targets_milestone',
	'task-document': 'references',
	'task-risk': 'mitigates',
	'task-event': 'has_event',
	'task-requirement': 'references',
	'task-metric': 'has_metric',
	'task-source': 'references',
	'task-project': 'has_task',
	'project-task': 'has_task',

	// Plan relationships
	'plan-task': 'has_task',
	'plan-goal': 'supports_goal',
	'plan-milestone': 'targets_milestone',
	'plan-document': 'references',
	'plan-risk': 'addresses',
	'plan-requirement': 'references',
	'plan-metric': 'has_metric',
	'plan-source': 'references',
	'plan-project': 'has_plan',
	'project-plan': 'has_plan',

	// Goal relationships
	'goal-milestone': 'has_milestone',
	'goal-document': 'references',
	'goal-task': 'supports_goal',
	'goal-plan': 'supports_goal',
	'goal-risk': 'threatens',
	'goal-requirement': 'has_requirement',
	'goal-metric': 'has_metric',
	'goal-source': 'references',
	'goal-project': 'has_goal',
	'project-goal': 'has_goal',

	// Milestone relationships
	'milestone-plan': 'has_plan',
	'milestone-task': 'targets_milestone',
	'milestone-goal': 'has_milestone',
	'milestone-document': 'references',
	'milestone-risk': 'has_risk',
	'milestone-requirement': 'has_requirement',
	'milestone-metric': 'has_metric',
	'milestone-source': 'references',
	'project-milestone': 'contains',

	// Document relationships
	'document-task': 'references',
	'document-plan': 'references',
	'document-goal': 'references',
	'document-milestone': 'references',
	'document-document': 'references',
	'document-risk': 'references',
	'document-requirement': 'references',
	'document-metric': 'references',
	'document-source': 'references',
	'document-event': 'references',
	'document-project': 'has_document',
	'project-document': 'has_document',

	// Risk relationships
	'risk-task': 'threatens',
	'risk-plan': 'addressed_in',
	'risk-goal': 'threatens',
	'risk-milestone': 'threatens',
	'risk-document': 'documented_in',
	'risk-requirement': 'references',
	'risk-metric': 'has_metric',
	'risk-source': 'references',
	'risk-project': 'has_risk',
	'project-risk': 'has_risk',

	// Requirement relationships
	'requirement-goal': 'has_requirement',
	'requirement-milestone': 'has_requirement',
	'requirement-document': 'references',
	'requirement-task': 'references',
	'requirement-plan': 'references',
	'requirement-project': 'has_requirement',
	'project-requirement': 'has_requirement',

	// Metric relationships
	'metric-project': 'has_metric',
	'metric-goal': 'has_metric',
	'metric-milestone': 'has_metric',
	'metric-plan': 'has_metric',
	'metric-task': 'has_metric',
	'metric-risk': 'has_metric',
	'metric-document': 'references',
	'project-metric': 'has_metric',

	// Source relationships
	'source-project': 'has_source',
	'project-source': 'has_source',
	'source-task': 'references',
	'source-plan': 'references',
	'source-goal': 'references',
	'source-milestone': 'references',
	'source-document': 'references',
	'source-risk': 'references',

	// Event relationships
	'event-task': 'has_event',
	'event-project': 'references',
	'event-document': 'references'
};

export function inferRelationshipFromKinds(
	srcKind: EntityKind,
	dstKind: EntityKind
): RelationshipType {
	const key = `${srcKind}-${dstKind}`;
	return DEFAULT_REL_BY_KIND_PAIR[key] ?? 'references';
}

export function resolveEdgeRelationship(params: {
	srcKind: EntityKind;
	dstKind: EntityKind;
	rel: string;
}): { rel: string; original_rel?: string } {
	const normalized = normalizeRelationshipToken(params.rel);
	if (!normalized) {
		return { rel: '' };
	}

	// If it's already known (including deprecated aliases), keep it and let edge-direction
	// normalization handle canonical swapping and deprecation mapping.
	if (VALID_RELS.includes(normalized)) {
		return { rel: normalized };
	}

	// Otherwise, fall back to a canonical rel inferred from kinds and record what the caller provided.
	return {
		rel: inferRelationshipFromKinds(params.srcKind, params.dstKind),
		original_rel: normalized
	};
}
