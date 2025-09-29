// src/routes/api/sms/verify/confirm/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TwilioClient } from '@buildos/twilio-service';
import {
	PRIVATE_TWILIO_ACCOUNT_SID,
	PRIVATE_TWILIO_AUTH_TOKEN,
	PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	PRIVATE_TWILIO_VERIFY_SERVICE_SID
} from '$env/static/private';

import { PRIVATE_SUPABASE_SERVICE_KEY, PRIVATE_BUILDOS_WEBHOOK_SECRET } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const twilioClient = new TwilioClient({
	accountSid: PRIVATE_TWILIO_ACCOUNT_SID,
	authToken: PRIVATE_TWILIO_AUTH_TOKEN,
	messagingServiceSid: PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	verifyServiceSid: PRIVATE_TWILIO_VERIFY_SERVICE_SID
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const session = await locals.auth();
	if (!session?.user) {
		return json({ success: false, errors: ['Unauthorized'] }, { status: 401 });
	}

	const { phoneNumber, code } = await request.json();

	if (!phoneNumber || !code) {
		return json(
			{ success: false, errors: ['Phone number and code are required'] },
			{ status: 400 }
		);
	}

	try {
		// Verify the code with Twilio
		const isValid = await twilioClient.checkVerification(phoneNumber, code);

		if (!isValid) {
			return json(
				{
					success: false,
					errors: ['Invalid verification code']
				},
				{ status: 400 }
			);
		}

		// Update user preferences with verified phone
		const supabase = createClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
		const { error } = await supabase.from('user_sms_preferences').upsert({
			user_id: session.user.id,
			phone_number: phoneNumber,
			phone_verified: true,
			phone_verified_at: new Date().toISOString(),
			updated_at: new Date().toISOString()
		});

		if (error) {
			console.error('Failed to update user preferences:', error);
			throw error;
		}

		// Send welcome SMS
		try {
			await supabase.rpc('queue_sms_message', {
				p_user_id: session.user.id,
				p_phone_number: phoneNumber,
				p_message:
					"Welcome to BuildOS! We'll help you stay on track. Reply HELP for commands or STOP to opt out.",
				p_priority: 'normal',
				p_metadata: {
					type: 'welcome'
				}
			});
		} catch (welcomeError) {
			// Don't fail verification if welcome SMS fails
			console.error('Failed to send welcome SMS:', welcomeError);
		}

		return json({
			success: true,
			verified: true,
			message: 'Phone number verified successfully'
		});
	} catch (error: any) {
		console.error('Verification confirmation error:', error);

		return json(
			{
				success: false,
				errors: [error.message || 'Failed to verify phone number']
			},
			{ status: 400 }
		);
	}
};
