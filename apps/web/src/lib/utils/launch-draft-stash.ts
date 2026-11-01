// apps/web/src/lib/utils/launch-draft-stash.ts
/**
 * Long chat-launch drafts (a visitor pasting notes into the homepage box) don't fit in a URL:
 * Google signup carries the redirect in a cookie-backed state capped near 2,000 characters and
 * drops the prompt past that. So the full text waits in this browser's localStorage under an
 * id, and the launch link carries `draft=<id>` plus a short preview as `prompt`. The preview
 * keeps the link a valid launch on its own (server checks and other devices still open chat
 * with it); Navigation swaps in the full text when this browser has it.
 *
 * localStorage, not sessionStorage: the email-confirmation link opens in a new tab.
 */

const STORAGE_KEY = 'buildos:launch-draft';
const TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_STASHED_DRAFT_CHARS = 8000;
/** Preview length that keeps the encoded redirect well under the OAuth state cap. */
export const LAUNCH_PREVIEW_CHARS = 500;

const STASH_ID_PATTERN = /^[a-z0-9]{8,32}$/;

type StashedDraft = { id: string; text: string; savedAt: number };

export function isLaunchDraftStashId(value: string | null | undefined): value is string {
	return typeof value === 'string' && STASH_ID_PATTERN.test(value);
}

/** Saves the draft and returns its id, or null when storage is unavailable. */
export function stashLaunchDraft(text: string): string | null {
	const trimmed = text.trim().slice(0, MAX_STASHED_DRAFT_CHARS);
	if (!trimmed) return null;
	const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
	try {
		const entry: StashedDraft = { id, text: trimmed, savedAt: Date.now() };
		localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
		return id;
	} catch {
		return null;
	}
}

/** Returns the stashed draft for this id once, then forgets it. */
export function takeLaunchDraft(id: string): string | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const entry = JSON.parse(raw) as Partial<StashedDraft>;
		if (entry.id !== id) return null;
		localStorage.removeItem(STORAGE_KEY);
		if (typeof entry.text !== 'string' || typeof entry.savedAt !== 'number') return null;
		if (Date.now() - entry.savedAt > TTL_MS) return null;
		return entry.text;
	} catch {
		return null;
	}
}

/**
 * The chat-launch path for a draft: `/?open=agent-chat&prompt=<preview>[&draft=<id>]`.
 * Short drafts ride in the URL whole; long ones are stashed with a preview in the URL.
 */
export function buildDraftLaunchPath(text: string): string {
	const trimmed = text.trim();
	const params = new URLSearchParams({ open: 'agent-chat' });
	if (trimmed.length <= LAUNCH_PREVIEW_CHARS) {
		params.set('prompt', trimmed);
		return `/?${params}`;
	}
	const stashId = stashLaunchDraft(trimmed);
	params.set('prompt', `${trimmed.slice(0, LAUNCH_PREVIEW_CHARS).trimEnd()}...`);
	if (stashId) params.set('draft', stashId);
	return `/?${params}`;
}
