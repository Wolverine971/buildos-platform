// src/routes/api/sms/verify/+server.ts
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

	const { phoneNumber } = await request.json();

	if (!phoneNumber) {
		return json({ success: false, errors: ['Phone number is required'] }, { status: 400 });
	}

	try {
		// Check if phone number is already verified by another user

		const supabase = createClient(PUBLIC_SUPABASE_URL, PRIVATE_SUPABASE_SERVICE_KEY, {
			auth: {
				autoRefreshToken: false,
				persistSession: false
			}
		});
		const { data: existingUser } = await supabase
			.from('user_sms_preferences')
			.select('user_id')
			.eq('phone_number', phoneNumber)
			.eq('phone_verified', true)
			.neq('user_id', session.user.id)
			.single();

		if (existingUser) {
			return json(
				{
					success: false,
					errors: ['This phone number is already verified by another user']
				},
				{ status: 400 }
			);
		}

		// Send verification code
		const result = await twilioClient.verifyPhoneNumber(phoneNumber);

		// Log verification attempt
		await supabase.from('user_sms_preferences').upsert({
			user_id: session.user.id,
			phone_number: phoneNumber,
			phone_verified: false,
			updated_at: new Date().toISOString()
		});

		return json({
			success: true,
			verificationSent: true,
			verificationSid: result.verificationSid
		});
	} catch (error: any) {
		console.error('Phone verification error:', error);

		// Handle specific Twilio errors
		if (error.code === 20003) {
			return json(
				{
					success: false,
					errors: ['Invalid phone number format']
				},
				{ status: 400 }
			);
		} else if (error.code === 20429) {
			return json(
				{
					success: false,
					errors: ['Too many verification attempts. Please try again later.']
				},
				{ status: 429 }
			);
		}

		return json(
			{
				success: false,
				errors: [error.message || 'Failed to send verification']
			},
			{ status: 400 }
		);
	}
};
