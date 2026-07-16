import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';
import { createLegalAcceptanceIntent } from '$lib/server/legal-acceptance';
import { CURRENT_POLICY_VERSIONS } from '$lib/legal/policy-versions';

const requestSchema = z
	.object({
		surface: z.enum(['email_signup', 'google_signup']),
		accepted: z.literal(true),
		termsVersion: z.string(),
		privacyVersion: z.string()
	})
	.strict();

export const POST: RequestHandler = async (event) => {
	const parsed = await parseJsonRequest(event.request, requestSchema);
	if (!parsed.ok) return parsed.response;
	if (
		parsed.data.termsVersion !== CURRENT_POLICY_VERSIONS.terms ||
		parsed.data.privacyVersion !== CURRENT_POLICY_VERSIONS.privacy
	) {
		return ApiResponse.badRequest(
			'The policy version changed. Please review and accept again.'
		);
	}

	try {
		const intent = await createLegalAcceptanceIntent(event, parsed.data.surface);

		if (parsed.data.surface === 'google_signup') {
			event.cookies.set('buildos_legal_acceptance', intent.token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure: event.url.protocol === 'https:',
				maxAge: 15 * 60
			});
		}

		return ApiResponse.success({
			token: intent.token,
			acceptedAt: intent.acceptedAt,
			expiresAt: intent.expiresAt,
			versions: CURRENT_POLICY_VERSIONS
		});
	} catch (error) {
		console.error('Legal acceptance intent error:', error);
		return ApiResponse.internalError(error, 'Could not record policy acceptance');
	}
};
