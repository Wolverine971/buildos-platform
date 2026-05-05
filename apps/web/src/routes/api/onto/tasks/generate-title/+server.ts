// apps/web/src/routes/api/onto/tasks/generate-title/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { OpenRouterV2Service } from '$lib/services/openrouter-v2-service';
import { GEMINI_31_FLASH_LITE_PREVIEW_MODEL, DEEPSEEK_V4_FLASH_MODEL } from '@buildos/smart-llm';

const DESCRIPTION_MIN = 4;
const DESCRIPTION_MAX = 4000;
const TITLE_MAX_CHARS = 80;

function trimTitle(raw: string): string {
	let title = raw.trim();
	// Strip wrapping quotes/backticks the model sometimes adds.
	title = title.replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, '');
	// Take only the first line.
	const firstLine = title.split(/\r?\n/)[0] ?? '';
	title = firstLine.trim();
	// Drop trailing punctuation that doesn't belong in titles.
	title = title.replace(/[.!?,;:]+$/g, '').trim();
	if (title.length > TITLE_MAX_CHARS) {
		title = title.slice(0, TITLE_MAX_CHARS).trim();
	}
	return title;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) return ApiResponse.unauthorized('Authentication required');

	let description: string;
	try {
		const body = (await request.json()) as { description?: unknown };
		if (typeof body.description !== 'string') {
			return ApiResponse.badRequest('description is required');
		}
		description = body.description.trim();
	} catch {
		return ApiResponse.badRequest('Invalid JSON body');
	}

	if (description.length < DESCRIPTION_MIN) {
		return ApiResponse.badRequest(`description must be at least ${DESCRIPTION_MIN} characters`);
	}
	if (description.length > DESCRIPTION_MAX) {
		description = description.slice(0, DESCRIPTION_MAX);
	}

	const llm = new OpenRouterV2Service({
		supabase: locals.supabase,
		httpReferer: request.headers.get('referer') ?? undefined,
		appName: 'BuildOS Task Title Generator'
	});

	// One-line system prompt to keep input tokens minimal.
	const systemPrompt =
		'Write a 3–6 word, action-oriented task title in sentence case. Output only the title — no quotes, labels, or punctuation.';

	try {
		const raw = await llm.generateText({
			prompt: `Description:\n${description}\n\nTitle:`,
			systemPrompt,
			// Pin Gemini 3.1 Flash Lite Preview as primary (fastest in the runtime set,
			// speed 4.7), with DeepSeek V4 Flash and the rest of the speed lane as fallback.
			model: GEMINI_31_FLASH_LITE_PREVIEW_MODEL,
			models: [DEEPSEEK_V4_FLASH_MODEL],
			profile: 'speed',
			temperature: 0.2,
			maxTokens: 24,
			timeoutMs: 8000,
			operationType: 'task_title_generation',
			userId: user.id
		});

		const title = trimTitle(raw);
		if (!title) {
			return ApiResponse.error('Failed to generate a usable title', 502);
		}

		return ApiResponse.success({ title });
	} catch (error) {
		console.error('[Task Title Generate API] POST failed:', error);
		return ApiResponse.internalError(error, 'Failed to generate title');
	}
};
