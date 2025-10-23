// apps/web/src/routes/api/stripe/test-webhook-config/+server.ts
// TEMPORARY TEST ENDPOINT - REMOVE IN PRODUCTION
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';

export const GET: RequestHandler = async () => {
	// Only allow in development
	if (process.env.NODE_ENV === 'production') {
		return json({ error: 'Not available in production' }, { status: 403 });
	}

	const webhookSecretInfo = {
		isConfigured: !!STRIPE_WEBHOOK_SECRET,
		startsWithCorrectPrefix: STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') || false,
		length: STRIPE_WEBHOOK_SECRET?.length || 0,
		first10Chars: STRIPE_WEBHOOK_SECRET
			? STRIPE_WEBHOOK_SECRET.substring(0, 10) + '...'
			: 'NOT SET',
		environment: process.env.NODE_ENV || 'development'
	};

	console.log('Webhook Secret Configuration Check:');
	console.log('- Is configured:', webhookSecretInfo.isConfigured);
	console.log('- Has correct prefix (whsec_):', webhookSecretInfo.startsWithCorrectPrefix);
	console.log('- Length:', webhookSecretInfo.length);
	console.log('- Starts with:', webhookSecretInfo.first10Chars);

	if (!webhookSecretInfo.isConfigured) {
		console.error('⚠️ STRIPE_WEBHOOK_SECRET is not configured in environment variables!');
	} else if (!webhookSecretInfo.startsWithCorrectPrefix) {
		console.error(
			'⚠️ STRIPE_WEBHOOK_SECRET does not start with "whsec_" - this might be wrong!'
		);
	} else {
		console.log('✅ Webhook secret appears to be configured correctly');
	}

	return json(webhookSecretInfo);
};
