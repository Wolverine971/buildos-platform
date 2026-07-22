// apps/web/src/lib/config/short-links.ts

/**
 * Curated short links served by /s/[slug].
 *
 * Purpose: human-friendly URLs for founder emails and campaigns
 * (https://build-os.com/s/welcome-back) that redirect to full destinations
 * carrying UTM parameters, so outbound copy stays clean while analytics stay intact.
 *
 * Rules:
 * - Slugs are kebab-case and STABLE once published — they land in emails that
 *   cannot be recalled. Never delete or repoint a slug that has been sent;
 *   add a new one instead.
 * - Destinations are same-origin relative paths (never external URLs), which
 *   keeps /s/ from ever becoming an open redirect.
 */
export const SHORT_LINKS: Record<string, string> = {
	// Beta reactivation campaign (2026-07) — docs/marketing/campaigns/beta-reactivation/
	'welcome-back':
		'/welcome-back?utm_source=founder_email&utm_medium=email&utm_campaign=beta-reactivation-tailored-2026-07',
	start: '/auth/register?utm_source=founder_email&utm_medium=email&utm_campaign=beta-reactivation-tailored-2026-07',

	// Writer memory campaign (2026-07) — LinkedIn re-entry receipt
	reentry:
		'/?utm_source=linkedin&utm_medium=organic_social&utm_campaign=writer_memory_2026_07&utm_content=w1_reentry_receipt_dj'
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Resolve a slug to its destination path, merging any query params supplied on
 * the short link itself (incoming params win over destination defaults, so
 * /s/welcome-back?utm_source=twitter can override the baked-in source).
 * Returns null for unknown or malformed slugs.
 */
export function resolveShortLink(slug: string, incomingParams?: URLSearchParams): string | null {
	if (!SLUG_PATTERN.test(slug)) return null;
	const destination = SHORT_LINKS[slug];
	if (!destination) return null;

	if (!incomingParams || [...incomingParams.keys()].length === 0) return destination;

	const queryIndex = destination.indexOf('?');
	const path = queryIndex === -1 ? destination : destination.slice(0, queryIndex);
	const search = queryIndex === -1 ? '' : destination.slice(queryIndex + 1);
	const merged = new URLSearchParams(search);
	for (const [key, value] of incomingParams) {
		merged.set(key, value);
	}
	const qs = merged.toString();
	return qs ? `${path}?${qs}` : path;
}
