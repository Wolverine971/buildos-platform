// apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.ts

export type DurableTextViolation = {
	path: string;
	matchedPattern: string;
	matchedText: string;
	message: string;
};

type InternalToolMarkupPattern = {
	name: string;
	pattern: RegExp;
};

const INTERNAL_TOOL_MARKUP_PATTERNS: InternalToolMarkupPattern[] = [
	{
		name: 'parameter_tag',
		pattern: /<\s*\/?\s*parameter\b[^>]*>/i
	},
	{
		name: 'tool_call_tag',
		pattern: /<\s*\/?\s*tool_calls?\b[^>]*>/i
	},
	{
		name: 'function_call_tag',
		pattern: /<\s*\/?\s*function(?:_call)?\b[^>]*>/i
	},
	{
		name: 'arguments_tag',
		pattern: /<\s*\/?\s*arguments?\b[^>]*>/i
	}
];

export function isOntologyDurableWriteTool(toolName: string): boolean {
	return (
		toolName.startsWith('create_onto_') ||
		toolName.startsWith('update_onto_') ||
		toolName === 'create_task_document' ||
		toolName === 'tag_onto_entity' ||
		toolName === 'link_onto_entities'
	);
}

export function findDurableTextViolations(
	value: unknown,
	basePath = 'args'
): DurableTextViolation[] {
	const violations: DurableTextViolation[] = [];
	collectDurableTextViolations(value, basePath, violations, new Set());
	return violations;
}

export function formatDurableTextViolation(violation: DurableTextViolation): string {
	return `${violation.path} contains internal tool-call markup (${violation.matchedPattern}). Remove the tool syntax and pass only user-visible content.`;
}

export function formatDurableTextViolations(violations: DurableTextViolation[]): string[] {
	return violations.map(formatDurableTextViolation);
}

export function assertNoDurableTextViolations(value: unknown, basePath = 'args'): void {
	const violations = findDurableTextViolations(value, basePath);
	if (violations.length === 0) return;
	throw new Error(formatDurableTextViolations(violations).join('; '));
}

function collectDurableTextViolations(
	value: unknown,
	path: string,
	violations: DurableTextViolation[],
	seen: Set<unknown>
): void {
	if (typeof value === 'string') {
		const violation = detectInternalToolMarkup(value, path);
		if (violation) {
			violations.push(violation);
		}
		return;
	}

	if (!value || typeof value !== 'object') {
		return;
	}

	if (seen.has(value)) {
		return;
	}
	seen.add(value);

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			collectDurableTextViolations(item, `${path}[${index}]`, violations, seen);
		});
		return;
	}

	for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
		collectDurableTextViolations(nestedValue, `${path}.${key}`, violations, seen);
	}
}

function detectInternalToolMarkup(value: string, path: string): DurableTextViolation | null {
	for (const { name, pattern } of INTERNAL_TOOL_MARKUP_PATTERNS) {
		const match = value.match(pattern);
		if (!match) continue;
		const matchedText = match[0] ?? name;
		return {
			path,
			matchedPattern: name,
			matchedText,
			message: `${path} contains internal tool-call markup`
		};
	}
	return null;
}
