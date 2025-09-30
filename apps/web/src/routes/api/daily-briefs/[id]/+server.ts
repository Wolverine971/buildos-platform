// apps/web/src/routes/api/daily-briefs/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;

	try {
		const { data, error } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('id', params.id)
			.eq('user_id', userId)
			.single();

		if (error) throw error;

		return json({ brief: data });
	} catch (error) {
		console.error('Error fetching daily brief:', error);
		return json({ error: 'Brief not found' }, { status: 404 });
	}
};

export const PUT: RequestHandler = async ({
	params,
	request,
	locals: { supabase, safeGetSession }
}) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;

	try {
		const updates = await request.json();

		const { data, error } = await supabase
			.from('daily_briefs')
			.update({ ...updates, updated_at: new Date().toISOString() })
			.eq('id', params.id)
			.eq('user_id', userId)
			.select()
			.single();

		if (error) throw error;

		return json({ brief: data });
	} catch (error) {
		console.error('Error updating daily brief:', error);
		return json({ error: 'Failed to update brief' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ params, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const { id } = params;

	try {
		// Delete the daily brief (this should cascade to project briefs)
		const { error: deleteError } = await supabase
			.from('daily_briefs')
			.delete()
			.eq('id', id)
			.eq('user_id', user.id);

		if (deleteError) {
			throw deleteError;
		}

		return json({ success: true });
	} catch (err) {
		console.error('Error deleting brief:', err);
		return json({ error: 'Failed to delete brief' }, { status: 500 });
	}
};
