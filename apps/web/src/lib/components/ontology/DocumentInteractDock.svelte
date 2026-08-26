<!-- apps/web/src/lib/components/ontology/DocumentInteractDock.svelte -->
<script lang="ts">
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';
	import type {
		DataMutationSummary,
		DocumentMutationEvent
	} from '$lib/components/agent/agent-chat.types';
	import { FileText, LoaderCircle, MessageCircle, X } from '$lib/icons/lucide';

	type AgentChatModalComponent =
		typeof import('$lib/components/agent/AgentChatModal.svelte').default;

	interface Props {
		isOpen?: boolean;
		projectId: string;
		projectName: string;
		documentId: string;
		documentTitle: string;
		placement?: 'viewport' | 'container' | 'inline';
		onClose?: (summary?: DataMutationSummary) => void;
		onDocumentMutation?: (event: DocumentMutationEvent) => void;
	}

	let {
		isOpen = $bindable(false),
		projectId,
		projectName,
		documentId,
		documentTitle,
		placement = 'viewport',
		onClose,
		onDocumentMutation
	}: Props = $props();

	let ChatComponent = $state<AgentChatModalComponent | null>(null);
	let isLoading = $state(false);
	let loadError = $state('');

	const focus = $derived.by(
		(): ProjectFocus => ({
			focusType: 'document',
			focusEntityId: documentId,
			focusEntityName: documentTitle || 'Untitled Document',
			projectId,
			projectName: projectName || 'Project'
		})
	);
	const placementClasses = $derived.by(() => {
		switch (placement) {
			case 'inline':
				return 'relative h-[clamp(15rem,34dvh,24rem)] w-full shrink-0 border-x-0 border-b-0';
			case 'container':
				return 'absolute inset-x-2 bottom-2 h-[min(72dvh,42rem)] sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[24rem]';
			case 'viewport':
			default:
				return 'fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] h-[min(72dvh,42rem)] sm:inset-x-auto sm:left-4 sm:bottom-4 sm:w-[24rem] lg:left-6';
		}
	});
	const surfaceClasses = $derived(
		placement === 'inline'
			? 'rounded-none border-t border-border-strong shadow-none'
			: 'rounded-lg border border-border shadow-ink-strong'
	);

	async function loadChat() {
		if (ChatComponent || isLoading) return;
		isLoading = true;
		loadError = '';
		try {
			const module = await import('$lib/components/agent/AgentChatModal.svelte');
			ChatComponent = module.default;
		} catch (error) {
			console.error('[DocumentInteractDock] Failed to load agent chat', error);
			loadError = 'Document interaction could not be loaded.';
		} finally {
			isLoading = false;
		}
	}

	function closeDock() {
		isOpen = false;
	}

	function handleChatClose(summary?: DataMutationSummary) {
		isOpen = false;
		onClose?.(summary);
	}

	$effect(() => {
		if (isOpen) void loadChat();
	});
</script>

{#if isOpen || ChatComponent}
	<aside
		id="document-interact-dock"
		data-placement={placement}
		class={`${placementClasses} ${surfaceClasses} z-50 min-h-0 flex-col overflow-hidden bg-card tx tx-frame tx-weak motion-reduce:animate-none motion-reduce:transition-none
			${isOpen ? 'flex animate-ink-in' : 'hidden'}`}
		aria-label="Document interaction"
		aria-hidden={!isOpen}
		inert={!isOpen}
	>
		<header
			class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-card px-3"
		>
			<div class="flex min-w-0 items-center gap-2 text-muted-foreground">
				<MessageCircle class="h-3.5 w-3.5 shrink-0" />
				<p class="micro-label truncate">DOCUMENT CHAT</p>
			</div>
			<button
				type="button"
				onclick={closeDock}
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Close document interaction"
			>
				<X class="h-4 w-4" />
			</button>
		</header>

		<div class="min-h-0 flex-1 overflow-hidden bg-card">
			{#if ChatComponent}
				{@const ChatModal = ChatComponent}
				<ChatModal
					{isOpen}
					embedded={true}
					initialProjectFocus={focus}
					autoSendVoiceOnStop={true}
					conversationOnly={true}
					composerPlaceholder="Ask about or update this document..."
					{onDocumentMutation}
					onClose={handleChatClose}
				/>
			{:else if loadError}
				<div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
					<span
						class="flex h-10 w-10 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive"
					>
						<FileText class="h-5 w-5" />
					</span>
					<p class="text-sm font-medium text-foreground">{loadError}</p>
					<button
						type="button"
						onclick={loadChat}
						class="rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground shadow-ink pressable hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						Try again
					</button>
				</div>
			{:else}
				<div
					class="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"
					aria-live="polite"
				>
					<LoaderCircle class="h-4 w-4 animate-spin motion-reduce:animate-none" />
					<span>Preparing document interaction…</span>
				</div>
			{/if}
		</div>
	</aside>
{/if}

<style>
	/* A bottom dock can be much wider than the floating launcher. Keep message
	   lines readable without giving up the available width. */
	@media (min-width: 768px) {
		aside[data-placement='inline'] :global(.agent-chat-scroll > *) {
			width: min(100%, 56rem);
			margin-inline: auto;
		}
	}
</style>
