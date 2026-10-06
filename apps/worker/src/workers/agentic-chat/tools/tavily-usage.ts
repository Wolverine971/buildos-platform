// apps/worker/src/workers/agentic-chat/tools/tavily-usage.ts
//
// Chat's Tavily spend (web_search, web_navigate's extract fallback) as
// llm_usage_logs rows under the user and turn, the way table AI fills and
// agent runs already log theirs. Without a row the spend was real but showed
// up nowhere. Rows carry 0 tokens, so the token-based consumption gate is
// unchanged. Logging is best effort: a failed write never fails the tool.
import type { LLMUsageLogger } from '@buildos/smart-llm';

export type TavilyUsageLogger = Pick<LLMUsageLogger, 'logUsageToDatabase'>;

export interface TavilyCharge {
	/** e.g. `tavily/search-advanced`, `tavily/extract-advanced` */
	model: string;
	credits: number;
	costUsd: number;
	providerRequestId?: string | null;
	source?: string;
}

export interface TavilyUsageContext {
	operationType: string;
	userId: string;
	chatSessionId?: string | null;
	turnRunId?: string | null;
	startedAt: number;
	metadata?: Record<string, unknown>;
}

export async function logTavilyCharge(
	usage: TavilyUsageLogger | undefined,
	charge: TavilyCharge,
	context: TavilyUsageContext
): Promise<void> {
	if (!usage || !(charge.costUsd > 0)) return;
	const completedAt = Date.now();
	try {
		await usage.logUsageToDatabase({
			userId: context.userId,
			operationType: context.operationType,
			modelRequested: charge.model,
			modelUsed: charge.model,
			provider: 'tavily',
			promptTokens: 0,
			completionTokens: 0,
			totalTokens: 0,
			inputCost: 0,
			outputCost: 0,
			totalCost: charge.costUsd,
			responseTimeMs: completedAt - context.startedAt,
			requestStartedAt: new Date(context.startedAt),
			requestCompletedAt: new Date(completedAt),
			status: 'success',
			...(context.chatSessionId ? { chatSessionId: context.chatSessionId } : {}),
			...(context.turnRunId ? { turnRunId: context.turnRunId } : {}),
			metadata: {
				...(context.metadata ?? {}),
				tavily_credits: charge.credits,
				provider_request_id: charge.providerRequestId ?? null,
				...(charge.source ? { charge_source: charge.source } : {})
			}
		});
	} catch (error) {
		console.warn(
			`[agenticChat] failed to log ${charge.model} usage:`,
			error instanceof Error ? error.message : String(error)
		);
	}
}
