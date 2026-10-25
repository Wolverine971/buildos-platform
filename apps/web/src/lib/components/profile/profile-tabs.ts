// apps/web/src/lib/components/profile/profile-tabs.ts
export const BASE_PROFILE_TAB_IDS = [
	'account',
	'contacts',
	'briefs',
	'calendar',
	'email',
	'notifications',
	'people',
	'data'
] as const;

export type BaseProfileTabId = (typeof BASE_PROFILE_TAB_IDS)[number];
export type ProfileTabId = BaseProfileTabId | 'cycles' | 'billing';

export interface ProfileTabVisibility {
	cyclesProfileEnabled: boolean;
	stripeEnabled: boolean;
}

export function getVisibleProfileTabIds({
	cyclesProfileEnabled,
	stripeEnabled
}: ProfileTabVisibility): ProfileTabId[] {
	return [
		...BASE_PROFILE_TAB_IDS,
		...(cyclesProfileEnabled ? (['cycles'] as const) : []),
		...(stripeEnabled ? (['billing'] as const) : [])
	];
}

/** Old tab ids that now live inside another tab (Agents moved into People & agents). */
const PROFILE_TAB_ALIASES: Record<string, { tab: ProfileTabId; section: string }> = {
	'agent-keys': { tab: 'people', section: 'agents' }
};

/** The section inside a tab that an old tab id points at, e.g. ?tab=agent-keys → 'agents'. */
export function profileTabAliasSection(requestedTab: string | null): string | null {
	return requestedTab ? (PROFILE_TAB_ALIASES[requestedTab]?.section ?? null) : null;
}

export function resolveProfileTab(
	requestedTab: string | null,
	visibility: ProfileTabVisibility
): ProfileTabId {
	const visibleTabs = new Set<string>(getVisibleProfileTabIds(visibility));
	const tab = requestedTab ? (PROFILE_TAB_ALIASES[requestedTab]?.tab ?? requestedTab) : null;
	return tab && visibleTabs.has(tab) ? (tab as ProfileTabId) : 'account';
}

export function getProfileTabHref(tab: ProfileTabId): string {
	return tab === 'account' ? '/profile' : `/profile?tab=${encodeURIComponent(tab)}`;
}
