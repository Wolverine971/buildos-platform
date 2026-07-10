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

const LITE_SECTION_TITLE_KEYS: Record<string, string> = {
	'Identity and Mission': 'identity_mission',
	'Capabilities, Skills, and Tools': 'capabilities_skills_tools',
	'Current Tool Surface': 'tool_surface_dynamic',
	'Operating Strategy': 'operating_strategy',
	'Safety and Data Rules': 'safety_data_rules',
	'Current Focus and Purpose': 'focus_purpose',
	'Location and Loaded Context': 'location_loaded_context',
	'Timeline and Recent Activity': 'timeline_recent_activity',
	'Loaded Data and Retrieval Boundaries': 'context_inventory_retrieval',
	'Project Creation Boundaries': 'context_inventory_retrieval'
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

function splitLiteCapabilitiesSection(content: string): {
	capabilities: string;
	skillCatalog: string;
} {
	// WP-5 (2026-07-10): the capability block collapsed from a "Capabilities:"
	// bullet list to a single "BuildOS runtime capabilities: ..." line followed
	// by the routing-signals paragraph.
	const capabilitiesStart = content.indexOf('BuildOS runtime capabilities:');
	const rootSkillStart = content.indexOf('Root skill catalog');
	if (capabilitiesStart < 0 || rootSkillStart < 0 || rootSkillStart <= capabilitiesStart) {
		return { capabilities: '', skillCatalog: '' };
	}
	return {
		capabilities: content.slice(capabilitiesStart, rootSkillStart).trim(),
		skillCatalog: content.slice(rootSkillStart).trim()
	};
}

function buildLiteCompatibilitySections(
	liteSections: Record<string, string>
): Record<string, string> {
	if (Object.keys(liteSections).length === 0) return {};

	const capabilitiesSplit = splitLiteCapabilitiesSection(
		liteSections.capabilities_skills_tools ?? ''
	);
	const contextSections = [
		liteSections.focus_purpose,
		liteSections.location_loaded_context,
		liteSections.timeline_recent_activity,
		liteSections.context_inventory_retrieval
	]
		.filter((section): section is string => Boolean(section?.trim()))
		.join('\n\n');

	return {
		instructions: [
			liteSections.lite_preamble,
			liteSections.identity_mission,
			liteSections.capabilities_skills_tools,
			liteSections.tool_surface_dynamic,
			liteSections.operating_strategy,
			liteSections.safety_data_rules
		]
			.filter((section): section is string => Boolean(section?.trim()))
			.join('\n\n'),
		context: contextSections,
		capabilities: capabilitiesSplit.capabilities,
		skill_catalog: capabilitiesSplit.skillCatalog,
		tools_text_block: liteSections.tool_surface_dynamic ?? '',
		execution_protocol: liteSections.operating_strategy ?? '',
		agent_behavior: liteSections.operating_strategy ?? '',
		data_rules: liteSections.safety_data_rules ?? '',
		context_payload: [
			liteSections.location_loaded_context,
			liteSections.timeline_recent_activity,
			liteSections.context_inventory_retrieval
		]
			.filter((section): section is string => Boolean(section?.trim()))
			.join('\n\n')
	};
}

function buildPromptSections(systemPrompt: string): Record<string, string> {
	const legacySections = buildLegacyPromptSections(systemPrompt);
	if (legacySections.instructions || legacySections.context) {
		return legacySections;
	}

	const liteSections = extractLiteMarkdownSections(systemPrompt);
	return {
		...buildLiteCompatibilitySections(liteSections),
		...liteSections
	};
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
