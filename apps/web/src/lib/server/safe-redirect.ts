// apps/web/src/lib/server/safe-redirect.ts
/**
 * Normalize a redirect candidate to a same-origin path. Absolute same-origin
 * URLs are accepted but reduced to a path so redirects cannot leave the app.
 */
export function getSafeLocalRedirect(
	candidate: string | null | undefined,
	origin: string,
	fallback: string
): string {
	if (!candidate) return fallback;

	try {
		const target = new URL(candidate, origin);
		if (target.origin !== origin) return fallback;
		return `${target.pathname}${target.search}${target.hash}`;
	} catch {
		return fallback;
	}
}
