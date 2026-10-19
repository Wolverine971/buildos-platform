// apps/web/src/lib/components/agent/agent-chat-url.svelte.ts
import { browser } from '$app/environment';
import { replaceState } from '$app/navigation';
import { page } from '$app/state';

type ChatUrlClaim = { instanceId: string; sessionId: string };
// Browser-only ownership: never populate this stack during SSR.
const claims: ChatUrlClaim[] = [];
let suspended = 0;

export function buildChatResumeUrl(base: URL, sessionId: string): string {
	const url = new URL(base);
	url.searchParams.set('chat', sessionId);
	return url.href;
}

export function getChatUrlSessionId(): string | null {
	return claims.at(-1)?.sessionId ?? null;
}

export function isChatUrlSyncSuspended(): boolean {
	return suspended > 0;
}

/** Keep an incoming resume link intact while Navigation cleans and opens it. */
export function suspendChatUrlSync(): () => void {
	suspended += 1;
	let resumed = false;
	return () => {
		if (resumed) return;
		resumed = true;
		suspended -= 1;
		syncChatUrl();
	};
}

export function syncChatUrl(): void {
	if (!browser || suspended) return;
	// Shallow writes do not update page.url. The address bar is authoritative.
	const url = new URL(window.location.href);
	const sessionId = getChatUrlSessionId();
	if (url.searchParams.get('chat') === sessionId) return;
	if (sessionId) url.searchParams.set('chat', sessionId);
	else url.searchParams.delete('chat');
	replaceState(url, { ...page.state });
}

export function claimChatUrl(instanceId: string, sessionId: string): void {
	if (!browser) return;
	const previous = claims.findIndex((claim) => claim.instanceId === instanceId);
	if (previous !== -1) claims.splice(previous, 1);
	claims.push({ instanceId, sessionId });
	syncChatUrl();
}

export function releaseChatUrl(instanceId: string): void {
	if (!browser) return;
	const index = claims.findIndex((claim) => claim.instanceId === instanceId);
	if (index === -1) return;
	const wasOwner = index === claims.length - 1;
	claims.splice(index, 1);
	if (wasOwner) syncChatUrl();
}
