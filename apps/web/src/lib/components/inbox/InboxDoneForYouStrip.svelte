<!-- apps/web/src/lib/components/inbox/InboxDoneForYouStrip.svelte -->
<!--
	Tasker 149: what the review pass applied without asking this week, across projects whose
	cleanup card is not in the inbox (a card that is shows its own "Done for you"). Collapsed to
	one line; each change has Undo.
-->
<script lang="ts">
	import { ChevronDown, CircleCheck, Undo2 } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import { formatRelativeTime } from '$lib/utils/date-utils';
	import type { ProjectCleanupAutoApplied } from '@buildos/shared-types';

	export type DoneForYouEntry = ProjectCleanupAutoApplied & {
		project_id: string;
		project_name: string | null;
	};

	let {
		entries,
		onUndone
	}: {
		entries: DoneForYouEntry[];
		/** After one change is undone. */
		onUndone?: (entry: DoneForYouEntry) => void;
	} = $props();

	const uid = $props.id();
	let open = $state(false);
	let undoingId = $state<string | null>(null);
	let undone = $state.raw<Set<string>>(new Set());
	let errors = $state.raw<Map<string, string>>(new Map());

	const visible = $derived(entries.filter((entry) => !undone.has(entry.suggestion_id)));
	const projectCount = $derived(new Set(visible.map((entry) => entry.project_id)).size);

	async function undo(entry: DoneForYouEntry) {
		if (undoingId) return;
		undoingId = entry.suggestion_id;
		const nextErrors = new Map(errors);
		nextErrors.delete(entry.suggestion_id);
		errors = nextErrors;
		try {
			const res = await fetch(
				`/api/onto/projects/${encodeURIComponent(entry.project_id)}/cleanup/undo`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ suggestion_id: entry.suggestion_id })
				}
			);
			const json = await res.json().catch(() => null);
			if (!res.ok || json?.data?.ok === false) {
				throw new Error(json?.data?.message ?? json?.error ?? 'Could not undo this');
			}
			undone = new Set(undone).add(entry.suggestion_id);
			onUndone?.(entry);
		} catch (error) {
			errors = new Map(errors).set(
				entry.suggestion_id,
				error instanceof Error ? error.message : 'Could not undo this'
			);
		} finally {
			undoingId = null;
		}
	}
</script>

{#if visible.length}
	<div class="border-b border-border bg-success/5 px-3 py-1.5">
		<button
			type="button"
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-controls={`${uid}-list`}
			class="flex min-h-11 w-full items-center justify-between gap-2 rounded-md text-left text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span class="flex min-w-0 items-center gap-1.5">
				<CircleCheck class="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
				<span class="min-w-0 truncate">
					<span class="font-semibold text-foreground">Done for you this week:</span>
					<span class="text-muted-foreground">
						{visible.length} change{visible.length === 1 ? '' : 's'}
						{projectCount > 1 ? `across ${projectCount} projects` : ''}
					</span>
				</span>
			</span>
			<ChevronDown
				class="h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none {open
					? 'rotate-180'
					: ''}"
				aria-hidden="true"
			/>
		</button>
		{#if open}
			<ul id={`${uid}-list`} class="space-y-1.5 pb-1.5 pt-0.5">
				{#each visible as entry (entry.suggestion_id)}
					{@const error = errors.get(entry.suggestion_id)}
					<li
						class="flex min-w-0 flex-col gap-1.5 rounded-md border border-border bg-card px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="min-w-0">
							<p class="break-words text-xs font-medium text-foreground">
								{entry.title}
							</p>
							<p class="mt-0.5 break-words text-2xs text-muted-foreground">
								{[
									entry.project_name,
									entry.reason,
									formatRelativeTime(entry.applied_at)
								]
									.filter(Boolean)
									.join(' · ')}
							</p>
							{#if error}
								<p role="alert" class="mt-0.5 text-2xs text-destructive">{error}</p>
							{/if}
						</div>
						{#if entry.undoable}
							<Button
								variant="ghost"
								size="sm"
								icon={Undo2}
								onclick={() => undo(entry)}
								loading={undoingId === entry.suggestion_id}
								disabled={Boolean(undoingId)}
								aria-label={`Undo: ${entry.title}`}
								class="shrink-0 text-xs"
							>
								Undo
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}
