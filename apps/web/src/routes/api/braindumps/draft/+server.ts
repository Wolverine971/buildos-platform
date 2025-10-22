// apps/web/src/routes/api/braindumps/draft/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import type { Database } from '@buildos/shared-types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const projectId = url.searchParams.get('projectId');
		const excludeBrainDumpId = url.searchParams.get('excludeBrainDumpId');

		// Build query based on whether projectId is provided
		let query = supabase
			.from('brain_dumps')
			.select('*')
			.eq('user_id', user.id)
			.in('status', ['pending', 'parsed'])
			.order('updated_at', { ascending: false })
			.limit(1);

		// If projectId is provided, filter by it; if null, get drafts without project_id
		if (projectId) {
			query = query.eq('project_id', projectId);
		} else {
			query = query.is('project_id', null);
		}

		// Exclude specified brain dump ID if provided (prevents reusing drafts already in use)
		if (excludeBrainDumpId) {
			query = query.neq('id', excludeBrainDumpId);
		}

		const { data, error } = await query.maybeSingle();

		if (error) {
			console.error('Error fetching draft brain dump:', error);
			return ApiResponse.internalError(error, 'Failed to fetch draft');
		}

		// If no draft found, return empty response
		if (!data) {
			return ApiResponse.success({ brainDump: null });
		}

		// If it's parsed, try to get the parse results from parsed_results field
		let parseResults = null;
		if (data.status === 'parsed' && data.parsed_results) {
			try {
				// Parse results stored in parsed_results as JSON
				parseResults = JSON.parse(data.parsed_results as string);

				// Validate parse results structure
				if (
					!parseResults ||
					!parseResults.operations ||
					!Array.isArray(parseResults.operations)
				) {
					console.error('Invalid parse results structure, reverting to pending');
					// Don't auto-revert here, let the client handle it
					parseResults = null;
				}
			} catch (e) {
				console.warn('Could not parse parse results as JSON, may be corrupted');
				parseResults = null;
			}
		}

		return ApiResponse.success({
			brainDump: data,
			parseResults
		});
	} catch (error) {
		console.error('Draft API GET error:', error);
		return ApiResponse.internalError(error);
	}
};

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		const body = await parseRequestBody(request);
		if (!body) {
			return ApiResponse.badRequest('Invalid request body');
		}

		const { content, brainDumpId, selectedProjectId, forceNew, excludeBrainDumpId } = body;

		if (!content || typeof content !== 'string' || content.trim().length === 0) {
			return ApiResponse.validationError('content', 'Content is required');
		}

		const trimmedContent = content.trim();
		const now = new Date().toISOString();

		let result;
		let actualBrainDumpId = brainDumpId;
		const forceNewDraft = forceNew === true;

		// If forceNew requested, skip reuse logic
		if (forceNewDraft) {
			actualBrainDumpId = null;
		}

		// If no brainDumpId provided, check for existing draft for this project
		if (!actualBrainDumpId) {
			let query = supabase
				.from('brain_dumps')
				.select('id, status')
				.eq('user_id', user.id)
				.eq('project_id', selectedProjectId || null)
				.in('status', ['pending', 'parsed'])
				.order('updated_at', { ascending: false })
				.limit(1);

			// Exclude specified brain dump ID if provided (prevents reusing drafts already in use)
			// This prevents race conditions where multiple requests try to save to the same brain dump
			if (excludeBrainDumpId) {
				query = query.neq('id', excludeBrainDumpId);
				console.log(
					`[Draft API] Excluding brain dump ${excludeBrainDumpId} from reuse search`
				);
			}

			const { data: existingDraft } = await query.maybeSingle();

			if (existingDraft) {
				actualBrainDumpId = existingDraft.id;
				console.log(
					`Found existing draft ${actualBrainDumpId} for project ${selectedProjectId || 'new'}`
				);
			}
		}

		if (actualBrainDumpId) {
			// Get current brain dump to check status
			const { data: currentDump, error: fetchError } = await supabase
				.from('brain_dumps')
				.select('status')
				.eq('id', actualBrainDumpId)
				.eq('user_id', user.id)
				.single();

			if (fetchError) {
				console.error('Error fetching current brain dump:', fetchError);
				return ApiResponse.internalError(fetchError, 'Failed to fetch brain dump');
			}

			// Don't change status if it's already saved
			const newStatus =
				currentDump?.status === 'saved' ? 'saved' : currentDump?.status || 'pending';

			// Update existing brain dump
			const { data, error } = await supabase
				.from('brain_dumps')
				.update({
					content: trimmedContent,
					project_id: selectedProjectId,
					updated_at: now,
					status: newStatus
				})
				.eq('id', actualBrainDumpId)
				.eq('user_id', user.id)
				.select('id')
				.single();

			if (error) {
				console.error('Error updating brain dump:', error);
				return ApiResponse.internalError(error, 'Failed to update brain dump');
			}

			result = data;
		} else {
			// Create new brain dump only if no existing draft found
			const { data, error } = await supabase
				.from('brain_dumps')
				.insert({
					user_id: user.id,
					content: trimmedContent,
					project_id: selectedProjectId,
					title: `Brain Dump - ${new Date().toLocaleDateString()}`,
					status: 'pending',
					tags: ['draft'],
					created_at: now,
					updated_at: now
				})
				.select('id')
				.single();

			if (error) {
				console.error('Error creating brain dump:', error);
				return ApiResponse.internalError(error, 'Failed to create brain dump');
			}

			result = data;
			console.log(`Created new draft ${result.id} for project ${selectedProjectId || 'new'}`);
		}

		// Log the auto-save activity
		try {
			await supabase.from('user_activity_logs').insert({
				user_id: user.id,
				activity_type: 'brain_dump_auto_saved',
				metadata: {
					brain_dump_id: result.id,
					content_length: trimmedContent.length,
					selected_project_id: selectedProjectId,
					action: actualBrainDumpId ? 'updated' : 'created'
				},
				created_at: now
			});
		} catch (logError) {
			console.warn('Failed to log auto-save activity:', logError);
		}

		return ApiResponse.success({ brainDumpId: result.id });
	} catch (error) {
		console.error('Draft API POST error:', error);
		return ApiResponse.internalError(error);
	}
};

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

		const { brainDumpId, projectId } = body;

		if (!brainDumpId) {
			return ApiResponse.validationError('brainDumpId', 'Brain dump ID is required');
		}

		// Update project_id
		const { error } = await supabase
			.from('brain_dumps')
			.update({
				project_id: projectId,
				updated_at: new Date().toISOString()
			})
			.eq('id', brainDumpId)
			.eq('user_id', user.id);

		if (error) {
			console.error('Error updating brain dump project:', error);
			return ApiResponse.internalError(error, 'Failed to update brain dump project');
		}

		// Log the project change
		try {
			await supabase.from('user_activity_logs').insert({
				user_id: user.id,
				activity_type: 'brain_dump_project_changed',
				metadata: {
					brain_dump_id: brainDumpId,
					new_project_id: projectId
				},
				created_at: new Date().toISOString()
			});
		} catch (logError) {
			console.warn('Failed to log project change activity:', logError);
		}

		return ApiResponse.success({ success: true });
	} catch (error) {
		console.error('Draft API PATCH error:', error);
		return ApiResponse.internalError(error);
	}
};
