// src/lib/utils/projects-filters.ts
import type { Project } from '$lib/types/project';
import type { ProjectFilter, BriefDateRange } from '$lib/types/projects-page';

/**
 * Filter projects based on status and search query
 */
export function filterProjects(
	projects: Project[],
	filter: ProjectFilter,
	searchQuery: string
): Project[] {
	const filtered = projects.filter((project) => {
		// Status filter
		if (filter !== 'all' && project.status !== filter) return false;

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			const name = project.name?.toLowerCase() || '';
			const description = project.description?.toLowerCase() || '';
			return name.includes(query) || description.includes(query);
		}

		return true;
	});

	// Ensure archived projects are shown last without disturbing the original array order
	return filtered.slice().sort((a, b) => {
		const aArchived = a.status === 'archived';
		const bArchived = b.status === 'archived';
		if (aArchived === bArchived) return 0;
		return aArchived ? 1 : -1;
	});
}

/**
 * Filter briefs based on date range, project, and search query
 */
export function filterBriefs(
	briefs: any[],
	dateRange: BriefDateRange,
	projectFilter: string,
	searchQuery: string
): any[] {
	return briefs.filter((brief) => {
		// Date range filter
		if (dateRange !== 'all') {
			const now = Date.now();
			const briefTime = new Date(brief.brief_date).getTime();
			const dayMs = 24 * 60 * 60 * 1000;

			let maxAge: number;
			switch (dateRange) {
				case 'today':
					maxAge = dayMs;
					break;
				case 'week':
					maxAge = 7 * dayMs;
					break;
				case 'month':
					maxAge = 30 * dayMs;
					break;
				default:
					maxAge = Infinity;
			}

			if (now - briefTime > maxAge) return false;
		}

		// Project filter
		if (projectFilter !== 'all' && brief.project_id !== projectFilter) {
			return false;
		}

		// Search filter
		if (searchQuery) {
			const query = searchQuery.toLowerCase();
			const content = brief.brief_content?.toLowerCase() || '';
			const projectName = brief.project_name?.toLowerCase() || '';
			return content.includes(query) || projectName.includes(query);
		}

		return true;
	});
}

/**
 * Calculate filter counts for projects
 */
export function calculateFilterCounts(projects: Project[]) {
	return projects.reduce(
		(acc, project) => {
			acc.all++;
			const status = project.status as keyof typeof acc;
			if (status in acc) {
				acc[status]++;
			}
			return acc;
		},
		{ all: 0, active: 0, paused: 0, completed: 0, archived: 0 }
	);
}

/**
 * Debounce function for search input
 */
export function debounce<T extends (...args: any[]) => any>(
	func: T,
	wait: number
): (...args: Parameters<T>) => void {
	let timeout: NodeJS.Timeout | null = null;

	return function executedFunction(...args: Parameters<T>) {
		const later = () => {
			timeout = null;
			func(...args);
		};

		if (timeout) {
			clearTimeout(timeout);
		}
		timeout = setTimeout(later, wait);
	};
}
