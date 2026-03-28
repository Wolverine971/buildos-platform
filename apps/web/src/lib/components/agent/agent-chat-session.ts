// apps/web/src/lib/components/agent/agent-chat-session.ts
import { dev } from '$app/environment';
import type { ChatContextType, ChatRole, ChatSession } from '@buildos/shared-types';
import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
import type { VoiceNote } from '$lib/types/voice-notes';
import type { FastAgentPrewarmRequest } from '$lib/services/agentic-chat-v2';
import type { FastChatContextCache } from '$lib/services/agentic-chat-v2/context-cache';
import type { UIMessage } from './agent-chat.types';

type LoadedChatMessage = {
	id: string;
	session_id?: string;
	user_id?: string;
	role: 'user' | 'assistant' | string;
	content: string;
	created_at: string;
	metadata?: Record<string, any>;
	tool_calls?: any;
	tool_call_id?: string;
};

type LoadedChatSessionPayload = {
	session: ChatSession;
	messages?: LoadedChatMessage[];
	truncated?: boolean;
	voiceNotes?: VoiceNote[];
};

export interface AgentChatSessionSnapshot {
	session: ChatSession;
	contextType: ChatContextType;
	selectedEntityId?: string;
	selectedContextLabel: string;
	projectFocus: ProjectFocus | null;
	messages: UIMessage[];
	voiceNotesByGroupId: Record<string, VoiceNote[]>;
}

const DEFAULT_CHAT_SESSION_TITLES = [
	'Agent Session',
	'Project Assistant',
	'Calendar Assistant',
	'Brief Chat',
	'General Assistant',
	'New Project Creation',
	'Project Audit',
	'Project Forecast',
	'Daily Brief Settings',
	'Chat session',
	'Untitled Chat'
].map((title) => title.toLowerCase());

export function isProjectContext(context: ChatContextType | null | undefined): boolean {
	return context === 'project' || context === 'project_audit' || context === 'project_forecast';
}

export function buildProjectWideFocus(
	projectId: string,
	projectName?: string | null
): ProjectFocus {
	return {
		focusType: 'project-wide',
		focusEntityId: null,
		focusEntityName: null,
		projectId,
		projectName: projectName ?? 'Project'
	};
}

export function normalizeProjectFocusClient(focus?: ProjectFocus | null): ProjectFocus | null {
	if (!focus || !focus.projectId) return null;
	return {
		focusType: focus.focusType ?? 'project-wide',
		focusEntityId: focus.focusEntityId ?? null,
		focusEntityName: focus.focusEntityName ?? null,
		projectId: focus.projectId,
		projectName: focus.projectName ?? 'Project'
	};
}

function isPlaceholderSessionTitle(title?: string | null): boolean {
	const normalized = title?.trim().toLowerCase();
	if (!normalized) return true;
	return DEFAULT_CHAT_SESSION_TITLES.includes(normalized);
}

export function deriveSessionTitle(session: ChatSession | null | undefined): string | null {
	if (!session) return null;
	const rawTitle = session.title?.trim() ?? '';
	const autoTitle = session.auto_title?.trim() ?? '';

	if (rawTitle && !isPlaceholderSessionTitle(rawTitle)) {
		return rawTitle;
	}

	if (autoTitle) {
		return autoTitle;
	}

	return rawTitle || null;
}

export async function prewarmAgentContext(
	payload: FastAgentPrewarmRequest,
	options: { signal?: AbortSignal } = {}
): Promise<{
	session: ChatSession | null;
	prewarmedContext: FastChatContextCache | null;
} | null> {
	try {
		const response = await fetch('/api/agent/v2/prewarm', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			signal: options.signal,
			body: JSON.stringify(payload)
		});
		if (!response.ok) {
			return null;
		}

		const result = await response.json();
		if (!result?.success) {
			return null;
		}

		const session = result?.data?.session ?? null;
		const prewarmedContext = result?.data?.prewarmed_context ?? null;
		return {
			session: session as ChatSession | null,
			prewarmedContext: prewarmedContext as FastChatContextCache | null
		};
	} catch (err) {
		if ((err as DOMException)?.name === 'AbortError') {
			throw err;
		}
		if (dev) {
			console.warn('[AgentChat] Prewarm failed:', err);
		}
		return null;
	}
}

function mapLoadedMessagesToUI(loadedMessages: LoadedChatMessage[] | undefined): UIMessage[] {
	return (loadedMessages ?? [])
		.filter((msg) => msg.role === 'user' || msg.role === 'assistant')
		.map((msg) => ({
			id: msg.id,
			session_id: msg.session_id,
			user_id: msg.user_id,
			type: msg.role === 'user' ? 'user' : 'assistant',
			role: msg.role as ChatRole,
			content: msg.content,
			timestamp: new Date(msg.created_at),
			created_at: msg.created_at,
			metadata: msg.metadata as Record<string, any> | undefined,
			tool_calls: msg.tool_calls,
			tool_call_id: msg.tool_call_id
		}));
}

function groupVoiceNotesByGroupId(voiceNotes: VoiceNote[]): Record<string, VoiceNote[]> {
	const grouped: Record<string, VoiceNote[]> = {};
	for (const note of voiceNotes) {
		if (!note.group_id) continue;
		const existing = grouped[note.group_id] ?? [];
		existing.push(note);
		grouped[note.group_id] = existing;
	}

	for (const groupId of Object.keys(grouped)) {
		grouped[groupId] = grouped[groupId]!.sort((a, b) => {
			const aIndex = a.segment_index ?? 0;
			const bIndex = b.segment_index ?? 0;
			if (aIndex !== bIndex) return aIndex - bIndex;
			return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
		});
	}

	return grouped;
}

export function buildAgentChatSessionSnapshot(
	payload: LoadedChatSessionPayload
): AgentChatSessionSnapshot {
	const { session, messages: loadedMessages, truncated, voiceNotes = [] } = payload;
	const contextType = (
		session.context_type === 'general' ? 'global' : session.context_type
	) as ChatContextType;
	const selectedEntityId = session.entity_id || undefined;
	const selectedContextLabel = deriveSessionTitle(session) || 'Resumed Chat';
	const metadataFocus = normalizeProjectFocusClient(
		(session.agent_metadata as { focus?: ProjectFocus | null })?.focus
	);

	let projectFocus: ProjectFocus | null = null;
	if (isProjectContext(contextType)) {
		if (metadataFocus) {
			projectFocus = metadataFocus;
		} else if (selectedEntityId) {
			projectFocus = buildProjectWideFocus(selectedEntityId, selectedContextLabel);
		}
	}

	let messages = mapLoadedMessagesToUI(loadedMessages);

	if (truncated) {
		const truncationNote: UIMessage = {
			id: crypto.randomUUID(),
			type: 'activity',
			role: 'system' as ChatRole,
			content: 'Note: This conversation has been truncated to show the most recent messages.',
			timestamp: new Date(),
			created_at: new Date().toISOString()
		};
		messages = [truncationNote, ...messages];
	}

	const welcomeMessage: UIMessage = {
		id: crypto.randomUUID(),
		type: 'assistant',
		role: 'system' as ChatRole,
		content: session.summary
			? `Resuming your conversation. Here's where we left off:\n\n**Summary:** ${session.summary}\n\nHow can I help you continue?`
			: "Welcome back! I've restored your previous conversation. How can I help you continue?",
		timestamp: new Date(),
		created_at: new Date().toISOString()
	};

	return {
		session,
		contextType,
		selectedEntityId: metadataFocus?.projectId || projectFocus?.projectId || selectedEntityId,
		selectedContextLabel,
		projectFocus,
		messages: [...messages, welcomeMessage],
		voiceNotesByGroupId: groupVoiceNotesByGroupId(voiceNotes)
	};
}

export async function loadAgentChatSessionSnapshot(
	sessionId: string,
	options: { signal?: AbortSignal } = {}
): Promise<AgentChatSessionSnapshot> {
	const response = await fetch(`/api/chat/sessions/${sessionId}?includeVoiceNotes=1`, {
		signal: options.signal
	});
	const result = await response.json().catch(() => null);

	if (!response.ok || !result?.success) {
		throw new Error(result?.error || 'Failed to load chat session');
	}

	return buildAgentChatSessionSnapshot(result.data as LoadedChatSessionPayload);
}
