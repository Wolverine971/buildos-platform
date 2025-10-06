// apps/web/src/routes/api/notification-preferences/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * GET: Get user notification preferences for a specific event type or all events
 * Query params: ?event_type=brief.completed (optional)
 */
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const eventType = url.searchParams.get('event_type');

		let query = supabase
			.from('user_notification_preferences')
			.select('*')
			.eq('user_id', user.id);

		if (eventType) {
			query = query.eq('event_type', eventType);
		}

		const { data, error } = await query;

		if (error) throw error;

		return json({ preferences: data });
	} catch (error) {
		console.error('Error fetching notification preferences:', error);
		return json({ error: 'Failed to fetch preferences' }, { status: 500 });
	}
};

/**
 * PUT: Update or create user notification preferences for an event type
 * Body: { event_type: string, push_enabled?: boolean, email_enabled?: boolean, sms_enabled?: boolean, ... }
 */
export const PUT: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const body = await request.json();
		const { event_type, ...updates } = body;

		if (!event_type) {
			return json({ error: 'event_type is required' }, { status: 400 });
		}

		const { data, error } = await supabase
			.from('user_notification_preferences')
			.upsert(
				{
					user_id: user.id,
					event_type,
					...updates,
					updated_at: new Date().toISOString()
				},
				{
					onConflict: 'user_id,event_type'
				}
			)
			.select()
			.single();

		if (error) throw error;

		return json({ success: true, preference: data });
	} catch (error) {
		console.error('Error updating notification preferences:', error);
		return json({ error: 'Failed to update preferences' }, { status: 500 });
	}
};
