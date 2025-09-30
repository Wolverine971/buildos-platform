// apps/web/src/lib/types/projects-page.ts

export type ProjectFilter = 'all' | 'active' | 'paused' | 'completed' | 'archived';
export type BriefDateRange = 'today' | 'week' | 'month' | 'all';
export type TabType = 'projects' | 'briefs';

export interface FilterCounts {
	all: number;
	active: number;
	paused: number;
	completed: number;
	archived: number;
}

export interface ProjectsFilterState {
	projectFilter: ProjectFilter;
	briefDateRange: BriefDateRange;
	selectedProjectFilter: string;
	searchQuery: string;
}

export interface ProjectsPageState {
	activeTab: TabType;
	filters: ProjectsFilterState;
	briefsLoaded: boolean;
	loadingBriefs: boolean;
	projectBriefs: any[];
	selectedBrief: any | null;
	showBriefModal: boolean;
	showNewProjectModal: boolean;
	creatingProject: boolean;
	loadingProjectId: string;
}
