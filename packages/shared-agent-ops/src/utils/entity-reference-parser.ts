// packages/shared-agent-ops/src/utils/entity-reference-parser.ts
/**
 * Entity Reference Parser
 *
 * Parses and creates entity references embedded in markdown text.
 * Used for making entity mentions clickable in next_step_long content.
 *
 * Format: [[entity_type:entity_id|display_text]]
 *
 * @example
 * // Input markdown:
 * // "Complete the [[task:abc-123|project brief]] and review [[document:def-456|Brand Guidelines]]."
 * //
 * // Parsed entities:
 * // [
 * //   { type: 'task', id: 'abc-123', displayText: 'project brief' },
 * //   { type: 'document', id: 'def-456', displayText: 'Brand Guidelines' }
 * // ]
 *
 * @see /apps/web/docs/features/project-activity-logging/IMPLEMENTATION_PLAN.md
 */

import type {
	EntityReference,
	EntityReferenceType,
	ParsedNextStepLong
} from '@buildos/shared-types';

// =============================================================================
// Constants
// =============================================================================

/**
 * Regex pattern for matching entity references
 * Matches: [[type:id|displayText]]
 *
 * Groups:
 * 1. type - entity type (word characters)
 * 2. id - entity ID (alphanumeric, hyphens, underscores - supports UUIDs and slugs)
 * 3. displayText - display text (anything except closing bracket)
 */
const ENTITY_REF_REGEX = /\[\[(\w+):([\w-]+)\|([^\]]+)\]\]/gi;

/**
 * Valid entity types that can be referenced
 */
const VALID_ENTITY_TYPES: Set<EntityReferenceType> = new Set([
	'project',
	'task',
	'document',
	'note',
	'goal',
	'milestone',
	'risk',
	'plan',
	'requirement',
	'source',
	'edge',
	'user'
]);

// =============================================================================
// Escaping Helpers
// =============================================================================

/**
 * Basic HTML escaper to prevent injection in rendered links
 */
function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Sanitize hrefs to block javascript/data URLs while keeping relative links
 */
function sanitizeHref(rawHref: string): string {
	const href = rawHref.trim();

	// Allow relative paths and hash anchors
	if (href.startsWith('/') || href.startsWith('#')) {
		return escapeHtml(href);
	}

	try {
		const url = new URL(href, 'http://localhost'); // base to parse relative URLs
		const protocol = url.protocol.toLowerCase();
		const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);

		if (allowedProtocols.has(protocol)) {
			return escapeHtml(href);
		}
	} catch {
		// Fall through to unsafe
	}

	return '#';
}

// =============================================================================
// Parser Functions
// =============================================================================

/**
 * Parse entity references from markdown text
 *
 * @param markdown - The markdown text containing entity references
 * @returns ParsedNextStepLong with original markdown and extracted entities
 *
 * @example
 * const result = parseEntityReferences(
 *   "Complete [[task:abc|Task A]] then [[task:def|Task B]]"
 * );
 * // result.entities = [
 * //   { type: 'task', id: 'abc', displayText: 'Task A' },
 * //   { type: 'task', id: 'def', displayText: 'Task B' }
 * // ]
 */
export function parseEntityReferences(markdown: string): ParsedNextStepLong {
	const entities: EntityReference[] = [];

	// Reset regex lastIndex for global regex
	ENTITY_REF_REGEX.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = ENTITY_REF_REGEX.exec(markdown)) !== null) {
		const [, type, id, displayText] = match;

		// Ensure all captured groups exist
		if (!type || !id || !displayText) continue;

		const normalizedType = type.toLowerCase() as EntityReferenceType;

		// Only include valid entity types
		if (VALID_ENTITY_TYPES.has(normalizedType)) {
			entities.push({
				type: normalizedType,
				id,
				displayText
			});
		}
	}

	return { markdown, entities };
}

/**
 * Create an entity reference string for embedding in markdown
 *
 * @param type - The entity type
 * @param id - The entity ID (UUID)
 * @param displayText - The text to display for the link
 * @returns Formatted entity reference string
 *
 * @example
 * createEntityReference('task', 'abc-123', 'Finish report')
 * // Returns: "[[task:abc-123|Finish report]]"
 */
export function createEntityReference(
	type: EntityReferenceType,
	id: string,
	displayText: string
): string {
	// Sanitize display text - remove any brackets that could break parsing
	const sanitizedText = displayText.replace(/[\[\]|]/g, '');
	return `[[${type}:${id}|${sanitizedText}]]`;
}

/**
 * Check if a string contains any entity references
 *
 * @param text - Text to check
 * @returns true if the text contains at least one entity reference
 */
export function hasEntityReferences(text: string): boolean {
	ENTITY_REF_REGEX.lastIndex = 0;
	return ENTITY_REF_REGEX.test(text);
}

/**
 * Count the number of entity references in text
 *
 * @param text - Text to analyze
 * @returns Number of entity references found
 */
export function countEntityReferences(text: string): number {
	const parsed = parseEntityReferences(text);
	return parsed.entities.length;
}

// =============================================================================
// Renderer Functions
// =============================================================================

/**
 * Convert entity references to HTML links
 *
 * @param markdown - Markdown with entity references
 * @param linkBuilder - Function to build the href for each entity
 * @returns HTML string with entity references converted to links
 *
 * @example
 * const html = renderEntityReferencesAsHtml(
 *   "See [[task:abc|my task]]",
 *   (ref) => `/projects/123/tasks/${ref.id}`
 * );
 * // Returns: 'See <a href="/projects/123/tasks/abc" class="entity-ref entity-ref-task">my task</a>'
 */
export function renderEntityReferencesAsHtml(
	markdown: string,
	linkBuilder: (ref: EntityReference) => string
): string {
	ENTITY_REF_REGEX.lastIndex = 0;

	return markdown.replace(ENTITY_REF_REGEX, (match, type, id, displayText) => {
		const normalizedType = type.toLowerCase() as EntityReferenceType;

		if (!VALID_ENTITY_TYPES.has(normalizedType)) {
			return match; // Return original if not a valid type
		}

		const ref: EntityReference = { type: normalizedType, id, displayText };
		const href = sanitizeHref(linkBuilder(ref));
		const safeText = escapeHtml(displayText);

		return `<a href="${href}" class="entity-ref entity-ref-${normalizedType}" data-entity-type="${normalizedType}" data-entity-id="${id}">${safeText}</a>`;
	});
}

/**
 * Strip entity references from text, leaving only the display text
 *
 * @param markdown - Markdown with entity references
 * @returns Plain text with references replaced by their display text
 *
 * @example
 * stripEntityReferences("Complete [[task:abc|the report]]")
 * // Returns: "Complete the report"
 */
export function stripEntityReferences(markdown: string): string {
	ENTITY_REF_REGEX.lastIndex = 0;
	return markdown.replace(ENTITY_REF_REGEX, (_, __, ___, displayText) => displayText);
}

// Relative BuildOS links a model copies from chat replies:
// [label](/projects/<project-id>) or [label](/projects/<project-id>/<kind>s/<id>).
const PROJECT_PATH_LINK_REGEX =
	/\[([^\]]+)\]\(\/projects\/([0-9a-f-]{36})(?:\/([a-z_]+?)s?\/([0-9a-f-]{36}))?\/?\)/gi;

/**
 * Keep only links to entities the caller knows. A model-generated reference to
 * an unknown id (an invented slug, or an entity from another project) becomes
 * its plain display text, so a link can never point at nothing. Covers
 * `[[type:id|label]]` references and relative `/projects/...` markdown links.
 */
export function resolveEntityReferences(
	markdown: string,
	isKnown: (type: string, id: string) => boolean
): { markdown: string; dropped: EntityReference[] } {
	const dropped: EntityReference[] = [];
	ENTITY_REF_REGEX.lastIndex = 0;
	PROJECT_PATH_LINK_REGEX.lastIndex = 0;
	const resolved = markdown
		.replace(ENTITY_REF_REGEX, (reference, type: string, id: string, displayText: string) => {
			const normalizedType = type.toLowerCase();
			if (isKnown(normalizedType, id)) return reference;
			dropped.push({ type: normalizedType as EntityReferenceType, id, displayText });
			return displayText;
		})
		.replace(
			PROJECT_PATH_LINK_REGEX,
			(link, label: string, projectId: string, kind?: string, entityId?: string) => {
				const type = kind ? kind.toLowerCase() : 'project';
				const id = entityId ?? projectId;
				if (isKnown('project', projectId) && isKnown(type, id)) return link;
				dropped.push({ type: type as EntityReferenceType, id, displayText: label });
				return label;
			}
		);
	return { markdown: resolved, dropped };
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that an entity reference has a valid format
 *
 * @param ref - Entity reference to validate
 * @returns true if the reference is valid
 */
export function isValidEntityReference(ref: EntityReference): boolean {
	// Check type is valid
	if (!VALID_ENTITY_TYPES.has(ref.type)) {
		return false;
	}

	// Check ID is valid (alphanumeric, hyphens, underscores - supports UUIDs and slugs)
	const idRegex = /^[\w-]+$/;
	if (!idRegex.test(ref.id)) {
		return false;
	}

	// Check display text is not empty
	if (!ref.displayText || ref.displayText.trim().length === 0) {
		return false;
	}

	return true;
}

/**
 * Get all unique entity IDs from a parsed result, grouped by type
 *
 * @param parsed - Parsed next step result
 * @returns Map of entity type to array of IDs
 *
 * @example
 * const ids = getEntityIdsByType(parsed);
 * // { task: ['abc', 'def'], document: ['ghi'] }
 */
export function getEntityIdsByType(parsed: ParsedNextStepLong): Map<EntityReferenceType, string[]> {
	const result = new Map<EntityReferenceType, string[]>();

	for (const entity of parsed.entities) {
		const existing = result.get(entity.type) || [];
		if (!existing.includes(entity.id)) {
			existing.push(entity.id);
		}
		result.set(entity.type, existing);
	}

	return result;
}

// =============================================================================
// Modal Routing Helpers
// =============================================================================

/**
 * Entity type to modal mapping
 * Used to determine which modal to open when clicking an entity reference
 */
export const ENTITY_MODAL_MAP: Record<EntityReferenceType, string> = {
	task: 'TaskEditModal',
	document: 'DocumentEditModal',
	note: 'NoteEditModal',
	goal: 'GoalEditModal',
	milestone: 'MilestoneEditModal',
	risk: 'RiskEditModal',
	plan: 'PlanEditModal',
	project: 'ProjectEditModal',
	requirement: 'RequirementEditModal',
	source: 'SourceEditModal',
	edge: 'EdgeEditModal',
	user: 'UserProfileModal',
	event: 'EventEditModal'
};

/**
 * Get the modal component name for an entity type
 *
 * @param type - Entity type
 * @returns Modal component name or undefined if no modal exists
 */
export function getModalForEntityType(type: EntityReferenceType): string | undefined {
	return ENTITY_MODAL_MAP[type];
}
