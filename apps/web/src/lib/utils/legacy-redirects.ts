// apps/web/src/lib/utils/legacy-redirects.ts
// Permanent redirects for retired public paths. hooks.server.ts serves them as 308s and
// scripts/generate-sitemap.ts skips them, so keep this module free of app imports.

const LEGACY_FEATURE_PATHS = new Set(['/features', '/features/']);
const LEGACY_PATH_REDIRECTS = new Map<string, string>([
	['/community', '/contact'],
	['/community/', '/contact'],
	['/s-build-os.webp', '/twitter_card_light.webp'],
	// Merged into the irresistible-hooks deep-read (combined build formula + diagnostic).
	[
		'/blogs/source-analyses/kallaway-hooks-impossible-to-skip',
		'/blogs/source-analyses/kallaway-irresistible-hooks'
	],
	[
		'/blogs/source-analyses/kallaway-hooks-impossible-to-skip/',
		'/blogs/source-analyses/kallaway-irresistible-hooks'
	]
]);
const LEGACY_BLOG_MARKDOWN_PATH = /^\/src\/content\/blogs\/([^/]+)\/([^/]+?)(?:\.md)?\/?$/;

/** Where a retired path now lives, or null when the path is not redirected. */
export function getLegacyRedirectPath(pathname: string): string | null {
	const redirectedPath = LEGACY_PATH_REDIRECTS.get(pathname);
	if (redirectedPath) {
		return redirectedPath;
	}

	if (LEGACY_FEATURE_PATHS.has(pathname)) {
		return '/';
	}

	const legacyBlogPathMatch = pathname.match(LEGACY_BLOG_MARKDOWN_PATH);
	if (!legacyBlogPathMatch) {
		return null;
	}

	const [, category, rawSlug] = legacyBlogPathMatch;
	if (!category || !rawSlug) {
		return null;
	}

	const slug = rawSlug.replace(/\.md$/i, '');
	return `/blogs/${category}/${slug}`;
}
