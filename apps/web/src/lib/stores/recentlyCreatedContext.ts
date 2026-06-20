// apps/web/src/lib/stores/recentlyCreatedContext.ts
import { getContext, setContext } from 'svelte';

/**
 * Lets the project page tell any descendant list/row — however deeply nested (task
 * boards, the document tree, entity strips) — which entities just appeared via a
 * chat/agent mutation, so they can play a brief "just created" entrance.
 *
 * Set once at the page; leaf rows read it and animate when `has(id)` is true. The
 * provider closes over reactive `$state`, so membership stays live as the highlight
 * set updates and clears.
 */
const KEY = Symbol('project-recently-created');

export interface RecentlyCreatedContext {
	/** True if the entity id was just created/updated via a chat or agent mutation. */
	has(id: string): boolean;
}

export function setRecentlyCreatedContext(ctx: RecentlyCreatedContext): void {
	setContext(KEY, ctx);
}

export function getRecentlyCreatedContext(): RecentlyCreatedContext | undefined {
	return getContext<RecentlyCreatedContext>(KEY);
}
