// apps/web/src/lib/server/agent-call/connector-grant-links.ts
//
// Links an agent can hand its person when a wall is theirs to clear (tasker 140).
// The shared gateway marks those walls with `access_needed.link`; only the web knows
// the public origin and the page.

/**
 * The person's own page for one connection: one tap grants a project (or
 * everything), allows changes (`need: 'write'`), or lets shared projects in.
 */
export function buildConnectorGrantUrl(params: {
	origin: string;
	callerId: string;
	projectId?: string | null;
	need?: 'write';
}): string {
	const url = new URL(
		`/profile/agent-keys/${encodeURIComponent(params.callerId)}/grant`,
		params.origin
	);
	if (params.projectId) url.searchParams.set('project', params.projectId);
	if (params.need) url.searchParams.set('need', params.need);
	return url.toString();
}

/** Turns an access_needed `link` into `next.open_url` (and drops `link`). */
export function linkAccessNeeded(
	accessNeeded: Record<string, unknown>,
	params: { origin?: string; callerId?: string }
): Record<string, unknown> {
	const { link, ...rest } = accessNeeded;
	if (link !== 'grant' && link !== 'allow_writes') return accessNeeded;
	if (!params.origin || !params.callerId) {
		return {
			...rest,
			next: null,
			say_to_user: `${String(rest.say_to_user ?? '')} (BuildOS → Profile → Agent keys)`.trim()
		};
	}
	return {
		...rest,
		next: {
			open_url: buildConnectorGrantUrl({
				origin: params.origin,
				callerId: params.callerId,
				projectId: typeof rest.project_id === 'string' ? rest.project_id : null,
				...(link === 'allow_writes' ? { need: 'write' as const } : {})
			})
		}
	};
}
