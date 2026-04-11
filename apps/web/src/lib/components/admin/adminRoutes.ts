// apps/web/src/lib/components/admin/adminRoutes.ts
import { BarChart3, Bot, Clock, Coins, History, Wrench } from 'lucide-svelte';
import type { AdminNavItem } from './AdminSidebar.svelte';

export const CHAT_ADMIN_ROOT = '/admin/chat';
export const CHAT_ADMIN_TITLE = 'Chat Monitoring';

export const CHAT_ADMIN_NAV_ITEMS: AdminNavItem[] = [
	{
		title: 'Overview',
		href: CHAT_ADMIN_ROOT,
		icon: BarChart3
	},
	{
		title: 'Agents',
		href: `${CHAT_ADMIN_ROOT}/agents`,
		icon: Bot
	},
	{
		title: 'Costs',
		href: `${CHAT_ADMIN_ROOT}/costs`,
		icon: Coins
	},
	{
		title: 'Sessions',
		href: `${CHAT_ADMIN_ROOT}/sessions`,
		icon: History
	},
	{
		title: 'Tools',
		href: `${CHAT_ADMIN_ROOT}/tools`,
		icon: Wrench
	},
	{
		title: 'Timing',
		href: `${CHAT_ADMIN_ROOT}/timing`,
		icon: Clock
	}
];

export function isChatAdminSubpath(pathname: string): boolean {
	return pathname.startsWith(`${CHAT_ADMIN_ROOT}/`);
}
