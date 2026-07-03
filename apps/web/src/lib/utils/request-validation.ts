// apps/web/src/lib/utils/request-validation.ts
import { z } from 'zod';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';

export type JsonRequestParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

export const jsonObjectSchema = z.record(z.unknown());

export function formatZodIssues(error: z.ZodError) {
	return error.issues.map((issue) => ({
		path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
		message: issue.message,
		code: issue.code
	}));
}

export async function parseJsonRequest<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema,
	options: {
		invalidJsonMessage?: string;
		invalidBodyMessage?: string;
	} = {}
): Promise<JsonRequestParseResult<z.infer<TSchema>>> {
	let raw: unknown;

	try {
		raw = await request.json();
	} catch {
		return {
			ok: false,
			response: ApiResponse.badRequest(options.invalidJsonMessage ?? 'Invalid JSON body')
		};
	}

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			response: ApiResponse.error(
				options.invalidBodyMessage ?? 'Invalid request body',
				HttpStatus.UNPROCESSABLE_ENTITY,
				ErrorCode.INVALID_FIELD,
				{ issues: formatZodIssues(parsed.error) }
			)
		};
	}

	return { ok: true, data: parsed.data };
}

export async function parseOptionalJsonRequest<TSchema extends z.ZodTypeAny>(
	request: Request,
	schema: TSchema,
	defaultBody: unknown,
	options: {
		invalidJsonMessage?: string;
		invalidBodyMessage?: string;
	} = {}
): Promise<JsonRequestParseResult<z.infer<TSchema>>> {
	let raw: unknown = defaultBody;

	try {
		const text = await request.text();
		if (text.trim().length > 0) {
			raw = JSON.parse(text);
		}
	} catch {
		return {
			ok: false,
			response: ApiResponse.badRequest(options.invalidJsonMessage ?? 'Invalid JSON body')
		};
	}

	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		return {
			ok: false,
			response: ApiResponse.error(
				options.invalidBodyMessage ?? 'Invalid request body',
				HttpStatus.UNPROCESSABLE_ENTITY,
				ErrorCode.INVALID_FIELD,
				{ issues: formatZodIssues(parsed.error) }
			)
		};
	}

	return { ok: true, data: parsed.data };
}
