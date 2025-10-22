// apps/web/src/routes/api/sms/verify/confirm/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createServiceClient } from '@buildos/supabase-client';
import { TwilioClient } from '@buildos/twilio-service';
import {
	PRIVATE_TWILIO_ACCOUNT_SID,
	PRIVATE_TWILIO_AUTH_TOKEN,
	PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	PRIVATE_TWILIO_VERIFY_SERVICE_SID
} from '$env/static/private';

const twilioClient = new TwilioClient({
	accountSid: PRIVATE_TWILIO_ACCOUNT_SID,
	authToken: PRIVATE_TWILIO_AUTH_TOKEN,
	messagingServiceSid: PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	verifyServiceSid: PRIVATE_TWILIO_VERIFY_SERVICE_SID
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized();
	}

	const { phoneNumber, code } = await request.json();

	if (!phoneNumber || !code) {
		return ApiResponse.badRequest('Phone number and code are required');
	}

	try {
		// Verify the code with Twilio
		const isValid = await twilioClient.checkVerification(phoneNumber, code);

		if (!isValid) {
			return ApiResponse.badRequest('Invalid verification code');
		}

		// Update user preferences with verified phone
		const supabase = createServiceClient();
		const { error } = await supabase.from('user_sms_preferences').upsert(
			{
				user_id: session.user.id,
				phone_number: phoneNumber,
				phone_verified: true,
				phone_verified_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id'
			}
		);

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

		return ApiResponse.success({ verified: true }, 'Phone number verified successfully');
	} catch (error: any) {
		console.error('Verification confirmation error:', error);

		return ApiResponse.badRequest(error.message || 'Failed to verify phone number');
	}
};
