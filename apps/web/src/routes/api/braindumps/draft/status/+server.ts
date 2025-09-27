// src/routes/api/braindumps/draft/status/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import type { Database } from '$lib/database.types';

// Status flow validation function (same as in parent file)
function validateStatusTransition(
	currentStatus: Database['public']['Enums']['brain_dump_status'],
	newStatus: Database['public']['Enums']['brain_dump_status']
): boolean {
	const validTransitions: Record<string, string[]> = {
		pending: ['parsed', 'parsed_and_deleted'],
		parsed: ['saved', 'pending'], // Allow revert to pending for corrupted data
		saved: [], // Cannot change from saved - terminal state
		parsed_and_deleted: [] // Terminal state
	};

	return validTransitions[currentStatus]?.includes(newStatus) || false;
}

export const PATCH: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const body = await parseRequestBody(request);
		if (!body) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const { brainDumpId, status } = body;

		if (!brainDumpId) {
			return ApiResponse.validationError('brainDumpId', 'Brain dump ID is required');
		}

		const validStatuses: Database['public']['Enums']['brain_dump_status'][] = [
			'pending',
			'parsed',
			'saved',
			'parsed_and_deleted'
		];

		if (!status || !validStatuses.includes(status)) {
			return ApiResponse.validationError('status', 'Valid status is required');
		}

		// Get current status to validate transition
		const { data: currentDump, error: fetchError } = await supabase
			.from('brain_dumps')
			.select('status')
			.eq('id', brainDumpId)
			.eq('user_id', user.id)
			.single();

		if (fetchError || !currentDump) {
			console.error('Error fetching brain dump:', fetchError);
			return ApiResponse.notFound('Brain dump not found');
		}

		// Validate status transition
		if (!validateStatusTransition(currentDump.status, status)) {
			return ApiResponse.badRequest(
				`Invalid status transition from ${currentDump.status} to ${status}`
			);
		}

		// Update status and clear ai_insights if reverting to pending
		const updateData: any = {
			status,
			updated_at: new Date().toISOString()
		};

		// Clear parse results when reverting to pending
		if (status === 'pending' && currentDump.status === 'parsed') {
			updateData.ai_insights = null;
			updateData.ai_summary = null;
			console.log(
				`Reverting brain dump ${brainDumpId} from parsed to pending, clearing AI insights`
			);
		}

		const { error } = await supabase
			.from('brain_dumps')
			.update(updateData)
			.eq('id', brainDumpId)
			.eq('user_id', user.id);

		if (error) {
			console.error('Error updating brain dump status:', error);
			return ApiResponse.internalError(error, 'Failed to update brain dump status');
		}

		// Log the status change
		try {
			await supabase.from('user_activity_logs').insert({
				user_id: user.id,
				activity_type: 'brain_dump_status_changed',
				metadata: {
					brain_dump_id: brainDumpId,
					from_status: currentDump.status,
					to_status: status,
					reason: status === 'pending' ? 'corrupted_parse_results' : 'manual_update'
				},
				created_at: new Date().toISOString()
			});
		} catch (logError) {
			console.warn('Failed to log status change activity:', logError);
		}

		return ApiResponse.success({
			success: true,
			previousStatus: currentDump.status,
			newStatus: status
		});
	} catch (error) {
		console.error('Status API PATCH error:', error);
		return ApiResponse.internalError(error);
	}
};
