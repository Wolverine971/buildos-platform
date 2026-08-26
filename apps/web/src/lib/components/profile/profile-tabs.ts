// apps/web/src/lib/components/profile/profile-tabs.ts
export const BASE_PROFILE_TAB_IDS = [
	'account',
	'contacts',
	'preferences',
	'briefs',
	'calendar',
	'email',
	'notifications',
	'agent-keys'
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

export function resolveProfileTab(
	requestedTab: string | null,
	visibility: ProfileTabVisibility
): ProfileTabId {
	const visibleTabs = new Set<string>(getVisibleProfileTabIds(visibility));
	return requestedTab && visibleTabs.has(requestedTab)
		? (requestedTab as ProfileTabId)
		: 'account';
}

export function getProfileTabHref(tab: ProfileTabId): string {
	return tab === 'account' ? '/profile' : `/profile?tab=${encodeURIComponent(tab)}`;
}
