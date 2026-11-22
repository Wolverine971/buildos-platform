<!-- apps/web/src/lib/components/knowledge/KnowledgeConnectionChips.svelte -->
<!--
	The overlaps on a person's card (tasker 166): "Also at Acme · 4", "Near Annapolis,
	Maryland · 9". Pressing a chip lists those people in place; pressing a name opens their card.
	Counts are other people in your world who share one of this person's employers or places;
	the person is never counted. Renders nothing when there is no overlap.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { ChevronRight, Loader2, MapPin } from '$lib/icons/lucide';
	import { KIND_ICON } from './knowledge-client';
	import {
		connectionChips,
		connectionLine,
		findConnections,
		type ConnectionChip,
		type KnowledgeConnectionPerson
	} from './connections-client';

	interface Props {
		entityId: string;
		onOpen: (id: string) => void;
	}

	let { entityId, onOpen }: Props = $props();

	const LIST = 12;
	const OrgIcon = KIND_ICON.org;

	let chips = $state.raw<ConnectionChip[]>([]);
	let openKey = $state<string | null>(null);
	let listed = $state.raw<KnowledgeConnectionPerson[]>([]);
	let listing = $state(false);

	const chipId = (chip: ConnectionChip) => `${chip.facet}:${chip.key}`;
	const openChip = $derived(chips.find((chip) => chipId(chip) === openKey) ?? null);

	onMount(() => {
		const id = entityId;
		void findConnections(
			{ related_to: id },
			{ facets: ['company', 'place'], limit: 0, facetLimit: 6 }
		)
			.then((answer) => {
				if (answer) chips = connectionChips(answer);
			})
			.catch(() => {
				// The chips are a nicety; the card works without them.
			});
	});

	let seq = 0;
	async function toggle(chip: ConnectionChip) {
		const key = chipId(chip);
		if (openKey === key) {
			openKey = null;
			return;
		}
		openKey = key;
		listed = [];
		listing = true;
		const mine = ++seq;
		try {
			const answer = await findConnections(
				chip.facet === 'company' ? { company: [chip.name] } : { place: [chip.name] },
				{ limit: LIST + 1 }
			);
			if (mine !== seq) return;
			listed = (answer?.people ?? [])
				.filter((person) => person.id !== entityId)
				.slice(0, LIST);
		} catch {
			if (mine === seq) openKey = null;
		} finally {
			if (mine === seq) listing = false;
		}
	}
</script>

{#if chips.length}
	<section class="flex min-w-0 flex-col gap-1.5" aria-label="Connections">
		<p class="micro-label text-muted-foreground">Connections</p>
		<div class="flex flex-wrap gap-1.5">
			{#each chips as chip (chipId(chip))}
				{@const on = chipId(chip) === openKey}
				<button
					type="button"
					class="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 text-sm pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {on
						? 'border-accent bg-accent/10 text-foreground'
						: 'border-border bg-card text-foreground hover:bg-muted'}"
					aria-expanded={on}
					title={chip.sample.join(', ')}
					onclick={() => void toggle(chip)}
				>
					{#if chip.facet === 'company'}
						<OrgIcon
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{:else}
						<MapPin
							class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{/if}
					<span class="min-w-0 truncate"
						>{chip.facet === 'company' ? 'Also at' : 'Near'} {chip.name}</span
					>
					<span class="stamp shrink-0 text-xs text-muted-foreground">{chip.people}</span>
				</button>
			{/each}
		</div>
		{#if openChip}
			{#if listing}
				<p class="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
					<Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Finding them
				</p>
			{:else}
				<ul class="-mx-2 flex min-w-0 flex-col gap-0.5">
					{#each listed as person (person.id)}
						{@const line = connectionLine(person)}
						<li>
							<button
								type="button"
								class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-8"
								onclick={() => onOpen(person.id)}
							>
								<span class="min-w-0 flex-1 truncate">{person.name}</span>
								{#if line}<span
										class="max-w-[55%] shrink truncate text-xs text-muted-foreground"
										>{line}</span
									>{/if}
								<ChevronRight
									class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
							</button>
						</li>
					{/each}
				</ul>
				{#if openChip.people > listed.length}
					<p class="px-1 text-xs text-muted-foreground">
						{openChip.people - listed.length} more. Open Connections on the Knowledge page
						to see everyone.
					</p>
				{/if}
			{/if}
		{/if}
	</section>
{/if}
