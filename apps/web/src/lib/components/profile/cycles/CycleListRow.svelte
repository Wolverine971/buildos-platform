<!-- apps/web/src/lib/components/profile/cycles/CycleListRow.svelte -->
<script lang="ts">
	import type { CycleDefinition, CycleKind } from '@buildos/shared-types';
	import {
		CalendarClock,
		ClipboardList,
		Coffee,
		FolderKanban,
		ListChecks,
		Repeat,
		type Icon
	} from '$lib/icons/lucide';
	import Badge from '$lib/components/ui/Badge.svelte';
	import { presentCycle, type CycleExecutionAuthority } from './cycle-presenter';

	interface Props {
		cycle: CycleDefinition;
		authority: CycleExecutionAuthority;
		locale?: string;
		displayTimeZone?: string;
	}

	let { cycle, authority, locale = 'en-US', displayTimeZone = 'UTC' }: Props = $props();

	const KIND_ICONS: Record<CycleKind, Icon> = {
		daily_brief: Coffee,
		project_audit: ClipboardList,
		project_review: FolderKanban,
		task_review: ListChecks
	};

	let presentation = $derived(presentCycle(cycle, { authority, locale, displayTimeZone }));
	let KindIcon = $derived(KIND_ICONS[cycle.kind] ?? Repeat);
</script>

<article
	class="min-w-0 rounded-lg border border-border bg-card p-4 shadow-ink sm:p-5"
	aria-label={`${cycle.label}, ${presentation.status.label}`}
>
	<div class="flex min-w-0 items-start gap-3">
		<div
			class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-accent shadow-ink-inner"
		>
			<KindIcon class="h-5 w-5" aria-hidden="true" />
		</div>

		<div class="min-w-0 flex-1">
			<div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
				<div class="min-w-0 flex-1">
					<h3 class="break-words text-base font-semibold leading-snug text-foreground">
						{cycle.label || presentation.kind.label}
					</h3>
					<p class="mt-0.5 text-xs font-medium text-muted-foreground">
						{presentation.kind.label}
					</p>
				</div>
				<Badge size="sm" variant={presentation.status.badgeVariant}>
					{presentation.status.label}
				</Badge>
			</div>

			<p class="mt-2 break-words text-sm leading-relaxed text-muted-foreground">
				{presentation.kind.purpose}
			</p>

			<div class="mt-3 flex min-w-0 items-start gap-2 text-sm text-foreground">
				<CalendarClock
					class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
					aria-hidden="true"
				/>
				<span class="min-w-0 break-words">{presentation.cadence}</span>
			</div>

			<p class="mt-2 text-xs leading-relaxed text-muted-foreground">
				{presentation.status.description}
			</p>

			{#if presentation.nextRun || presentation.lastRun || presentation.failureSummary}
				<div
					class="mt-3 flex min-w-0 flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground"
				>
					{#if presentation.nextRun}
						<span class="min-w-0 break-words"
							><strong class="font-medium text-foreground">Next:</strong>
							{presentation.nextRun}</span
						>
					{/if}
					{#if presentation.lastRun}
						<span class="min-w-0 break-words"
							><strong class="font-medium text-foreground">Last recorded:</strong>
							{presentation.lastRun}</span
						>
					{/if}
					{#if presentation.failureSummary}
						<span class="min-w-0 break-words text-destructive"
							>{presentation.failureSummary}</span
						>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</article>
