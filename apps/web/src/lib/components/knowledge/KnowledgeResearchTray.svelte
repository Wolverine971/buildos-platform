<!-- apps/web/src/lib/components/knowledge/KnowledgeResearchTray.svelte -->
<!--
	The research tray (tasker 164): a bottom-right window, like a chat window, that shows every
	"Find more" while it runs (waiting → searching → reading → found N) so the page stays free to
	click around. Each entry opens its card; anything unfinished can be stopped. It collapses to
	one line, and while open it publishes its height as --app-bottom-dock so toasts and the
	selection bar sit above it. Data comes from KnowledgeResearchQueue (one poll for the page).
-->
<script lang="ts">
	import {
		AlertTriangle,
		ChevronDown,
		ChevronUp,
		CircleCheck,
		CircleDashed,
		CircleSlash,
		Loader2,
		Sparkles,
		X
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import type { KnowledgeResearchQueue } from './research-queue.svelte';
	import {
		isActiveTarget,
		isLiveRun,
		researchStatusLine,
		type ResearchRun,
		type ResearchTarget
	} from './research-tray';

	interface Props {
		queue: KnowledgeResearchQueue;
		onOpenEntity: (id: string) => void;
	}

	let { queue, onOpenEntity }: Props = $props();

	const LIST_ID = 'knowledge-research-tray-list';
	let stopping = $state<string | null>(null);

	const runs = $derived(queue.visibleRuns);
	const targets = $derived(runs.flatMap((run) => run.targets));
	const activeCount = $derived(targets.filter(isActiveTarget).length);
	const runningCount = $derived(targets.filter((t) => t.status === 'running').length);
	const doneCount = $derived(targets.filter((t) => t.status === 'done').length);
	const foundCount = $derived(targets.reduce((sum, t) => sum + t.facts_added, 0));
	const anyLive = $derived(runs.some(isLiveRun));
	const headline = $derived(
		anyLive
			? `Researching ${targets.length - activeCount + runningCount} of ${targets.length}`
			: `Research done · ${doneCount} of ${targets.length} entr${targets.length === 1 ? 'y' : 'ies'}`
	);
	const subline = $derived(
		foundCount
			? `${foundCount} new detail${foundCount === 1 ? '' : 's'} so far`
			: anyLive
				? 'You can keep browsing'
				: 'Nothing new turned up'
	);

	// Publish the tray's height so the notification stack and the selection bar sit above it.
	function dock(element: HTMLElement) {
		const root = document.documentElement;
		const publish = () =>
			root.style.setProperty('--app-bottom-dock', `${element.offsetHeight + 8}px`);
		publish();
		const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
		observer?.observe(element);
		return () => {
			observer?.disconnect();
			root.style.removeProperty('--app-bottom-dock');
		};
	}

	async function stopTarget(target: ResearchTarget) {
		stopping = target.id;
		try {
			await queue.cancelTarget(target);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not stop it');
		} finally {
			stopping = null;
		}
	}

	async function stopRun(run: ResearchRun) {
		stopping = run.id;
		try {
			await queue.cancelRun(run);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not stop it');
		} finally {
			stopping = null;
		}
	}

	function money(usd: number): string {
		return usd > 0 && usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
	}

	function when(iso: string): string {
		return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	}

	const iconButton =
		'inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
</script>

{#if runs.length}
	<section
		{@attach dock}
		class="fixed bottom-3 right-3 z-40 flex w-[min(24rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-ink-strong sm:bottom-4 sm:right-4"
		aria-label="Research"
	>
		<div class="flex min-h-12 items-center gap-1 px-2">
			<button
				type="button"
				class="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-expanded={queue.expanded}
				aria-controls={LIST_ID}
				onclick={() => (queue.expanded = !queue.expanded)}
			>
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent"
					aria-hidden="true"
				>
					{#if anyLive}
						<Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" />
					{:else}
						<Sparkles class="h-4 w-4" />
					{/if}
				</span>
				<span class="min-w-0 flex-1">
					<span class="block truncate text-sm font-semibold text-foreground"
						>{headline}</span
					>
					<span class="block truncate text-xs text-muted-foreground">{subline}</span>
				</span>
				{#if queue.expanded}
					<ChevronDown
						class="h-4 w-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				{:else}
					<ChevronUp class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				{/if}
			</button>
			{#if !anyLive}
				<button
					type="button"
					class={iconButton}
					aria-label="Clear finished research"
					title="Clear"
					onclick={() => queue.clearFinished()}
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		</div>
		<p class="sr-only" aria-live="polite">{headline}. {subline}.</p>

		<div
			id={LIST_ID}
			class="max-h-[min(55dvh,26rem)] overflow-y-auto overscroll-contain border-t border-border"
			hidden={!queue.expanded}
		>
			{#each runs as run (run.id)}
				{@const live = isLiveRun(run)}
				{@const unfinished = run.targets.filter(isActiveTarget).length}
				<div class="border-b border-border last:border-b-0">
					<div class="flex min-h-9 items-center gap-2 px-3 pt-2">
						<p class="micro-label min-w-0 flex-1 truncate text-muted-foreground">
							{run.targets.length === 1
								? 'Find more'
								: `${run.targets.length} entries`}
							· <span class="stamp">{when(run.created_at)}</span>
							· <span class="stamp">{money(run.cost_usd)}</span>
							{#if run.stalled}· not moving{/if}
						</p>
						{#if live && unfinished > 1}
							<button
								type="button"
								class="inline-flex min-h-8 items-center rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground disabled:opacity-50"
								disabled={stopping === run.id}
								onclick={() => void stopRun(run)}
							>
								Stop all {unfinished}
							</button>
						{/if}
					</div>
					<ul class="flex flex-col pb-1.5">
						{#each run.targets as target (target.id)}
							{@const active = isActiveTarget(target)}
							<li class="flex min-w-0 items-center gap-1 px-1.5">
								<button
									type="button"
									class="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 text-left pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [@media(pointer:fine)]:min-h-10"
									title={target.instructions ?? undefined}
									onclick={() => onOpenEntity(target.entity_id)}
								>
									<span class="shrink-0" aria-hidden="true">
										{#if target.status === 'running'}
											<Loader2
												class="h-4 w-4 animate-spin text-accent motion-reduce:animate-none"
											/>
										{:else if target.status === 'queued'}
											<CircleDashed class="h-4 w-4 text-muted-foreground" />
										{:else if target.status === 'done'}
											<CircleCheck class="h-4 w-4 text-success" />
										{:else if target.status === 'failed'}
											<AlertTriangle class="h-4 w-4 text-warning" />
										{:else}
											<CircleSlash class="h-4 w-4 text-muted-foreground" />
										{/if}
									</span>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm text-foreground"
											>{target.name}</span
										>
										<span class="block truncate text-xs text-muted-foreground"
											>{researchStatusLine(target)}</span
										>
									</span>
									{#if target.facts_added}
										<span
											class="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent"
											>+{target.facts_added}</span
										>
									{/if}
								</button>
								{#if active}
									<button
										type="button"
										class={iconButton}
										aria-label="Stop researching {target.name}"
										title="Stop"
										disabled={stopping === target.id}
										onclick={() => void stopTarget(target)}
									>
										<X class="h-3.5 w-3.5" />
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</section>
{/if}
