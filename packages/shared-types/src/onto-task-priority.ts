// packages/shared-types/src/onto-task-priority.ts
/**
 * Canonical `onto_tasks.priority` scale.
 *
 * The scale is INVERTED relative to the intuitive reading (1 is the most
 * important), and it has five distinct rungs — not three. Before this module
 * existed the labels lived only in Svelte (`TaskEditModal.svelte`), so every
 * tool schema had to paraphrase them; the paraphrase "1 is highest, 5 lowest"
 * is the only reading a model has for "high", and "high" -> 1 is the reading it
 * picks. The UI then renders that task as "P1 Critical" and the user sees a
 * promotion they never asked for (observed 2026-09-04).
 *
 * One definition, used by the tool schemas, the gateway op schemas, the field
 * introspection tool, the API input normalizers, and the UI badges.
 */

export const ONTO_TASK_PRIORITY_LABELS = {
	1: 'Critical',
	2: 'High',
	3: 'Medium',
	4: 'Low',
	5: 'Nice to have'
} as const;

export type OntoTaskPriority = 1 | 2 | 3 | 4 | 5;

/** Priority applied when the user did not state one. */
export const ONTO_TASK_PRIORITY_DEFAULT = 3;

/**
 * Schema `description` for every `priority` parameter exposed to a model.
 * Names the UI label for each rung so "high" cannot be read as 1.
 */
export const ONTO_TASK_PRIORITY_DESCRIPTION =
	'Priority 1-5 matching the UI labels: 1=Critical (only for "critical", "urgent", "top priority"), ' +
	'2=High, 3=Medium (default), 4=Low, 5=Nice to have. "high" means 2, "medium" 3, "low" 4.';

/**
 * Word -> rung map for callers that accept prose priorities (API inputs,
 * imported suggestions). Keys are lowercase and already trimmed.
 */
export const ONTO_TASK_PRIORITY_WORDS: Record<string, OntoTaskPriority> = {
	critical: 1,
	urgent: 1,
	high: 2,
	medium: 3,
	normal: 3,
	low: 4,
	minimal: 5,
	'nice to have': 5
};
