// packages/agent-orchestrator/src/ports/route-model.ts
export interface RouteModelCall {
	promptVersion: string;
	attempt: 1 | 2;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	maxTokens: number;
}

/** Phase A keeps the model/provider outside the orchestration application boundary. */
export interface RouteModelPort {
	generateJson(call: RouteModelCall): Promise<unknown>;
}
