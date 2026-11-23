<!-- apps/web/src/lib/components/knowledge/KnowledgeReviewDetails.svelte -->
<!--
	One entry opened up inside the duplicates review or the merge dialog: where its details came
	from (which import, task, chat or research), every detail with its source, other spellings,
	the tasks and docs it is on, and who points at it. Read-only; loads when it is mounted, so
	the parent mounts it only while the entry is expanded.
-->
<script lang="ts">
	import { ExternalLink, Loader2 } from '$lib/icons/lucide';
	import {
		displayValue,
		knowledgeAddedLine,
		knowledgeApi,
		knownVia,
		qualifierNote,
		type KnowledgeFactView,
		type KnowledgeReviewDetail
	} from './knowledge-client';

	interface Props {
		id: string;
	}

	let { id }: Props = $props();

	let detail = $state.raw<KnowledgeReviewDetail | null>(null);
	let error = $state<string | null>(null);

	// Mounted once per expanded entry; a late answer for an entry that was closed is dropped.
	$effect(() => {
		let cancelled = false;
		knowledgeApi
			.reviewDetail(id)
			.then((found) => {
				if (!cancelled) detail = found;
			})
			.catch((err) => {
				if (!cancelled)
					error = err instanceof Error ? err.message : 'Could not load the details';
			});
		return () => {
			cancelled = true;
		};
	});

	const SHOWN = ['active', 'suggested', 'disputed'];
	const INCOMING_MAX = 8;

	function day(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, {
					month: 'short',
					day: 'numeric',
					year: 'numeric'
				});
	}

	function valueOf(fact: KnowledgeFactView) {
		let value = fact.entity ? fact.entity.name : displayValue(fact);
		// A bare ISO date ("2017-11-14") reads better as a date.
		if (!fact.entity && /^\d{4}-\d{2}-\d{2}$/.test(value)) value = day(`${value}T00:00:00`);
		// A profile link already names its site.
		const note = fact.predicate === 'profile_url' ? null : qualifierNote(fact);
		return note ? `${value} · ${note}` : value;
	}

	const facts = $derived(
		(detail?.facts ?? []).filter((f) => SHOWN.includes(f.status) && f.predicate !== 'alias')
	);
	const otherNames = $derived(
		(detail?.facts ?? [])
			.filter((f) => f.predicate === 'alias' && SHOWN.includes(f.status) && f.value)
			.map((f) => f.value!)
	);
	const incoming = $derived(detail?.incoming ?? []);

	/** Where the details came from, most details first. */
	const origins = $derived.by(() => {
		if (!detail) return [];
		const groups = new Map<string, { label: string; count: number; last: string }>();
		for (const fact of [...facts, ...incoming]) {
			const label = detail.origins[fact.id];
			if (!label) continue;
			const group = groups.get(label) ?? { label, count: 0, last: fact.observed_at };
			group.count += 1;
			if (fact.observed_at > group.last) group.last = fact.observed_at;
			groups.set(label, group);
		}
		return [...groups.values()].sort((a, b) => b.count - a.count);
	});
</script>

<div class="mt-2 flex flex-col gap-3 border-t border-border pt-2 text-xs">
	{#if error}
		<p class="text-destructive" role="alert">{error}</p>
	{:else if !detail}
		<p class="flex items-center gap-1.5 text-muted-foreground">
			<Loader2 class="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading details…
		</p>
	{:else}
		<section>
			<h4 class="font-medium text-foreground">Where it came from</h4>
			<ul class="mt-1 flex flex-col gap-0.5 text-muted-foreground">
				<li>
					{knowledgeAddedLine(detail.entity.created_at, detail.entity.created_via, true)}
				</li>
				{#each origins as origin (origin.label)}
					<li class="break-words">
						<span class="text-foreground">{origin.label}</span>
						· {origin.count}
						{origin.count === 1 ? 'detail' : 'details'} · {day(origin.last)}
					</li>
				{/each}
			</ul>
		</section>

		<section>
			<h4 class="font-medium text-foreground">Details</h4>
			{#if facts.length}
				<dl class="mt-1 flex flex-col gap-1.5">
					{#each facts as fact (fact.id)}
						<div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2">
							<dt class="text-muted-foreground">{fact.label}</dt>
							<dd class="min-w-0">
								<span class="break-words text-foreground">{valueOf(fact)}</span>
								{#if fact.status !== 'active'}
									<span
										class="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground"
										>{fact.status === 'suggested'
											? 'suggestion'
											: 'in question'}</span
									>
								{/if}
								<span class="block break-words text-muted-foreground">
									{detail.origins[fact.id] ?? 'Saved earlier'} · {day(
										fact.observed_at
									)}
								</span>
							</dd>
						</div>
					{/each}
				</dl>
			{:else}
				<p class="mt-1 text-muted-foreground">Nothing saved on this entry yet.</p>
			{/if}
		</section>

		{#if otherNames.length}
			<section>
				<h4 class="font-medium text-foreground">Other spellings</h4>
				<p class="mt-1 break-words text-muted-foreground">{otherNames.join(' · ')}</p>
			</section>
		{/if}

		{#if detail.records.length}
			<section>
				<h4 class="font-medium text-foreground">On tasks &amp; docs</h4>
				<ul class="mt-1 flex flex-col gap-0.5">
					{#each detail.records as record (record.id)}
						<li class="min-w-0 break-words text-muted-foreground">
							{#if record.href}
								<a
									class="text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
									href={record.href}
									target="_blank"
									rel="noopener">{record.title}</a
								>
							{:else}
								<span class="text-foreground">{record.title}</span>
							{/if}
							{#if record.project_name}· {record.project_name}{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if incoming.length}
			<section>
				<h4 class="font-medium text-foreground">Connections</h4>
				<ul class="mt-1 flex flex-col gap-0.5 text-muted-foreground">
					{#each incoming.slice(0, INCOMING_MAX) as fact (fact.id)}
						<li class="break-words">
							{#if fact.predicate === 'knows' && fact.entity?.is_self}
								<span class="text-foreground">{knownVia(fact)}</span>
							{:else}
								{fact.label}:
								<span class="text-foreground">{fact.entity?.name}</span>
							{/if}
							· {detail.origins[fact.id] ?? 'Saved earlier'}
						</li>
					{/each}
					{#if incoming.length > INCOMING_MAX || detail.incoming_truncated}
						<li>…and more on the full card</li>
					{/if}
				</ul>
			</section>
		{/if}

		<a
			class="inline-flex w-fit items-center gap-1 text-muted-foreground underline decoration-border underline-offset-2 hover:text-foreground"
			href="/knowledge?e={detail.entity.id}"
			target="_blank"
			rel="noopener"
		>
			Open the full card in a new tab
			<ExternalLink class="h-3.5 w-3.5" aria-hidden="true" />
		</a>
	{/if}
</div>
