// apps/web/src/routes/api/cron/trial-reminders/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PRIVATE_CRON_SECRET } from '$env/static/private';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { TRIAL_CONFIG } from '$lib/config/trial';
import { timingSafeEqual } from 'crypto';

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeCompare(a: string, b: string): boolean {
	try {
		// First check lengths - if different, fail fast but still in constant time
		if (a.length !== b.length) {
			return false;
		}
		// Use crypto.timingSafeEqual for constant-time comparison
		return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret
	const authHeader = request.headers.get('authorization');
	const expectedAuth = `Bearer ${PRIVATE_CRON_SECRET}`;

	if (!authHeader || !constantTimeCompare(authHeader, expectedAuth)) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const supabase = createAdminSupabaseClient();

	try {
		// Get all users in trial or grace period
		const { data: users, error } = await supabase
			.from('users')
			.select('id, email, trial_ends_at, subscription_status')
			.or('subscription_status.eq.trialing,subscription_status.eq.past_due')
			.not('trial_ends_at', 'is', null);

		if (error) throw error;

		let sent = 0;
		const today = new Date();

		for (const user of users || []) {
			const trialEnd = new Date(user.trial_ends_at);
			const daysUntilEnd = Math.ceil(
				(trialEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
			);

			// Check if we should send a reminder
			let reminderType: string | null = null;

			if (daysUntilEnd < 0) {
				// Trial has ended
				const daysSinceEnd = Math.abs(daysUntilEnd);
				if (daysSinceEnd === 0) {
					reminderType = 'expired';
				} else if (daysSinceEnd <= TRIAL_CONFIG.GRACE_PERIOD_DAYS) {
					reminderType = 'grace_period';
				}
			} else if (TRIAL_CONFIG.WARNING_DAYS.includes(daysUntilEnd)) {
				reminderType = `${daysUntilEnd}_days`;
			}

			if (reminderType) {
				// Check if we've already sent this reminder
				const { data: existingReminder } = await supabase
					.from('trial_reminders')
					.select('id')
					.eq('user_id', user.id)
					.eq('reminder_type', reminderType)
					.single();

				if (!existingReminder) {
					// Send reminder email (you would integrate with your email service here)
					console.log(`Sending ${reminderType} reminder to ${user.email}`);

					// Record that we sent the reminder
					await supabase.from('trial_reminders').insert({
						user_id: user.id,
						reminder_type: reminderType
					});

					// Create in-app notification
					await supabase.from('user_notifications').insert({
						user_id: user.id,
						type: 'trial_warning',
						title: getNotificationTitle(reminderType, daysUntilEnd),
						message: getNotificationMessage(reminderType, daysUntilEnd),
						action_url: '/pricing',
						action_label: 'Subscribe Now',
						expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
					});

					sent++;
				}
			}
		}

		// Log the cron execution
		await supabase.from('cron_logs').insert({
			job_name: 'trial_reminders',
			status: 'success',
			message: `Sent ${sent} reminders`,
			executed_at: new Date().toISOString()
		});

		return json({ success: true, sent });
	} catch (error) {
		console.error('Trial reminders cron error:', error);

		await supabase.from('cron_logs').insert({
			job_name: 'trial_reminders',
			status: 'error',
			error_message: error instanceof Error ? error.message : 'Unknown error',
			executed_at: new Date().toISOString()
		});

		return json({ error: 'Failed to send trial reminders' }, { status: 500 });
	}
};

function getNotificationTitle(reminderType: string, daysUntilEnd: number): string {
	switch (reminderType) {
		case 'expired':
			return 'Your trial has ended';
		case 'grace_period':
			return 'Your account is in grace period';
		case '7_days':
			return 'Your trial ends in 7 days';
		case '3_days':
			return 'Your trial ends in 3 days';
		case '1_days':
			return 'Your trial ends tomorrow';
		default:
			return 'Trial reminder';
	}
}

function getNotificationMessage(reminderType: string, daysUntilEnd: number): string {
	switch (reminderType) {
		case 'expired':
			return 'Subscribe now to continue using BuildOS with full access.';
		case 'grace_period':
			const graceDaysLeft = TRIAL_CONFIG.GRACE_PERIOD_DAYS + daysUntilEnd;
			return `You have ${graceDaysLeft} days to subscribe before your account is suspended.`;
		case '7_days':
		case '3_days':
		case '1_days':
			return `Subscribe now to ensure uninterrupted access to all features.`;
		default:
			return 'Subscribe to BuildOS Pro to continue using all features.';
	}
}
