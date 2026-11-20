// apps/web/src/lib/server/routed-pathname.ts

/**
 * The path SvelteKit matches routes against, or null when it cannot be decoded.
 *
 * `event.url.pathname` keeps the request's percent-encoding, but SvelteKit picks the route from
 * a decoded copy. `/%61dmin/users` therefore reaches the `/admin/users` route while its raw path
 * starts with `/%61dmin`, and a prefix check on the raw path does not see an admin request.
 * Any check that decides access from the path must read this form (or `event.route.id`).
 *
 * This mirrors `decode_pathname` in @sveltejs/kit (`src/utils/url.js`): `%25` stays encoded so
 * route parameters are not decoded twice, and `decodeURI` leaves `%2F` alone, so an encoded
 * slash stays inside its segment exactly as the router sees it.
 */
export function routedPathname(url: URL): string | null {
	try {
		return url.pathname.split('%25').map(decodeURI).join('%25');
	} catch {
		return null;
	}
}
