// apps/worker/src/workers/agentic-chat/provider/openrouter/errors.ts
export class AgenticChatProviderNetworkError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
		/** Upstream endpoint the failing response named, when it named one. */
		readonly providerSlug: string | null = null
	) {
		super(message);
		this.name = 'AgenticChatProviderNetworkError';
	}
}

export class AgenticChatSlowStreamError extends AgenticChatProviderNetworkError {
	constructor(
		readonly windowMs: number,
		readonly outputBytes: number
	) {
		super(
			'Agentic Chat provider stream made insufficient progress; retrying the buffered pass',
			true
		);
	}
}
