// apps/web/src/lib/utils/analytics-url.ts

/**
 * Origin + path of a URL, or the path of a relative one, for analytics
 * properties. The query string and hash are dropped: they can carry tokens,
 * email addresses, or search text.
 */
export function analyticsUrl(value: string | null | undefined): string | null {
	const trimmed = typeof value === 'string' ? value.trim() : '';
	if (!trimmed) return null;
	try {
		const url = new URL(trimmed);
		// Non-web schemes (android-app://…) have an opaque origin.
		const origin = url.origin !== 'null' ? url.origin : `${url.protocol}//${url.host}`;
		return `${origin}${url.pathname}`;
	} catch {
		return trimmed.split(/[?#]/, 1)[0] || null;
	}
}
