<!-- apps/web/src/lib/components/agent/AgentChatHeader.svelte -->
<!-- INKPRINT Design System: Header component with Frame texture -->
<script lang="ts">
	import { X, ExternalLink, ArrowLeft } from 'lucide-svelte';
	import ProjectFocusIndicator from './ProjectFocusIndicator.svelte';
	import type { ChatContextType } from '@buildos/shared-types';
	import type { ProjectFocus } from '$lib/types/agent-chat-enhancement';

	interface Props {
		selectedContextType: ChatContextType | null;
		displayContextLabel: string;
		displayContextSubtitle: string;
		isStreaming: boolean;
		showBackButton: boolean;
		onBack: () => void;
		onClose?: () => void;
		projectId?: string;
		resolvedProjectFocus: ProjectFocus | null;
		onChangeFocus: () => void;
		onClearFocus: () => void;
		ontologyLoaded: boolean;
		hasActiveThinkingBlock: boolean;
		currentActivity: string;
	}

	let {
		selectedContextType,
		displayContextLabel,
		displayContextSubtitle,
		isStreaming,
		showBackButton,
		onBack,
		onClose,
		projectId,
		resolvedProjectFocus,
		onChangeFocus,
		onClearFocus,
		ontologyLoaded,
		hasActiveThinkingBlock,
		currentActivity
	}: Props = $props();

	const isProjectContext = $derived.by(
		() =>
			selectedContextType === 'project' ||
			selectedContextType === 'project_audit' ||
			selectedContextType === 'project_forecast'
	);

	// Determine project URL based on context
	const projectUrl = $derived(projectId ? `/projects/${projectId}` : null);
</script>

<!-- INKPRINT compact header: fixed 48px height with Frame texture for structural hierarchy -->
<div class="flex h-12 items-center gap-2 px-3 sm:px-4 tx tx-frame tx-weak">
	<!-- Back button with INKPRINT outline style -->
	{#if showBackButton}
		<button
			type="button"
			class="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition pressable hover:border-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={onBack}
			disabled={isStreaming}
			aria-label="Go back"
		>
			<ArrowLeft class="h-4 w-4" strokeWidth={2.5} />
		</button>
	{/if}

	<!-- Brain-bolt icon -->
	<div class="relative shrink-0">
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="h-7 w-7 rounded-lg object-cover shadow-ink dark:hidden"
		/>
		<img
			src="/brain-bolt.png"
			alt="BuildOS Assistant"
			class="hidden h-7 w-7 rounded-lg object-cover shadow-ink dark:block"
		/>
	</div>

	<!-- Title & Focus Section -->
	<div class="flex min-w-0 flex-1 items-center gap-2">
		{#if selectedContextType}
			<h2 class="truncate text-sm font-semibold text-foreground">
				{displayContextLabel}
			</h2>
		{:else}
			<!-- BuildOS with accent color -->
			<h2 class="inline-flex items-baseline gap-[0.05em] text-sm font-bold tracking-tight">
				<span class="text-foreground">Build</span>
				<span class="text-accent">OS</span>
				<span class="ml-1 text-sm font-semibold text-foreground">Assistant</span>
			</h2>
		{/if}

		{#if selectedContextType}
			<span class="hidden text-muted-foreground sm:inline">•</span>

			{#if resolvedProjectFocus}
				<!-- Hide project-wide indicator on mobile to give more room for project title -->
				<span
					class={resolvedProjectFocus.focusType === 'project-wide'
						? 'hidden sm:inline-flex'
						: 'inline-flex'}
				>
					<ProjectFocusIndicator
						focus={resolvedProjectFocus}
						{onChangeFocus}
						{onClearFocus}
					/>
				</span>
			{:else}
				<span class="hidden truncate text-xs text-muted-foreground sm:inline">
					{displayContextSubtitle || 'Ready to assist'}
				</span>
			{/if}
		{:else}
			<span class="hidden text-muted-foreground sm:inline">•</span>
			<span class="hidden truncate text-xs text-muted-foreground sm:inline">
				{displayContextSubtitle}
			</span>
		{/if}
	</div>

	<!-- Right side: Status pills, Project link, Close button -->
	<div class="flex shrink-0 items-center gap-2">
		<!-- INKPRINT status pills with micro-label styling -->
		{#if ontologyLoaded || (currentActivity && !hasActiveThinkingBlock)}
			<div class="flex items-center gap-2">
				{#if ontologyLoaded}
					<span
						class="micro-label rounded-lg border border-purple-600/30 bg-purple-50 px-2.5 py-1.5 text-purple-700 tx tx-thread tx-weak dark:bg-purple-950/30 dark:text-purple-400"
					>
						ONTO
					</span>
				{/if}

				{#if currentActivity && !hasActiveThinkingBlock}
					<span
						class="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
						title={currentActivity}
					></span>
				{/if}
			</div>
		{/if}

		<!-- INKPRINT project link button -->
		{#if isProjectContext && projectUrl}
			<a
				href={projectUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="flex h-7 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[0.65rem] font-semibold uppercase tracking-[0.15em] text-muted-foreground shadow-ink transition-all pressable hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				title="Open project in new tab"
			>
				<ExternalLink class="h-3.5 w-3.5 shrink-0" />
				<span class="hidden sm:inline">View</span>
			</a>
		{/if}

		<!-- INKPRINT close button -->
		{#if onClose}
			<button
				type="button"
				onclick={onClose}
				class="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
				aria-label="Close modal"
			>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>
</div>
