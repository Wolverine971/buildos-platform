// apps/web/src/lib/services/agentic-chat/execution/tool-execution/argument-values.ts
export type ToolArguments = Record<string, unknown>;

export function isToolArgumentRecord(value: unknown): value is ToolArguments {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Clone JSON-like argument values so normalization and downstream executors do
 * not retain references into caller-owned tool calls or shared definitions.
 */
export function cloneToolArgumentValue(
	value: unknown,
	seen: WeakMap<object, unknown> = new WeakMap()
): unknown {
	if (!value || typeof value !== 'object') {
		return value;
	}

	const existing = seen.get(value);
	if (existing !== undefined) {
		return existing;
	}

	if (Array.isArray(value)) {
		const cloned: unknown[] = [];
		seen.set(value, cloned);
		for (const entry of value) {
			cloned.push(cloneToolArgumentValue(entry, seen));
		}
		return cloned;
	}

	const prototype = Object.getPrototypeOf(value);
	if (prototype !== Object.prototype && prototype !== null) {
		return value;
	}

	const cloned: ToolArguments = {};
	seen.set(value, cloned);
	for (const [key, entry] of Object.entries(value)) {
		cloned[key] = cloneToolArgumentValue(entry, seen);
	}
	return cloned;
}

export function cloneToolArguments(value: object): ToolArguments {
	const cloned = cloneToolArgumentValue(value);
	if (Array.isArray(cloned)) {
		return Object.fromEntries(cloned.map((entry, index) => [String(index), entry]));
	}
	return isToolArgumentRecord(cloned) ? cloned : {};
}
