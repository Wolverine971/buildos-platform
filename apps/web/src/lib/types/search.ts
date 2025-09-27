// src/lib/types/search.ts

// Enum type definitions matching your database
export type BrainDumpStatus = 'pending' | 'parsed' | 'saved' | 'parsed_and_deleted';
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived';
export type TaskStatus = 'backlog' | 'in_progress' | 'done' | 'blocked';
export type PriorityLevel = 'low' | 'medium' | 'high';

export interface SearchResult {
	item_type: 'braindump' | 'project' | 'task';
	item_id: string;
	title: string;
	description: string;
	tags: string[] | null;
	status: string; // Will be one of the enum values above based on item_type
	project_id: string | null;
	created_at: string;
	updated_at: string;
	relevance_score: number;
	is_completed: boolean;
	is_deleted: boolean;
	matched_fields: string[];
}

export interface GroupedSearchResults {
	braindumps: SearchResult[];
	projects: SearchResult[];
	tasks: SearchResult[];
}

export interface SearchState {
	query: string;
	results: GroupedSearchResults;
	isLoading: boolean;
	error: string | null;
	hasMore: {
		braindumps: boolean;
		projects: boolean;
		tasks: boolean;
	};
}

export interface HighlightedText {
	text: string;
	highlighted: boolean;
}
