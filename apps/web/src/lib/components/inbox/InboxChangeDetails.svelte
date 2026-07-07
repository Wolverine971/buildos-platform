<!-- apps/web/src/lib/components/inbox/InboxChangeDetails.svelte -->
<!--
	Decodes a project-review suggestion's declarative `operations[]` into a
	human-readable list so the reviewer can see WHAT the change actually does
	(update a task, change a status, move a doc, delete, etc.) before deciding.
	Used by both the Dashboard AI Inbox modal and the project-page Inbox panel.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import {
		ArrowRight,
		ChevronDown,
		FilePlus2,
		FileText,
		FolderTree,
		Link2,
		ListChecks,
		Pencil,
		Trash2
	} from '$lib/icons/lucide';
	import type { LoopOperation, ProjectSuggestionPreview } from '@buildos/shared-types';
	import {
		decodeLoopOperations,
		type LoopOperationAction
	} from '@buildos/shared-agent-ops/proposal-context';

	let {
		operations = [],
		preview = null,
		defaultOpen = false
	}: {
		operations?: LoopOperation[];
		preview?: ProjectSuggestionPreview | null;
		defaultOpen?: boolean;
	} = $props();

	let open = $state(untrack(() => defaultOpen));
	const propsId = $props.id();
	const detailsId = `inbox-change-details-${propsId}`;

	const actionMeta: Record<LoopOperationAction, { cls: string; icon: typeof Pencil }> = {
		create: {
			cls: 'border-success/30 bg-success/10 text-success',
			icon: FilePlus2
		},
		update: { cls: 'border-accent/30 bg-accent/10 text-accent', icon: Pencil },
		delete: {
			cls: 'border-destructive/30 bg-destructive/10 text-destructive',
			icon: Trash2
		},
		move: {
			cls: 'border-warning/30 bg-warning/10 text-warning',
			icon: FolderTree
		},
		link: { cls: 'border-border bg-muted text-muted-foreground', icon: Link2 },
		unlink: {
			cls: 'border-border bg-muted text-muted-foreground',
			icon: Link2
		},
		other: {
			cls: 'border-border bg-muted text-muted-foreground',
			icon: FileText
		}
	};

	const entityIcon: Record<string, typeof FileText> = {
		task: ListChecks,
		document: FileText,
		entities: Link2
	};

	const decoded = $derived(decodeLoopOperations(operations));
	const count = $derived(operations.length);

	const hasPreviewDetail = $derived(
		Boolean(
			(preview?.before && preview.before.length) ||
				(preview?.after && preview.after.length) ||
				preview?.impact
		)
	);
</script>

{#if count > 0 || hasPreviewDetail}
	<div class="mt-2">
		<button
			type="button"
			onclick={() => (open = !open)}
			class="-ml-2 inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/10 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background motion-reduce:transition-none"
			aria-expanded={open}
			aria-controls={detailsId}
		>
			<ChevronDown
				class="h-3 w-3 shrink-0 transition-transform motion-reduce:transition-none {open
					? 'rotate-0'
					: '-rotate-90'}"
			/>
			{open ? 'Hide' : 'Show'}
			{count} proposed change{count === 1 ? '' : 's'}
		</button>

		{#if open}
			<div id={detailsId} class="mt-2 space-y-1.5">
				{#each decoded as op, opIndex (opIndex)}
					{@const Icon = entityIcon[op.entityLabel] ?? actionMeta[op.action].icon}
					<div class="rounded-md border border-border bg-muted/20 p-2">
						<div class="flex flex-wrap items-center gap-1.5">
							<span
								class="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold {actionMeta[
									op.action
								].cls}"
							>
								<Icon class="h-3 w-3 shrink-0" />
								{op.actionLabel}
								{op.entityLabel}
							</span>
							{#if op.target}
								<span
									class="block min-w-0 max-w-full truncate text-[11px] font-medium text-foreground"
								>
									{op.target}
								</span>
							{/if}
						</div>

						{#if op.summary}
							<p class="mt-1 break-words text-[11px] text-muted-foreground">
								{op.summary}
							</p>
						{/if}

						{#if op.changes.length}
							<div class="mt-1.5 space-y-0.5">
								{#each op.changes as change, changeIndex (changeIndex)}
									<div class="flex items-baseline gap-1.5 text-[11px]">
										<span class="shrink-0 font-medium text-muted-foreground">
											{change.label}:
										</span>
										<span class="min-w-0 break-words text-foreground/90">
											{change.value}
										</span>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				{#if hasPreviewDetail}
					<div class="rounded-md border border-border bg-muted/10 p-2">
						{#if preview?.before?.length || preview?.after?.length}
							<div class="flex flex-wrap items-start gap-2 text-[11px]">
								{#if preview?.before?.length}
									<div class="min-w-0 flex-1">
										<p class="micro-label text-muted-foreground">Before</p>
										<ul class="mt-0.5 space-y-0.5">
											{#each preview.before as line}
												<li
													class="break-words text-muted-foreground line-through"
												>
													{line}
												</li>
											{/each}
										</ul>
									</div>
									<ArrowRight
										class="mt-4 h-3 w-3 shrink-0 text-muted-foreground"
									/>
								{/if}
								{#if preview?.after?.length}
									<div class="min-w-0 flex-1">
										<p class="micro-label text-muted-foreground">After</p>
										<ul class="mt-0.5 space-y-0.5">
											{#each preview.after as line}
												<li class="break-words text-foreground/90">
													{line}
												</li>
											{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
						{#if preview?.impact}
							<p class="mt-1.5 break-words text-[11px] text-muted-foreground">
								<span class="font-semibold text-foreground/80">Impact:</span>
								{preview.impact}
							</p>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
