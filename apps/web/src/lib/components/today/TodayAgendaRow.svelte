<!-- apps/web/src/lib/components/today/TodayAgendaRow.svelte -->
<script lang="ts">
	import {
		Calendar,
		Check,
		ChevronRight,
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
		done?: boolean;
		past?: boolean;
		current?: boolean;
		projectName?: string | null;
		projectHref?: string | null;
		onChat: () => void;
		onOpenTask?: (() => void) | null;
		onToggleDone?: (() => void) | null;
	}

	let {
		kind,
		title,
		timeLabel = null,
		metaLabel = null,
		stateKey = null,
		done = false,
		past = false,
		current = false,
		projectName = null,
		projectHref = null,
		onChat,
		onOpenTask = null,
		onToggleDone = null
	}: Props = $props();
</script>

<div class="flex items-stretch gap-2 sm:gap-3">
	<!-- Time rail -->
	<div
		class="w-12 sm:w-16 flex-shrink-0 pt-2.5 sm:pt-3 text-right text-[10px] sm:text-xs tabular-nums {current
			? 'font-semibold text-accent'
			: 'text-muted-foreground'}"
	>
		{timeLabel ?? ''}
	</div>

	<!-- Card -->
	<div
		class="group relative flex-1 min-w-0 wt-paper p-2 sm:p-3 tx tx-frame tx-weak transition-colors {current
			? 'border-accent/60 bg-accent/5'
			: 'hover:border-accent/40'} {past && !current ? 'opacity-60' : ''}"
	>
		<div class="flex items-center gap-2 sm:gap-3">
			{#if kind === 'task' && onToggleDone}
				<button
					onclick={onToggleDone}
					class="flex-shrink-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card {done
						? 'border-success bg-success text-success-foreground'
						: 'border-border hover:border-accent hover:bg-accent/10 text-transparent hover:text-accent'}"
					title={done ? 'Mark as not done' : 'Mark done'}
					aria-label={done ? `Mark "${title}" as not done` : `Mark "${title}" done`}
					aria-pressed={done}
				>
					<Check class="h-3 w-3 sm:h-3.5 sm:w-3.5" />
				</button>
			{:else}
				<div
					class="flex-shrink-0 p-1 sm:p-1.5 rounded-md {current
						? 'bg-accent/15 border border-accent/30'
						: 'bg-accent/10 border border-accent/20'}"
				>
					<Calendar class="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent" />
				</div>
			{/if}

			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
					<p
						class="truncate text-xs sm:text-sm font-medium text-foreground {done
							? 'line-through text-muted-foreground'
							: ''}"
					>
						{title}
					</p>
					{#if current}
						<span
							class="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wide bg-accent/10 text-accent border border-accent/20"
						>
							Now
						</span>
					{:else if !done && stateKey === 'in_progress'}
						<span
							class="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-accent/10 text-accent border border-accent/20"
						>
							In progress
						</span>
					{:else if !done && stateKey === 'blocked'}
						<span
							class="flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-medium bg-warning/10 text-warning border border-warning/20"
						>
							Blocked
						</span>
					{/if}
				</div>
				{#if metaLabel || (projectHref && projectName)}
					<div
						class="mt-0.5 flex min-w-0 items-center gap-1.5 text-[10px] text-muted-foreground sm:text-xs"
					>
						{#if metaLabel}
							<span class="min-w-0 truncate">{metaLabel}</span>
						{/if}
						{#if projectHref && projectName}
							{#if metaLabel}<span aria-hidden="true">·</span>{/if}
							<a
								href={projectHref}
								class="inline-flex min-w-0 items-center gap-1 rounded-sm font-medium text-muted-foreground underline decoration-border-strong underline-offset-2 transition-colors hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title={`Open ${projectName}`}
								aria-label={`Open project ${projectName}`}
							>
								<FolderKanban class="h-3 w-3 shrink-0" />
								<span class="shrink-0">Project:</span>
								<span class="truncate">{projectName}</span>
								<ChevronRight class="h-2.5 w-2.5 shrink-0" />
							</a>
						{/if}
					</div>
				{/if}
			</div>

			<div class="flex flex-shrink-0 items-center gap-0.5 sm:gap-1">
				<button
					onclick={onChat}
					class="p-1.5 sm:p-2 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Chat about this"
					aria-label={`Chat about "${title}"`}
				>
					<MessageCircle class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
				</button>
				{#if onOpenTask}
					<button
						onclick={onOpenTask}
						class="rounded-md border border-accent/30 bg-accent/5 p-1.5 text-accent transition-colors hover:border-accent/50 hover:bg-accent/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-2"
						title="Open task details"
						aria-label={`Open task details for "${title}"`}
					>
						<SquarePen class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
					</button>
				{:else if projectHref && !projectName}
					<a
						href={projectHref}
						class="p-1.5 sm:p-2 rounded-md text-muted-foreground hover:text-accent hover:bg-accent/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Open project"
						aria-label={`Open project for "${title}"`}
					>
						<FolderKanban class="h-3.5 w-3.5 sm:h-4 sm:w-4" />
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
