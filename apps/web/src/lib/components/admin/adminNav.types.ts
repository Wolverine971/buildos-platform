// apps/web/src/lib/components/admin/adminNav.types.ts
import type { ComponentType } from 'svelte';

export type AdminNavIcon = ComponentType;

export type AdminNavItem = {
	title: string;
	href: string;
	icon: AdminNavIcon;
	description?: string;
	badge?: string;
	children?: AdminNavItem[];
};

export type AdminNavGroup = {
	title: string;
	items: AdminNavItem[];
};
