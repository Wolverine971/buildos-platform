// apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts
import type { ChatContextType, ChatToolDefinition } from '@buildos/shared-types';
import { estimateTokensFromText } from './context-usage';
import {
	GATEWAY_SURFACE_PROFILE_NAMES,
	getGatewaySurfaceForContextType,
	getGatewaySurfaceForProfile,
	type GatewaySurfaceProfileName
} from '$lib/services/agentic-chat/tools/core/gateway-surface';

export const TOOL_SURFACE_PROFILE_CANONICAL_GATEWAY = 'canonical_gateway' as const;

export const TOOL_SURFACE_REPORT_CONTEXTS: ChatContextType[] = [
	'global',
	'project',
	'project_create',
	'calendar',
	'daily_brief',
	'general',
	'ontology',
	'brain_dump',
	'daily_brief_update'
];

export const TOOL_SURFACE_REPORT_PROFILES: GatewaySurfaceProfileName[] = [
	...GATEWAY_SURFACE_PROFILE_NAMES
];

export type ToolDefinitionSize = {
	name: string;
	chars: number;
	estimatedTokens: number;
};

export type ToolSurfaceSizeReport = {
	profile: string;
	contextType: string;
	toolCount: number;
	totalChars: number;
	estimatedTokens: number;
	tools: ToolDefinitionSize[];
};

export function buildToolSurfaceSizeReport(params: {
	profile: string;
	contextType: string;
	tools?: ChatToolDefinition[] | null;
}): ToolSurfaceSizeReport {
	const tools = params.tools ?? [];
	const toolSizes = tools
		.map((tool) => {
			const serialized = serializeToolDefinition(tool);
			return {
				name: resolveToolName(tool),
				chars: serialized.length,
				estimatedTokens: estimateTokensFromText(serialized)
			};
		})
		.sort((a, b) => b.chars - a.chars || a.name.localeCompare(b.name));
	const totalSerialized = tools.length ? JSON.stringify(tools) : '';

	return {
		profile: params.profile,
		contextType: params.contextType,
		toolCount: tools.length,
		totalChars: totalSerialized.length,
		estimatedTokens: estimateTokensFromText(totalSerialized),
		tools: toolSizes
	};
}

export function buildCanonicalToolSurfaceSizeReports(
	contextTypes: ChatContextType[] = TOOL_SURFACE_REPORT_CONTEXTS
): ToolSurfaceSizeReport[] {
	return contextTypes.map((contextType) =>
		buildToolSurfaceSizeReport({
			profile: TOOL_SURFACE_PROFILE_CANONICAL_GATEWAY,
			contextType,
			tools: getGatewaySurfaceForContextType(contextType)
		})
	);
}

export function buildGatewayProfileToolSurfaceSizeReports(
	profiles: GatewaySurfaceProfileName[] = TOOL_SURFACE_REPORT_PROFILES
): ToolSurfaceSizeReport[] {
	return profiles.map((profile) =>
		buildToolSurfaceSizeReport({
			profile,
			contextType: profile,
			tools: getGatewaySurfaceForProfile(profile)
		})
	);
}

export function formatToolSurfaceSizeReport(
	report: ToolSurfaceSizeReport,
	options: { maxTools?: number } = {}
): string[] {
	const maxTools = options.maxTools ?? report.tools.length;
	const shownTools = report.tools.slice(0, maxTools);
	const hiddenCount = Math.max(report.tools.length - shownTools.length, 0);
	const lines = [
		`Profile: ${report.profile}`,
		`Context: ${report.contextType}`,
		`Tool count: ${report.toolCount}`,
		`Total tool definitions: ${report.totalChars} chars (~${report.estimatedTokens} tokens)`,
		'',
		'Tool definition sizes:'
	];

	if (shownTools.length === 0) {
		lines.push('- none');
		return lines;
	}

	shownTools.forEach((tool, index) => {
		lines.push(
			`${index + 1}. ${tool.name}: ${tool.chars} chars (~${tool.estimatedTokens} tokens)`
		);
	});
	if (hiddenCount > 0) {
		lines.push(`... ${hiddenCount} more tool(s) omitted from this view`);
	}

	return lines;
}

export function formatToolSurfaceSizeMatrix(reports: ToolSurfaceSizeReport[]): string[] {
	const lines = ['profile | context | tools | chars | est_tokens'];
	for (const report of reports) {
		lines.push(
			`${report.profile} | ${report.contextType} | ${report.toolCount} | ${report.totalChars} | ${report.estimatedTokens}`
		);
	}
	return lines;
}

function serializeToolDefinition(tool: ChatToolDefinition): string {
	return JSON.stringify(tool);
}

function resolveToolName(tool: ChatToolDefinition): string {
	const name = tool.function?.name;
	return typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'unknown';
}
