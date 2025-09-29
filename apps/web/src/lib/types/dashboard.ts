// src/lib/types/dashboard.ts
// Dashboard component type definitions

import type { Database } from '@buildos/shared-types';
import type { DashboardData } from '$lib/services/dashboardData.service';

// User type from database
export type User = Database['public']['Tables']['users']['Row'];

// Dashboard component props
export interface DashboardProps {
	user: User;
	initialData: DashboardData | null;
	isLoadingDashboard?: boolean;
	dashboardError?: string | null;
}

// Calendar status type for dashboard
export interface CalendarStatus {
	isConnected: boolean;
	loading: boolean;
	error: string | null;
}

// Dashboard stats type
export interface DashboardStats {
	totalProjects: number;
	activeTasks: number;
	completedToday: number;
	upcomingDeadlines: number;
	weeklyProgress?: {
		completed: number;
		total: number;
	};
}

// User familiarity calculation result
export interface UserFamiliarity {
	tier: 1 | 2 | 3;
	level: 'brand-new' | 'getting-started' | 'experienced';
	projectCount: number;
	taskCount: number;
	isStale: boolean;
	isVeryStale: boolean;
}

// Nudge card for dashboard
export interface NudgeCard {
	type: string;
	title: string;
	description: string;
	action: {
		text: string;
		href: string;
	};
	icon: any; // Lucide icon component
	color: string;
}

// Primary CTA for welcome messages
export interface PrimaryCTA {
	title: string;
	subtitle?: string;
	description: string;
	primaryAction: {
		text: string;
		href: string;
		icon: any; // Lucide icon component
	};
}

// Bottom sections data
export interface BottomSectionsData {
	todaysBrief?: any; // DailyBrief type from existing types
	stats?: Partial<DashboardStats>;
	[key: string]: any; // Allow additional properties
}
