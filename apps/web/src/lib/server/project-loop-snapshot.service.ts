// apps/web/src/lib/server/project-loop-snapshot.service.ts
import {
	buildProjectLoopParentMap,
	buildProjectLoopSourceFingerprint,
	type ProjectLoopFingerprintContext,
	summarizeProjectLoopDocTree
} from '@buildos/shared-agent-ops';

type AnySupabase = any;

export type ProjectLoopSnapshotContext = ProjectLoopFingerprintContext & {
	docStructureSummary: string;
};

export async function loadProjectLoopSnapshotContext(
	supabase: AnySupabase,
	projectId: string
): Promise<ProjectLoopSnapshotContext | null> {
	const { data: projectRow, error: projectError } = await supabase
		.from('onto_projects')
		.select('id, name, description, doc_structure, deleted_at, archived_at')
		.eq('id', projectId)
		.maybeSingle();

	if (projectError) throw projectError;
	if (!projectRow || projectRow.deleted_at || projectRow.archived_at) return null;

	const { data: graphData, error: graphError } = await supabase.rpc(
		'load_project_graph_context',
		{ p_project_id: projectId }
	);
	if (graphError) throw graphError;

	const payload = graphData as any;
	const rawDocs: any[] = Array.isArray(payload?.documents) ? payload.documents : [];
	const rawTasks: any[] = Array.isArray(payload?.tasks) ? payload.tasks : [];
	const rawGoals: any[] = Array.isArray(payload?.goals) ? payload.goals : [];

	const parentMap = buildProjectLoopParentMap(projectRow.doc_structure);
	const titleById = new Map<string, string>(
		rawDocs.map((doc) => [doc.id as string, (doc.title as string) ?? 'Untitled'])
	);

	return {
		projectId,
		projectName: projectRow.name ?? 'Untitled project',
		projectDescription: projectRow.description ?? null,
		goals: rawGoals.slice(0, 10).map((goal) => ({
			name: goal.name ?? goal.goal ?? 'Untitled goal',
			description: goal.description ?? null
		})),
		documents: rawDocs.map((doc) => ({
			id: doc.id,
			title: doc.title ?? 'Untitled',
			state_key: doc.state_key ?? null,
			updated_at: doc.updated_at ?? doc.created_at ?? null,
			parent_id: parentMap.get(doc.id) ?? null
		})),
		tasks: rawTasks
			.filter((task) => task.state_key !== 'done')
			.slice(0, 20)
			.map((task) => ({
				id: task.id,
				title: task.title ?? 'Untitled',
				state_key: task.state_key ?? null,
				updated_at: task.updated_at ?? task.created_at ?? null
			})),
		docStructureSummary: summarizeProjectLoopDocTree(projectRow.doc_structure, titleById)
	};
}

export async function loadProjectLoopSourceFingerprint(
	supabase: AnySupabase,
	projectId: string
): Promise<string | null> {
	const ctx = await loadProjectLoopSnapshotContext(supabase, projectId);
	return ctx ? buildProjectLoopSourceFingerprint(ctx) : null;
}
