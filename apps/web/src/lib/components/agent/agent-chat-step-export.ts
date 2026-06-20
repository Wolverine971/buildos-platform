// apps/web/src/lib/components/agent/agent-chat-step-export.ts
import type { ChatContextType } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import {
	isThinkingBlockMessage,
	type ActivityEntry,
	type AgentTimelineEntityRef,
	type AgentTimelineItem,
	type ThinkingBlockMessage,
	type UIMessage
} from './agent-chat.types';

const MAX_MESSAGE_CHARS = 12_000;
const MAX_METADATA_CHARS = 2_000;
const SENSITIVE_METADATA_KEY_PATTERN =
	/(authorization|cookie|credential|password|secret|token|api[_-]?key)/i;

export interface AgentChatStepsExportParams {
	messages: UIMessage[];
	timelineItems?: AgentTimelineItem[];
	sessionId?: string | null;
	contextLabel: string;
	contextType?: ChatContextType | null;
	entityId?: string | null;
	projectFocus?: ProjectFocus | null;
	exportedAt?: Date;
}

function formatTimestamp(value: Date | string | null | undefined): string {
	if (!value) return 'unknown time';
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return 'unknown time';
	return date.toISOString();
}

function formatActivityType(type: ActivityEntry['activityType']): string {
	return type
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function truncate(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, maxChars)}... [truncated ${value.length - maxChars} chars]`;
}

function createJsonReplacer(): (key: string, value: unknown) => unknown {
	const seen = new WeakSet<object>();

	return (key: string, value: unknown) => {
		if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) {
			return '[redacted]';
		}

		if (value && typeof value === 'object') {
			if (seen.has(value)) return '[Circular]';
			seen.add(value);
		}

		return value;
	};
}

function compactJson(value: unknown): string {
	let normalized = value;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '';
		try {
			normalized = JSON.parse(trimmed);
		} catch {
			return truncate(trimmed.replace(/\s+/g, ' '), MAX_METADATA_CHARS);
		}
	}

	try {
		return truncate(JSON.stringify(normalized, createJsonReplacer()), MAX_METADATA_CHARS);
	} catch {
		return truncate(String(normalized), MAX_METADATA_CHARS);
	}
}

function inlineCode(value: string): string {
	return `\`${value.replace(/`/g, '\\`')}\``;
}

function formatContent(content: string | null | undefined, maxChars = MAX_MESSAGE_CHARS): string {
	const trimmed = (content ?? '').trim();
	if (!trimmed) return '_No content._';
	return truncate(trimmed, maxChars);
}

function getMetadataString(
	metadata: Record<string, any> | undefined,
	...keys: string[]
): string | null {
	if (!metadata) return null;
	for (const key of keys) {
		const value = metadata[key];
		if (typeof value === 'string' && value.trim()) {
			return value.trim();
		}
	}
	return null;
}

function getMetadataValue(metadata: Record<string, any> | undefined, ...keys: string[]): unknown {
	if (!metadata) return undefined;
	for (const key of keys) {
		if (metadata[key] !== undefined && metadata[key] !== null) {
			return metadata[key];
		}
	}
	return undefined;
}

function formatActivityMetadata(activity: ActivityEntry): string[] {
	const metadata = activity.metadata;
	if (!metadata) return [];

	const lines: string[] = [];
	const toolName = getMetadataString(metadata, 'toolName', 'originalToolName');
	const toolCallId = activity.toolCallId ?? getMetadataString(metadata, 'toolCallId', 'id');
	const skillPath = getMetadataString(metadata, 'skillPath');
	const skillAction = getMetadataString(metadata, 'skillAction');
	const skillVia = getMetadataString(metadata, 'skillVia');
	const operationStatus = getMetadataString(metadata, 'operationStatus');
	const error = getMetadataValue(metadata, 'error');
	const args = getMetadataValue(metadata, 'arguments', 'rawArguments', 'args');
	const result = getMetadataValue(metadata, 'result', 'response');
	const operation = getMetadataValue(metadata, 'operation');

	if (toolName) lines.push(`   - Tool: ${inlineCode(toolName)}`);
	if (toolCallId) lines.push(`   - Tool call ID: ${inlineCode(toolCallId)}`);
	if (skillPath) {
		const prefix = skillAction ? `${skillAction} ` : '';
		const suffix = skillVia ? ` via ${skillVia}` : '';
		lines.push(`   - Skill: ${inlineCode(`${prefix}${skillPath}${suffix}`)}`);
	}
	if (operationStatus) lines.push(`   - Operation status: ${inlineCode(operationStatus)}`);
	if (operation !== undefined)
		lines.push(`   - Operation: ${inlineCode(compactJson(operation))}`);
	if (args !== undefined) lines.push(`   - Arguments: ${inlineCode(compactJson(args))}`);
	if (result !== undefined) lines.push(`   - Result: ${inlineCode(compactJson(result))}`);
	if (error !== undefined) lines.push(`   - Error: ${inlineCode(compactJson(error))}`);

	return lines;
}

function formatActivity(activity: ActivityEntry, index: number): string {
	const status = activity.status ? ` [${activity.status}]` : '';
	const lines = [
		`${index + 1}. **${formatActivityType(activity.activityType)}**${status} - ${formatTimestamp(activity.timestamp)}`,
		`   ${formatContent(activity.content, MAX_METADATA_CHARS)}`
	];

	const metadataLines = formatActivityMetadata(activity);
	if (metadataLines.length > 0) {
		lines.push(...metadataLines);
	}

	return lines.join('\n');
}

function formatThinkingBlock(block: ThinkingBlockMessage, index: number): string {
	const lines = [
		`## Turn ${index + 1} - Agent Steps`,
		`- Time: ${formatTimestamp(block.timestamp)}`,
		`- Status: ${block.status}`,
		block.agentState ? `- Agent state: ${block.agentState}` : null,
		`- Activity count: ${block.activities.length}`,
		'',
		formatContent(block.content, MAX_METADATA_CHARS),
		''
	].filter((line): line is string => line !== null);

	if (block.activities.length === 0) {
		lines.push('_No activity entries were recorded for this turn._');
		return lines.join('\n');
	}

	lines.push(
		...block.activities.map((activity, activityIndex) =>
			formatActivity(activity, activityIndex)
		)
	);
	return lines.join('\n');
}

function formatMessage(message: UIMessage, index: number): string {
	const roleLabel =
		message.type === 'agent_peer'
			? 'Agent Peer'
			: message.type.charAt(0).toUpperCase() + message.type.slice(1);
	const lines = [
		`## Turn ${index + 1} - ${roleLabel}`,
		`- Time: ${formatTimestamp(message.timestamp ?? message.created_at)}`,
		message.role ? `- Role: ${message.role}` : null,
		'',
		formatContent(message.content)
	].filter((line): line is string => line !== null);

	if (message.tool_calls) {
		lines.push('', `Tool calls: \`${compactJson(message.tool_calls)}\``);
	}

	return lines.join('\n');
}

function formatTimelineStatus(status: string): string {
	return status
		.split('_')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function formatEntityRef(ref: AgentTimelineEntityRef): string {
	const label = ref.title || ref.id;
	const prefix = ref.operation ? `${ref.operation} ` : '';
	const text = `${prefix}${ref.kind}: ${label}`;
	return ref.url ? `[${text}](${ref.url})` : text;
}

function formatTimelineItem(item: AgentTimelineItem, index: number): string {
	const lines = [
		`${index + 1}. **${item.title}** [${formatTimelineStatus(item.status)}] - ${formatTimestamp(item.timestamp)}`,
		item.summary ? `   - Summary: ${formatContent(item.summary, MAX_METADATA_CHARS)}` : null,
		item.tool?.name ? `   - Tool: ${inlineCode(item.tool.name)}` : null,
		item.tool?.gatewayOp ? `   - Operation: ${inlineCode(item.tool.gatewayOp)}` : null,
		typeof item.tool?.durationMs === 'number'
			? `   - Duration: ${item.tool.durationMs}ms`
			: null,
		item.tool?.argsPreview ? `   - Arguments: ${inlineCode(item.tool.argsPreview)}` : null,
		item.tool?.resultPreview ? `   - Result: ${inlineCode(item.tool.resultPreview)}` : null,
		item.tool?.errorMessage ? `   - Error: ${inlineCode(item.tool.errorMessage)}` : null,
		item.projectRef ? `   - Project: ${formatEntityRef(item.projectRef)}` : null,
		item.entityRefs.length > 0
			? `   - Entities: ${item.entityRefs.map(formatEntityRef).join(', ')}`
			: null,
		item.redaction?.argsRedacted || item.redaction?.resultRedacted
			? `   - Redaction: ${item.redaction.reason ?? 'sensitive fields'}`
			: null
	].filter((line): line is string => line !== null);

	return lines.join('\n');
}

function formatTimelineSection(title: string, items: AgentTimelineItem[]): string[] {
	const lines = [`## ${title}`, ''];
	if (items.length === 0) {
		lines.push('_No entries._', '');
		return lines;
	}
	lines.push(...items.map((item, index) => formatTimelineItem(item, index)), '');
	return lines;
}

function countActivities(messages: UIMessage[]): number {
	return messages.reduce((count, message) => {
		if (!isThinkingBlockMessage(message)) return count;
		return count + message.activities.length;
	}, 0);
}

function buildProjectFocusLine(projectFocus: ProjectFocus | null | undefined): string | null {
	if (!projectFocus) return null;
	const parts = [
		projectFocus.projectName ? `project=${projectFocus.projectName}` : null,
		projectFocus.projectId ? `project_id=${projectFocus.projectId}` : null,
		projectFocus.focusType ? `focus=${projectFocus.focusType}` : null,
		projectFocus.focusEntityName ? `focus_name=${projectFocus.focusEntityName}` : null,
		projectFocus.focusEntityId ? `focus_id=${projectFocus.focusEntityId}` : null
	].filter((part): part is string => Boolean(part));
	return parts.length > 0 ? parts.join(', ') : null;
}

export function buildAgentChatStepsMarkdown(params: AgentChatStepsExportParams): string {
	const exportedAt = params.exportedAt ?? new Date();
	const thinkingBlocks = params.messages.filter(isThinkingBlockMessage);
	const activityCount = countActivities(params.messages);
	const timelineItems = params.timelineItems ?? [];
	const hasTimeline = timelineItems.length > 0;
	const stepItems = timelineItems.filter(
		(item) => item.kind === 'step' || item.kind === 'status'
	);
	const toolItems = timelineItems.filter((item) => item.kind === 'tool');
	const changeItems = timelineItems.filter((item) => item.kind === 'change');
	const toolCallCount = thinkingBlocks.reduce(
		(count, block) =>
			count +
			block.activities.filter((activity) => activity.activityType === 'tool_call').length,
		0
	);
	const projectFocusLine = buildProjectFocusLine(params.projectFocus);

	const lines = [
		'# BuildOS Agent Steps',
		'',
		'## Export Metadata',
		`- Exported at: ${formatTimestamp(exportedAt)}`,
		params.sessionId ? `- Session ID: ${params.sessionId}` : '- Session ID: not available',
		`- Context: ${params.contextLabel}`,
		params.contextType ? `- Context type: ${params.contextType}` : null,
		params.entityId ? `- Entity ID: ${params.entityId}` : null,
		projectFocusLine ? `- Project focus: ${projectFocusLine}` : null,
		'',
		'## Summary',
		`- Messages exported: ${params.messages.length}`,
		hasTimeline ? `- Timeline entries: ${timelineItems.length}` : null,
		`- Agent step blocks: ${thinkingBlocks.length}`,
		`- Activity entries: ${activityCount}`,
		`- Tool calls: ${hasTimeline ? toolItems.length : toolCallCount}`,
		hasTimeline ? `- Changes: ${changeItems.length}` : null,
		'',
		hasTimeline ? null : '## Timeline',
		hasTimeline ? null : ''
	].filter((line): line is string => line !== null);

	if (params.messages.length === 0) {
		lines.push('_No messages were loaded in this chat modal._');
		return `${lines.join('\n')}\n`;
	}

	if (hasTimeline) {
		lines.push(
			...formatTimelineSection('Steps', stepItems),
			...formatTimelineSection('Tool Calls', toolItems),
			...formatTimelineSection('Changes', changeItems),
			'## Conversation',
			''
		);
	}

	params.messages.forEach((message, index) => {
		lines.push(
			isThinkingBlockMessage(message)
				? formatThinkingBlock(message, index)
				: formatMessage(message, index),
			''
		);
	});

	return `${lines.join('\n')}\n`;
}

function slugifyFilenamePart(value: string): string {
	const slug = value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || 'agent-chat';
}

export function buildAgentChatStepsFilename(params: AgentChatStepsExportParams): string {
	const sessionPart = params.sessionId ? params.sessionId.slice(0, 8) : null;
	const contextPart = slugifyFilenamePart(params.contextLabel);
	const datePart = formatTimestamp(params.exportedAt ?? new Date()).slice(0, 10);
	return `buildos-agent-steps-${contextPart}-${sessionPart ?? datePart}.md`;
}

export function downloadAgentChatStepsMarkdown(params: AgentChatStepsExportParams): string {
	const markdown = buildAgentChatStepsMarkdown(params);
	const filename = buildAgentChatStepsFilename(params);
	const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
	return filename;
}
