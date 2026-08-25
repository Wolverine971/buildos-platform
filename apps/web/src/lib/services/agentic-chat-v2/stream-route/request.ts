import { normalizeFastAgentStreamRequest, type FastAgentStreamRequest } from '../index';
import { parseFastAgentStreamRequestBody } from '../stream-request';

export class FastChatRequestValidationError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid stream request: ${issues.join('; ')}`);
		this.name = 'FastChatRequestValidationError';
	}
}

/** Parse wire aliases and validate the request exactly once at the HTTP boundary. */
export async function parseFastChatStreamRequest(
	request: Request
): Promise<FastAgentStreamRequest> {
	const body = (await request.json()) as unknown;
	const parsed = parseFastAgentStreamRequestBody(body);
	if (!parsed.ok) {
		throw new FastChatRequestValidationError(parsed.issues);
	}
	return normalizeFastAgentStreamRequest(parsed.input);
}
