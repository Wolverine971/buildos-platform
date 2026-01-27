// apps/web/src/routes/api/tree-agent/runs/[id]/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({
	params,
	url,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const runId = params.id;
	const includeNodes = url.searchParams.get('include_nodes') !== 'false';
	const includeEvents = url.searchParams.get('include_events') !== 'false';
	const includePlans = url.searchParams.get('include_plans') === 'true';
	const includeArtifacts = url.searchParams.get('include_artifacts') !== 'false';
	const includeScratchpads = url.searchParams.get('include_scratchpads') !== 'false';

	const sb = supabase as any;

	const { data: run, error: runError } = await sb
		.from('tree_agent_runs')
		.select('*')
		.eq('id', runId)
		.eq('user_id', user.id)
		.single();

	if (runError || !run) {
		return ApiResponse.error('Tree Agent run not found', HttpStatus.NOT_FOUND, 'NOT_FOUND');
	}

	let nodes: any[] = [];
	let events: any[] = [];
	let plans: any[] = [];
	let artifacts: any[] = [];
	let scratchpads: any[] = [];
	let artifactDocuments: any[] = [];

	if (includeNodes) {
		const { data } = await sb
			.from('tree_agent_nodes')
			.select('*')
			.eq('run_id', runId)
			.order('created_at', { ascending: true });
		nodes = data ?? [];
	}

	if (includeEvents) {
		const { data } = await sb
			.from('tree_agent_events')
			.select('*')
			.eq('run_id', runId)
			.order('seq', { ascending: false })
			.limit(500);
		events = data ?? [];
	}

	if (includePlans) {
		const { data } = await sb
			.from('tree_agent_plans')
			.select('*')
			.eq('run_id', runId)
			.order('created_at', { ascending: false })
			.limit(50);
		plans = data ?? [];
	}

	if (includeArtifacts) {
		const { data } = await sb
			.from('tree_agent_artifacts')
			.select('*')
			.eq('run_id', runId)
			.order('created_at', { ascending: false })
			.limit(200);
		artifacts = data ?? [];

		const documentIds = artifacts
			.filter((a) => a?.artifact_type === 'document' && a?.document_id)
			.map((a) => a.document_id);

		if (documentIds.length > 0) {
			const { data: docs } = await sb
				.from('onto_documents')
				.select('id, title, type_key, state_key, props, updated_at, created_at')
				.in('id', documentIds);
			artifactDocuments = docs ?? [];
		}
	}

	if (includeScratchpads) {
		const { data: pads } = await sb
			.from('onto_documents')
			.select('id, title, type_key, state_key, props, updated_at, created_at')
			.contains('props', { tree_agent_run_id: runId, doc_role: 'tree_agent_scratchpad' })
			.order('updated_at', { ascending: false })
			.limit(200);
		scratchpads = pads ?? [];
	}

	return ApiResponse.success({
		run,
		nodes,
		events,
		plans,
		artifacts,
		scratchpads,
		artifactDocuments
	});
};
