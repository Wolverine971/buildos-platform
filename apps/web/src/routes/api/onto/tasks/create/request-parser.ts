// apps/web/src/routes/api/onto/tasks/create/request-parser.ts
import type { toParentRefs } from '$lib/services/ontology/auto-organizer.service';
import type { ConnectionRef } from '$lib/services/ontology/relationship-resolver';

type ParentInput = NonNullable<Parameters<typeof toParentRefs>[0]>['parent'];
type ParentsInput = NonNullable<Parameters<typeof toParentRefs>[0]>['parents'];

export interface ParsedTaskCreateBody {
	project_id: string;
	title: string;
	description?: string | null;
	priority: number;
	plan_id?: string | null;
	state_key: string;
	goal_id?: string | null;
	supporting_milestone_id?: string | null;
	start_at?: string | null;
	due_at?: string | null;
	parent?: ParentInput;
	parents?: ParentsInput;
	connections?: ConnectionRef[];
	classificationSource: unknown;
}

export const parseTaskCreateBody = (body: Record<string, unknown>): ParsedTaskCreateBody => {
	const {
		project_id,
		title,
		description,
		priority = 3,
		plan_id,
		state_key = 'todo',
		goal_id,
		supporting_milestone_id,
		start_at,
		due_at,
		parent,
		parents,
		connections
	} = body;

	return {
		project_id: project_id as string,
		title: title as string,
		description: (description as string | null | undefined) ?? undefined,
		priority: priority as number,
		plan_id: (plan_id as string | null | undefined) ?? undefined,
		state_key: (state_key as string | undefined) ?? 'todo',
		goal_id: (goal_id as string | null | undefined) ?? undefined,
		supporting_milestone_id:
			(supporting_milestone_id as string | null | undefined) ?? undefined,
		start_at: (start_at as string | null | undefined) ?? undefined,
		due_at: (due_at as string | null | undefined) ?? undefined,
		parent: parent as ParentInput | undefined,
		parents: parents as ParentsInput | undefined,
		connections: (connections as ConnectionRef[] | undefined) ?? undefined,
		classificationSource: body.classification_source ?? body.classificationSource
	};
};
