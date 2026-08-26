// apps/web/src/lib/components/profile/settings-navigation.ts
import type { Icon } from '$lib/icons/lucide';
import {
	Bell,
	Calendar,
	Coffee,
	CreditCard,
	Key,
	Mail,
	Repeat,
	Sparkles,
	User,
	Users
} from '$lib/icons/lucide';
import type { ProfileTabId, ProfileTabVisibility } from './profile-tabs';

export const SETTINGS_GROUPS = [
	{ id: 'your-buildos', label: 'Your BuildOS' },
	{ id: 'connections', label: 'Connections' },
	{ id: 'data-plan', label: 'Data & Plan' }
] as const;

export type SettingsGroupId = (typeof SETTINGS_GROUPS)[number]['id'];

export interface SettingsDestination {
	id: ProfileTabId;
	label: string;
	icon: Icon;
	group: SettingsGroupId;
	isVisible?: (visibility: ProfileTabVisibility) => boolean;
}

const SETTINGS_DESTINATIONS: readonly SettingsDestination[] = [
	{ id: 'account', label: 'Account', icon: User, group: 'your-buildos' },
	{ id: 'preferences', label: 'AI Preferences', icon: Sparkles, group: 'your-buildos' },
	{
		id: 'cycles',
		label: 'Cycles',
		icon: Repeat,
		group: 'your-buildos',
		isVisible: ({ cyclesProfileEnabled }) => cyclesProfileEnabled
	},
	{ id: 'briefs', label: 'Brief Settings', icon: Coffee, group: 'your-buildos' },
	{ id: 'notifications', label: 'Notifications', icon: Bell, group: 'your-buildos' },
	{ id: 'calendar', label: 'Calendar', icon: Calendar, group: 'connections' },
	{ id: 'email', label: 'Email', icon: Mail, group: 'connections' },
	{ id: 'agent-keys', label: 'Agents', icon: Key, group: 'connections' },
	{ id: 'contacts', label: 'Contacts', icon: Users, group: 'data-plan' },
	{
		id: 'billing',
		label: 'Billing',
		icon: CreditCard,
		group: 'data-plan',
		isVisible: ({ stripeEnabled }) => stripeEnabled
	}
];

export function getSettingsDestinations(visibility: ProfileTabVisibility): SettingsDestination[] {
	return SETTINGS_DESTINATIONS.filter(
		(destination) => destination.isVisible?.(visibility) ?? true
	);
}

export function getSettingsGroupLabel(groupId: SettingsGroupId): string {
	return SETTINGS_GROUPS.find((group) => group.id === groupId)?.label ?? 'Settings';
}
