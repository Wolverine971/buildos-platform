<!-- apps/web/src/lib/components/today/TodayAgendaRow.svelte -->
<script lang="ts">
	import { Calendar, Check, FolderKanban, MessageCircle, SquarePen } from '$lib/icons/lucide';

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

<div class="flex min-w-0 items-stretch gap-2">
	{#if timeLabel}
		<div
			class="w-12 shrink-0 pt-2 text-right text-2xs tabular-nums sm:w-16 sm:text-xs {current
				? 'font-semibold text-accent'
				: 'text-muted-foreground'}"
		>
			{timeLabel}
		</div>
	{/if}
	<div
		class="group min-w-0 flex-1 rounded-lg border px-1 py-0.5 sm:px-2 {current
			? 'border-accent/40 bg-accent/5 shadow-ink'
			: 'border-border/70 bg-card'}"
	>
		<div class="flex items-center gap-1 sm:gap-2">
			{#if onToggleDone}
				<button
					onclick={onToggleDone}
					class="group/check flex h-11 w-11 shrink-0 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
					class="flex h-11 w-11 shrink-0 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7"
					aria-hidden="true"
				>
					<Calendar class="h-4 w-4 {current ? 'text-accent' : 'text-muted-foreground'}" />
				</div>
			{/if}
			<div class="min-w-0 flex-1">
				{#if onOpenTask}
					<button
						onclick={onOpenTask}
						class="flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-md text-left text-sm font-medium leading-5 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {done
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
						<SquarePen
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 group-hover:text-accent"
						/>
					</button>
				{:else}
					<p
						class="text-sm font-medium leading-5 line-clamp-2 sm:line-clamp-1 [overflow-wrap:anywhere] {done
							? 'text-muted-foreground line-through'
							: kind === 'event' && past && !current
								? 'text-muted-foreground'
								: 'text-foreground'}"
					>
						{title}
					</p>
				{/if}
				<div
					class="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1.5 text-2xs sm:flex-nowrap text-muted-foreground sm:text-xs"
				>
					{#if current}
						<span
							class="inline-flex shrink-0 items-center gap-1 font-medium text-accent"
							><span class="h-1.5 w-1.5 rounded-full bg-accent"></span>Now</span
						>
					{:else if !done && stateKey === 'in_progress'}
						<span class="shrink-0">In progress</span>
					{:else if !done && stateKey === 'blocked'}
						<span class="shrink-0 font-medium text-warning">Blocked</span>
					{/if}
					{#if metaLabel}
						<span class="shrink-0">{metaLabel}</span>
					{/if}
					{#if projectHref && projectName}
						{#if current || (!done && (stateKey === 'in_progress' || stateKey === 'blocked')) || metaLabel}
							<span class="shrink-0 text-muted-foreground/50" aria-hidden="true"
								>·</span
							>
						{/if}
						<a
							href={projectHref}
							class="{timeLabel
								? 'max-[360px]:basis-full'
								: ''} inline-flex min-h-6 min-w-0 items-center gap-1 rounded-md underline decoration-border-strong underline-offset-2 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							title={`Open ${projectName}`}
							aria-label={`Open project ${projectName}`}
						>
							<FolderKanban class="h-3 w-3 shrink-0" />
							<span class="truncate">{projectName}</span>
						</a>
					{/if}
				</div>
			</div>
			<div class="flex shrink-0 flex-col">
				<button
					onclick={onChat}
					class="flex h-11 w-11 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					title="Chat about this"
					aria-label={`Chat about "${title}"`}
				>
					<MessageCircle class="h-4 w-4" />
				</button>
				{#if !onOpenTask && projectHref && !projectName}
					<a
						href={projectHref}
						class="flex h-11 w-11 items-center justify-center [@media(pointer:fine)]:h-7 [@media(pointer:fine)]:w-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						title="Open project"
						aria-label={`Open project for "${title}"`}
					>
						<FolderKanban class="h-4 w-4" />
					</a>
				{/if}
			</div>
		</div>
	</div>
</div>
