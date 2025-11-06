<!-- apps/web/src/lib/components/chat/ChatModal.svelte -->
<!--
  ChatModal Component

  Main chat interface with progressive disclosure pattern support.
  Uses Svelte 5 runes for reactive state management.
-->

<script lang="ts">
	import { tick, onMount } from 'svelte';
	import {
		Plus,
		X,
		MessageSquare,
		Send,
		Mic,
		MicOff,
		Loader2,
		MoreHorizontal,
		Pencil,
		Trash2
	} from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { SSEProcessor, type StreamCallbacks } from '$lib/utils/sse-processor';
	import type {
		ChatSession,
		ChatMessage,
		ChatSSEMessage,
		ChatContextType,
		ChatToolCall,
		ChatToolResult,
		TokenUsage
	} from '@buildos/shared-types';
	import ChatMessageComponent from './ChatMessage.svelte';
	import ToolVisualization from './ToolVisualization.svelte';
	import ContextSelectionScreen from './ContextSelectionScreen.svelte';
	import {
		voiceRecordingService,
		type TranscriptionService
	} from '$lib/services/voiceRecording.service';
	import { toastService } from '$lib/stores/toast.store';
	import { clickOutside } from '$lib/utils/clickOutside';

	interface Props {
		isOpen?: boolean;
		contextType?: ChatContextType;
		entityId?: string;
		initialMessage?: string;
		sessionId?: string;
		showContextSelection?: boolean;
		onClose?: () => void;
	}

	let {
		isOpen = false,
		contextType = 'global',
		entityId,
		initialMessage,
		sessionId,
		showContextSelection = false,
		onClose
	}: Props = $props();

	let messages = $state<ChatMessage[]>([]);
	let currentSession = $state<ChatSession | null>(null);
	let isLoading = $state(false);
	let isStreaming = $state(false);
	let inputValue = $state(initialMessage || '');
	let currentStreamingMessage = $state('');
	let currentToolCalls = $state<ChatToolCall[]>([]);
	let currentToolResults = $state<ChatToolResult[]>([]);
	let error = $state<string | null>(null);
	let messagesContainer: HTMLElement;
	let activeSessionId = $state<string | null>(sessionId ?? null);
	let hasRequestedTitle = $state(false);
	let recentSessions = $state<ChatSession[]>([]);
	let isSessionsLoading = $state(false);
	let sessionsError = $state<string | null>(null);
	let hasPrefetchedSessions = $state(false);
	let lastSessionsFetchAt = $state(0);
	let loadingSessionId = $state<string | null>(null);

	// Context selection state
	let selectedContextType = $state<ChatContextType | null>(contextType || null);
	let selectedEntityId = $state<string | null>(entityId || null);
	let showingContextSelection = $state(showContextSelection && !contextType);

	// Voice recording state
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	let isInitializingRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let microphonePermissionGranted = $state(false);
	let canUseLiveTranscript = $state(false);
	let recordingDuration = $state(0);
	let hasAttemptedVoice = $state(false);
	let showSessionMenu = $state(false);
	let sessionDialog = $state<'rename' | 'delete' | null>(null);
	let renameInputValue = $state('');
	let sessionActionError = $state('');
	let isSessionActionLoading = $state(false);
	let renameInputElement: HTMLInputElement | null = null;
	let sessionDialogElement: HTMLDivElement | null = null;
	let isSendDisabled = $derived(
		!inputValue.trim() ||
			isStreaming ||
			isCurrentlyRecording ||
			isInitializingRecording ||
			isTranscribing
	);
	const sessionActionId = $derived(currentSession?.id || activeSessionId || null);

	const chatTranscriptionService: TranscriptionService = {
		async transcribeAudio(audioFile: File) {
			const formData = new FormData();
			formData.append('audio', audioFile);

			const response = await fetch('/api/transcribe', {
				method: 'POST',
				body: formData
			});

			if (!response.ok) {
				let errorMessage = `Transcription failed: ${response.status}`;
				try {
					const errorPayload = await response.json();
					if (errorPayload?.error) {
						errorMessage = errorPayload.error;
					}
				} catch {
					// Ignore JSON parse errors and fall back to default message
				}
				throw new Error(errorMessage);
			}

			const result = await response.json();
			if (result?.success && result?.data?.transcript) {
				return { transcript: result.data.transcript };
			}

			if (result?.transcript) {
				return { transcript: result.transcript };
			}

			throw new Error('No transcript returned from transcription service');
		}
	};

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	let voiceButtonState = $derived.by(() => {
		if (!isVoiceSupported) {
			return {
				icon: MicOff,
				label: 'Voice input unavailable',
				disabled: true,
				isLoading: false,
				variant: 'muted' as const
			};
		}

		if (isCurrentlyRecording) {
			return {
				icon: MicOff,
				label: 'Stop recording',
				disabled: false,
				isLoading: false,
				variant: 'recording' as const
			};
		}

		if (isInitializingRecording) {
			return {
				icon: Loader2,
				label: 'Preparing microphone…',
				disabled: true,
				isLoading: true,
				variant: 'loading' as const
			};
		}

		if (isTranscribing) {
			return {
				icon: Loader2,
				label: 'Transcribing…',
				disabled: true,
				isLoading: true,
				variant: 'loading' as const
			};
		}

		if (!microphonePermissionGranted && (hasAttemptedVoice || voiceError)) {
			return {
				icon: Mic,
				label: 'Enable microphone',
				disabled: false,
				isLoading: false,
				variant: 'prompt' as const
			};
		}

		if (isStreaming) {
			return {
				icon: Mic,
				label: 'Wait for current reply',
				disabled: true,
				isLoading: false,
				variant: 'muted' as const
			};
		}

		return {
			icon: Mic,
			label: 'Record voice note',
			disabled: false,
			isLoading: false,
			variant: 'ready' as const
		};
	});

	onMount(() => {
		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();

		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					inputValue = text;
					voiceError = '';
				},
				onError: (error: string) => {
					voiceError = error;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					isTranscribing = phase === 'transcribing';
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					canUseLiveTranscript = update.canUseLiveTranscript;
				}
			},
			chatTranscriptionService
		);

		const durationStore = voiceRecordingService.getRecordingDuration();
		const unsubscribe = durationStore.subscribe((value) => {
			recordingDuration = value;
		});

		return () => {
			unsubscribe();
			voiceRecordingService.cleanup();
		};
	});

	async function startVoiceRecording() {
		if (
			!isVoiceSupported ||
			isStreaming ||
			isInitializingRecording ||
			isCurrentlyRecording ||
			isTranscribing
		) {
			return;
		}

		hasAttemptedVoice = true;
		voiceError = '';
		isInitializingRecording = true;

		try {
			await voiceRecordingService.startRecording(inputValue);
			isInitializingRecording = false;
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
		} catch (error) {
			console.error('Failed to start voice recording:', error);
			const message = error instanceof Error ? error.message : 'Unable to access microphone';
			voiceError = message;
			microphonePermissionGranted = false;
			isInitializingRecording = false;
			isCurrentlyRecording = false;
		}
	}

	async function stopVoiceRecording() {
		if (!isCurrentlyRecording && !isInitializingRecording) {
			return;
		}

		try {
			await voiceRecordingService.stopRecording(inputValue);
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message = error instanceof Error ? error.message : 'Failed to stop recording';
			voiceError = message;
		} finally {
			isCurrentlyRecording = false;
			isInitializingRecording = false;
		}
	}

	async function handleVoiceToggle() {
		if (!isVoiceSupported) return;

		if (isCurrentlyRecording || isInitializingRecording) {
			await stopVoiceRecording();
		} else {
			await startVoiceRecording();
		}
	}

	function toggleSessionMenu() {
		if (!sessionActionId || sessionDialog || isSessionActionLoading) {
			return;
		}
		showSessionMenu = !showSessionMenu;
	}

	function openRenameDialog() {
		if (!sessionActionId) return;
		showSessionMenu = false;
		sessionActionError = '';

		const activeTitle =
			(currentSession?.id === sessionActionId ? currentSession?.title : undefined) ??
			recentSessions.find((session) => session.id === sessionActionId)?.title ??
			'';

		renameInputValue = activeTitle?.trim() ? activeTitle.trim() : 'Untitled Chat';
		sessionDialog = 'rename';
	}

	function openDeleteDialog() {
		if (!sessionActionId) return;
		showSessionMenu = false;
		sessionActionError = '';
		sessionDialog = 'delete';
	}

	function closeSessionDialogs() {
		sessionDialog = null;
		sessionActionError = '';
		renameInputValue = '';
		isSessionActionLoading = false;
		showSessionMenu = false;
		renameInputElement = null;
		sessionDialogElement = null;
	}

	async function submitRenameSession(event: SubmitEvent) {
		event.preventDefault();
		if (!sessionActionId) return;

		const title = renameInputValue.trim();
		if (!title) {
			sessionActionError = 'Please enter a session name.';
			return;
		}

		if (title.length > 120) {
			sessionActionError = 'Session names must be 120 characters or fewer.';
			return;
		}

		isSessionActionLoading = true;
		sessionActionError = '';

		try {
			const response = await fetch(`/api/chat/sessions/${sessionActionId}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ title })
			});

			let payload: any = null;
			try {
				payload = await response.json();
			} catch {
				// ignore parse errors
			}

			if (!response.ok || payload?.success === false) {
				const message =
					payload?.error ||
					payload?.message ||
					(payload?.data?.error as string | undefined) ||
					'Failed to rename chat session.';
				sessionActionError = message;
				return;
			}

			const updatedSession: ChatSession | null =
				payload?.data?.session ?? payload?.session ?? payload?.data ?? null;

			if (updatedSession) {
				if (currentSession && currentSession.id === sessionActionId) {
					currentSession = { ...currentSession, ...updatedSession };
				}

				upsertSessionInList(updatedSession);
			}

			toastService.success('Chat renamed');
			closeSessionDialogs();
		} catch (error) {
			sessionActionError =
				error instanceof Error ? error.message : 'Failed to rename chat session.';
		} finally {
			isSessionActionLoading = false;
		}
	}

	async function confirmDeleteSession() {
		if (!sessionActionId) return;

		isSessionActionLoading = true;
		sessionActionError = '';

		try {
			const response = await fetch(`/api/chat/sessions/${sessionActionId}`, {
				method: 'DELETE'
			});

			let payload: any = null;
			try {
				payload = await response.json();
			} catch {
				// ignore parse errors
			}

			if (!response.ok || payload?.success === false) {
				const message =
					payload?.error ||
					payload?.message ||
					(payload?.data?.error as string | undefined) ||
					'Failed to delete chat session.';
				sessionActionError = message;
				return;
			}

			const updatedSessions = recentSessions.filter(
				(session) => session.id !== sessionActionId
			);
			recentSessions = updatedSessions;

			const wasActive =
				currentSession?.id === sessionActionId || activeSessionId === sessionActionId;

			if (wasActive) {
				if (updatedSessions.length > 0) {
					const nextSession = updatedSessions[0];
					currentSession = null;
					messages = [];
					currentStreamingMessage = '';
					currentToolCalls = [];
					currentToolResults = [];
					error = null;
					isLoading = true;
					activeSessionId = nextSession.id;
					void loadSession(nextSession.id, true);
				} else {
					createNewSession();
				}
			}

			toastService.success('Chat deleted');
			closeSessionDialogs();
		} catch (error) {
			sessionActionError =
				error instanceof Error ? error.message : 'Failed to delete chat session.';
		} finally {
			isSessionActionLoading = false;
		}
	}

	$effect(async () => {
		if (!sessionDialog) return;
		await tick();

		if (sessionDialog === 'rename') {
			renameInputElement?.focus();
			renameInputElement?.select();
		} else {
			sessionDialogElement?.focus();
		}
	});

	$effect(() => {
		if (!sessionActionId) {
			showSessionMenu = false;
			if (sessionDialog) {
				closeSessionDialogs();
			}
		}
	});

	// Context indicator badge
	const contextLabel = $derived.by(() => {
		const currentType = selectedContextType || contextType;
		const meta = CONTEXT_META[currentType];
		return meta ? `${meta.badge} ${meta.description}` : '🌍 Global Context';
	});

	const CONTEXT_META: Record<ChatContextType, { badge: string; description: string }> = {
		global: {
			badge: '🌍 Global',
			description: 'No specific context'
		},
		project: {
			badge: '📁 Project',
			description: 'Project-focused session'
		},
		task: {
			badge: '✅ Task',
			description: 'Task-focused session'
		},
		calendar: {
			badge: '📅 Calendar',
			description: 'Calendar session'
		},
		general: {
			badge: '💬 General',
			description: 'General conversation'
		},
		project_create: {
			badge: '➕ New Project',
			description: 'Creating new project'
		},
		project_update: {
			badge: '🔄 Update Project',
			description: 'Updating project'
		},
		project_audit: {
			badge: '🔍 Audit',
			description: 'Project audit'
		},
		project_forecast: {
			badge: '📊 Forecast',
			description: 'Project forecast'
		},
		task_update: {
			badge: '✏️ Update Task',
			description: 'Updating task'
		},
		daily_brief_update: {
			badge: '📮 Brief Settings',
			description: 'Daily brief preferences'
		}
	};

	function getContextMeta(type?: ChatContextType | null) {
		if (!type) return CONTEXT_META.global;
		return CONTEXT_META[type] ?? CONTEXT_META.global;
	}

	function sortSessions(sessions: ChatSession[]): ChatSession[] {
		return sessions.slice().sort((a, b) => {
			const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
			const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
			return bTime - aTime;
		});
	}

	function formatSessionTitle(session: ChatSession): string {
		const title = session.title?.trim();
		if (
			session.id === activeSessionId &&
			hasRequestedTitle &&
			(!title || title === 'Untitled Chat')
		) {
			return 'Generating title…';
		}
		if (title && title !== 'Untitled Chat') {
			return title;
		}
		return 'Untitled Chat';
	}

	function formatSessionUpdatedAt(session: ChatSession): string | null {
		if (!session.updated_at) return null;
		const updated = new Date(session.updated_at);
		return new Intl.DateTimeFormat('en', {
			month: 'short',
			day: 'numeric'
		}).format(updated);
	}

	function upsertSessionInList(session: ChatSession) {
		if (!session) return;

		const { messages: _ignored, ...rest } = session as ChatSession & {
			messages?: ChatMessage[];
		};
		const sanitized = rest as ChatSession;

		const next = [...recentSessions];
		const idx = next.findIndex((item) => item.id === sanitized.id);

		if (idx >= 0) {
			next[idx] = { ...next[idx], ...sanitized };
		} else {
			next.unshift(sanitized);
		}

		recentSessions = sortSessions(next);
	}

	async function loadRecentSessions(force = false) {
		if (!isOpen) return;
		if (isSessionsLoading) return;

		const now = Date.now();
		if (!force && now - lastSessionsFetchAt < 5000) {
			return;
		}

		isSessionsLoading = true;
		sessionsError = null;
		lastSessionsFetchAt = now;

		try {
			const response = await fetch('/api/chat/stream');

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}

			const payload = await response.json();
			// Backend returns { success: true, data: { sessions: [...] } }
			const sessionsData =
				(payload?.data?.sessions as Array<ChatSession & { messages?: ChatMessage[] }>) ??
				[];

			if (sessionsData.length > 0) {
				const sanitized = sessionsData.map(
					({ messages: _ignored, ...session }) => session as ChatSession
				);
				recentSessions = sortSessions(sanitized);
			} else {
				recentSessions = [];
			}
		} catch (err) {
			console.error('Failed to load chat sessions:', err);
			sessionsError = 'Unable to load chat history';
			lastSessionsFetchAt = 0;
		} finally {
			isSessionsLoading = false;
		}
	}

	function handleSessionSelect(id: string) {
		if (isStreaming) return;
		if (!id || activeSessionId === id) return;
		activeSessionId = id;
		void loadSession(id);
	}

	$effect(() => {
		if (!isOpen) {
			hasPrefetchedSessions = false;
			return;
		}

		if (!hasPrefetchedSessions) {
			hasPrefetchedSessions = true;
			void loadRecentSessions();
		}

		if (sessionId) {
			activeSessionId = sessionId;
			void loadSession(sessionId, true);
		} else {
			createNewSession(true);
		}
	});

	$effect(() => {
		// Trigger on new messages or streaming updates
		messages.length;
		currentStreamingMessage;
		void scrollMessagesToBottom();
	});

	async function scrollMessagesToBottom() {
		await tick();
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	async function loadSession(id: string, force = false) {
		if (!id) return;
		if (!force && loadingSessionId === id) return;
		if (!force && currentSession?.id === id && messages.length > 0) {
			return;
		}

		loadingSessionId = id;
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/chat/stream?session_id=${id}`);
			if (!response.ok) throw new Error('Failed to load session');

			const payload = await response.json();
			// Backend returns { success: true, data: { session: { ... } } }
			const sessionPayload = payload?.data?.session as ChatSession & {
				messages?: ChatMessage[];
			};
			if (!sessionPayload) throw new Error('Session payload missing');

			const sessionWithMessages = sessionPayload;

			const sessionMessages = sessionWithMessages.messages ?? [];
			const { messages: _omit, ...sessionMeta } = sessionWithMessages;

			currentSession = sessionMeta as ChatSession;
			activeSessionId = sessionMeta.id;
			hasRequestedTitle = false;
			messages = sessionMessages;
			currentStreamingMessage = '';
			currentToolCalls = [];
			currentToolResults = [];
			upsertSessionInList(currentSession);
		} catch (err) {
			console.error('Failed to load session:', err);
			error = 'Failed to load chat session';
		} finally {
			isLoading = false;
			loadingSessionId = null;
		}
	}

	function createNewSession(prefillFromInitial = false) {
		currentSession = null;
		activeSessionId = null;
		messages = [];
		currentStreamingMessage = '';
		currentToolCalls = [];
		currentToolResults = [];
		error = null;
		isLoading = false;
		hasRequestedTitle = false;
		inputValue = prefillFromInitial && initialMessage ? initialMessage : '';
	}

	function handleContextSelect(
		event: CustomEvent<{ contextType: ChatContextType; entityId?: string }>
	) {
		const { contextType: selected, entityId: selectedEntity } = event.detail;

		selectedContextType = selected;
		selectedEntityId = selectedEntity || null;
		showingContextSelection = false;

		// Start new session with selected context
		createNewSession(true);
	}

	function clearSession() {
		createNewSession();
	}

	function handleClose() {
		if (isCurrentlyRecording || isInitializingRecording) {
			void stopVoiceRecording();
		}
		closeSessionDialogs();
		onClose?.();
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			if (isCurrentlyRecording || isInitializingRecording || isTranscribing) {
				event.preventDefault();
				return;
			}
			event.preventDefault();
			void sendMessage();
		}
	}

	async function sendMessage() {
		const trimmed = inputValue.trim();
		if (
			!trimmed ||
			isStreaming ||
			isCurrentlyRecording ||
			isInitializingRecording ||
			isTranscribing
		)
			return;

		const now = new Date().toISOString();
		const sessionIdentifier = currentSession?.id || activeSessionId || '';

		const tempUserMessage: ChatMessage = {
			id: crypto.randomUUID(),
			session_id: sessionIdentifier,
			role: 'user',
			content: trimmed,
			created_at: now
		} as ChatMessage;

		messages = [...messages, tempUserMessage];
		inputValue = '';
		error = null;
		isStreaming = true;
		currentStreamingMessage = '';
		currentToolCalls = [];
		currentToolResults = [];

		try {
			const response = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					message: trimmed,
					session_id: currentSession?.id || activeSessionId || sessionId,
					context_type: selectedContextType || contextType,
					entity_id: selectedEntityId || entityId
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const callbacks: StreamCallbacks = {
				onProgress: (data: ChatSSEMessage) => {
					switch (data.type) {
						case 'session':
							handleSessionHydration(data.session);
							break;
						case 'text':
							currentStreamingMessage += data.content;
							break;
						case 'tool_call':
							currentToolCalls = [...currentToolCalls, data.tool_call];
							break;
						case 'tool_result':
							upsertToolResult(data.tool_result);
							break;
						case 'error':
							error = data.error || 'An error occurred';
							isStreaming = false;
							resetStreamingState();
							break;
						case 'done':
							finalizeAssistantMessage(data.usage);
							break;
					}
				},
				onError: (err) => {
					console.error('SSE error:', err);
					error =
						typeof err === 'string' ? err : 'Connection error occurred while streaming';
					isStreaming = false;
					resetStreamingState();
				},
				onComplete: () => {
					isStreaming = false;
				}
			};

			await SSEProcessor.processStream(response, callbacks, {
				timeout: 60000,
				parseJSON: true
			});
		} catch (err) {
			console.error('Failed to send message:', err);
			error = 'Failed to send message. Please try again.';
			isStreaming = false;
			restoreUserInput(tempUserMessage.id, trimmed);
		}
	}

	function restoreUserInput(messageId: string, value: string) {
		messages = messages.filter((message) => message.id !== messageId);
		inputValue = value;
		resetStreamingState();
	}

	function handleSessionHydration(session: ChatSession) {
		currentSession = session;
		activeSessionId = session.id;
		hasRequestedTitle = false;
		upsertSessionInList(session);
	}

	function upsertToolResult(result: ChatToolResult) {
		const index = currentToolResults.findIndex(
			(item) => item.tool_call_id === result.tool_call_id
		);

		if (index >= 0) {
			const next = [...currentToolResults];
			next[index] = result;
			currentToolResults = next;
		} else {
			currentToolResults = [...currentToolResults, result];
		}
	}

	function finalizeAssistantMessage(usage?: TokenUsage) {
		const sessionIdentifier = currentSession?.id || activeSessionId || '';

		if (currentStreamingMessage || currentToolCalls.length > 0) {
			const assistantMessage: ChatMessage = {
				id: crypto.randomUUID(),
				session_id: sessionIdentifier,
				role: 'assistant',
				content: currentStreamingMessage,
				tool_calls: currentToolCalls.length ? currentToolCalls : null,
				tool_call_id: null,
				metadata: null,
				error_code: null,
				error_message: null,
				prompt_tokens: usage?.prompt_tokens ?? null,
				completion_tokens: usage?.completion_tokens ?? null,
				total_tokens: usage?.total_tokens ?? null,
				created_at: new Date().toISOString()
			} as ChatMessage;

			messages = [...messages, assistantMessage];
		}

		if (currentSession) {
			currentSession = {
				...currentSession,
				updated_at: new Date().toISOString(),
				message_count: (currentSession.message_count ?? 0) + 1,
				tool_call_count: (currentSession.tool_call_count ?? 0) + currentToolCalls.length,
				total_tokens_used:
					(currentSession.total_tokens_used ?? 0) + (usage?.total_tokens ?? 0)
			};
			upsertSessionInList(currentSession);
		}

		resetStreamingState();
		isStreaming = false;
		error = null;
		void generateSessionTitle();
	}

	function resetStreamingState() {
		currentStreamingMessage = '';
		currentToolCalls = [];
		currentToolResults = [];
	}

	async function generateSessionTitle() {
		if (
			hasRequestedTitle ||
			!activeSessionId ||
			!currentSession ||
			(currentSession.title && currentSession.title !== 'Untitled Chat')
		) {
			return;
		}

		const meaningfulMessageCount = messages.filter(
			(message) => message.role === 'user' || message.role === 'assistant'
		).length;

		if (meaningfulMessageCount < 2) return;

		hasRequestedTitle = true;
		if (currentSession) {
			currentSession = {
				...currentSession,
				title: 'Generating title…'
			};
			upsertSessionInList(currentSession);
		}

		try {
			const response = await fetch('/api/chat/generate-title', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					session_id: activeSessionId
				})
			});

			if (!response.ok) {
				hasRequestedTitle = false;
				return;
			}

			const data = await response.json();
			// Backend returns { success: true, data: { title: '...' } }
			if (data?.data?.title) {
				currentSession = {
					...currentSession,
					title: data.data.title
				};
				upsertSessionInList(currentSession);
			} else {
				hasRequestedTitle = false;
				if (currentSession) {
					currentSession = {
						...currentSession,
						title: 'Untitled Chat'
					};
					upsertSessionInList(currentSession);
				}
			}
		} catch (err) {
			console.error('Failed to generate chat title:', err);
			hasRequestedTitle = false;
			if (currentSession) {
				currentSession = {
					...currentSession,
					title: 'Untitled Chat'
				};
				upsertSessionInList(currentSession);
			}
		}
	}
</script>

<Modal
	{isOpen}
	onClose={handleClose}
	size="xl"
	showCloseButton={false}
	ariaLabel="Chat assistant dialog"
>
	{@const VoiceIcon = voiceButtonState.icon}
	<div
		slot="header"
		class="relative z-[60] flex items-center justify-between gap-4 border-b border-slate-200/60 bg-white/90 px-6 py-5 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/85"
	>
		<div class="flex items-center gap-4">
			<div class="hidden h-12 w-12 items-center justify-center rounded-2xl gradient-icon-primary dark:flex">
				<MessageSquare class="h-5 w-5 text-blue-600 dark:text-blue-300" />
			</div>
			<div class="flex flex-col gap-1">
				<h2 class="text-lg font-semibold text-gray-900 dark:text-white">
					{currentSession?.title || 'Chat Assistant'}
				</h2>
				<div class="flex flex-wrap items-center gap-2">
					<Badge
						size="sm"
						class="!rounded-full border border-slate-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-700 shadow-sm backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/80 dark:text-gray-200"
					>
						{contextLabel}
					</Badge>
					<span class="text-[12px] text-gray-500 dark:text-gray-400">
						Tuned for calm, precise collaboration
					</span>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-2">
			<div
				class="relative"
				use:clickOutside={() => {
					showSessionMenu = false;
				}}
			>
				<Button
					variant="ghost"
					size="sm"
					icon={MoreHorizontal}
					aria-label="Chat session actions"
					class="rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90 disabled:opacity-40"
					onclick={toggleSessionMenu}
					aria-haspopup="true"
					aria-expanded={showSessionMenu}
					disabled={!sessionActionId ||
						isStreaming ||
						isCurrentlyRecording ||
						isInitializingRecording ||
						isTranscribing}
				/>

				{#if showSessionMenu}
					<div
						class="absolute right-0 z-[70] mt-3 w-56 rounded-2xl border border-slate-200/60 bg-white/95 p-2 shadow-[0_24px_60px_-32px_rgba(15,23,42,0.4)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95"
					>
						<button
							type="button"
							class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-700 transition-all duration-150 hover:bg-blue-500/10 hover:text-blue-600 dark:text-gray-200 dark:hover:bg-blue-500/20 dark:hover:text-blue-300"
							onclick={openRenameDialog}
						>
							<Pencil class="h-4 w-4" />
							Rename chat
						</button>
						<button
							type="button"
							class="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-500 transition-all duration-150 hover:bg-rose-500/10 dark:hover:bg-rose-500/20"
							onclick={openDeleteDialog}
						>
							<Trash2 class="h-4 w-4" />
							Delete chat
						</button>
					</div>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="sm"
				icon={Plus}
				class="rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90"
				aria-label="Start new chat"
				onclick={clearSession}
			/>
			<Button
				variant="ghost"
				size="sm"
				icon={X}
				class="rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90"
				aria-label="Close chat"
				onclick={handleClose}
			/>
		</div>
	</div>

	<div
		class="relative z-[10] flex h-[min(82vh,820px)] flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90 md:flex-row"
	>
		<aside
			class="order-2 flex w-full flex-shrink-0 flex-col border-t border-slate-200/60 bg-white/80 backdrop-blur-md transition-colors duration-200 dark:border-slate-700/60 dark:bg-slate-900/70 md:order-1 md:w-72 md:border-t-0 md:border-r"
		>
			<div
				class="flex items-center justify-between gap-2 border-b border-slate-200/60 bg-white/60 px-5 py-4 backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/60"
			>
				<div>
					<h3
						class="text-[13px] font-semibold uppercase tracking-[0.18em] text-gray-700 dark:text-gray-200"
					>
						Previous Chats
					</h3>
					<p class="text-[12px] text-gray-500 dark:text-gray-400">
						Resurface a thread or start fresh
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					icon={Plus}
					aria-label="Start new chat"
					onclick={clearSession}
					class="hidden rounded-full border border-slate-200/60 bg-white/70 px-3 py-2 text-sm font-medium text-gray-700 backdrop-blur hover:bg-white/90 md:inline-flex dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90"
				/>
			</div>
			<div class="flex-1 overflow-y-auto">
				{#if isSessionsLoading}
					<div
						class="flex items-center justify-center gap-2 py-12 text-sm text-gray-500 dark:text-gray-400"
					>
						<div
							class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
						></div>
						<span>Loading sessions…</span>
					</div>
				{:else if sessionsError}
					<div class="px-5 py-6 text-sm text-red-600 dark:text-red-400">
						<p>{sessionsError}</p>
						<button
							type="button"
							class="mt-3 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
							onclick={() => loadRecentSessions(true)}
						>
							Try again
						</button>
					</div>
				{:else if recentSessions.length === 0}
					<div class="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
						Your conversations will appear here once you start chatting.
					</div>
				{:else}
					<div class="py-2">
						{#each recentSessions as session (session.id)}
							{@const isActive = activeSessionId === session.id}
							{@const context = getContextMeta(
								session.context_type as ChatContextType | null
							)}
							{@const updatedLabel = formatSessionUpdatedAt(session)}
							<button
								type="button"
								class={`group w-full rounded-2xl border px-5 py-3 text-left transition-all duration-200 ${
									isActive
										? 'border-blue-200/60 gradient-card-primary dark:border-blue-800/60'
										: 'border-transparent hover:border-slate-200/60 hover:bg-white/80 hover:shadow-sm dark:hover:border-slate-700/60 dark:hover:bg-slate-900/60'
								} disabled:cursor-not-allowed disabled:opacity-60`}
								onclick={() => handleSessionSelect(session.id)}
								disabled={isStreaming && activeSessionId !== session.id}
							>
								<div class="flex items-center justify-between gap-2">
									<span
										class={`text-[13.5px] font-semibold ${
											isActive
												? 'text-blue-700 dark:text-blue-200'
												: 'text-gray-800 dark:text-gray-100'
										}`}
									>
										{formatSessionTitle(session)}
									</span>
									{#if updatedLabel}
										<span
											class="text-[11px] font-medium text-gray-500 dark:text-gray-400"
										>
											{updatedLabel}
										</span>
									{/if}
								</div>
								<div
									class="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
								>
									<span
										class={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
											isActive
												? 'border-blue-200/60 bg-blue-50/80 text-blue-700 shadow-sm dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-200'
												: 'border-slate-200/60 bg-white/70 text-gray-600 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-gray-300'
										}`}
									>
										{context.badge}
									</span>
									{#if session.message_count}
										<span
											>{session.message_count} msg{session.message_count === 1
												? ''
												: 's'}</span
										>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</aside>

		{#if showingContextSelection}
			<!-- Context Selection Screen -->
			<div class="order-1 flex flex-1 flex-col items-center justify-center md:order-2">
				<ContextSelectionScreen on:select={handleContextSelect} />
			</div>
		{:else}
			<!-- Main Chat Interface -->
			<div class="order-1 flex flex-1 flex-col md:order-2">
				<div
					bind:this={messagesContainer}
					class="chat-scroll relative flex-1 space-y-4 overflow-y-auto px-6 py-6 bg-white/70 backdrop-blur-sm dark:bg-slate-900/70"
				>
					{#if isLoading}
						<div class="flex justify-center py-12">
							<div
								class="h-10 w-10 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
								aria-hidden="true"
							></div>
						</div>
					{:else if messages.length === 0 && !isStreaming}
						<div
							class="flex flex-col items-center justify-center gap-4 py-16 text-center text-gray-600 dark:text-gray-300"
						>
							<div class="relative">
								<div class="absolute inset-0 animate-pulse rounded-3xl gradient-glow-primary blur-xl"></div>
								<div class="relative flex h-16 w-16 items-center justify-center rounded-2xl gradient-icon-primary">
									<MessageSquare
										class="h-7 w-7 text-blue-600 dark:text-blue-300"
									/>
								</div>
							</div>
							<h3 class="text-lg font-semibold text-gray-800 dark:text-white">
								Start a calm, focused conversation
							</h3>
							<p
								class="max-w-sm text-sm leading-relaxed text-gray-500 dark:text-gray-400"
							>
								Ask about your projects, tasks, or calendar. I'll surface what
								matters first, then refine with you.
							</p>
						</div>
					{:else}
						{#each messages as message (message.id)}
							<ChatMessageComponent {message} />
						{/each}

						{#if isStreaming && currentStreamingMessage}
							<ChatMessageComponent
								message={{
									id: 'streaming',
									session_id: currentSession?.id || activeSessionId || '',
									role: 'assistant',
									content: currentStreamingMessage,
									tool_calls: null,
									tool_call_id: null,
									metadata: {},
									error_code: null,
									error_message: null,
									prompt_tokens: null,
									completion_tokens: null,
									total_tokens: null,
									created_at: new Date().toISOString()
								} as ChatMessage}
								{isStreaming}
							/>
						{/if}

						{#if currentToolCalls.length > 0}
							<ToolVisualization
								toolCalls={currentToolCalls}
								toolResults={currentToolResults}
								isExecuting={isStreaming}
							/>
						{/if}
					{/if}

					{#if error}
						<div
							class="rounded-2xl border border-rose-200/60 bg-rose-50/80 p-3 text-sm text-rose-600 shadow-[0_10px_32px_-24px_rgba(244,63,94,0.45)] dark:border-rose-800/50 dark:bg-rose-900/20 dark:text-rose-300"
							role="alert"
						>
							{error}
						</div>
					{/if}
				</div>

				<div
					class="border-t border-slate-200/60 bg-white/85 px-4 py-5 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/85 sm:px-6"
				>
					<form
						onsubmit={(e) => {
							e.preventDefault();
							sendMessage();
						}}
						class="space-y-3"
					>
						<div class="relative">
							<div
								class="relative rounded-[28px] border border-slate-200/60 bg-white/90 shadow-[0_12px_32px_-20px_rgba(15,23,42,0.4)] transition duration-200 ease-out focus-within:border-blue-300 focus-within:shadow-[0_20px_48px_-24px_rgba(59,130,246,0.45)] focus-within:ring-1 focus-within:ring-blue-200/40 dark:border-slate-700/60 dark:bg-slate-900/80 dark:shadow-[0_20px_40px_-24px_rgba(15,23,42,0.6)] dark:focus-within:border-blue-500/40 dark:focus-within:ring-blue-500/20"
							>
								<Textarea
									bind:value={inputValue}
									class="border-none bg-transparent px-6 py-4 pr-[7.25rem] text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
									placeholder="Ask anything about your work, projects, or ideas…"
									autoResize
									rows={1}
									maxRows={8}
									disabled={isStreaming || isInitializingRecording}
									onkeydown={handleKeyDown}
								/>

								<div class="absolute inset-y-1 right-2 flex items-end gap-2">
									<button
										type="button"
										class={`group relative flex h-11 w-11 items-center justify-center rounded-full border text-gray-700 shadow-sm backdrop-blur transition-all duration-200 ease-out hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 dark:text-gray-200 ${
											voiceButtonState.variant === 'recording'
												? 'border-rose-300 bg-gradient-to-br from-rose-500 via-rose-500/95 to-rose-500/90 text-white shadow-[0_16px_32px_-20px_rgba(244,63,94,0.6)]'
												: voiceButtonState.variant === 'prompt'
													? 'border-blue-200 gradient-badge-blue dark:border-blue-700'
													: 'border-slate-200/60 bg-white/70 hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:hover:bg-slate-900/90'
										} ${voiceButtonState.disabled ? 'opacity-50 cursor-not-allowed hover:scale-100' : ''}`}
										onclick={(event) => {
											event.preventDefault();
											void handleVoiceToggle();
										}}
										aria-label={voiceButtonState.label}
										title={voiceButtonState.label}
										disabled={voiceButtonState.disabled}
									>
										<VoiceIcon
											class={`h-5 w-5 ${voiceButtonState.isLoading ? 'animate-spin' : ''}`}
										/>
									</button>

									<button
										type="submit"
										class="flex h-12 w-12 items-center justify-center rounded-full gradient-btn-primary"
										aria-label="Send message"
										disabled={isSendDisabled}
									>
										<Send class="h-5 w-5" />
									</button>
								</div>
							</div>
						</div>

						<div
							class="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-gray-500 dark:text-gray-400"
						>
							<div class="flex flex-wrap items-center gap-3">
								{#if isCurrentlyRecording}
									<span
										class="flex items-center gap-2 text-rose-500 dark:text-rose-400"
									>
										<span
											class="relative flex h-2.5 w-2.5 items-center justify-center"
										>
											<span
												class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/60"
											></span>
											<span
												class="relative inline-flex h-2 w-2 rounded-full bg-rose-500"
											></span>
										</span>
										<span class="flex items-center gap-1">
											Listening
											<span class="font-semibold tracking-wide">
												{formatDuration(recordingDuration)}
											</span>
										</span>
									</span>
								{:else if isTranscribing}
									<span class="flex items-center gap-2">
										<Loader2 class="h-4 w-4 animate-spin" />
										<span>Transcribing your voice note…</span>
									</span>
								{:else}
									<span>Press Enter to send · Shift + Enter for a new line</span>
								{/if}

								{#if canUseLiveTranscript && isCurrentlyRecording}
									<span
										class="hidden rounded-full border border-blue-200/40 bg-blue-50/60 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-500 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 sm:inline"
									>
										Live transcript
									</span>
								{/if}
							</div>

							{#if voiceError}
								<span
									role="alert"
									class="flex items-center gap-2 rounded-full bg-rose-50/80 px-3 py-1 text-rose-500 dark:bg-rose-900/20 dark:text-rose-300"
								>
									{voiceError}
								</span>
							{/if}
						</div>
					</form>

					{#if isStreaming}
						<div
							class="mt-4 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400"
							aria-live="polite"
						>
							<div class="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
							<span>Assistant is composing a response…</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		{#if sessionDialog}
			<div
				class="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-xl dark:bg-slate-950/85"
				role="presentation"
			>
				<div
					bind:this={sessionDialogElement}
					class="w-[min(92%,420px)] rounded-3xl border border-slate-200/60 bg-white/95 p-6 shadow-[0_32px_90px_-42px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/95"
					role="dialog"
					aria-modal="true"
					aria-labelledby={sessionDialog === 'rename'
						? 'chat-session-rename-title'
						: 'chat-session-delete-title'}
					tabindex="-1"
					onkeydown={(event) => {
						if (event.key === 'Escape' && !isSessionActionLoading) {
							event.preventDefault();
							closeSessionDialogs();
						}
					}}
				>
					{#if sessionDialog === 'rename'}
						<form class="space-y-5" onsubmit={submitRenameSession}>
							<div>
								<h3
									id="chat-session-rename-title"
									class="text-base font-semibold text-gray-900 dark:text-white"
								>
									Rename chat
								</h3>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Give this conversation a name you will recognize later.
								</p>
							</div>
							<label class="block">
								<span class="sr-only">Chat name</span>
								<input
									bind:this={renameInputElement}
									type="text"
									class="w-full rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-200/40 dark:border-slate-700/70 dark:bg-slate-900/80 dark:text-gray-100 dark:focus:border-blue-500 dark:focus:ring-blue-500/30"
									bind:value={renameInputValue}
									placeholder="Project catch-up, Strategy sync…"
									maxlength="120"
									spellcheck="false"
									aria-invalid={sessionActionError ? 'true' : 'false'}
									onkeydown={(event) => {
										if (event.key === 'Escape') {
											event.preventDefault();
											closeSessionDialogs();
										}
									}}
								/>
							</label>
							{#if sessionActionError}
								<p class="text-sm text-rose-500" role="alert">
									{sessionActionError}
								</p>
							{/if}
							<div class="flex items-center justify-end gap-3">
								<button
									type="button"
									class="rounded-full border border-slate-200/60 bg-white/70 px-5 py-2 text-sm font-medium text-gray-700 backdrop-blur transition hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90 disabled:cursor-not-allowed disabled:opacity-60"
									onclick={closeSessionDialogs}
									disabled={isSessionActionLoading}
								>
									Cancel
								</button>
								<button
									type="submit"
									class="rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(59,130,246,0.6)] transition hover:scale-[1.02] hover:shadow-[0_16px_32px_-14px_rgba(79,70,229,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
									disabled={isSessionActionLoading || !renameInputValue.trim()}
								>
									{isSessionActionLoading ? 'Saving…' : 'Save'}
								</button>
							</div>
						</form>
					{:else}
						<div class="space-y-5">
							<div>
								<h3
									id="chat-session-delete-title"
									class="text-base font-semibold text-gray-900 dark:text-white"
								>
									Delete chat
								</h3>
								<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
									This removes the entire conversation and its history. This
									action cannot be undone.
								</p>
							</div>
							{#if sessionActionError}
								<p class="text-sm text-rose-500" role="alert">
									{sessionActionError}
								</p>
							{/if}
							<div class="flex items-center justify-end gap-3">
								<button
									type="button"
									class="rounded-full border border-slate-200/60 bg-white/70 px-5 py-2 text-sm font-medium text-gray-700 backdrop-blur transition hover:bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/70 dark:text-gray-200 dark:hover:bg-slate-900/90 disabled:cursor-not-allowed disabled:opacity-60"
									onclick={closeSessionDialogs}
									disabled={isSessionActionLoading}
								>
									Cancel
								</button>
								<button
									type="button"
									class="rounded-full bg-gradient-to-r from-rose-500 to-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-[0_12px_28px_-16px_rgba(244,63,94,0.6)] transition hover:scale-[1.02] hover:shadow-[0_16px_32px_-14px_rgba(225,29,72,0.6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
									onclick={confirmDeleteSession}
									disabled={isSessionActionLoading}
								>
									{isSessionActionLoading ? 'Deleting…' : 'Delete'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</Modal>

<style>
	.chat-scroll {
		scrollbar-gutter: stable;
	}

	:global(.chat-scroll::-webkit-scrollbar) {
		width: 8px;
	}

	:global(.chat-scroll::-webkit-scrollbar-track) {
		background: rgb(243 244 246);
	}

	:global(.chat-scroll::-webkit-scrollbar-thumb) {
		background: rgb(209 213 219);
		border-radius: 4px;
	}

	:global(.dark .chat-scroll::-webkit-scrollbar-track) {
		background: rgb(31 41 55);
	}

	:global(.dark .chat-scroll::-webkit-scrollbar-thumb) {
		background: rgb(75 85 99);
	}

	:global(.chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: rgb(156 163 175);
	}

	:global(.dark .chat-scroll::-webkit-scrollbar-thumb:hover) {
		background: rgb(107 114 128);
	}
</style>
