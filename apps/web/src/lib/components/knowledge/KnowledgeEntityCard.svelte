<!-- apps/web/src/lib/components/knowledge/KnowledgeEntityCard.svelte -->
<!--
	One entry in the personal knowledge graph: who or what it is, how to reach it, what it's
	connected to (each relationship drills into the next card), where it shows up in BuildOS,
	what research found, and where every detail came from. "Find more" opens the "What should we
	look for?" dialog (the page owns it); progress shows here and in the research tray, both fed by
	the page's one research poll, and the card reloads when its research finishes (tasker 164).
	"Ask in chat" opens chat with the entry named. Tasker 160.
	"Not this one" (tasker 164): when research latched onto a different entity with the same name,
	one action retracts everything that research run added and remembers what this entry is not,
	so the next research skips it.
-->
<script lang="ts">
	import {
		ArrowLeft,
		Check,
		ChevronRight,
		Copy,
		Eye,
		EyeOff,
		Globe,
		Info,
		Loader2,
		Lock,
		MessageSquare,
		Pencil,
		Plus,
		Share2,
		Sparkles,
		Trash2,
		X
	} from '$lib/icons/lucide';
	import { toastService } from '$lib/stores/toast.store';
	import { safeHref } from '$lib/components/tables/table-cell-format';
	import {
		addablePredicates,
		CONTACT_PREDICATES,
		contactAction,
		contactHref,
		DETAIL_PREDICATES,
		displayValue,
		KIND_ICON,
		KIND_LABEL,
		knowledgeApi,
		knownVia,
		qualifierNote,
		type KnowledgeEntityPayload,
		type KnowledgeFactView,
		type KnowledgeKind
	} from './knowledge-client';
	import { isActiveTarget, researchStatusLine, type ResearchTarget } from './research-tray';
	import KnowledgeNameUpdates from './KnowledgeNameUpdates.svelte';
	import KnowledgeSharePanel from './KnowledgeSharePanel.svelte';

	interface Props {
		entityId: string;
		/** Open another entry (drill in). */
		onOpen: (id: string) => void;
		/** Go back one card, when there is one. */
		onBack?: () => void;
		onClose?: () => void;
		/** Something changed that the list should reflect. */
		onChanged?: () => void;
		onAskChat?: (entity: { id: string; name: string; kind: KnowledgeKind }) => void;
		/** This entry's latest research from the page's research queue, if any. */
		research?: ResearchTarget | null;
		/** Open the "What should we look for?" dialog for this entry. */
		onFindMore?: (entity: {
			id: string;
			name: string;
			kind: KnowledgeKind;
			researched_at: string | null;
		}) => void;
		/**
		 * "All people" / "All organizations": show every entry of this kind with this one picked.
		 * Without it the button links to /knowledge?kind=…&e=…, which does the same on arrival.
		 */
		onBrowseKind?: (entity: { id: string; kind: KnowledgeKind }) => void;
		/** This entry was hidden or deleted here (a task card then stops pointing at it). */
		onRemoved?: (id: string) => void;
	}

	let {
		entityId,
		onOpen,
		onBack,
		onClose,
		onChanged,
		onAskChat,
		research = null,
		onFindMore,
		onBrowseKind,
		onRemoved
	}: Props = $props();

	let detail = $state<KnowledgeEntityPayload | null>(null);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let openSource = $state<string | null>(null);
	let editingName = $state(false);
	let nameDraft = $state('');
	let adding = $state(false);
	let addPredicate = $state('');
	let addValue = $state('');
	let saving = $state(false);
	let confirmDelete = $state(false);
	let confirmNotThis = $state(false);
	let rejecting = $state(false);
	let heading = $state<HTMLElement | null>(null);

	const entity = $derived(detail?.entity ?? null);
	const isOwn = $derived(entity?.scope === 'private');
	const Icon = $derived(entity ? KIND_ICON[entity.kind] : null);
	const researching = $derived(research ? isActiveTarget(research) : false);
	const lastResearchedAt = $derived(
		entity?.enriched_at ??
			detail?.enrichment.find((t) => t.status === 'done')?.finished_at ??
			null
	);

	const visibleFacts = $derived(
		(detail?.facts ?? []).filter((f) => f.status === 'active' || f.status === 'disputed')
	);
	const suggestions = $derived((detail?.facts ?? []).filter((f) => f.status === 'suggested'));
	const contacts = $derived(
		visibleFacts.filter((f) => !f.entity && CONTACT_PREDICATES.includes(f.predicate))
	);
	const details = $derived(
		visibleFacts
			.filter((f) => !f.entity && DETAIL_PREDICATES.includes(f.predicate))
			.filter((f) => !(f.predicate === 'headline' && f.value === entity?.summary))
	);
	const notes = $derived(visibleFacts.filter((f) => f.predicate === 'note'));
	/** The latest research run that still has details on this entry (for "Not this one"). */
	const researchRun = $derived.by(() => {
		const runs: Record<string, { runId: string; count: number; at: string }> = {};
		for (const fact of detail?.facts ?? []) {
			if (fact.created_via !== 'enrichment' || !fact.run_id) continue;
			if (fact.status === 'retracted' || fact.status === 'superseded') continue;
			const run = (runs[fact.run_id] ??= { runId: fact.run_id, count: 0, at: '' });
			run.count++;
			if (fact.observed_at > run.at) run.at = fact.observed_at;
		}
		return Object.values(runs).sort((a, b) => b.at.localeCompare(a.at))[0] ?? null;
	});

	type Group = { label: string; facts: KnowledgeFactView[] };
	function group(facts: KnowledgeFactView[]): Group[] {
		const map = new Map<string, KnowledgeFactView[]>();
		for (const fact of facts) map.set(fact.label, [...(map.get(fact.label) ?? []), fact]);
		return [...map].map(([label, list]) => ({ label, facts: list }));
	}
	const outgoing = $derived(group(visibleFacts.filter((f) => f.entity && !f.entity.is_self)));
	/** "You know them" comes from the user's own entity; shown as a chip, not a row. */
	const knownFact = $derived(
		(detail?.incoming ?? []).find((f) => f.predicate === 'knows' && f.entity?.is_self) ?? null
	);
	const ownedFact = $derived(
		(detail?.incoming ?? []).find((f) => f.predicate === 'owns' && f.entity?.is_self) ?? null
	);
	const incoming = $derived(group((detail?.incoming ?? []).filter((f) => !f.entity?.is_self)));
	const addOptions = $derived(
		entity ? addablePredicates(entity.kind).filter((p) => !p.entity) : []
	);

	async function load(id: string, quiet = false) {
		if (!quiet) loading = true;
		loadError = null;
		try {
			detail = await knowledgeApi.get(id);
		} catch (error) {
			loadError = error instanceof Error ? error.message : 'Could not load this entry';
		} finally {
			loading = false;
		}
	}

	// The parent keys this card by entity id, so each entry gets a fresh card: load it once and
	// move focus to its name.
	$effect(() => {
		// preventScroll: the card may sit off-screen beside a long list or inside a task's popover.
		void load(entityId).then(() => heading?.focus({ preventScroll: true }));
	});

	// When this entry's research finishes (the page's queue sees it), reload to show what it
	// found. Plain variable: only the transition matters, not a reactive value.
	let lastResearchStatus: string | null = null;
	$effect(() => {
		const status = research?.status ?? null;
		const was = lastResearchStatus;
		lastResearchStatus = status;
		if (was && (was === 'queued' || was === 'running') && status && !researching) {
			// The page refreshes the list itself when research settles.
			void load(entityId, true);
		}
	});

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			toastService.success('Copied');
		} catch {
			toastService.error('Could not copy');
		}
	}

	async function saveName() {
		if (!entity) return;
		const name = nameDraft.trim();
		if (!name || name === entity.name) {
			editingName = false;
			return;
		}
		try {
			await knowledgeApi.update(entity.id, { name });
			editingName = false;
			await load(entity.id, true);
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not rename');
		}
	}

	async function setFact(fact: KnowledgeFactView, status: 'active' | 'retracted') {
		try {
			await knowledgeApi.setFactStatus(fact.id, status);
			await load(entityId, true);
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not update');
		}
	}

	async function removeFact(fact: KnowledgeFactView) {
		try {
			await knowledgeApi.deleteFact(fact.id);
			await load(entityId, true);
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not remove');
		}
	}

	async function addDetail(event: SubmitEvent) {
		event.preventDefault();
		if (!entity || !addPredicate || !addValue.trim()) return;
		saving = true;
		try {
			await knowledgeApi.addFacts(entity.id, [
				{ predicate: addPredicate, value: addValue.trim() }
			]);
			addValue = '';
			adding = false;
			await load(entity.id, true);
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not save');
		} finally {
			saving = false;
		}
	}

	async function notThisOne() {
		if (!entity || !researchRun || rejecting) return;
		rejecting = true;
		try {
			const result = await knowledgeApi.rejectResearch(entity.id, researchRun.runId);
			confirmNotThis = false;
			toastService.success(
				`Removed ${result.retracted} detail${result.retracted === 1 ? '' : 's'}.` +
					(result.hint ? ` Next research will skip ${result.hint.label}.` : '')
			);
			await load(entity.id, true);
			onChanged?.();
		} catch (error) {
			toastService.error(
				error instanceof Error ? error.message : 'Could not undo that research'
			);
		} finally {
			rejecting = false;
		}
	}

	/** The user's answer to the sorter: part of my world, or only mentioned in passing. */
	// circle is only sent for the viewer's own entries (a shared one belongs to someone else).
	const sortable = $derived(
		Boolean(
			entity &&
				entity.circle !== undefined &&
				(entity.kind === 'person' || entity.kind === 'org')
		)
	);
	const droppedAsNotName = $derived(
		entity?.status === 'hidden' && entity.hidden_reason === 'not_a_name'
	);
	let sorting = $state(false);
	async function setCircle(circle: 'inner' | 'public') {
		if (!entity || sorting) return;
		sorting = true;
		try {
			await knowledgeApi.update(entity.id, {
				circle,
				...(droppedAsNotName ? { status: 'active' as const } : {})
			});
			toastService.success(
				circle === 'public'
					? `${entity.name} moved to Just mentioned`
					: `${entity.name} is part of your world`
			);
			await load(entity.id, true);
			onChanged?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not move this');
		} finally {
			sorting = false;
		}
	}

	async function hide() {
		if (!entity) return;
		try {
			await knowledgeApi.update(entity.id, { status: 'hidden' });
			toastService.success(`Hid ${entity.name}`);
			onRemoved?.(entity.id);
			onChanged?.();
			onClose?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not hide');
		}
	}

	async function remove() {
		if (!entity) return;
		try {
			await knowledgeApi.remove(entity.id);
			toastService.success(`Deleted ${entity.name}`);
			onRemoved?.(entity.id);
			onChanged?.();
			onClose?.();
		} catch (error) {
			toastService.error(error instanceof Error ? error.message : 'Could not delete');
		}
	}

	function sourceLine(fact: KnowledgeFactView): string {
		if (!fact.sources.length) {
			return fact.created_via === 'manual'
				? 'Added by you'
				: fact.created_via === 'chat'
					? 'From a chat'
					: 'No source recorded';
		}
		const first = fact.sources[0]!;
		const where =
			first.title || (first.url ? first.url.replace(/^https?:\/\//, '') : first.type);
		const when = new Date(first.captured_at).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
		return `${where} · ${when}${fact.sources.length > 1 ? ` · +${fact.sources.length - 1} more` : ''}`;
	}

	const rowClass =
		'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8';
	const iconButton =
		'inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

{#snippet sourceToggle(fact: KnowledgeFactView)}
	<button
		type="button"
		class={iconButton}
		aria-label="Where this came from"
		aria-expanded={openSource === fact.id}
		title="Source"
		onclick={() => (openSource = openSource === fact.id ? null : fact.id)}
	>
		<Info class="h-3.5 w-3.5" />
	</button>
{/snippet}

{#snippet sourceDetail(fact: KnowledgeFactView)}
	{#if openSource === fact.id}
		<div
			class="mx-2 mb-1 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground"
		>
			<p>{sourceLine(fact)}</p>
			{#each fact.sources as source (source.id)}
				{#if source.quote}<p class="mt-1 italic text-foreground/80">
						“{source.quote}”
					</p>{/if}
				{#if safeHref(source.url)}
					<a
						href={safeHref(source.url)}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-1 block truncate text-accent underline-offset-2 hover:underline"
						>{source.url}</a
					>
				{/if}
			{/each}
			{#if isOwn || fact.scope === 'private'}
				<div class="mt-1.5 flex gap-3">
					<button
						type="button"
						class="font-medium text-foreground hover:underline"
						onclick={() => void removeFact(fact)}
					>
						Remove
					</button>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<div class="flex min-w-0 flex-col gap-4 p-4" aria-busy={loading}>
	<div class="flex items-start gap-2">
		{#if onBack}
			<button type="button" class="{iconButton} -ml-1.5" aria-label="Back" onclick={onBack}>
				<ArrowLeft class="h-4 w-4" />
			</button>
		{/if}
		{#if entity && Icon}
			<span
				class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
				aria-hidden="true"
			>
				<Icon class="h-4 w-4" />
			</span>
		{/if}
		<div class="min-w-0 flex-1">
			{#if entity}
				{#if editingName}
					<form
						class="flex items-center gap-1"
						onsubmit={(e) => {
							e.preventDefault();
							void saveName();
						}}
					>
						<input
							class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-base font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
							bind:value={nameDraft}
							aria-label="Name"
							maxlength="300"
						/>
						<button type="submit" class={iconButton} aria-label="Save name"
							><Check class="h-4 w-4" /></button
						>
						<button
							type="button"
							class={iconButton}
							aria-label="Cancel"
							onclick={() => (editingName = false)}
						>
							<X class="h-4 w-4" />
						</button>
					</form>
				{:else}
					<div class="flex min-w-0 items-center gap-1">
						<h2
							bind:this={heading}
							tabindex="-1"
							class="truncate text-base font-semibold leading-snug text-foreground focus:outline-none"
						>
							{entity.name}
						</h2>
						{#if isOwn}
							<button
								type="button"
								class="{iconButton} h-7 w-7"
								aria-label="Rename"
								onclick={() => {
									nameDraft = entity.name;
									editingName = true;
								}}
							>
								<Pencil class="h-3.5 w-3.5" />
							</button>
						{/if}
					</div>
				{/if}
				<p
					class="flex min-w-0 flex-wrap items-center gap-x-1 text-xs text-muted-foreground"
				>
					<span>{KIND_LABEL[entity.kind].one}</span>
					{#if entity.summary}<span aria-hidden="true">·</span><span class="truncate"
							>{entity.summary}</span
						>{/if}
				</p>
			{:else if loading}
				<div
					class="h-5 w-40 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
				<div
					class="mt-1.5 h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none"
				></div>
			{/if}
		</div>
		{#if onClose}
			<button type="button" class="{iconButton} -mr-1.5" aria-label="Close" onclick={onClose}>
				<X class="h-4 w-4" />
			</button>
		{/if}
	</div>

	{#if entity && isOwn}
		<!-- Tags still spelling another full name (after a rename or a fold, tasker 167). -->
		<KnowledgeNameUpdates entityId={entity.id} name={entity.name} />
	{/if}

	{#if loadError}
		<p
			class="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
		>
			{loadError}
		</p>
	{/if}

	{#if entity && detail}
		{#if detail.sharing}
			<KnowledgeSharePanel
				part="asks"
				entityId={entity.id}
				entityName={entity.name}
				sharing={detail.sharing}
				predicates={detail.facts.map((f) => f.predicate)}
				onChanged={() => void load(entity.id, true)}
			/>
		{/if}
		<div class="flex flex-wrap items-center gap-2">
			<span
				class="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
				title={isOwn
					? detail.sharing?.projects.length
						? 'Your notes and contact details are only yours. People in your shared projects see the public details; see "Who can see this".'
						: 'Only you can see this entry'
					: 'A shared entry. Your notes and contact details on it stay private.'}
			>
				{#if isOwn}<Lock class="h-3 w-3" aria-hidden="true" /> Only you{:else}<Share2
						class="h-3 w-3"
						aria-hidden="true"
					/> Shared entry{/if}
			</span>
			{#if knownFact}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
				>
					{knownVia(knownFact)}
				</span>
			{/if}
			{#if ownedFact}
				<span
					class="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
				>
					Yours
				</span>
			{/if}
		</div>

		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:bg-muted disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				disabled={researching || !onFindMore}
				onclick={() =>
					onFindMore?.({
						id: entity.id,
						name: entity.name,
						kind: entity.kind,
						researched_at: lastResearchedAt
					})}
			>
				{#if researching}
					<Loader2
						class="h-4 w-4 animate-spin motion-reduce:animate-none"
						aria-hidden="true"
					/> Researching…
				{:else}
					<Sparkles class="h-4 w-4 text-accent" aria-hidden="true" /> Find more
				{/if}
			</button>
			{#if onAskChat}
				<button
					type="button"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() =>
						onAskChat?.({ id: entity.id, name: entity.name, kind: entity.kind })}
				>
					<MessageSquare class="h-4 w-4" aria-hidden="true" /> Ask in chat
				</button>
			{/if}
			{#if Icon}
				<a
					href="/knowledge?kind={entity.kind}&e={entity.id}"
					class="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={(event) => {
						if (!onBrowseKind) return;
						event.preventDefault();
						onBrowseKind({ id: entity.id, kind: entity.kind });
					}}
				>
					<Icon class="h-4 w-4" aria-hidden="true" />
					All {KIND_LABEL[entity.kind].many.toLowerCase()}
					<ChevronRight class="h-3.5 w-3.5" aria-hidden="true" />
				</a>
			{/if}
		</div>
		{#if research}
			<p
				class="-mt-2 text-xs {research.status === 'failed'
					? 'text-destructive'
					: 'text-muted-foreground'}"
				role="status"
			>
				{researching
					? `${researchStatusLine(research)} New details land here with their sources.`
					: `Last research: ${researchStatusLine(research)}`}
			</p>
		{/if}
		{#if researchRun && !researching}
			<p class="-mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
				<span
					>{researchRun.count} detail{researchRun.count === 1 ? '' : 's'} from the last research.</span
				>
				<button
					type="button"
					class="font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-60"
					disabled={rejecting}
					title="Research found a different {entity.kind === 'person'
						? 'person'
						: 'one'} with the same name"
					onclick={() => (confirmNotThis ? void notThisOne() : (confirmNotThis = true))}
					onblur={() => (confirmNotThis = false)}
				>
					{confirmNotThis
						? `Remove ${researchRun.count === 1 ? 'it' : `all ${researchRun.count}`}?`
						: 'Not this one'}
				</button>
			</p>
		{/if}

		{#if suggestions.length}
			<section
				class="flex min-w-0 flex-col gap-1 rounded-md border border-accent/30 bg-accent/5 p-2"
			>
				<p class="micro-label px-1 text-accent">Found by research · check these</p>
				<ul class="flex min-w-0 flex-col gap-0.5">
					{#each suggestions as fact (fact.id)}
						<li class="flex min-w-0 flex-col">
							<div class="flex min-w-0 items-center gap-1 px-1">
								<span class="w-20 shrink-0 text-xs text-muted-foreground"
									>{fact.label}</span
								>
								<span class="min-w-0 flex-1 truncate text-sm text-foreground"
									>{fact.entity?.name ?? displayValue(fact)}</span
								>
								{@render sourceToggle(fact)}
								<button
									type="button"
									class={iconButton}
									aria-label="Keep {fact.label}"
									title="Keep"
									onclick={() => void setFact(fact, 'active')}
								>
									<Check class="h-4 w-4" />
								</button>
								<button
									type="button"
									class={iconButton}
									aria-label="Wrong {fact.label}"
									title="Wrong"
									onclick={() => void setFact(fact, 'retracted')}
								>
									<X class="h-4 w-4" />
								</button>
							</div>
							{@render sourceDetail(fact)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if contacts.length}
			<section class="flex min-w-0 flex-col gap-1" aria-label="Contact">
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{#each contacts as fact (fact.id)}
						{@const href = contactHref(fact.predicate, fact.value ?? '')}
						{@const note = qualifierNote(fact)}
						<li class="flex min-w-0 flex-col">
							<div class="flex min-w-0 items-center gap-1">
								<a
									{href}
									target={href?.startsWith('http') ? '_blank' : undefined}
									rel={href?.startsWith('http')
										? 'noopener noreferrer'
										: undefined}
									class="{rowClass} flex-1"
								>
									<span class="w-16 shrink-0 text-xs text-muted-foreground"
										>{fact.label}</span
									>
									<span class="min-w-0 flex-1 truncate">{displayValue(fact)}</span
									>
									{#if note}<span
											class="max-w-[35%] shrink truncate text-xs text-muted-foreground"
											>{note}</span
										>{/if}
									{#if href}<span class="shrink-0 text-xs font-medium text-accent"
											>{contactAction(fact.predicate)}</span
										>{/if}
								</a>
								<button
									type="button"
									class={iconButton}
									aria-label="Copy {displayValue(fact)}"
									title="Copy"
									onclick={() => void copy(displayValue(fact))}
								>
									<Copy class="h-3.5 w-3.5" />
								</button>
								{@render sourceToggle(fact)}
							</div>
							{@render sourceDetail(fact)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if details.length}
			<section class="flex min-w-0 flex-col gap-1">
				<p class="micro-label text-muted-foreground">About</p>
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{#each details as fact (fact.id)}
						<li class="flex min-w-0 flex-col">
							<div class="flex min-w-0 items-start gap-1">
								<div
									class="flex min-h-9 min-w-0 flex-1 items-start gap-2 px-2 py-1.5 text-sm [@media(pointer:fine)]:min-h-8"
								>
									<span class="w-16 shrink-0 pt-px text-xs text-muted-foreground"
										>{fact.label}</span
									>
									<span class="min-w-0 flex-1 text-foreground"
										>{displayValue(fact)}</span
									>
								</div>
								{@render sourceToggle(fact)}
							</div>
							{@render sourceDetail(fact)}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#each [...outgoing, ...incoming] as section (section.label)}
			<section class="flex min-w-0 flex-col gap-1">
				<p class="micro-label text-muted-foreground">{section.label}</p>
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{#each section.facts as fact (fact.id)}
						{@const other = fact.entity!}
						{@const OtherIcon = KIND_ICON[other.kind]}
						{@const note = qualifierNote(fact) ?? other.summary}
						<li>
							<button type="button" class={rowClass} onclick={() => onOpen(other.id)}>
								<OtherIcon
									class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span class="min-w-0 flex-1 truncate">{other.name}</span>
								{#if note}<span
										class="max-w-[45%] shrink truncate text-xs text-muted-foreground"
										>{note}</span
									>{/if}
								<ChevronRight
									class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if detail.incoming_truncated}
			<p class="text-xs text-muted-foreground">Showing the 200 most recent connections.</p>
		{/if}

		{#if notes.length}
			<section class="flex min-w-0 flex-col gap-1">
				<p class="micro-label text-muted-foreground">Notes</p>
				{#each notes as fact (fact.id)}
					<p
						class="whitespace-pre-line rounded-md bg-muted/40 px-3 py-2 text-sm text-foreground"
					>
						{fact.value}
					</p>
				{/each}
			</section>
		{/if}

		{#if detail.records.length}
			<section class="flex min-w-0 flex-col gap-1">
				<p class="micro-label text-muted-foreground">In your work</p>
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{#each detail.records as record (record.id)}
						<li>
							<a href={record.href ?? undefined} class={rowClass}>
								<span class="min-w-0 flex-1 truncate">{record.title}</span>
								{#if record.project_name}<span
										class="max-w-[45%] shrink truncate text-xs text-muted-foreground"
										>{record.project_name}</span
									>{/if}
								<ChevronRight
									class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if detail.sharing}
			<KnowledgeSharePanel
				part="who"
				entityId={entity.id}
				entityName={entity.name}
				sharing={detail.sharing}
				predicates={detail.facts.map((f) => f.predicate)}
				onChanged={() => void load(entity.id, true)}
			/>
		{/if}

		{#if adding}
			<form
				class="flex min-w-0 flex-col gap-2 rounded-md border border-border p-2.5"
				onsubmit={addDetail}
			>
				<div class="flex min-w-0 gap-2">
					<select
						class="w-36 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						bind:value={addPredicate}
						aria-label="What to add"
					>
						{#each addOptions as option (option.key)}
							<option value={option.key}>{option.label}</option>
						{/each}
					</select>
					<input
						class="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
						bind:value={addValue}
						aria-label="Value"
						placeholder="Value"
						maxlength="2000"
					/>
				</div>
				<div class="flex justify-end gap-2">
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
						onclick={() => (adding = false)}>Cancel</button
					>
					<button
						type="submit"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-60"
						disabled={saving || !addValue.trim()}
					>
						Save
					</button>
				</div>
			</form>
		{/if}

		<div class="flex flex-wrap items-center gap-1 border-t border-border pt-3">
			<button
				type="button"
				class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground"
				onclick={() => {
					addPredicate = addOptions[0]?.key ?? '';
					adding = true;
				}}
			>
				<Plus class="h-3.5 w-3.5" aria-hidden="true" /> Add detail
			</button>
			{#if sortable}
				{#if droppedAsNotName || entity?.circle === 'public'}
					<button
						type="button"
						class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground disabled:opacity-60"
						disabled={sorting}
						title="Show it in Your world"
						onclick={() => void setCircle('inner')}
					>
						<Eye class="h-3.5 w-3.5" aria-hidden="true" />
						{droppedAsNotName ? 'Show again' : 'Part of my world'}
					</button>
				{:else}
					<button
						type="button"
						class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground disabled:opacity-60"
						disabled={sorting}
						title="Only mentioned in passing: keep it searchable, off your list"
						onclick={() => void setCircle('public')}
					>
						<Globe class="h-3.5 w-3.5" aria-hidden="true" /> Just a mention
					</button>
				{/if}
			{/if}
			{#if isOwn}
				<button
					type="button"
					class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-foreground"
					onclick={() => void hide()}
				>
					<EyeOff class="h-3.5 w-3.5" aria-hidden="true" /> Hide
				</button>
				<button
					type="button"
					class="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground pressable hover:bg-muted hover:text-destructive"
					onclick={() => (confirmDelete ? void remove() : (confirmDelete = true))}
					onblur={() => (confirmDelete = false)}
				>
					<Trash2 class="h-3.5 w-3.5" aria-hidden="true" />
					{confirmDelete ? 'Delete for good?' : 'Delete'}
				</button>
			{/if}
			{#if lastResearchedAt}
				<span class="ml-auto text-xs text-muted-foreground">
					Researched {new Date(lastResearchedAt).toLocaleDateString(undefined, {
						month: 'short',
						day: 'numeric'
					})}
				</span>
			{/if}
		</div>
	{/if}
</div>
