// apps/web/src/routes/api/admin/emails/generate/+server.ts
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { EmailGenerationService } from '$lib/services/email-generation-service';
import { ApiResponse } from '$lib/utils/api-response';
import type { EmailGenerationContext } from '$lib/services/email-generation-service';
import { validateEmail } from '$lib/utils/email-validation';
import { parseJsonRequest } from '$lib/utils/request-validation';

const emailGenerationUserInfoSchema = z
	.object({
		basic: z
			.object({
				email: z.string().optional()
			})
			.passthrough(),
		activity: z.record(z.unknown())
	})
	.passthrough();

const generateAdminEmailSchema = z
	.object({
		userId: z.string().min(1),
		instructions: z.string().min(1).max(5000),
		emailType: z.enum(['welcome', 'follow-up', 'feature', 'feedback', 'custom']).optional(),
		tone: z.enum(['professional', 'friendly', 'casual']).optional(),
		userInfo: emailGenerationUserInfoSchema,
		customSystemPrompt: z.string().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	try {
		const { user } = await safeGetSession();

		if (!user?.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse request body
		const parsed = await parseJsonRequest(request, generateAdminEmailSchema);
		if (!parsed.ok) return parsed.response;
		const { userId, instructions, emailType, tone, userInfo, customSystemPrompt } = parsed.data;

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
			userInfo: userInfo as unknown as EmailGenerationContext['userInfo'],
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
		const userEmail = typeof userInfo.basic.email === 'string' ? userInfo.basic.email : '';
		await emailService.logGeneratedEmail(
			logUserId,
			userEmail,
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
