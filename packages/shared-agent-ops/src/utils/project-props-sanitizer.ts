// packages/shared-agent-ops/src/utils/project-props-sanitizer.ts
/**
 * Keep system-managed project behavioral settings off user-facing payloads.
 *
 * These keys can still exist in storage for backend agent logic, but are not
 * returned to frontend clients and are ignored on user-originated PATCH payloads.
 */

const HIDDEN_PROJECT_PROP_KEYS = new Set(['preferences']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sanitizeProjectPropsForClient(props: unknown): unknown {
	if (!isPlainObject(props)) {
		return props;
	}

	const nextProps: Record<string, unknown> = { ...props };
	let changed = false;

	for (const key of HIDDEN_PROJECT_PROP_KEYS) {
		if (key in nextProps) {
			delete nextProps[key];
			changed = true;
		}
	}

	return changed ? nextProps : props;
}

export function sanitizeProjectForClient<T extends { props?: unknown }>(project: T): T {
	const sanitizedProps = sanitizeProjectPropsForClient(project.props);
	if (sanitizedProps === project.props) {
		return project;
	}

	return {
		...project,
		props: sanitizedProps
	};
}

/**
 * Server-owned props that user- or model-originated PATCH payloads may never
 * set or overwrite. `agent_workspace` is written once by project creation and
 * read back as trusted routing state (living-reference mode, domain profile) —
 * a props merge must not be able to promote it. Unlike HIDDEN keys, these stay
 * visible on reads because the agent runtime needs them.
 */
const PATCH_BLOCKED_PROJECT_PROP_KEYS = new Set(['agent_workspace']);

export function sanitizeProjectPropsPatchInput(props: unknown): Record<string, unknown> | null {
	if (!isPlainObject(props)) {
		return null;
	}

	const base = sanitizeProjectPropsForClient(props) as Record<string, unknown>;
	let next = base;
	for (const key of PATCH_BLOCKED_PROJECT_PROP_KEYS) {
		if (key in next) {
			if (next === base) {
				next = { ...base };
			}
			delete next[key];
		}
	}
	return next;
}
