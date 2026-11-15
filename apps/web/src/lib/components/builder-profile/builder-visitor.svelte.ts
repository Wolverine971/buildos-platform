// apps/web/src/lib/components/builder-profile/builder-visitor.svelte.ts
//
// What a visitor can do on a builder page or a project page: follow the person or a
// project, ask to join a project, and count a view or a link tap. Signed-out visitors
// go to sign-up (most visitors are new; it links to sign-in) with what they tapped named
// there, and come back to the same page with that button focused
// (?intent=follow[&project=id], or ?ask=id), so nothing is done on their behalf.

import { toastService } from '$lib/stores/toast.store';

export type AskState = { open: boolean; sending: boolean; message: string | null; done: boolean };

export const closedAsk: AskState = { open: false, sending: false, message: null, done: false };

export interface BuilderVisitorContext {
	handle: string;
	/** "DJ Wayne", or "@handle" when there's no name. */
	displayName: string;
	signedIn: boolean;
	/** False for the owner and inside the editor: buttons don't act. */
	canAct: boolean;
	/** Views and taps count only for visitors on a published page. */
	countable: boolean;
	askPending: boolean;
	/** The page to come back to after signing in, e.g. "/@djwayne/9takes". */
	returnPath: string;
}

export class BuilderVisitor {
	personFollowOverride = $state<boolean | null>(null);
	projectFollowOverrides = $state<Record<string, boolean>>({});
	followBusy = $state<string | null>(null);
	asks = $state<Record<string, AskState>>({});

	#ctx: () => BuilderVisitorContext;

	constructor(ctx: () => BuilderVisitorContext) {
		this.#ctx = ctx;
	}

	personFollowing(saved: boolean): boolean {
		return this.personFollowOverride ?? saved;
	}

	projectFollowing(projectId: string, saved: boolean | undefined): boolean {
		return this.projectFollowOverrides[projectId] ?? saved ?? false;
	}

	ask(projectId: string): AskState {
		return this.asks[projectId] ?? closedAsk;
	}

	/** A view of this page (a project page passes its project), or a link tap. */
	track(kind: 'view' | 'link_tap', projectId?: string) {
		const ctx = this.#ctx();
		if (!ctx.countable) return;
		const body =
			kind === 'view' && projectId
				? { kind: 'project_view', project_id: projectId }
				: { kind };
		void fetch(`/api/public/builders/${encodeURIComponent(ctx.handle)}/event`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			keepalive: true
		}).catch(() => {});
	}

	#signIn(query: string) {
		const path = `${this.#ctx().returnPath}?${query}`;
		window.location.href = `/auth/register?redirect=${encodeURIComponent(path)}`;
	}

	async setFollow(projectId: string | null, on: boolean) {
		const ctx = this.#ctx();
		if (!ctx.canAct) return;
		if (!ctx.signedIn) {
			this.#signIn(
				projectId
					? `intent=follow&project=${encodeURIComponent(projectId)}`
					: 'intent=follow'
			);
			return;
		}
		this.followBusy = projectId ?? 'person';
		try {
			const res = await fetch(`/api/builders/${encodeURIComponent(ctx.handle)}/follow`, {
				method: on ? 'POST' : 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(projectId ? { project_id: projectId } : {})
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				toastService.error(payload?.error || 'Could not update that. Try again.');
				return;
			}
			if (projectId) {
				this.projectFollowOverrides = { ...this.projectFollowOverrides, [projectId]: on };
			} else {
				this.personFollowOverride = on;
			}
			toastService.success(
				on
					? `Following. ${ctx.displayName}'s updates will show up in your daily brief.`
					: 'Stopped following.'
			);
		} catch {
			toastService.error('Could not update that. Try again.');
		} finally {
			this.followBusy = null;
		}
	}

	openAsk(projectId: string) {
		const ctx = this.#ctx();
		if (!ctx.canAct) return;
		if (!ctx.signedIn) {
			this.#signIn(`ask=${encodeURIComponent(projectId)}`);
			return;
		}
		if (ctx.askPending) {
			this.asks = {
				...this.asks,
				[projectId]: {
					...closedAsk,
					done: true,
					message: 'Your ask is already waiting for an answer.'
				}
			};
			return;
		}
		this.asks = { ...this.asks, [projectId]: { ...closedAsk, open: true } };
	}

	async sendAsk(projectId: string, note: string) {
		const ctx = this.#ctx();
		const set = (state: AskState) => (this.asks = { ...this.asks, [projectId]: state });
		set({ open: true, sending: true, message: null, done: false });
		try {
			const res = await fetch(`/api/builders/${encodeURIComponent(ctx.handle)}/ask`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ project_id: projectId, note })
			});
			const payload = await res.json().catch(() => null);
			if (!res.ok) {
				set({
					open: true,
					sending: false,
					done: false,
					message: payload?.error || 'Could not send that. Try again.'
				});
				return;
			}
			set({
				open: false,
				sending: false,
				done: true,
				message: payload?.data?.message ?? 'Asked. You’ll hear back in BuildOS.'
			});
		} catch {
			set({
				open: true,
				sending: false,
				done: false,
				message: 'Could not send that. Try again.'
			});
		}
	}
}
