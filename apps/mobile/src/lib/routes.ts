// apps/mobile/src/lib/routes.ts
// Where screens live. Today and Workspace each keep their own native stack, and the project page
// is a shared route that exists in both (app/(tabs)/(today,workspace)/project/[id].tsx). Hrefs to
// a project name the tab's stack explicitly, so a project never opens in the other tab.
// Pure: no React Native imports, so tests can load this file.

export type TabStack = 'today' | 'workspace';

/** The tab bar's labels, also the back label on a project opened from a tab's root. */
export const TAB_LABEL: Record<TabStack, string> = { today: 'Today', workspace: 'Workspace' };

/** Each tab's route name in the tab navigator: its group directory under app/(tabs)/. */
export const TAB_ROUTE = {
	today: '(today)',
	workspace: '(workspace)'
} as const satisfies Record<TabStack, string>;

/** The project page's route name inside either tab's stack. */
export const PROJECT_ROUTE = 'project/[id]';

/**
 * The tab a shared layout is rendering for, from the `segment` prop Expo Router passes it
 * ("(today)" or "(workspace)"). Anything else is Today, the first tab.
 */
export function tabStackFromSegment(segment: string | null | undefined): TabStack {
	return segment === TAB_ROUTE.workspace ? 'workspace' : 'today';
}

const PROJECT_PATHNAME = {
	today: '/(tabs)/(today)/project/[id]',
	workspace: '/(tabs)/(workspace)/project/[id]'
} as const satisfies Record<TabStack, string>;

/** The project page pushed on `tab`'s stack. Group-qualified, so it can't resolve to the other tab. */
export function projectHref(tab: TabStack, id: string) {
	return { pathname: PROJECT_PATHNAME[tab], params: { id } };
}

const WEB_SCHEMES = new Set(['http', 'https', 'exp', 'exps']);

/** Workspace's search param naming a project to push over it, set by a warm project link. */
export const OPEN_PROJECT_PARAM = 'open';

/**
 * An incoming link to one project (`buildos://project/<id>`, Expo Go's
 * `exp://host/--/project/<id>`, or the website's `https://build-os.com/projects/<id>`) as a
 * Workspace stack path. A shared route would otherwise open in whichever tab sorts first on a
 * cold start. Returns null for every other link, which is then left alone.
 *
 * A cold start seeds the stack's anchor under the project. A link that arrives while the app is
 * running gets no anchor, so if Workspace was never opened its stack would hold only the project
 * (back then jumps to Today and the grid is unreachable). Warm links open the Workspace root
 * instead, and it pushes the project named by `?open=`.
 */
export function projectLinkPath(url: string, initial = true): string | null {
	let rest = url;
	const schemeEnd = url.indexOf('://');
	if (schemeEnd > 0) {
		const scheme = url.slice(0, schemeEnd).toLowerCase();
		rest = url.slice(schemeEnd + 3);
		if (WEB_SCHEMES.has(scheme)) {
			// Drop the host; Expo Go puts the app's path after `/--`.
			const slash = rest.indexOf('/');
			rest = slash >= 0 ? rest.slice(slash) : '';
			if (rest === '/--' || rest.startsWith('/--/')) rest = rest.slice(3);
		}
		// A custom scheme has no host: `buildos://project/abc` is the path `project/abc`.
	}
	const queryAt = rest.search(/[?#]/);
	const path = queryAt >= 0 ? rest.slice(0, queryAt) : rest;
	const suffix = queryAt >= 0 ? rest.slice(queryAt) : '';
	const parts = path.split('/').filter(Boolean);
	if (parts.length !== 2 || (parts[0] !== 'project' && parts[0] !== 'projects')) return null;
	if (!initial) return `/(tabs)/(workspace)/projects?${OPEN_PROJECT_PARAM}=${parts[1]}`;
	return `/(tabs)/(workspace)/project/${parts[1]}${suffix}`;
}
