// apps/web/src/lib/utils/invalidate-keeping-state.ts
import { invalidate, refreshAll } from '$app/navigation';
import { page } from '$app/state';

/**
 * `invalidate()` that does not close what the page has open.
 *
 * SvelteKit's `invalidate()` empties `page.state` when its loads land, and that is where an
 * open project card and its reader live. `refreshAll()` is the only reload that keeps the
 * state, at the price of re-running every load. So: the narrow invalidate when the page
 * holds no state, the full refresh when it does.
 *
 * For callers that can sit above such a page (the Today row, app-wide banners). A page that
 * owns the data should re-read just that data instead; see refreshProjects on /projects.
 */
export function invalidateKeepingState(resource: string): Promise<void> {
	return Object.keys(page.state).length > 0 ? refreshAll() : invalidate(resource);
}
