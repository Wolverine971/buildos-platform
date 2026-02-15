// apps/web/src/lib/services/dailyBrief/ontology-mappers.ts
import type { Database } from '@buildos/shared-types';
import type { DailyBrief, ProjectDailyBrief } from '$lib/types/daily-brief';

type OntologyDailyBriefRow = Database['public']['Tables']['ontology_daily_briefs']['Row'];
type OntologyProjectBriefRow = Database['public']['Tables']['ontology_project_briefs']['Row'];

type ProjectLike = {
	id?: string | null;
	name?: string | null;
	description?: string | null;
};

export function mapOntologyDailyBriefRow(row: OntologyDailyBriefRow): DailyBrief {
	const summary = row.executive_summary || row.llm_analysis || '';

	return {
		id: row.id,
		chat_brief_id: row.id,
		user_id: row.user_id,
		brief_date: row.brief_date,
		summary_content: summary,
		executive_summary: row.executive_summary || summary,
		llm_analysis: row.llm_analysis,
		insights: row.llm_analysis || undefined,
		priority_actions: row.priority_actions || [],
		generation_status: (row.generation_status as DailyBrief['generation_status']) || 'pending',
		generation_error: row.generation_error || undefined,
		generation_started_at: row.generation_started_at || undefined,
		generation_completed_at: row.generation_completed_at || undefined,
		metadata: row.metadata,
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

interface MapProjectBriefInput {
	row: OntologyProjectBriefRow;
	userId: string;
	briefDate: string;
	project?: ProjectLike | null;
	generationStatus?: string | null;
}

export function mapOntologyProjectBriefRow({
	row,
	userId,
	briefDate,
	project,
	generationStatus
}: MapProjectBriefInput): ProjectDailyBrief {
	const projectName = project?.name || 'Project';

	return {
		id: row.id,
		user_id: userId,
		project_id: row.project_id,
		brief_content: row.brief_content,
		brief_date: briefDate,
		generation_status:
			(generationStatus as ProjectDailyBrief['generation_status']) || 'completed',
		metadata: row.metadata,
		created_at: row.created_at,
		updated_at: row.updated_at,
		projects: {
			id: project?.id || row.project_id,
			name: projectName,
			description: project?.description || undefined
		}
	};
}
