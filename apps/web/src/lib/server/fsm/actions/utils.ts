// apps/web/src/lib/server/fsm/actions/utils.ts

/**
 * Simple token replacement for templates using {{token}} syntax.
 * Supports dotted paths (e.g. {{props.title}}) and leaves unknown tokens untouched.
 */
export function renderTemplate(template: string, context: Record<string, unknown>): string {
	if (!template) return '';

	return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, token) => {
		const value = resolvePath(context, token);
		return value !== undefined && value !== null ? String(value) : match;
	});
}

/**
 * Resolve a dotted path within a nested context object.
 */
export function resolvePath(source: Record<string, unknown>, path: string): unknown {
	return path.split('.').reduce<unknown>((acc, part) => {
		if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
			return (acc as Record<string, unknown>)[part];
		}
		return undefined;
	}, source);
}

/**
 * Infer ontology entity kind from a type_key string.
 */
export function inferEntityKindFromType(
	typeKey: string
): 'project' | 'plan' | 'task' | 'output' | 'document' {
	if (typeKey.startsWith('plan.')) return 'plan';
	if (typeKey.startsWith('task.')) return 'task';
	if (typeKey.startsWith('output.')) return 'output';
	if (typeKey.startsWith('doc.')) return 'document';
	return 'project';
}

/**
 * Runtime helper for merging deeply nested objects.
 */
export function mergeDeep(
	base: Record<string, unknown>,
	override: Record<string, unknown>
): Record<string, unknown> {
	const result: Record<string, unknown> = { ...base };

	for (const [key, value] of Object.entries(override)) {
		const existing = result[key];
		if (isPlainObject(existing) && isPlainObject(value)) {
			result[key] = mergeDeep(
				existing as Record<string, unknown>,
				value as Record<string, unknown>
			);
		} else {
			result[key] = value;
		}
	}

	return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strip HTML tags from a string to produce a plain-text variant.
 */
export function stripHtml(html: string): string {
	return html.replace(/<[^>]+>/g, '');
}
