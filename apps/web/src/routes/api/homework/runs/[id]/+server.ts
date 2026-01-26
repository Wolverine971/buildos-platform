// apps/web/src/routes/api/homework/runs/[id]/+server.ts
import type { RequestHandler } from './$types';
import type { Database } from '@buildos/shared-types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

// Type definitions for database rows
type HomeworkRunIteration = Database['public']['Tables']['homework_run_iterations']['Row'];
type HomeworkRunEvent = Database['public']['Tables']['homework_run_events']['Row'];
type OntoDocument = Database['public']['Tables']['onto_documents']['Row'];
type OntoEdge = Database['public']['Tables']['onto_edges']['Row'];

// Partial types for specific queries
type WorkspaceDoc = Pick<
	OntoDocument,
	'id' | 'title' | 'type_key' | 'state_key' | 'project_id' | 'props' | 'updated_at' | 'created_at'
>;
type WorkspaceEdge = Pick<OntoEdge, 'id' | 'src_id' | 'dst_id' | 'rel' | 'props'>;
type ScratchpadDoc = Pick<OntoDocument, 'id' | 'content' | 'title'>;
type ExecutorPadDoc = Pick<
	OntoDocument,
	'id' | 'title' | 'content' | 'props' | 'updated_at' | 'created_at'
>;

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const runId = params.id;
	const includeIterations = url.searchParams.get('include_iterations') !== 'false';
	const includeEvents = url.searchParams.get('include_events') !== 'false';
	const includeWorkspace = url.searchParams.get('include_workspace') === 'true';

	const { data: run, error } = await supabase
		.from('homework_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (error || !run) {
		return ApiResponse.error('Homework run not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
	}

	let iterations: HomeworkRunIteration[] = [];
	let events: HomeworkRunEvent[] = [];
	let workspaceDocs: WorkspaceDoc[] = [];
	let workspaceEdges: WorkspaceEdge[] = [];
	let scratchpad: ScratchpadDoc | null = null;
	let executorPads: ExecutorPadDoc[] = [];

	if (includeIterations) {
		const { data, error: iterError } = await supabase
			.from('homework_run_iterations')
			.select('*')
			.eq('run_id', runId)
			.order('iteration', { ascending: false })
			.limit(50);

		if (!iterError) iterations = data ?? [];
	}

	if (includeEvents) {
		const { data, error: eventError } = await supabase
			.from('homework_run_events')
			.select('*')
			.eq('run_id', runId)
			.order('seq', { ascending: false })
			.limit(200);

		if (!eventError) events = data ?? [];
	}

	if (includeWorkspace) {
		const { data: docs } = await supabase
			.from('onto_documents')
			.select('id, title, type_key, state_key, project_id, props, updated_at, created_at')
			.contains('props', { homework_run_id: runId })
			.order('created_at', { ascending: true });
		workspaceDocs = docs ?? [];

		const { data: edges } = await supabase
			.from('onto_edges')
			.select('id, src_id, dst_id, rel, props')
			.contains('props', { homework_run_id: runId });
		workspaceEdges = edges ?? [];

		const { data: scratch } = await supabase
			.from('onto_documents')
			.select('id, content, title')
			.contains('props', { homework_run_id: runId, doc_role: 'scratchpad' })
			.order('updated_at', { ascending: false })
			.limit(1)
			.maybeSingle();
		scratchpad = scratch ?? null;

		const { data: execPads } = await supabase
			.from('onto_documents')
			.select('id, title, content, props, updated_at, created_at')
			.contains('props', { homework_run_id: runId, doc_role: 'scratchpad_exec' })
			.order('updated_at', { ascending: false })
			.limit(20);
		executorPads = execPads ?? [];
	}

	return ApiResponse.success({
		run,
		iterations,
		events,
		workspaceDocs,
		workspaceEdges,
		scratchpad,
		executorPads
	});
};
