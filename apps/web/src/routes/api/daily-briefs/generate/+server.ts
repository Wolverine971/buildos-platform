// apps/web/src/routes/api/daily-briefs/generate/+server.ts
import type { RequestHandler } from './$types';
import { DailyBriefGenerator } from '$lib/services/dailyBrief/generator';
import { DailyBriefRepository } from '$lib/services/dailyBrief/repository';
import { BriefStreamHandler } from '$lib/services/dailyBrief/streamHandler';
import { BriefGenerationValidator } from '$lib/services/dailyBrief/validator';
import { DailyBriefEmailSender } from '$lib/services/dailyBrief/emailSender';
import { ActivityLogger } from '$lib/utils/activityLogger';
import { ApiResponse, parseRequestBody } from '$lib/utils/api-response';
import { getCurrentDateInTimezone } from '$lib/utils/timezone';

/**
 * Validate timezone string and return safe timezone
 * Falls back to UTC if invalid with warning log
 */
function getSafeTimezone(timezone: string | null | undefined, userId: string): string {
	if (!timezone) {
		return 'UTC';
	}

	try {
		// Validate timezone using Intl API
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return timezone;
	} catch {
		console.warn(
			`[Brief Generation] Invalid timezone "${timezone}" for user ${userId}, falling back to UTC`
		);
		return 'UTC';
	}
}

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

	// Calculate target date in user's timezone (avoid DB call if briefDate provided)
	let targetDate: string;
	if (briefDate) {
		// User explicitly provided a date, use it as-is
		targetDate = briefDate;
	} else {
		// Fetch timezone from users table (centralized source of truth)
		// Fallback to user_brief_preferences for backward compatibility
		const { data: user } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.single();

		let userTimezone = user?.timezone;

		// Fallback to preferences table if users.timezone is not set
		if (!userTimezone) {
			const { data: preferences } = await supabase
				.from('user_brief_preferences')
				.select('timezone')
				.eq('user_id', userId)
				.single();
			userTimezone = preferences?.timezone;
		}

		userTimezone = getSafeTimezone(userTimezone, userId);
		targetDate = getCurrentDateInTimezone(userTimezone);

		console.log(
			`[Brief Generation] Calculated target date for user ${userId}: ${targetDate} (timezone: ${userTimezone}, from: ${user?.timezone ? 'users.timezone' : 'brief_preferences fallback'})`
		);
	}

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
		return ApiResponse.unauthorized();
	}

	const userId = user.id;
	const briefDateParam = url.searchParams.get('briefDate');
	const forceRegenerate = url.searchParams.get('forceRegenerate') === 'true';
	const streaming = url.searchParams.get('streaming') === 'true';

	if (!streaming) {
		return ApiResponse.badRequest('This endpoint is for streaming only');
	}

	// Calculate target date in user's timezone (avoid DB call if briefDate provided)
	let briefDate: string;
	if (briefDateParam) {
		briefDate = briefDateParam;
	} else {
		// Fetch timezone from users table (centralized source of truth)
		// Fallback to user_brief_preferences for backward compatibility
		const { data: user } = await supabase
			.from('users')
			.select('timezone')
			.eq('id', userId)
			.single();

		let userTimezone = user?.timezone;

		// Fallback to preferences table if users.timezone is not set
		if (!userTimezone) {
			const { data: preferences } = await supabase
				.from('user_brief_preferences')
				.select('timezone')
				.eq('user_id', userId)
				.single();
			userTimezone = preferences?.timezone;
		}

		userTimezone = getSafeTimezone(userTimezone, userId);
		briefDate = getCurrentDateInTimezone(userTimezone);

		console.log(
			`[Brief Generation SSE] Calculated target date for user ${userId}: ${briefDate} (timezone: ${userTimezone}, from: ${user?.timezone ? 'users.timezone' : 'brief_preferences fallback'})`
		);
	}

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
		return ApiResponse.internalError(err, 'Failed to start streaming');
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
