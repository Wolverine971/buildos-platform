// apps/web/src/lib/server/projects/merged-project-redirect.ts
//
// A project combined into another (tasker 122, WP5) is archived and forwards
// to its destination. Project pages must never show it as live: they ask
// `get_project_route_redirect` (granted to `authenticated`; follows a chain of
// merges and answers `{status: 'merged', destination_project_id}` only when the
// viewer can read the destination) and send the viewer there instead.
//
// The check runs alongside each page's own first read, so it adds no round
// trip. Any failure (an older database, a network blip) means "no redirect":
// the page then behaves exactly as it did before.
import { redirect } from '@sveltejs/kit';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

type RpcClient = {
	rpc: (
		fn: 'get_project_route_redirect',
		args: { p_project_id: string }
	) => PromiseLike<{ data: unknown; error: unknown }>;
};

/** The project this one was merged into, when the viewer may open it; otherwise null. */
export async function readMergedProjectDestination(
	supabase: unknown,
	projectId: string
): Promise<string | null> {
	try {
		const { data, error } = await (supabase as RpcClient).rpc('get_project_route_redirect', {
			p_project_id: projectId
		});
		if (error || !data || typeof data !== 'object' || Array.isArray(data)) return null;
		const answer = data as { status?: unknown; destination_project_id?: unknown };
		const destination = answer.destination_project_id;
		return answer.status === 'merged' &&
			typeof destination === 'string' &&
			isValidUUID(destination) &&
			destination !== projectId
			? destination
			: null;
	} catch {
		return null;
	}
}

/**
 * The same page under the destination: `/projects/{source}/documents/{id}?x`
 * becomes `/projects/{destination}/documents/{id}?x`. Items keep their ids in a
 * combine, so sub-pages stay valid.
 */
export function mergedProjectLocation(url: URL, sourceId: string, destinationId: string): string {
	const prefix = `/projects/${sourceId}`;
	const rest = url.pathname.startsWith(prefix) ? url.pathname.slice(prefix.length) : '';
	return `/projects/${destinationId}${rest}${url.search}`;
}

/** Throws SvelteKit's redirect when the project was merged; temporary, since Undo can reverse it. */
export function redirectIfMerged(destinationId: string | null, url: URL, sourceId: string): void {
	if (destinationId) redirect(307, mergedProjectLocation(url, sourceId, destinationId));
}
