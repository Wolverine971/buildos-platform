// apps/web/src/lib/components/projects/desktop/desktop-chats.svelte.ts
//
// The card's Chats tab: earlier chats about one project, newest first. Nothing
// is read with the card; the first read waits until the tab is pointed at or
// opened, so a card that never shows its chats never asks for them.
import {
	fetchProjectRecentChats,
	type ProjectRecentChatSummary
} from '$lib/components/project/project-page-data-controller';

export type CardChat = ProjectRecentChatSummary;

const PAGE_SIZE = 20;

function errorMessage(cause: unknown): string {
	return cause instanceof Error ? cause.message : 'Chats could not load.';
}

export function createCardChats(projectId: () => string) {
	let rows = $state.raw<CardChat[]>([]);
	let hasMore = $state(false);
	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let loadingMore = $state(false);
	let error = $state('');
	// A read that finishes after a newer one started is dropped.
	let latest = 0;

	async function first(quiet: boolean) {
		const request = ++latest;
		if (!quiet) {
			status = 'loading';
			error = '';
		}
		try {
			const page = await fetchProjectRecentChats({
				projectId: projectId(),
				limit: PAGE_SIZE,
				offset: 0
			});
			if (request !== latest) return;
			// A quiet re-read keeps the older pages already on screen.
			const fresh = new Set(page.chats.map((chat) => chat.id));
			const older = quiet ? rows.slice(PAGE_SIZE).filter((chat) => !fresh.has(chat.id)) : [];
			rows = [...page.chats, ...older];
			hasMore = older.length ? hasMore : page.hasMore;
			status = 'ready';
		} catch (cause) {
			if (request !== latest || quiet) return;
			error = errorMessage(cause);
			status = 'error';
		}
	}

	return {
		get rows() {
			return rows;
		},
		get hasMore() {
			return hasMore;
		},
		get status() {
			return status;
		},
		get loadingMore() {
			return loadingMore;
		},
		get error() {
			return error;
		},
		/** The first read. Asking again while it runs, or after it lands, is free. */
		load() {
			if (status === 'idle') void first(false);
		},
		retry() {
			void first(false);
		},
		/** Read the newest chats again without clearing the list (a chat just closed). */
		refresh() {
			if (status === 'ready') void first(true);
		},
		async more() {
			if (status !== 'ready' || loadingMore || !hasMore) return;
			const request = ++latest;
			loadingMore = true;
			try {
				const page = await fetchProjectRecentChats({
					projectId: projectId(),
					limit: PAGE_SIZE,
					offset: rows.length
				});
				if (request !== latest) return;
				const seen = new Set(rows.map((chat) => chat.id));
				rows = [...rows, ...page.chats.filter((chat) => !seen.has(chat.id))];
				hasMore = page.hasMore;
			} catch {
				// The button stays, so another click tries again.
			} finally {
				loadingMore = false;
			}
		}
	};
}
