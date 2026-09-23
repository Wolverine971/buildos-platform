// apps/web/src/lib/utils/auth-redirect.ts

const PLACEHOLDER_ORIGIN = 'https://buildos.invalid';
// Structural URL check, not language classification. Browsers read `\` as `/` and drop tabs
// and newlines while parsing, so `/\evil.com` and `/<tab>/evil.com` both become `//evil.com`.
const UNSAFE_RAW_CHARS = /[\s\\\u0000-\u001f\u007f]/;
const UNSAFE_DECODED_CHARS = /[\\\u0000-\u001f\u007f]/;

function safeDecode(value: string): string | null {
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

/**
 * Reduce a `?redirect=` candidate to a same-origin path (path + search + hash), or null.
 * Mirrors the server's `getSafeLocalRedirect`, and additionally refuses backslashes and
 * control characters even when percent-encoded (`/%09/evil.com`).
 */
export function normalizeRedirectPath(value: string | null | undefined): string | null {
	if (!value) return null;

	const trimmed = value.trim();
	if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
	if (UNSAFE_RAW_CHARS.test(trimmed)) return null;

	const decoded = safeDecode(trimmed);
	if (decoded === null || UNSAFE_DECODED_CHARS.test(decoded) || decoded.startsWith('//')) {
		return null;
	}

	try {
		const target = new URL(trimmed, PLACEHOLDER_ORIGIN);
		if (target.origin !== PLACEHOLDER_ORIGIN) return null;
		// Dot segments can normalize to a `//host` path ("/.//evil" becomes "//evil").
		if (target.pathname.startsWith('//') || target.pathname.startsWith('/\\')) return null;
		return `${target.pathname}${target.search}${target.hash}`;
	} catch {
		return null;
	}
}
