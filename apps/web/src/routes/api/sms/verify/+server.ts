// apps/web/src/routes/api/sms/verify/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
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

	const { phoneNumber } = await request.json();

	if (!phoneNumber) {
		return ApiResponse.badRequest('Phone number is required');
	}

	try {
		// Check if phone number is already verified by another user
		// NOTE: Admin client required here because we need to check OTHER users' data
		// This bypasses RLS intentionally to prevent duplicate phone registration
		const adminSupabase = createAdminSupabaseClient();
		const { data: existingUser } = await adminSupabase
			.from('user_sms_preferences')
			.select('user_id')
			.eq('phone_number', phoneNumber)
			.eq('phone_verified', true)
			.neq('user_id', session.user.id)
			.single();

		if (existingUser) {
			return ApiResponse.conflict('This phone number is already verified by another user');
		}

		// Send verification code
		const result = await twilioClient.verifyPhoneNumber(phoneNumber);

		// Log verification attempt - use RLS-respecting client for own data
		await locals.supabase.from('user_sms_preferences').upsert(
			{
				user_id: session.user.id,
				phone_number: phoneNumber,
				phone_verified: false,
				updated_at: new Date().toISOString()
			},
			{
				onConflict: 'user_id'
			}
		);

		return ApiResponse.success({
			verificationSent: true,
			verificationSid: result.verificationSid
		});
	} catch (error: any) {
		console.error('Phone verification error:', error);

		// Handle specific Twilio errors
		if (error.code === 20003) {
			return ApiResponse.badRequest('Invalid phone number format');
		} else if (error.code === 20429) {
			return ApiResponse.error(
				'Too many verification attempts. Please try again later.',
				429,
				'RATE_LIMITED'
			);
		}

		return ApiResponse.badRequest(error.message || 'Failed to send verification');
	}
};
