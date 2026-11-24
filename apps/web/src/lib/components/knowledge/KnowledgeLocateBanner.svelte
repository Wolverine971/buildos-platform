<!-- apps/web/src/lib/components/knowledge/KnowledgeLocateBanner.svelte -->
<!--
	The company lookup's one line on /knowledge (tasker 170). While it runs: how far it is, and
	Stop. Afterwards: how many companies were placed, how many need a quick look (opens the
	"Which one?" stack), and how many no free source could place, with the web search for those
	where it is turned on. Before any lookup: a quiet link to start one.
-->
<script lang="ts">
	import { Loader2, MapPin, Search, X } from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import type { CompanyLocateWatch } from './company-locate.svelte';

	interface Props {
		watch: CompanyLocateWatch;
		onReview: () => void;
		/** A web search for the leftovers was queued: show the research tray. */
		onSearchStarted?: () => void;
	}

	let { watch, onReview, onSearchStarted }: Props = $props();

	const DISMISSED_KEY = 'buildos:knowledge-locate-dismissed-run';
	/** One click's worth of web research (the research queue's own limit). */
	const SEARCH_BATCH = 75;

	let busy = $state<'start' | 'stop' | 'search' | null>(null);
	let dismissed = $state<string | null>(readDismissed());

	function readDismissed(): string | null {
		try {
			return localStorage.getItem(DISMISSED_KEY);
		} catch {
			return null;
		}
	}

	const tray = $derived(watch.tray);
	const live = $derived(watch.live);
	const stats = $derived(tray?.stats);
	const found = $derived(stats ? stats.placed + stats.unconfirmed : 0);
	const questions = $derived(tray?.open_questions ?? 0);
	const leftover = $derived(tray?.leftover ?? 0);
	/** Stopped part-way (by the user, or its worker went quiet) with companies still to do. */
	const unfinished = $derived(
		Boolean(tray && stats && !live && stats.done < stats.total && tray.status !== 'completed')
	);
	// A finished run with nothing left to do can be put away; open questions bring it back.
	const hidden = $derived(Boolean(tray && !live && !questions && dismissed === tray.run_id));

	const plural = (n: number, one: string, many: string) =>
		`${n.toLocaleString()} ${n === 1 ? one : many}`;

	function dismiss() {
		if (!tray) return;
		dismissed = tray.run_id;
		try {
			localStorage.setItem(DISMISSED_KEY, tray.run_id);
		} catch {
			// private mode: put away for this visit only
		}
	}

	async function start() {
		busy = 'start';
		try {
			const started = await watch.begin({ origin: 'manual' });
			if (started.reason === 'nothing_to_locate')
				toastService.info('Every company already has a place or has been looked up.');
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not start the lookup'
			);
		} finally {
			busy = null;
		}
	}

	async function stop() {
		busy = 'stop';
		try {
			await watch.stopRun();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not stop it');
		} finally {
			busy = null;
		}
	}

	async function searchRest() {
		busy = 'search';
		try {
			const started = await watch.searchRest();
			if (started.queued) {
				toastService.success(
					`Searching the web for ${plural(started.queued, 'company', 'companies')}` +
						(started.remaining
							? `. ${started.remaining.toLocaleString()} more after this.`
							: '.')
				);
				onSearchStarted?.();
			} else {
				toastService.info(started.refused ?? 'Nothing left to search for.');
			}
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not start the web search'
			);
		} finally {
			busy = null;
		}
	}

	const action =
		'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';
</script>

{#if watch.loaded && !tray}
	<button
		type="button"
		class="inline-flex w-fit items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-60"
		disabled={busy !== null}
		onclick={() => void start()}
	>
		{#if busy === 'start'}
			<Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
		{:else}
			<MapPin class="h-4 w-4" aria-hidden="true" />
		{/if}
		Find where your companies are
	</button>
{:else if tray && stats && !hidden}
	<div
		class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
		role="status"
	>
		{#if live}
			<Loader2
				class="h-4 w-4 shrink-0 animate-spin text-accent motion-reduce:animate-none"
				aria-hidden="true"
			/>
			<span class="min-w-0 flex-1">
				Finding where your companies are
				<span class="stamp text-xs text-muted-foreground">
					{stats.done.toLocaleString()} of {stats.total.toLocaleString()}
				</span>
				{#if found}<span class="text-muted-foreground"
						>· {found.toLocaleString()} placed</span
					>{/if}
			</span>
			{#if questions}
				<button type="button" class={action} onclick={onReview}>
					{questions.toLocaleString()} need a quick look
				</button>
			{/if}
			<button
				type="button"
				class={action}
				disabled={busy !== null}
				onclick={() => void stop()}
			>
				Stop
			</button>
		{:else}
			<MapPin class="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
			<span class="min-w-0 flex-1">
				{plural(found, 'company', 'companies')} placed
				{#if stats.unconfirmed}
					<span class="text-muted-foreground"
						>· {stats.unconfirmed.toLocaleString()} unconfirmed</span
					>
				{/if}
				{#if leftover}
					<span class="text-muted-foreground"
						>· {leftover.toLocaleString()} not found</span
					>
				{/if}
				{#if unfinished}
					<span class="text-muted-foreground"
						>· stopped at {stats.done.toLocaleString()} of {stats.total.toLocaleString()}</span
					>
				{/if}
			</span>
			{#if questions}
				<button type="button" class={action} onclick={onReview}>
					{questions.toLocaleString()} need a quick look
				</button>
			{/if}
			{#if unfinished}
				<button
					type="button"
					class={action}
					disabled={busy !== null}
					onclick={() => void start()}
				>
					{#if busy === 'start'}
						<Loader2
							class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					{/if}
					Continue
				</button>
			{/if}
			{#if leftover && tray.web_search}
				<button
					type="button"
					class={action}
					disabled={busy !== null}
					title="Paid web research, inside today's research allowance"
					onclick={() => void searchRest()}
				>
					{#if busy === 'search'}
						<Loader2
							class="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
							aria-hidden="true"
						/>
					{:else}
						<Search class="h-3.5 w-3.5" aria-hidden="true" />
					{/if}
					{leftover > SEARCH_BATCH
						? `Search the web for ${SEARCH_BATCH} of them`
						: `Search the web for ${leftover === 1 ? 'it' : `the other ${leftover}`}`}
				</button>
			{/if}
			{#if !questions}
				<button
					type="button"
					class="inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-label="Put this away"
					title="Put away"
					onclick={dismiss}
				>
					<X class="h-4 w-4" />
				</button>
			{/if}
		{/if}
	</div>
{/if}
