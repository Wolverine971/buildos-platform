<!-- apps/web/src/lib/components/agent/AgentModal.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createEventDispatcher } from 'svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import ChatInterface from './ChatInterface.svelte';
	import OperationsLog from './OperationsLog.svelte';
	import OperationsQueue from './OperationsQueue.svelte';
	import DraftsList from './DraftsList.svelte';
	import type {
		AgentChatType,
		ProjectDraft,
		ChatOperation,
		AgentSSEMessage
	} from '@buildos/shared-types';
	import { supabase } from '$lib/supabase';
	import { formatRelativeTime } from '$lib/utils/date-utils';

	// Props using Svelte 5 syntax
	interface Props {
		chatType?: AgentChatType;
		entityId?: string | null;
		onClose: () => void;
	}

	let { chatType = 'project_create', entityId = null, onClose }: Props = $props();

	// State using Svelte 5 $state rune for reactivity
	let autoAcceptOperations = $state(false); // Default false per requirements
	let operations = $state<ChatOperation[]>([]);
	let queuedOperations = $state<ChatOperation[]>([]);
	let drafts = $state<ProjectDraft[]>([]);
	let resumableDraft = $state<ProjectDraft | null>(null);
	let sessionId = $state<string | null>(null);
	let isLoading = $state(false);

	// Panel collapse states
	let showOperationsLog = $state(true);
	let showOperationsQueue = $state(true);
	let showLeftPanel = $state(false); // Collapsed by default
	let showRightPanel = $state(false); // Collapsed by default

	// Dispatcher
	const dispatch = createEventDispatcher();

	// Check for resumable sessions on mount
	onMount(async () => {
		await checkResumableSessions();

		// Auto-save on page unload
		window.addEventListener('beforeunload', handleBeforeUnload);
	});

	onDestroy(() => {
		window.removeEventListener('beforeunload', handleBeforeUnload);
	});

	// Check for resumable drafts
	async function checkResumableSessions() {
		const user = await supabase.auth.getUser();
		if (!user.data.user) return;

		const { data: drafts } = await supabase
			.from('project_drafts')
			.select('*')
			.eq('user_id', user.data.user.id)
			.is('completed_at', null)
			.order('updated_at', { ascending: false })
			.limit(1);

		if (drafts?.length && isRecent(drafts[0].updated_at)) {
			resumableDraft = drafts[0] as ProjectDraft;
		}

		// Load all user drafts
		await loadUserDrafts();
	}

	// Check if a date is recent (within 24 hours)
	function isRecent(dateString: string): boolean {
		const date = new Date(dateString);
		const now = new Date();
		const hoursDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
		return hoursDiff < 24;
	}

	// Load user's drafts
	async function loadUserDrafts() {
		const user = await supabase.auth.getUser();
		if (!user.data.user) return;

		const { data } = await supabase
			.from('project_drafts')
			.select(
				`
        *,
        draft_tasks(*)
      `
			)
			.eq('user_id', user.data.user.id)
			.is('completed_at', null)
			.order('updated_at', { ascending: false });

		if (data) {
			drafts = data as unknown as ProjectDraft[];
		}
	}

	// Resume a session with a draft
	async function resumeSession(draft: ProjectDraft) {
		if (!draft.chat_session_id) return;

		sessionId = draft.chat_session_id;
		resumableDraft = null;

		// Load session operations
		await loadSessionOperations(sessionId);
	}

	// Start fresh session
	async function startFresh() {
		resumableDraft = null;
		sessionId = null;
	}

	// Load operations for a session
	async function loadSessionOperations(sessionId: string) {
		const { data } = await supabase
			.from('chat_operations')
			.select('*')
			.eq('chat_session_id', sessionId)
			.order('created_at', { ascending: true });

		if (data) {
			const allOps = data as unknown as ChatOperation[];
			operations = allOps.filter((op) => op.status === 'completed');
			queuedOperations = allOps.filter(
				(op) => op.status === 'queued' || op.status === 'pending'
			);
		}
	}

	// Handle operation event from chat
	function handleOperation(event: CustomEvent<ChatOperation>) {
		operations = [...operations, event.detail];
	}

	// Handle queue event from chat
	function handleQueue(event: CustomEvent<ChatOperation[]>) {
		queuedOperations = event.detail;
	}

	// Approve a single operation
	async function approveOperation(op: ChatOperation) {
		// Execute the operation
		const response = await fetch('/api/agent/operations/execute', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ operationId: op.id })
		});

		if (response.ok) {
			// Move from queue to completed
			queuedOperations = queuedOperations.filter((o) => o.id !== op.id);
			operations = [...operations, { ...op, status: 'completed' }];
		}
	}

	// Approve all operations
	async function approveAllOperations() {
		for (const op of queuedOperations) {
			await approveOperation(op);
		}
	}

	// Edit an operation
	function editOperation(op: ChatOperation) {
		// Open edit modal (to be implemented)
		dispatch('editOperation', op);
	}

	// Load a draft
	function loadDraft(draft: ProjectDraft) {
		if (draft.chat_session_id) {
			resumeSession(draft);
		}
	}

	// Handle before unload
	async function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (sessionId && hasUnsavedChanges()) {
			// Save draft state
			await saveDraftState();
		}
	}

	// Check if there are unsaved changes
	function hasUnsavedChanges(): boolean {
		return queuedOperations.length > 0;
	}

	// Save draft state
	async function saveDraftState() {
		if (!sessionId) return;

		// Update session metadata
		await supabase
			.from('chat_sessions')
			.update({
				agent_metadata: {
					has_unsaved_operations: queuedOperations.length > 0,
					last_save: new Date().toISOString()
				}
			})
			.eq('id', sessionId);
	}
</script>

<Modal isOpen={true} {onClose} size="xl" closeOnEscape={true}>
	<!-- Resume Dialog -->
	{#if resumableDraft}
		<Modal isOpen={true} onClose={() => (resumableDraft = null)} size="md">
			<div slot="header">
				<h2 class="text-xl font-semibold text-slate-900 dark:text-white">
					Continue Previous Session?
				</h2>
			</div>

			<div class="space-y-4 p-4 sm:p-6">
				<p class="text-sm text-slate-600 dark:text-slate-300">
					You have an in-progress project:
				</p>

				<div
					class="rounded-xl border border-slate-200/60 bg-white p-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900"
				>
					<div class="space-y-2">
						<h3 class="text-lg font-semibold text-slate-900 dark:text-white">
							📝 {resumableDraft.name || 'Untitled Project'}
						</h3>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Last edited: {formatRelativeTime(resumableDraft.updated_at)}
						</p>
						<p class="text-sm text-slate-600 dark:text-slate-400">
							Progress: {resumableDraft.dimensions_covered?.length || 0}/9 dimensions
						</p>
					</div>
				</div>

				<div class="flex flex-col gap-2 sm:flex-row">
					<Button
						on:click={() => resumeSession(resumableDraft)}
						variant="primary"
						size="md"
					>
						Continue Session
					</Button>
					<Button variant="secondary" size="md" on:click={() => startFresh()}>
						Start Fresh
					</Button>
				</div>
			</div>
		</Modal>
	{/if}

	<!-- Main Agent Interface -->
	<div class="flex h-[92vh] gap-0 overflow-hidden">
		<!-- LEFT PANEL - Drafts/Sessions (Collapsible) -->
		<div
			class="hidden lg:flex flex-col border-r border-slate-200/60 bg-gradient-to-b from-slate-50 to-slate-100 backdrop-blur-sm transition-all duration-300 ease-out motion-reduce:transition-none dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800 {showLeftPanel
				? 'w-80'
				: 'w-12'}"
		>
			{#if showLeftPanel}
				<!-- Expanded State -->
				<div class="flex h-full flex-col overflow-hidden">
					<div
						class="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-slate-700/60"
					>
						<h3
							class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							{chatType === 'project_create' ? 'Drafts' : 'Sessions'}
						</h3>
						<button
							on:click={() => (showLeftPanel = false)}
							class="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
							title="Collapse panel"
						>
							<svg
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 19l-7-7 7-7"
								/>
							</svg>
						</button>
					</div>
					<div class="flex-1 overflow-hidden">
						{#if chatType === 'project_create'}
							<DraftsList {drafts} onSelect={loadDraft} onRefresh={loadUserDrafts} />
						{:else if chatType === 'project_update'}
							<div class="p-4">
								<p class="text-sm text-slate-600 dark:text-slate-400">
									Previous conversations about this project
								</p>
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Collapsed State -->
				<button
					on:click={() => (showLeftPanel = true)}
					class="flex h-full flex-col items-center justify-center gap-4 px-2 py-8 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
					title="Show drafts"
				>
					<svg
						class="h-5 w-5 text-slate-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
						/>
					</svg>
					{#if drafts.length > 0}
						<Badge variant="info" size="sm">{drafts.length}</Badge>
					{/if}
				</button>
			{/if}
		</div>

		<!-- CENTER: CHAT (Hero Panel) -->
		<div class="flex min-w-0 flex-1 flex-col bg-white dark:bg-slate-900">
			<!-- Chat Header -->
			<div
				class="flex items-center justify-between border-b border-slate-200/60 bg-white/90 px-4 py-2 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/90 sm:px-6 sm:py-3"
			>
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<h2
						class="truncate text-sm font-semibold text-slate-900 dark:text-white sm:text-base"
					>
						{chatType === 'project_create'
							? 'Create Project'
							: chatType === 'project_update'
								? 'Update Project'
								: chatType === 'project_audit'
									? 'Audit Project'
									: 'Forecast Project'}
					</h2>
					{#if sessionId}
						<span
							class="hidden rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 sm:inline-block"
						>
							Active
						</span>
					{/if}
				</div>
				<div class="flex items-center gap-2">
					<!-- Toggle buttons for mobile -->
					<div class="flex gap-1 lg:hidden">
						{#if drafts.length > 0}
							<button
								on:click={() => (showLeftPanel = !showLeftPanel)}
								class="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
								title="Toggle drafts"
							>
								<svg
									class="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
									/>
								</svg>
							</button>
						{/if}
						{#if operations.length > 0 || queuedOperations.length > 0}
							<button
								on:click={() => (showRightPanel = !showRightPanel)}
								class="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
								title="Toggle operations"
							>
								<svg
									class="h-5 w-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
									/>
								</svg>
							</button>
						{/if}
					</div>
				</div>
			</div>

			<!-- Chat Interface -->
			<div
				class="flex-1 overflow-hidden bg-gradient-to-b from-slate-50/50 to-white dark:from-slate-900/50 dark:to-slate-900"
			>
				<ChatInterface
					{chatType}
					{entityId}
					{sessionId}
					{autoAcceptOperations}
					on:operation={handleOperation}
					on:queue={handleQueue}
					on:sessionCreated={(e) => (sessionId = e.detail)}
				/>
			</div>

			<!-- Chat Footer -->
			<div
				class="border-t border-slate-200/60 bg-slate-50/90 px-4 py-3 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-800/90 sm:px-6"
			>
				<label
					class="flex cursor-pointer items-center gap-3 text-xs text-slate-700 dark:text-slate-300 sm:text-sm"
				>
					<input
						type="checkbox"
						bind:checked={autoAcceptOperations}
						class="h-4 w-4 rounded border-slate-300 text-blue-600 transition-colors focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-slate-600 dark:bg-slate-800"
					/>
					<span class="font-medium">Auto-accept operations</span>
				</label>
			</div>
		</div>

		<!-- RIGHT PANEL - Operations (Collapsible) -->
		<div
			class="hidden lg:flex flex-col border-l border-slate-200/60 bg-gradient-to-b from-slate-50 to-slate-100 backdrop-blur-sm transition-all duration-300 ease-out motion-reduce:transition-none dark:border-slate-700/60 dark:from-slate-900 dark:to-slate-800 {showRightPanel
				? 'w-80'
				: 'w-12'}"
		>
			{#if showRightPanel}
				<!-- Expanded State -->
				<div class="flex h-full flex-col overflow-hidden">
					<div
						class="flex items-center justify-between border-b border-slate-200/60 px-4 py-3 dark:border-slate-700/60"
					>
						<h3
							class="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
						>
							Operations
						</h3>
						<button
							on:click={() => (showRightPanel = false)}
							class="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
							title="Collapse panel"
						>
							<svg
								class="h-4 w-4"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
						</button>
					</div>
					<div class="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
						<!-- Operations Log -->
						<div
							class="flex flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900"
						>
							<button
								class="flex items-center justify-between border-b border-slate-200/60 bg-blue-50 px-3 py-2 text-left transition-colors hover:bg-blue-100 dark:border-slate-700/60 dark:bg-blue-950/30 dark:hover:bg-blue-950/40"
								on:click={() => (showOperationsLog = !showOperationsLog)}
								aria-label={showOperationsLog
									? 'Collapse operations log'
									: 'Expand operations log'}
							>
								<span
									class="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white"
								>
									<span class="text-slate-400"
										>{showOperationsLog ? '▼' : '▶'}</span
									>
									<span>Log</span>
									{#if operations.length > 0}
										<Badge variant="info" size="sm">{operations.length}</Badge>
									{/if}
								</span>
							</button>
							{#if showOperationsLog}
								<div class="max-h-96 overflow-y-auto">
									<OperationsLog {operations} />
								</div>
							{/if}
						</div>

						<!-- Operations Queue -->
						{#if !autoAcceptOperations && queuedOperations.length > 0}
							<div
								class="flex flex-col overflow-hidden rounded-lg border border-amber-200/60 bg-amber-50 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20"
							>
								<button
									class="flex items-center justify-between border-b border-amber-200/60 bg-amber-100 px-3 py-2 text-left transition-colors hover:bg-amber-200 dark:border-amber-800/40 dark:bg-amber-950/30 dark:hover:bg-amber-950/40"
									on:click={() => (showOperationsQueue = !showOperationsQueue)}
									aria-label={showOperationsQueue
										? 'Collapse operations queue'
										: 'Expand operations queue'}
								>
									<span
										class="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-white"
									>
										<span class="text-amber-400"
											>{showOperationsQueue ? '▼' : '▶'}</span
										>
										<span>Queue</span>
										<Badge variant="warning" size="sm"
											>{queuedOperations.length}</Badge
										>
									</span>
								</button>
								{#if showOperationsQueue}
									<div class="max-h-96 overflow-y-auto">
										<OperationsQueue
											operations={queuedOperations}
											onApprove={approveOperation}
											onApproveAll={approveAllOperations}
											onEdit={editOperation}
										/>
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Collapsed State -->
				<button
					on:click={() => (showRightPanel = true)}
					class="flex h-full flex-col items-center justify-center gap-4 px-2 py-8 transition-colors hover:bg-slate-100/50 dark:hover:bg-slate-800/50"
					title="Show operations"
				>
					<svg
						class="h-5 w-5 text-slate-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
					</svg>
					{#if operations.length > 0}
						<Badge variant="info" size="sm">{operations.length}</Badge>
					{/if}
					{#if queuedOperations.length > 0}
						<Badge variant="warning" size="sm">{queuedOperations.length}</Badge>
					{/if}
				</button>
			{/if}
		</div>
	</div>
</Modal>
