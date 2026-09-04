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

// 2026-09-04 (stage S7): titles follow the eleven-section lite prompt. Recent
// activity and retrieval boundaries now render inside Location and Loaded
// Context; Daily Brief and Active Domain Signals no longer render.
const LITE_SECTION_TITLE_KEYS: Record<string, string> = {
	'Identity and Mission': 'identity_mission',
	'Capabilities, Skills, and Tools': 'capabilities_skills_tools',
	'Current Tool Surface': 'tool_surface_dynamic',
	'Operating Strategy': 'operating_strategy',
	'Safety and Data Rules': 'safety_data_rules',
	'Rules for This Turn': 'situational_rules',
	'Project Starter Profile': 'situational_rules',
	'Project Creation Boundaries': 'situational_rules',
	'Project Start Here': 'project_start_here',
	'Current Focus and Purpose': 'focus_purpose',
	'Location and Loaded Context': 'location_loaded_context',
	'Project Knowledge Map': 'project_knowledge_map',
	'Final Response Contract': 'final_response_contract'
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

function slugifyHeading(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '');
}

function findLiteMarkdownSectionStarts(systemPrompt: string): Array<{
	title: string;
	key: string;
	start: number;
	contentStart: number;
}> {
	const starts: Array<{ title: string; key: string; start: number; contentStart: number }> = [];
	const matches = systemPrompt.matchAll(/^(```|## ([^\n]+))\n?/gm);
	let inFence = false;

	for (const match of matches) {
		const marker = match[1] ?? '';
		if (marker === '```') {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const title = match[2]?.trim();
		if (!title) continue;
		const key = LITE_SECTION_TITLE_KEYS[title] ?? slugifyHeading(title);
		starts.push({
			title,
			key,
			start: match.index ?? 0,
			contentStart: (match.index ?? 0) + match[0].length
		});
	}

	return starts;
}

function extractLiteMarkdownSections(systemPrompt: string): Record<string, string> {
	const starts = findLiteMarkdownSectionStarts(systemPrompt);
	if (starts.length === 0) return {};

	const sections: Record<string, string> = {};
	const firstStart = starts[0]?.start ?? 0;
	const preamble = systemPrompt.slice(0, firstStart).trim();
	if (preamble) {
		sections.lite_preamble = preamble;
	}

	for (let index = 0; index < starts.length; index += 1) {
		const start = starts[index];
		if (!start) continue;
		const nextStart = starts[index + 1]?.start ?? systemPrompt.length;
		sections[start.key] = systemPrompt.slice(start.contentStart, nextStart).trim();
	}

	return sections;
}

function buildLegacyPromptSections(systemPrompt: string): Record<string, string> {
	const instructions = between(systemPrompt, '<instructions>\n', '\n</instructions>');
	const context = between(systemPrompt, '<context>\n', '\n</context>');
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

	return {
		instructions,
		context,
		capabilities,
		skill_catalog: skillCatalog,
		tools_text_block: toolsTextBlock,
		execution_protocol: executionProtocol,
		agent_behavior: agentBehavior,
		data_rules: dataRules,
		context_payload: contextPayload
	};
}

function buildPromptSections(systemPrompt: string): Record<string, string> {
	const legacySections = buildLegacyPromptSections(systemPrompt);
	if (legacySections.instructions || legacySections.context) {
		return legacySections;
	}

	// Lite markdown headings are already canonical and mutually exclusive.
	// Re-emitting them under legacy compatibility aliases made the diagnostic
	// section total exceed the actual system prompt by counting the same bytes
	// two or three times. Legacy XML prompts retain their legacy breakdown above.
	return extractLiteMarkdownSections(systemPrompt);
}

function measureSections(sections: Record<string, string>): Record<string, PromptSectionCost> {
	return Object.fromEntries(
		Object.entries(sections).map(([key, value]) => [key, measureText(value)])
	);
}

export function buildPromptCostBreakdown(params: {
	systemPrompt: string;
	history: FastChatHistoryMessage[];
	userMessage: string;
	tools?: ChatToolDefinition[];
}): PromptCostBreakdown {
	const historyText = params.history.map((entry) => entry.content ?? '').join('\n');
	const modelMessagesText = [
		params.systemPrompt,
		...params.history.map((entry) => entry.content ?? ''),
		params.userMessage
	].join('\n');
	const toolDefinitionsText = serializeToolDefinitions(params.tools);
	const providerPayloadText = [modelMessagesText, toolDefinitionsText].filter(Boolean).join('\n');
	const promptSections = buildPromptSections(params.systemPrompt);

	return {
		system_prompt: measureText(params.systemPrompt),
		model_messages: measureText(modelMessagesText),
		tool_definitions: measureText(toolDefinitionsText),
		provider_payload_estimate: measureText(providerPayloadText),
		sections: {
			...measureSections(promptSections),
			history: measureText(historyText),
			user: measureText(params.userMessage)
		}
	};
}
