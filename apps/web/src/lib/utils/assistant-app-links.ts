// apps/web/src/lib/utils/assistant-app-links.ts
//
// Chat replies link saved records by relative app path
// (`/projects/<id>/documents/<id>`, from tool `record_references`). Models
// sometimes invent an origin for them (`https://buildos.com/projects/…`, book
// loop p06–p08; the real host is build-os.com) or use a bare record id as the
// link target (t08c). Both are URL-shape defects, so they are repaired from the
// URL alone, never from the prose around the link (AGENTS.md "Never classify
// language with regex" allows structured formats such as URLs and ids).

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// A BuildOS record route: `/projects/<uuid>` then end, `/`, `?`, or `#`.
const APP_RECORD_PATH = new RegExp(`^/projects/${UUID}(?:[/?#]|$)`, 'i');
const BARE_UUID = new RegExp(`^${UUID}$`, 'i');
// Inline Markdown link or image with a plain target (no title, no spaces).
const MARKDOWN_INLINE_LINK = /(!?)\[([^\]\n]*)\]\(\s*([^()\s]+)\s*\)/g;

export type AssistantAppLinkRepair =
	| { kind: 'keep' }
	| { kind: 'rewrite'; href: string }
	| { kind: 'unlink' };

/**
 * An absolute link on any host whose path is a BuildOS record route becomes
 * that relative path (the app only ever serves records from its own origin; an
 * outside site with a `/projects/<uuid>` path is not something chat cites). A
 * bare record id is not a URL at all, so the link is dropped and its text kept.
 */
export function repairAssistantAppLinkHref(
	href: string | null | undefined
): AssistantAppLinkRepair {
	const target = (href ?? '').trim();
	if (!target) return { kind: 'keep' };
	if (BARE_UUID.test(target)) return { kind: 'unlink' };
	if (!/^https?:\/\//i.test(target)) return { kind: 'keep' };
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		return { kind: 'keep' };
	}
	if (!APP_RECORD_PATH.test(url.pathname)) return { kind: 'keep' };
	return { kind: 'rewrite', href: `${url.pathname}${url.search}${url.hash}` };
}

/**
 * Same repair over Markdown source, for assistant text the model will read
 * again (conversation history), so one bad link is not copied into every later
 * reply. Images are left alone.
 */
export function repairAssistantAppLinks(markdown: string): string {
	if (!markdown.includes('](')) return markdown;
	return markdown.replace(
		MARKDOWN_INLINE_LINK,
		(whole, bang: string, label: string, href: string) => {
			if (bang) return whole;
			const repair = repairAssistantAppLinkHref(href);
			if (repair.kind === 'rewrite') return `[${label}](${repair.href})`;
			if (repair.kind === 'unlink') return label;
			return whole;
		}
	);
}
