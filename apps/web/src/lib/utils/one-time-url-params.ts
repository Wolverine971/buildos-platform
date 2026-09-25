// apps/web/src/lib/utils/one-time-url-params.ts
import { afterNavigate, goto } from '$app/navigation';

/**
 * Acts on one-time URL params (OAuth return flags, deep-link triggers) after each navigation,
 * then drops them with a replacing `goto` so a refresh, Back, or later tab switch never replays
 * them. `consume` returns the param names it acted on; return `[]` when there is nothing to do.
 * Call during component initialisation.
 *
 * Do not use `$effect` + shallow `replaceState` for this. On a full page load (every OAuth
 * return) that effect runs while SvelteKit is still hydrating, before its router exists, so
 * `replaceState` throws. Shallow `replaceState` also re-emits `page` without changing
 * `page.url`, so an effect reading `page.url` sees the same params and fires again. Together
 * those made Settings → Calendar refetch and re-render forever after connecting Google.
 */
export function consumeOneTimeUrlParams(consume: (url: URL) => readonly string[]): void {
	afterNavigate(({ to }) => {
		if (!to?.url) return;
		const consumed = consume(to.url);
		if (consumed.length === 0) return;

		const cleanUrl = new URL(to.url);
		for (const key of consumed) cleanUrl.searchParams.delete(key);
		// The first afterNavigate runs just before SvelteKit marks its router started; one
		// microtask later it is ready to navigate.
		queueMicrotask(() => {
			void goto(`${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`, {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		});
	});
}
