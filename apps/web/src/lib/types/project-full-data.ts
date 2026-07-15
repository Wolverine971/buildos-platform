// apps/web/src/lib/types/project-full-data.ts
export type ProjectEventsCoverage = {
	scope: 'all' | 'initial-window';
	complete: boolean;
	returned: number;
	recent_since?: string;
	recent_limit?: number;
	upcoming_limit?: number;
	recent_has_more?: boolean;
	upcoming_has_more?: boolean;
};
