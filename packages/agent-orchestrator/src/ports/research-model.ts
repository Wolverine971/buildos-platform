import type { MeteredTextResponse } from './model-usage';

export interface ResearchModelCall {
	promptVersion: string;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	maxTokens: number;
	maxCostUsd: number;
}

export interface ResearchModelPort {
	generateText(call: ResearchModelCall): Promise<MeteredTextResponse>;
}
