// apps/web/src/lib/services/linked-entity-context-formatter.ts
/**
 * Formatter for linked entity context in agentic chat system prompts.
 * Formats EntityLinkedContext into markdown suitable for LLM consumption.
 *
 * Documentation: /apps/web/docs/features/agentic-chat/LINKED_ENTITY_CONTEXT_SPEC.md
 */

import type {
	EntityLinkedContext,
	LinkedEntityContext
} from '$lib/types/linked-entity-context.types';
import { getRelationshipLabel } from '$lib/types/linked-entity-context.types';

/**
 * Format linked entities for system prompt (abbreviated mode).
 * Shows first 3 entities per type with IDs and overflow indicator.
 */
export function formatLinkedEntitiesForSystemPrompt(context: EntityLinkedContext): string {
	if (context.counts.total === 0) {
		return '';
	}

	const lines: string[] = [];
	lines.push('## Linked Entities');
	lines.push('');
	lines.push(`This ${context.source.kind} has the following relationships:`);
	lines.push('');

	// Format each entity type section
	const sections: Array<{
		key: keyof EntityLinkedContext['linkedEntities'];
		label: string;
		singular: string;
		count: number;
	}> = [
		{ key: 'plans', label: 'Plans', singular: 'plan', count: context.counts.plans },
		{ key: 'goals', label: 'Goals', singular: 'goal', count: context.counts.goals },
		{ key: 'tasks', label: 'Tasks', singular: 'task', count: context.counts.tasks },
		{
			key: 'milestones',
			label: 'Milestones',
			singular: 'milestone',
			count: context.counts.milestones
		},
		{
			key: 'documents',
			label: 'Documents',
			singular: 'document',
			count: context.counts.documents
		},
		{ key: 'outputs', label: 'Outputs', singular: 'output', count: context.counts.outputs }
	];

	for (const { key, label, singular, count } of sections) {
		const entities = context.linkedEntities[key];
		if (count === 0) continue;

		const shownCount = entities.length;
		const remainingCount = count - shownCount;

		// Section header with count
		if (remainingCount > 0) {
			lines.push(`### ${label} (${count} linked, showing first ${shownCount})`);
		} else {
			lines.push(`### ${label} (${count} linked)`);
		}

		// List entities with IDs
		for (const entity of entities) {
			lines.push(formatAbbreviatedEntity(entity));
		}

		// Overflow indicator
		if (remainingCount > 0) {
			lines.push(
				`- ... and ${remainingCount} more ${remainingCount === 1 ? singular : label.toLowerCase()}`
			);
		}

		lines.push('');
	}

	// Hint to use tool for full details
	lines.push('*Use `get_linked_entities` tool to see full details including descriptions.*');

	return lines.join('\n');
}

/**
 * Format a single entity for abbreviated display.
 * Includes ID for agent to query directly.
 */
function formatAbbreviatedEntity(entity: LinkedEntityContext): string {
	const parts: string[] = [];

	// Name with ID
	parts.push(`- **${entity.name}** [${entity.id}]`);

	// State in parentheses if present
	if (entity.state) {
		parts.push(`(${entity.state})`);
	}

	// Relationship type
	parts.push(`- ${getRelationshipLabel(entity.relation)}`);

	return parts.join(' ');
}

/**
 * Format linked entities for full detail display (via tool).
 * Shows all entities with complete information.
 */
export function formatLinkedEntitiesFullDetail(context: EntityLinkedContext): string {
	if (context.counts.total === 0) {
		return `## Linked Entities for: ${context.source.name} [${context.source.id}]\n\nNo linked entities found.`;
	}

	const lines: string[] = [];
	lines.push(`## Linked Entities for: ${context.source.name} [${context.source.id}]`);
	lines.push('');

	const sections: Array<{
		key: keyof EntityLinkedContext['linkedEntities'];
		label: string;
		count: number;
	}> = [
		{ key: 'plans', label: 'Plans', count: context.counts.plans },
		{ key: 'goals', label: 'Goals', count: context.counts.goals },
		{ key: 'tasks', label: 'Tasks', count: context.counts.tasks },
		{ key: 'milestones', label: 'Milestones', count: context.counts.milestones },
		{ key: 'documents', label: 'Documents', count: context.counts.documents },
		{ key: 'outputs', label: 'Outputs', count: context.counts.outputs }
	];

	for (const { key, label, count } of sections) {
		const entities = context.linkedEntities[key];
		if (count === 0) continue;

		lines.push(`### ${label} (${count} total)`);
		lines.push('');

		for (const entity of entities) {
			lines.push(formatFullDetailEntity(entity));
			lines.push('');
		}
	}

	return lines.join('\n');
}

/**
 * Format a single entity with full details.
 */
function formatFullDetailEntity(entity: LinkedEntityContext): string {
	const lines: string[] = [];

	// Entity header with ID
	lines.push(`#### ${entity.name} [${entity.id}]`);

	// Properties
	if (entity.state) {
		lines.push(`- **State:** ${entity.state}`);
	}
	if (entity.typeKey) {
		lines.push(`- **Type:** ${entity.typeKey}`);
	}
	lines.push(
		`- **Relationship:** ${getRelationshipLabel(entity.relation)} (${entity.direction})`
	);

	// Description if present
	if (entity.description) {
		lines.push(`- **Description:** ${entity.description}`);
	}

	// Due date for milestones
	if (entity.dueAt) {
		lines.push(`- **Due:** ${entity.dueAt}`);
	}

	return lines.join('\n');
}

/**
 * Check if an entity has any linked entities worth showing.
 */
export function hasLinkedEntities(context: EntityLinkedContext): boolean {
	return context.counts.total > 0;
}

/**
 * Get a brief summary of linked entities (for metadata/logging).
 */
export function getLinkedEntitiesSummary(context: EntityLinkedContext): string {
	if (context.counts.total === 0) {
		return 'No linked entities';
	}

	const parts: string[] = [];
	if (context.counts.plans > 0) parts.push(`${context.counts.plans} plans`);
	if (context.counts.goals > 0) parts.push(`${context.counts.goals} goals`);
	if (context.counts.tasks > 0) parts.push(`${context.counts.tasks} tasks`);
	if (context.counts.milestones > 0) parts.push(`${context.counts.milestones} milestones`);
	if (context.counts.documents > 0) parts.push(`${context.counts.documents} documents`);
	if (context.counts.outputs > 0) parts.push(`${context.counts.outputs} outputs`);

	return parts.join(', ');
}
