<!-- apps/web/src/lib/components/agent/KnowledgeEntityTray.svelte -->
<!--
	The Entities tray under a reply (guided search, 2026-11-22): the people, companies and places
	a search inside the graph or out on the web brought back, as chips the user can tick. Ticked
	entries ride on the next message; the buttons under the tray send a next step straight away.

	Entries found on the web are already saved to the graph (marked found on the web). Each such
	chip can be dropped again ("Don't save") or moved into the user's world ("I know them").
	Clicking a name opens its knowledge card.
-->
<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import {
		ArrowRight,
		BookUser,
		Check,
		CircleHelp,
		Globe,
		Network,
		Sparkles,
		TriangleAlert,
		UserCheck,
		X
	} from '$lib/icons/lucide';
	import {
		KIND_ICON,
		KIND_LABEL,
		knowledgeApi
	} from '$lib/components/knowledge/knowledge-client';
	import { toastService } from '$lib/stores/toast.store';
	import { safeHref } from '$lib/components/tables/table-cell-format';
	import {
		entityFit,
		knowledgeNextSteps,
		selectionRefOf,
		siteName,
		type GuidedEntity,
		type KnowledgeNextStep,
		type KnowledgeSelectionRef,
		type KnowledgeTrailRow,
		type KnowledgeTray
	} from './knowledge-search-tray';

	interface Props {
		tray: KnowledgeTray;
		/** Every entry ticked in this chat (across trays), in the order ticked. */
		selected: KnowledgeSelectionRef[];
		onToggle: (ref: KnowledgeSelectionRef) => void;
		/** Send a next step now, with the ticked entries attached. */
		onNextStep: (step: KnowledgeNextStep) => void;
		/** An entry was dropped from the graph: untick it wherever it is ticked. */
		onRemoved?: (id: string) => void;
		/** The most recent tray in the chat: it offers next steps even with nothing ticked. */
		latest?: boolean;
		/** False while a reply is streaming: the buttons wait. */
		canSend?: boolean;
		animateEntrance?: boolean;
		/**
		 * The whole search so far (every hop in this chat) as an indented trail. Shown, folded,
		 * on the latest tray once there is more than one hop to look back on.
		 */
		trail?: KnowledgeTrailRow[];
	}

	let {
		tray,
		selected,
		onToggle,
		onNextStep,
		onRemoved,
		latest = false,
		canSend = true,
		animateEntrance = false,
		trail = []
	}: Props = $props();

	const trailHops = $derived(trail.reduce((max, row) => Math.max(max, row.hop), 0));
	const showTrail = $derived(latest && trailHops >= 1 && trail.length > 1);

	const removed = new SvelteSet<string>();
	const known = new SvelteSet<string>();
	const busy = new SvelteSet<string>();
	let showRuledOut = $state(false);

	const entities = $derived(tray.entities.filter((entity) => !removed.has(entity.id)));
	const ruledOut = $derived(entities.filter((entity) => entityFit(entity) === 'out'));
	const shown = $derived(
		showRuledOut ? entities : entities.filter((entity) => entityFit(entity) !== 'out')
	);
	const selectedIds = $derived(new Set(selected.map((ref) => ref.entity_id)));
	const selectedHere = $derived(
		selected.filter((ref) => tray.entities.some((e) => e.id === ref.entity_id))
	);
	const steps = $derived(
		selectedHere.length || (latest && !selected.length)
			? knowledgeNextSteps(tray, selectedHere.length ? selected : [])
			: []
	);
	const newCount = $derived(entities.filter((entity) => entity.is_new).length);
	const passing = $derived(entities.filter((entity) => entityFit(entity) === 'pass').length);

	const NEED_LABEL: Record<string, string> = {
		phone: 'phone',
		email: 'email',
		company: 'company',
		title: 'title',
		place: 'location',
		website: 'website',
		social: 'social account',
		people: 'people',
		industry: 'industry'
	};

	function kindLabel(entity: GuidedEntity): string {
		return KIND_LABEL[entity.kind]?.one ?? entity.kind;
	}

	function subline(entity: GuidedEntity): string | null {
		return entity.title ?? entity.summary ?? null;
	}

	// The card opens from the chip's name. Loaded in its own chunk on first use.
	let cardDeps = $state<typeof import('$lib/components/knowledge/record-knowledge-deps') | null>(
		null
	);
	let card = $state<{ id: string; name: string; anchor: HTMLElement } | null>(null);

	async function openCard(entity: GuidedEntity, anchor: HTMLElement) {
		cardDeps ??= await import('$lib/components/knowledge/record-knowledge-deps');
		card = { id: entity.id, name: entity.name, anchor };
	}

	function drop(id: string) {
		removed.add(id);
		onRemoved?.(id);
	}

	async function dontSave(entity: GuidedEntity) {
		if (busy.has(entity.id)) return;
		busy.add(entity.id);
		try {
			// Server-checked: only an entry this search created, still outside Your world.
			await knowledgeApi.discardFound(entity.id);
			drop(entity.id);
			toastService.success(`Removed ${entity.name} from your graph`);
		} catch {
			toastService.error(
				`${entity.name} wasn't removed. It may already be part of your world: open its card to remove it there.`
			);
		} finally {
			busy.delete(entity.id);
		}
	}

	async function iKnowThem(entity: GuidedEntity) {
		if (busy.has(entity.id)) return;
		busy.add(entity.id);
		try {
			await knowledgeApi.update(entity.id, { circle: 'inner' });
			known.add(entity.id);
			toastService.success(`${entity.name} is now in Your world`);
		} catch {
			toastService.error(`Couldn't update ${entity.name}. Try again.`);
		} finally {
			busy.delete(entity.id);
		}
	}
</script>

<section
	class={['flex min-w-0 flex-col gap-2', { 'entity-just-created': animateEntrance }]}
	aria-label="Entities from this search"
	data-testid="knowledge-entity-tray"
>
	<div
		class="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
	>
		<span class="inline-flex items-center gap-1.5">
			<Network class="h-3 w-3 text-accent" aria-hidden="true" />
			Entities {entities.length}
		</span>
		{#if tray.source !== 'graph'}
			<span
				class="rounded-full border border-border bg-muted px-1.5 py-0.5 normal-case tracking-normal"
			>
				Hop {tray.hop} of {tray.hopLimit}
			</span>
		{:else}
			<span
				class="rounded-full border border-border bg-muted px-1.5 py-0.5 normal-case tracking-normal"
			>
				From your graph
			</span>
		{/if}
		{#if tray.checks.length && entities.length}
			<span class="normal-case tracking-normal">
				{passing} meet{passing === 1 ? 's' : ''}
				{tray.checks.length === 1 ? 'it' : `all ${tray.checks.length}`}
			</span>
		{/if}
		{#if newCount}
			<span class="normal-case tracking-normal">
				· {newCount} new, saved to your graph
			</span>
		{/if}
	</div>

	{#if shown.length}
		<ul class="grid min-w-0 gap-1.5 sm:grid-cols-2">
			{#each shown as entity (entity.id)}
				{@const KindIcon = KIND_ICON[entity.kind] ?? Sparkles}
				{@const ticked = selectedIds.has(entity.id)}
				{@const isKnown = entity.known || known.has(entity.id)}
				{@const line = subline(entity)}
				<li
					class="flex min-w-0 items-start gap-2 rounded-lg border bg-card p-2 shadow-ink transition-colors {ticked
						? 'border-accent bg-accent/5'
						: 'border-border'}"
				>
					<button
						type="button"
						role="checkbox"
						aria-checked={ticked}
						aria-label="{ticked ? 'Unselect' : 'Select'} {entity.name}"
						class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {ticked
							? 'border-accent bg-accent text-accent-foreground'
							: 'border-border bg-background text-transparent hover:border-accent'}"
						onclick={() => onToggle(selectionRefOf(entity))}
					>
						<Check class="h-3.5 w-3.5" aria-hidden="true" />
					</button>
					<div class="min-w-0 flex-1">
						<div class="flex min-w-0 items-center gap-1.5">
							<span class="shrink-0 text-accent" aria-hidden="true">
								<KindIcon class="h-3.5 w-3.5" />
							</span>
							<button
								type="button"
								class="min-w-0 truncate text-left text-sm font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								title="Open {entity.name}"
								onclick={(event) => openCard(entity, event.currentTarget)}
							>
								{entity.name}
							</button>
							{#if isKnown}
								<span
									class="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-success/10 px-1.5 py-0.5 text-2xs font-semibold text-success"
								>
									<BookUser class="h-3 w-3" aria-hidden="true" /> Know
								</span>
							{:else if entity.is_new}
								<span
									class="shrink-0 rounded-full bg-accent/10 px-1.5 py-0.5 text-2xs font-semibold text-accent"
								>
									New
								</span>
							{/if}
						</div>
						<p
							class="mt-0.5 text-2xs font-semibold uppercase tracking-[0.12em] text-muted-foreground"
						>
							{kindLabel(entity)}{entity.origin === 'web'
								? ' · found on the web'
								: ''}
						</p>
						{#if line}
							<p
								class="mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]"
							>
								{line}
							</p>
						{/if}
						{#if tray.checks.length && entity.fit}
							<div class="mt-1.5 flex flex-wrap gap-1">
								{#each tray.checks as check (check.key)}
									{@const answer = entity.fit[check.key] ?? 'unknown'}
									<span
										class="inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-2xs font-medium {answer ===
										'yes'
											? 'border-success/30 bg-success/10 text-success'
											: answer === 'no'
												? 'border-border bg-muted text-muted-foreground line-through'
												: 'border-border bg-background text-muted-foreground'}"
										title={check.question}
									>
										{#if answer === 'yes'}
											<Check class="h-3 w-3" aria-hidden="true" />
										{:else if answer === 'no'}
											<X class="h-3 w-3" aria-hidden="true" />
										{:else}
											<CircleHelp class="h-3 w-3" aria-hidden="true" />
										{/if}
										{check.key.replace(/_/g, ' ')}
										<span class="sr-only">
											: {answer === 'unknown' ? 'not recorded' : answer}
										</span>
									</span>
								{/each}
							</div>
						{/if}
						{#if entity.missing?.length}
							<p class="mt-1 text-2xs text-warning">
								No {entity.missing
									.map((key) => NEED_LABEL[key] ?? key)
									.join(' or ')} on file
							</p>
						{/if}
						{#if entity.maybe_same_as}
							<p class="mt-1 text-2xs text-warning">
								Same as {entity.maybe_same_as.name}? Open either card to combine
								them.
							</p>
						{/if}
						{#if entity.note}
							<p class="mt-1 text-2xs text-warning">{entity.note}</p>
						{/if}
						{#if entity.origin === 'web' && !isKnown}
							{@const sourceHref = safeHref(entity.sources?.[0])}
							<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
								{#if sourceHref}
									<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the web page the entry was found on, not a route in this app -->
									<a
										href={sourceHref}
										target="_blank"
										rel="noopener noreferrer"
										class="inline-flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-accent"
									>
										<Globe class="h-3 w-3" aria-hidden="true" />
										{siteName(sourceHref)}
									</a>
								{/if}
								<!-- Only for entries this search created. One the user already had
								     is never offered for removal here. -->
								{#if entity.is_new}
									<button
										type="button"
										class="inline-flex items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-accent disabled:opacity-50"
										disabled={busy.has(entity.id)}
										onclick={() => iKnowThem(entity)}
									>
										<UserCheck class="h-3 w-3" aria-hidden="true" />
										{entity.kind === 'person'
											? 'I know them'
											: 'Add to Your world'}
									</button>
									<button
										type="button"
										class="inline-flex items-center gap-1 text-2xs font-semibold text-muted-foreground hover:text-destructive disabled:opacity-50"
										disabled={busy.has(entity.id)}
										onclick={() => dontSave(entity)}
									>
										<X class="h-3 w-3" aria-hidden="true" />
										Don't save
									</button>
								{/if}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if ruledOut.length}
		<button
			type="button"
			class="self-start text-2xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			onclick={() => (showRuledOut = !showRuledOut)}
		>
			{showRuledOut ? 'Hide' : 'Show'}
			{ruledOut.length} that {ruledOut.length === 1 ? "doesn't" : "don't"} fit
		</button>
	{/if}

	{#if tray.pages.length}
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
				Sites read
			</span>
			{#each tray.pages as page (page.url)}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- a web page the search read, not a route in this app -->
				<a
					href={safeHref(page.url)}
					target="_blank"
					rel="noopener noreferrer"
					title={page.flagged
						? 'Flagged: this page has text aimed at AI tools. It was read with that in mind.'
						: (page.title ?? page.url)}
					class="inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium {page.flagged
						? 'border-warning/40 bg-warning/10 text-foreground hover:border-warning'
						: 'border-border bg-card text-muted-foreground hover:border-accent hover:text-accent'}"
				>
					{#if page.flagged}
						<TriangleAlert class="h-3 w-3 shrink-0 text-warning" aria-hidden="true" />
						<span class="sr-only">Flagged:</span>
					{:else}
						<Globe class="h-3 w-3 shrink-0" aria-hidden="true" />
					{/if}
					<span class="truncate">{siteName(page.url)}</span>
				</a>
			{/each}
		</div>
	{/if}

	{#if tray.stopped && tray.source !== 'graph' && tray.hop >= tray.hopLimit}
		<p
			class="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1.5 text-xs font-medium text-foreground"
		>
			Stopped at hop {tray.hop}. That's as far as one trail goes on its own; select entries
			and say so to keep going.
		</p>
	{:else if tray.stopped && !entities.length}
		<p
			class="rounded-lg border border-border bg-muted px-2.5 py-1.5 text-xs text-muted-foreground"
		>
			This search stopped before it found anything.
		</p>
	{/if}

	{#if showTrail}
		<details class="group rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-ink">
			<summary
				class="flex cursor-pointer list-none items-center gap-1.5 text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground"
			>
				<Network class="h-3 w-3 text-accent" aria-hidden="true" />
				Trail
				<span class="normal-case tracking-normal">
					· {trailHops}
					{trailHops === 1 ? 'hop' : 'hops'} out of {tray.hopLimit}
				</span>
				<span class="ml-auto normal-case tracking-normal group-open:hidden">Show</span>
				<span class="ml-auto hidden normal-case tracking-normal group-open:inline"
					>Hide</span
				>
			</summary>
			<ol class="mt-2 flex flex-col gap-1" aria-label="The search so far">
				{#each trail as row (row.id)}
					{@const RowIcon = row.kind ? (KIND_ICON[row.kind] ?? Sparkles) : BookUser}
					<li
						class="flex min-w-0 items-center gap-1.5 text-xs"
						style:padding-left="{Math.min(row.depth, 4) * 14}px"
					>
						{#if row.depth > 0}
							<span
								class="h-3 w-2 shrink-0 rounded-bl border-b border-l border-border"
							></span>
						{/if}
						<RowIcon
							class="h-3 w-3 shrink-0 {selectedIds.has(row.id)
								? 'text-accent'
								: 'text-muted-foreground'}"
							aria-hidden="true"
						/>
						<span
							class="min-w-0 truncate {selectedIds.has(row.id)
								? 'font-semibold text-foreground'
								: 'text-foreground'}"
						>
							{row.count ? `${row.count} ${row.name}` : row.name}
						</span>
						<span
							class="shrink-0 rounded-full border border-border bg-muted px-1.5 text-2xs text-muted-foreground"
						>
							{row.hop === 0 ? 'your graph' : `hop ${row.hop}`}
						</span>
					</li>
				{/each}
			</ol>
		</details>
	{/if}

	{#if steps.length || (latest && entities.length && !selected.length && tray.source !== 'graph')}
		<div class="flex flex-wrap items-center gap-1.5">
			<span class="text-2xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
				Next
			</span>
			{#each steps as step (step.id)}
				<button
					type="button"
					class="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/5 px-2.5 py-1 text-xs font-semibold text-foreground pressable hover:border-accent hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					disabled={!canSend}
					onclick={() => onNextStep(step)}
				>
					<span class="truncate">{step.label}</span>
					<ArrowRight class="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden="true" />
				</button>
			{/each}
			{#if !steps.length}
				<span class="text-xs text-muted-foreground">
					Select entries to go further, or say what to do next.
				</span>
			{/if}
		</div>
	{/if}
</section>

{#if cardDeps}
	<cardDeps.KnowledgeCardPopover
		anchor={card?.anchor ?? null}
		rootId={card?.id ?? null}
		label="About {card?.name ?? ''}"
		onClose={() => (card = null)}
		onRemoved={(id) => drop(id)}
	/>
{/if}
