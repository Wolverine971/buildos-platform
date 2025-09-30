// apps/web/src/routes/api/daily-briefs/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const userId = user.id;
	const briefDate = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

	try {
		// Check if brief already exists for this date
		const { data: existingBrief } = await supabase
			.from('daily_briefs')
			.select('*')
			.eq('user_id', userId)
			.eq('brief_date', briefDate)
			.single();

		if (existingBrief) {
			return json({ brief: existingBrief });
		}

		return json({ brief: null, message: 'No brief found for this date' });
	} catch (error) {
		console.error('Error fetching daily brief:', error);
		return json({ error: 'Failed to fetch daily brief' }, { status: 500 });
	}
};
