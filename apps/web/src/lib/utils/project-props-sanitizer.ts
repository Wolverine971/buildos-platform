// apps/web/src/lib/utils/project-props-sanitizer.ts
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

export function sanitizeProjectPropsPatchInput(props: unknown): Record<string, unknown> | null {
	if (!isPlainObject(props)) {
		return null;
	}

	return sanitizeProjectPropsForClient(props) as Record<string, unknown>;
}
