<!-- apps/web/src/lib/components/today/TodayAgendaRow.svelte -->
<script lang="ts">
	import {
		AlertCircle,
		Calendar,
		Check,
		FolderKanban,
		MessageCircle,
		SquarePen
	} from '$lib/icons/lucide';

	interface Props {
		kind: 'event' | 'task';
		title: string;
		/** Rail label for timed entries, e.g. "12:00 PM" */
		timeLabel?: string | null;
		/** Secondary line, e.g. "12:00 – 1:00 PM · Marketing Site" */
		metaLabel?: string | null;
		stateKey?: string | null;
		/** A surrounding group can already communicate the in-progress state. */
		showProgressState?: boolean;
		done?: boolean;
		past?: boolean;
		current?: boolean;
		projectName?: string | null;
		projectHref?: string | null;
		onChat: () => void;
		onOpenTask?: (() => void) | null;
		onToggleDone?: (() => void) | null;
		/** The task id, so the reader can scroll its row into view. */
		rowId?: string | null;
		/** Open in the reader beside the list. */
		selected?: boolean;
	}

	let {
		kind,
		title,
		timeLabel = null,
		metaLabel = null,
		stateKey = null,
		showProgressState = true,
		done = false,
		past = false,
		current = false,
		projectName = null,
		projectHref = null,
		onChat,
		onOpenTask = null,
		onToggleDone = null,
		rowId = null,
		selected = false
	}: Props = $props();

	const showInProgress = $derived(!done && stateKey === 'in_progress' && showProgressState);
	const showBlocked = $derived(!done && stateKey === 'blocked');
	const hasMetadata = $derived(
		current || showInProgress || showBlocked || metaLabel || (projectHref && projectName)
	);
</script>

<div class="flex min-w-0 items-stretch gap-2" data-row-id={rowId}>
	{#if timeLabel}
		<div
			class="w-12 shrink-0 pt-3 text-right text-2xs tabular-nums sm:w-16 sm:text-xs {current
				? 'font-semibold text-accent'
				: 'text-muted-foreground'}"
		>
			{timeLabel}
		</div>
	{/if}
	<div
		class="group relative min-w-0 flex-1 border-l-2 px-1 py-1.5 sm:px-2 {current || selected
			? 'border-accent bg-accent/5'
			: 'border-transparent hover:bg-muted/50 focus-within:bg-muted/50'}"
		aria-current={selected ? 'true' : undefined}
	>
		<div class="flex items-center gap-1 sm:gap-2">
			<!-- Phones get no left control: the row opens the task, which holds Mark done. -->
			{#if onToggleDone}
				<button
					onclick={onToggleDone}
					class="group/check relative z-10 hidden sm:flex h-11 w-11 shrink-0 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title={done ? 'Mark as not done' : 'Mark done'}
					aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" done`}
					aria-pressed={done}
				>
					<span
						class="flex h-5 w-5 items-center justify-center rounded-full border {done
							? 'border-success bg-success text-success-foreground'
							: 'border-border-strong text-transparent group-hover/check:border-accent group-hover/check:bg-accent/10 group-hover/check:text-accent'}"
					>
						<Check class="h-3 w-3" />
					</span>
				</button>
			{:else}
				<div
					class="hidden h-11 w-11 shrink-0 items-center justify-center sm:flex [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7"
					aria-hidden="true"
				>
					<Calendar class="h-4 w-4 {current ? 'text-accent' : 'text-muted-foreground'}" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				{#if onOpenTask}
					<button
						onclick={onOpenTask}
						class="flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md text-left text-sm font-medium leading-5 after:absolute after:inset-0 after:content-[''] hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {done
							? 'text-muted-foreground'
							: 'text-foreground'}"
						{title}
						aria-label={`Open task details for "${title}"`}
					>
						<span
							class="min-w-0 flex-1 line-clamp-2 sm:line-clamp-1 [overflow-wrap:anywhere] {done
								? 'line-through'
								: ''}">{title}</span
						>
					</button>
				{:else}
					<p
						class="flex min-w-0 items-start gap-1.5 text-sm font-medium leading-5 {done
							? 'text-muted-foreground line-through'
							: kind === 'event' && past && !current
								? 'text-muted-foreground'
								: 'text-foreground'}"
					>
						{#if kind === 'event'}
							<Calendar
								class="mt-0.5 h-3.5 w-3.5 shrink-0 sm:hidden {current
									? 'text-accent'
									: 'text-muted-foreground'}"
								aria-hidden="true"
							/>
						{/if}
						<span class="min-w-0 line-clamp-2 sm:line-clamp-1 [overflow-wrap:anywhere]"
							>{title}</span
						>
					</p>
				{/if}
				{#if hasMetadata}<div
						class="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1.5 text-2xs sm:flex-nowrap text-muted-foreground sm:text-xs"
					>
						{#if current}
							<span
								class="inline-flex shrink-0 items-center gap-1 font-medium text-accent"
								><span class="h-1.5 w-1.5 rounded-full bg-accent"></span>Now</span
							>
						{:else if showInProgress}
							<span class="shrink-0">In progress</span>
						{:else if showBlocked}
							<span
								class="inline-flex shrink-0 items-center gap-1 font-medium text-warning"
								><AlertCircle class="h-3 w-3" aria-hidden="true" />Blocked</span
							>
						{/if}
						{#if metaLabel}
							<span class="shrink-0">{metaLabel}</span>
						{/if}
						{#if projectHref && projectName}
							{#if current || showInProgress || showBlocked || metaLabel}
								<span class="shrink-0 text-muted-foreground/50" aria-hidden="true"
									>·</span
								>
							{/if}
							<a
								href={projectHref}
								data-sveltekit-preload-data="hover"
								data-sveltekit-preload-code="viewport"
								class="{timeLabel
									? 'max-[360px]:basis-full'
									: ''} relative z-10 inline-flex min-h-6 min-w-0 items-center gap-1 rounded-md underline decoration-border-strong underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title={`Open ${projectName}`}
								aria-label={`Open project ${projectName}`}
							>
								<FolderKanban class="h-3 w-3 shrink-0" />
								<span class="truncate">{projectName}</span>
							</a>
						{/if}
					</div>{/if}
			</div>
			<div class="relative z-10 flex shrink-0 items-center">
				{#if onOpenTask}
					<button
						onclick={onOpenTask}
						class="hidden sm:flex h-11 w-11 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Edit task"
						aria-label={`Edit task "${title}"`}
					>
						<SquarePen class="h-4 w-4" />
					</button>
				{:else if projectHref && !projectName}
					<a
						href={projectHref}
						data-sveltekit-preload-data="hover"
						data-sveltekit-preload-code="viewport"
						class="flex h-11 w-11 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Open project"
						aria-label={`Open project for "${title}"`}
					>
						<FolderKanban class="h-4 w-4" />
					</a>
				{/if}
				<button
					onclick={onChat}
					class="flex h-11 w-11 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Chat about this"
					aria-label={`Chat about "${title}"`}
				>
					<MessageCircle class="h-4 w-4" />
				</button>
			</div>
		</div>
	</div>
</div>
