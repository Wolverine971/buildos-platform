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

/**
 * Project types the `fiction_story` workspace profile applies to. The runtime
 * profile shares this matcher so routing and retype demotion cannot drift.
 * `project.creative.book.nonfiction` is the nonfiction book variant.
 */
export function isFictionProjectTypeKey(typeKey: string): boolean {
	return (
		/^project\.creative\.(?:novel|book|fiction|screenplay)(?:\.|$)/i.test(typeKey) &&
		!/^project\.creative\.book\.non_?fiction$/i.test(typeKey)
	);
}

const FICTION_WORKSPACE_PROFILE_ID = 'fiction_story';

/**
 * Demote-only: after a project retype, drop a stored fiction domain profile the
 * new type no longer supports. Never sets or promotes a profile, and keeps
 * `mode` (living reference is not fiction-specific). Returns null when the
 * props need no change. 2026-09-22 book loop: a nonfiction book scaffolded as a
 * novel kept loading fiction routing because nothing could clear it.
 */
export function demoteAgentWorkspaceForProjectType(
	props: unknown,
	typeKey: string
): Record<string, unknown> | null {
	if (!isPlainObject(props) || !isPlainObject(props.agent_workspace)) return null;
	const workspace = props.agent_workspace;
	if (workspace.domain_profile !== FICTION_WORKSPACE_PROFILE_ID) return null;
	if (isFictionProjectTypeKey(typeKey)) return null;
	const { domain_profile: _profile, domain_affinity: _affinity, ...rest } = workspace;
	const next: Record<string, unknown> = { ...props };
	if (Object.keys(rest).length > 0) next.agent_workspace = rest;
	else delete next.agent_workspace;
	return next;
}
