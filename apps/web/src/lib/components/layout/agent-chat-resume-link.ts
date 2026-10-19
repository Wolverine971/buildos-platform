// apps/web/src/lib/components/layout/agent-chat-resume-link.ts
import { readChatResumeSessionId } from '$lib/utils/agent-chat-resume';

type ResumeResult = 'ok' | 'not_found' | 'error';
type Dependencies = {
	isSignedIn: () => boolean;
	visibleSession: () => string | null;
	suspendUrl: () => () => void;
	cleanUrl: (url: URL) => Promise<void>;
	/** True when an already loaded visible/parked instance was reused. */
	open: (sessionId: string) => Promise<boolean>;
	close: () => void;
	notFound: () => void;
	restoreHistoryUrl: () => void;
	record: (result: ResumeResult, cameThroughLogin: boolean) => void;
};

/** Coordinates the awaited cleanup and restore; the modal retains its existing loader. */
export function createChatResumeLinkHandler(deps: Dependencies) {
	let pending: { sessionId: string; cameThroughLogin: boolean } | null = null;
	let opening = Promise.resolve();
	let generation = 0;

	function complete(sessionId: string, result: ResumeResult) {
		if (pending?.sessionId !== sessionId) return;
		const request = pending;
		pending = null;
		deps.record(result, request.cameThroughLogin);
		if (result === 'not_found') {
			deps.notFound();
			deps.close();
		}
	}

	async function handle(url: URL, from?: URL | null, isChatHistoryEntry = false): Promise<void> {
		if (!deps.isSignedIn()) return;
		// Back traverses the mounted chat's history; an old entry is not a fresh
		// request to reopen a chat the user has since closed on another page.
		if (isChatHistoryEntry) {
			deps.restoreHistoryUrl();
			return;
		}
		const sessionId = readChatResumeSessionId(url);
		if (!sessionId || deps.visibleSession() === sessionId || pending?.sessionId === sessionId)
			return;
		const version = ++generation;
		pending = {
			sessionId,
			cameThroughLogin:
				from?.pathname === '/auth/login' || url.searchParams.get('auth_success') === 'true'
		};
		// Serialize history cleanup. If multiple links arrive together, only the newest
		// pending destination should open, never two modals racing over one history entry.
		opening = opening.then(async () => {
			if (version !== generation) return;
			const resumeUrl = deps.suspendUrl();
			const clean = new URL(url);
			clean.searchParams.delete('chat');
			// Older History links also carried a server-loaded selection. The
			// canonical chat request owns opening, so remove that duplicate trigger.
			if (
				clean.pathname === '/history' &&
				clean.searchParams.get('itemType') === 'chat_session'
			) {
				clean.searchParams.delete('id');
				clean.searchParams.delete('itemType');
			}
			try {
				await deps.cleanUrl(clean);
				if (version !== generation) return;
				if (!deps.isSignedIn()) {
					pending = null;
					return;
				}
				if (await deps.open(sessionId)) complete(sessionId, 'ok');
			} catch {
				if (version === generation) complete(sessionId, 'error');
			} finally {
				resumeUrl();
			}
		});
		await opening;
	}

	function cancel(sessionId: string | null) {
		if (!sessionId || pending?.sessionId !== sessionId) return;
		pending = null;
		generation += 1;
	}

	return { handle, complete, cancel };
}
