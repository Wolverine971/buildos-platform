// packages/supabase-client/src/request-path-guard.ts

/**
 * Keeps a stored file path from steering a Supabase request somewhere else.
 *
 * supabase-js builds storage URLs by joining the bucket and the object path as text
 * (`…/storage/v1/object/<bucket>/<path>`) and hands the string to `fetch`. `fetch` then
 * resolves dot segments, including the encoded spellings `%2e%2e` and `.%2e`. A path such as
 * `<user>/%2e%2e/%2e%2e/%2e%2e/%2e%2e/%2e%2e/rest/v1/users?select=*` therefore leaves the
 * bucket and the storage API, and the request reaches the database API with the client's own
 * key. On a service-role client that reads any table or signs any stored file.
 *
 * Two layers close this:
 * - `isPlainStorageObjectPath` is the check for a path read from a row before it is used.
 * - `refuseDotSegmentFetch` is the `fetch` every server client uses, so a path that slips past
 *   a caller still cannot leave its folder.
 */

const PLAIN_STORAGE_OBJECT_PATH = /^[A-Za-z0-9_-][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_-][A-Za-z0-9._-]*)*$/;
const MAX_STORAGE_OBJECT_PATH_LENGTH = 1024;

/**
 * Whether a stored object path is made only of plain segments: letters, digits, `_`, `-`, and
 * `.` after the first character. That excludes `.` and `..` segments in every encoding, `%`,
 * `?`, `#`, backslashes, spaces, control characters, and leading or doubled slashes. Every
 * path the app writes has this shape (`<user>/<id>.webm`, `projects/<id>/assets/<id>/original.png`).
 */
export function isPlainStorageObjectPath(path: unknown): path is string {
	return (
		typeof path === 'string' &&
		path.length <= MAX_STORAGE_OBJECT_PATH_LENGTH &&
		PLAIN_STORAGE_OBJECT_PATH.test(path)
	);
}

const SCHEME_AND_AUTHORITY = /^[a-z][a-z0-9+.-]*:[/\\]{2}[^/\\?#]*/i;
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Whether `fetch` would resolve a `.` or `..` segment in this URL's path. Mirrors the URL
 * standard: tabs and newlines are dropped, `\` separates segments like `/`, and `%2e` counts
 * as a dot.
 */
export function urlHasDotSegment(rawUrl: string): boolean {
	const withoutStripped = rawUrl.replace(/[\t\n\r]/g, '');
	const afterAuthority = withoutStripped.replace(SCHEME_AND_AUTHORITY, '');
	const path = afterAuthority.split(/[?#]/, 1)[0] ?? '';
	return path.split(/[/\\]/).some((segment) => DOT_SEGMENT.test(segment));
}

/**
 * `fetch` for server-side Supabase clients. It refuses a request whose path contains a dot
 * segment, which no Supabase endpoint needs. supabase-js passes its URLs as strings; a `URL`
 * or `Request` has already been resolved, so its final path is checked as given.
 */
export const refuseDotSegmentFetch: typeof fetch = (input, init) => {
	const rawUrl =
		typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
	if (urlHasDotSegment(rawUrl)) {
		return Promise.reject(
			new TypeError('Refused a Supabase request whose path contains a dot segment')
		);
	}
	return fetch(input, init);
};
