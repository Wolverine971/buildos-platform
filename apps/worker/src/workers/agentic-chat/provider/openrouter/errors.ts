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
		readonly outputBytes: number,
		message = 'Agentic Chat provider stream made insufficient progress; retrying the buffered pass'
	) {
		super(message, true);
	}
}

/**
 * No reasoning, text, or tool delta arrived after the response opened. Same
 * retry and classification as a slow stream; its own message names it in
 * the usage log.
 */
export class AgenticChatFirstProgressStallError extends AgenticChatSlowStreamError {
	constructor(waitedMs: number, timeoutMs: number) {
		super(
			waitedMs,
			0,
			`Agentic Chat provider stream sent no progress within ${timeoutMs}ms of opening; retrying the buffered pass`
		);
	}
}

/**
 * Abort reason for the request that lost a hedge (provider-pass.ts). Receipts name it
 * `hedge_lost`, apart from a user cancel.
 */
export class AgenticChatProviderHedgeLostError extends Error {
	readonly errorClass = 'hedge_lost';
	constructor() {
		super('Agentic Chat provider hedge: the other request finished first');
		this.name = 'AgenticChatProviderHedgeLostError';
	}
}

/** `error_class` for a request ended by its own signal. */
export function abortedErrorClass(signal: AbortSignal): 'hedge_lost' | 'aborted' {
	return signal.reason instanceof AgenticChatProviderHedgeLostError ? 'hedge_lost' : 'aborted';
}
