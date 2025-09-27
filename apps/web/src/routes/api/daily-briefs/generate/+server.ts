// src/routes/api/daily-briefs/generate/+server.ts
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { DailyBriefGenerator } from '$lib/services/dailyBrief/generator';
import { DailyBriefRepository } from '$lib/services/dailyBrief/repository';
import { BriefStreamHandler } from '$lib/services/dailyBrief/streamHandler';
import { BriefGenerationValidator } from '$lib/services/dailyBrief/validator';
import { DailyBriefEmailSender } from '$lib/services/dailyBrief/emailSender';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';

export const POST: RequestHandler = async ({ request, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	const body = await parseRequestBody(request);
	if (!body) {
		return ApiResponse.badRequest('Invalid request body');
	}

	const { briefDate, forceRegenerate = false, streaming = false, background = false } = body;

	const userId = user.id;
	const targetDate = briefDate || new Date().toISOString().split('T')[0];

	// Initialize services
	const activityLogger = new ActivityLogger(supabase);
	const repository = new DailyBriefRepository(supabase);
	const validator = new BriefGenerationValidator(repository);
	const generator = new DailyBriefGenerator(repository, activityLogger);

	try {
		// Validate generation can start
		const validation = await validator.validateGeneration(userId, targetDate, forceRegenerate);
		if (!validation.canStart) {
			return ApiResponse.error(validation.message, validation.statusCode || 409);
		}

		// Handle different generation modes
		if (background) {
			return handleBackgroundGeneration(
				generator,
				repository,
				userId,
				targetDate,
				validation.briefId!,
				supabase
			);
		}

		if (streaming) {
			const streamHandler = new BriefStreamHandler(generator, repository);
			return streamHandler.createStreamResponse(userId, targetDate, validation.briefId!);
		}

		// Regular synchronous generation
		const result = await generator.generateDailyBrief(userId, targetDate);
		await repository.markGenerationCompleted(validation.briefId!, result);

		// Send email if user has opted in
		const emailSender = new DailyBriefEmailSender(supabase);
		await emailSender.sendDailyBriefEmail(userId, targetDate, result);

		return ApiResponse.success({
			brief_id: validation.briefId,
			result
		});
	} catch (err) {
		await activityLogger.logActivity(userId, 'brief_generation_failed', {
			brief_date: targetDate,
			error: err instanceof Error ? err.message : 'Unknown error'
		});

		if (err instanceof Error && 'status' in err) {
			return ApiResponse.error(err.message, (err as any).status);
		}

		return ApiResponse.internalError(err, 'Failed to generate daily brief');
	}
};

// SSE endpoint for streaming
export const GET: RequestHandler = async ({ url, locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const briefDate = url.searchParams.get('briefDate') || new Date().toISOString().split('T')[0];
	const forceRegenerate = url.searchParams.get('forceRegenerate') === 'true';
	const streaming = url.searchParams.get('streaming') === 'true';

	if (!streaming) {
		throw error(400, 'This endpoint is for streaming only');
	}

	const userId = user.id;

	// Initialize services
	const activityLogger = new ActivityLogger(supabase);
	const repository = new DailyBriefRepository(supabase);
	const validator = new BriefGenerationValidator(repository);
	const generator = new DailyBriefGenerator(repository, activityLogger);

	try {
		// Validate generation can start
		const validation = await validator.validateGeneration(userId, briefDate, forceRegenerate);
		if (!validation.canStart) {
			// Return error as SSE event
			const encoder = new TextEncoder();
			const stream = new ReadableStream({
				start(controller) {
					const errorEvent = {
						type: 'error',
						data: { message: validation.message }
					};
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`));
					controller.close();
				}
			});

			return new Response(stream, {
				headers: {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					Connection: 'keep-alive'
				}
			});
		}

		const streamHandler = new BriefStreamHandler(generator, repository);
		return streamHandler.createStreamResponse(userId, briefDate, validation.briefId!);
	} catch (err) {
		console.error('Error in streaming endpoint:', err);
		throw error(500, 'Failed to start streaming');
	}
};

async function handleBackgroundGeneration(
	generator: DailyBriefGenerator,
	repository: DailyBriefRepository,
	userId: string,
	targetDate: string,
	briefId: string,
	supabase: any
) {
	// Start background generation without awaiting
	generator
		.generateDailyBrief(userId, targetDate)
		.then(async (result) => {
			await repository.markGenerationCompleted(briefId, result);

			// Send email if user has opted in
			const emailSender = new DailyBriefEmailSender(supabase);
			await emailSender.sendDailyBriefEmail(userId, targetDate, result);
		})
		.catch((err) =>
			repository.markGenerationFailed(userId, targetDate, err.message || 'Unknown error')
		);

	return ApiResponse.success({
		brief_id: briefId,
		message: 'Brief generation started in background',
		status: 'processing'
	});
}
