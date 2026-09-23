// apps/web/src/routes/api/sms/verify/confirm/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { TwilioClient } from '@buildos/twilio-service';
import {
	PRIVATE_TWILIO_ACCOUNT_SID,
	PRIVATE_TWILIO_AUTH_TOKEN,
	PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	PRIVATE_TWILIO_VERIFY_SERVICE_SID
} from '$env/static/private';
import { env } from '$env/dynamic/private';
import { parseJsonRequest } from '$lib/utils/request-validation';

const smsSendingEnabled =
	String(env.PRIVATE_SMS_SENDING_ENABLED ?? 'false').toLowerCase() === 'true';

const smsVerifyConfirmSchema = z
	.object({
		phoneNumber: z.string().min(1),
		code: z.string().min(1)
	})
	.strict();

const twilioClient = new TwilioClient({
	accountSid: PRIVATE_TWILIO_ACCOUNT_SID,
	authToken: PRIVATE_TWILIO_AUTH_TOKEN,
	messagingServiceSid: PRIVATE_TWILIO_MESSAGING_SERVICE_SID,
	verifyServiceSid: PRIVATE_TWILIO_VERIFY_SERVICE_SID,
	sendingEnabled: smsSendingEnabled
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const { session } = await locals.safeGetSession();
	if (!session?.user) {
		return ApiResponse.unauthorized();
	}

	const parsed = await parseJsonRequest(request, smsVerifyConfirmSchema);
	if (!parsed.ok) return parsed.response;
	const { phoneNumber, code } = parsed.data;

	if (!phoneNumber || !code) {
		return ApiResponse.badRequest('Phone number and code are required');
	}

	// checkVerification answers false for a wrong or expired code and throws
	// only when Twilio itself failed; never show the user Twilio's raw error.
	let isValid: boolean;
	try {
		isValid = await twilioClient.checkVerification(phoneNumber, code);
	} catch (error) {
		console.error('Phone verification check failed:', error);
		return ApiResponse.error(
			'Phone verification is temporarily unavailable. Please try again in a moment.',
			HttpStatus.SERVICE_UNAVAILABLE,
			ErrorCode.SERVICE_UNAVAILABLE
		);
	}

	if (!isValid) {
		return ApiResponse.badRequest(
			'That code is invalid or has expired. Request a new code and try again.'
		);
	}

	try {
		// Update user preferences with verified phone
		// Use locals.supabase (RLS-respecting client) since we're only modifying current user's data
		const supabase = locals.supabase;
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
			return ApiResponse.databaseError(error);
		}

		// Send welcome SMS only when the global sending switch is explicitly enabled.
		if (smsSendingEnabled) {
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
		}

		return ApiResponse.success({ verified: true }, 'Phone number verified successfully');
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to verify phone number');
	}
};
