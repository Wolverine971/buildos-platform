// apps/web/src/routes/api/notes/[id]/+server.ts
import type { RequestHandler } from './$types';
import { cleanDataForTable, validateRequiredFields } from '$lib/utils/data-cleaner';
import { ApiResponse } from '$lib/utils/api-response';

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const data = await request.json();

		// Clean the note data
		const cleanedData = cleanDataForTable('notes', {
			...data,
			id: params.id,
			user_id: user.id,
			updated_at: new Date().toISOString()
		});

		// Validate required fields for update
		const validation = validateRequiredFields('notes', cleanedData, 'update');
		if (!validation.isValid) {
			return ApiResponse.badRequest('Validation failed', {
				missingFields: validation.missingFields
			});
		}

		// Verify ownership
		const { data: existingNote, error: fetchError } = await supabase
			.from('notes')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.notFound('Note');
		}

		if (existingNote.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Update the note
		const { data: note, error } = await supabase
			.from('notes')
			.update(cleanedData)
			.eq('id', params.id)
			.select()
			.single();

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ note });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		// Verify ownership
		const { data: existingNote, error: fetchError } = await supabase
			.from('notes')
			.select('user_id')
			.eq('id', params.id)
			.single();

		if (fetchError) {
			return ApiResponse.notFound('Note');
		}

		if (existingNote.user_id !== user.id) {
			return ApiResponse.forbidden();
		}

		// Remove note references from brain_dump_links
		const { error: brainDumpLinksError } = await supabase
			.from('brain_dump_links')
			.update({ note_id: null })
			.eq('note_id', params.id);

		if (brainDumpLinksError) {
			return ApiResponse.databaseError(brainDumpLinksError);
		}

		// Delete the note
		const { error } = await supabase.from('notes').delete().eq('id', params.id);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		return ApiResponse.success({ message: 'Note deleted successfully' });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const { data: note, error } = await supabase
			.from('notes')
			.select('*')
			.eq('id', params.id)
			.eq('user_id', user.id)
			.single();

		if (error) {
			return ApiResponse.notFound('Note');
		}

		return ApiResponse.success({ note });
	} catch (err) {
		return ApiResponse.internalError(err);
	}
};
