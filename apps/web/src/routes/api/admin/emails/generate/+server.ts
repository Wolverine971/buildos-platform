// apps/web/src/routes/api/admin/emails/generate/+server.ts
import type { RequestHandler } from './$types';
import { EmailGenerationService } from '$lib/services/email-generation-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { EmailGenerationContext } from '$lib/services/email-generation-service';
import { validateEmail } from '$lib/utils/email-validation';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse request body
		const body = await request.json();
		const { userId, instructions, emailType, tone, userInfo, customSystemPrompt } = body;

		// Validate required fields
		if (!userId || !instructions || !userInfo) {
			return ApiResponse.error('Missing required fields');
		}

		// Validate email address in userInfo
		if (userInfo?.basic?.email) {
			const emailValidation = validateEmail(userInfo.basic.email);
			if (!emailValidation.success) {
				return ApiResponse.badRequest(`Invalid email address: ${emailValidation.error}`);
			}
			// Normalize the email in userInfo
			userInfo.basic.email = emailValidation.email;
		}

		// Validate instruction length
		if (instructions.length > 5000) {
			return ApiResponse.error('Instructions too long (max 5000 characters)');
		}

		// Create email generation service
		const emailService = new EmailGenerationService(supabase);

		// Check rate limiting
		const canSend = await emailService.checkRateLimit(user.id);
		if (!canSend) {
			return ApiResponse.error('Rate limit exceeded. Please try again later.');
		}

		// Generate email with optional custom system prompt
		const context: EmailGenerationContext = {
			userInfo,
			instructions,
			emailType: emailType || 'custom',
			tone: tone || 'friendly'
		};

		const generatedEmail = await emailService.generateEmailWithCustomPrompt(
			context,
			customSystemPrompt
		);

		// Log the generation (use admin user ID if beta member without account)
		const logUserId = userId === 'beta-only' ? user.id : userId;
		await emailService.logGeneratedEmail(
			logUserId,
			userInfo.basic.email,
			generatedEmail,
			instructions,
			false
		);

		return ApiResponse.success({ email: generatedEmail });
	} catch (error) {
		console.error('Error generating email:', error);
		return ApiResponse.error(
			error instanceof Error ? error.message : 'Failed to generate email'
		);
	}
};
