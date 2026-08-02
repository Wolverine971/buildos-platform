import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { getAdminUserId } from '$lib/server/question-tree-admin';
import {
	buildQuestionTreeExportName,
	buildQuestionTreeExportZip
} from '$lib/services/question-tree/export';
import type { QuestionTreeRunDetail } from '$lib/services/question-tree/types';
import { ApiResponse } from '$lib/utils/api-response';

type AnySupabase = { from: (table: string) => any };
const EXPORT_PAGE_SIZE = 500;

async function selectAllRunRows(
	admin: AnySupabase,
	params: { table: string; runId: string; orderBy: string }
): Promise<unknown[]> {
	const rows: unknown[] = [];
	for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
		const { data, error } = await admin
			.from(params.table)
			.select('*')
			.eq('run_id', params.runId)
			.order(params.orderBy, { ascending: true })
			.range(from, from + EXPORT_PAGE_SIZE - 1);
		if (error) throw error;
		const page = data ?? [];
		rows.push(...page);
		if (page.length < EXPORT_PAGE_SIZE) return rows;
	}
}

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const adminUserId = await getAdminUserId({ supabase, safeGetSession });
	if (!adminUserId) return ApiResponse.forbidden('Admin access required');

	try {
		const admin = createAdminSupabaseClient() as unknown as AnySupabase;
		const [runResult, nodesResult, proposalsResult, eventsResult] = await Promise.all([
			admin.from('question_tree_runs').select('*').eq('id', params.runId).maybeSingle(),
			selectAllRunRows(admin, {
				table: 'question_tree_nodes',
				runId: params.runId,
				orderBy: 'node_number'
			}),
			selectAllRunRows(admin, {
				table: 'question_tree_proposals',
				runId: params.runId,
				orderBy: 'created_at'
			}),
			selectAllRunRows(admin, {
				table: 'question_tree_events',
				runId: params.runId,
				orderBy: 'seq'
			})
		]);

		if (runResult.error) throw runResult.error;
		if (!runResult.data) return ApiResponse.notFound('Question Tree run');

		const detail = {
			run: runResult.data,
			nodes: nodesResult,
			proposals: proposalsResult,
			events: eventsResult
		} as QuestionTreeRunDetail;
		const archive = new Uint8Array(buildQuestionTreeExportZip(detail));
		const filename = `${buildQuestionTreeExportName(detail)}.zip`;

		return new Response(archive, {
			headers: {
				'cache-control': 'private, no-store',
				'content-disposition': `attachment; filename="${filename}"`,
				'content-length': String(archive.byteLength),
				'content-type': 'application/zip'
			}
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to export Question Tree run');
	}
};
