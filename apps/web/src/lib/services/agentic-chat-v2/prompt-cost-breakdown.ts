// apps/web/src/lib/services/agentic-chat-v2/prompt-cost-breakdown.ts
import type { ChatToolDefinition } from '@buildos/shared-types';
import type { FastChatHistoryMessage } from './types';
import { estimateTokensFromText } from './context-usage';

export type PromptSectionCost = {
	chars: number;
	est_tokens: number;
};

export type PromptCostBreakdown = {
	system_prompt: PromptSectionCost;
	model_messages: PromptSectionCost;
	tool_definitions: PromptSectionCost;
	provider_payload_estimate: PromptSectionCost;
	sections: Record<string, PromptSectionCost>;
};

function measureText(text: string): PromptSectionCost {
	return {
		chars: text.length,
		est_tokens: estimateTokensFromText(text)
	};
}

function between(value: string, startMarker: string, endMarker: string): string {
	const start = value.indexOf(startMarker);
	if (start < 0) return '';
	const contentStart = start + startMarker.length;
	const end = value.indexOf(endMarker, contentStart);
	return end < 0 ? value.slice(contentStart) : value.slice(contentStart, end);
}

function after(value: string, marker: string): string {
	const start = value.indexOf(marker);
	if (start < 0) return '';
	return value.slice(start + marker.length);
}

function stripTaggedBlock(value: string, tag: string): string {
	return value.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>\\n*`, 'g'), '');
}

function serializeToolDefinitions(tools?: ChatToolDefinition[]): string {
	if (!tools?.length) return '';
	return JSON.stringify(tools);
}

export function buildPromptCostBreakdown(params: {
	systemPrompt: string;
	history: FastChatHistoryMessage[];
	userMessage: string;
	tools?: ChatToolDefinition[];
}): PromptCostBreakdown {
	const instructions = between(params.systemPrompt, '<instructions>\n', '\n</instructions>');
	const context = between(params.systemPrompt, '<context>\n', '\n</context>');
	const capabilities = between(instructions, '### Capabilities\n\n', '\n\n### Skill Catalog');
	const skillCatalog = between(instructions, '### Skill Catalog\n\n', '\n\n### Tools');
	const toolsTextBlock = between(instructions, '### Tools\n\n', '\n\n## Execution Protocol');
	const executionProtocol = between(
		instructions,
		'## Execution Protocol\n\n',
		'\n\n## Agent Behavior'
	);
	const agentBehavior = between(instructions, '## Agent Behavior\n\n', '\n\n## Data Rules');
	const dataRules = after(instructions, '## Data Rules\n\n');
	const contextPayload = stripTaggedBlock(
		stripTaggedBlock(
			stripTaggedBlock(stripTaggedBlock(context, 'context_description'), 'project'),
			'focus_entity'
		),
		'recent_referents'
	).trim();

	const historyText = params.history.map((entry) => entry.content ?? '').join('\n');
	const modelMessagesText = [
		params.systemPrompt,
		...params.history.map((entry) => entry.content ?? ''),
		params.userMessage
	].join('\n');
	const toolDefinitionsText = serializeToolDefinitions(params.tools);
	const providerPayloadText = [modelMessagesText, toolDefinitionsText].filter(Boolean).join('\n');

	return {
		system_prompt: measureText(params.systemPrompt),
		model_messages: measureText(modelMessagesText),
		tool_definitions: measureText(toolDefinitionsText),
		provider_payload_estimate: measureText(providerPayloadText),
		sections: {
			instructions: measureText(instructions),
			context: measureText(context),
			capabilities: measureText(capabilities),
			skill_catalog: measureText(skillCatalog),
			tools_text_block: measureText(toolsTextBlock),
			execution_protocol: measureText(executionProtocol),
			agent_behavior: measureText(agentBehavior),
			data_rules: measureText(dataRules),
			context_payload: measureText(contextPayload),
			history: measureText(historyText),
			user: measureText(params.userMessage)
		}
	};
}
