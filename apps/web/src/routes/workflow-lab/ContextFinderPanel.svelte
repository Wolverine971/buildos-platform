<!-- apps/web/src/routes/workflow-lab/ContextFinderPanel.svelte -->
<!--
	"Working from": Jev ranks the whole project for this question and shows what the specialist
	will read. Pin loads an item in full, drop removes it, add brings in something Jev missed.
	The edited plan rides along with the review; the worker only materializes it.
-->
<script lang="ts" module>
	import type { ContextPlanV1 as Plan } from '@buildos/agentic-chat-runtime/context-finder';
	export type EvidenceSelection = { plan: Plan; question: string; projectId: string };
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		applyContextPlanEdits,
		EMPTY_CONTEXT_PLAN_EDITS,
		hasContextPlanEdits,
		CONTEXT_FINDER_POLICY,
		type ContextFinderCandidateV1,
		type ContextPlanEditsV1,
		type ContextPlanItemV1,
		type ContextPlanV1
	} from '@buildos/agentic-chat-runtime/context-finder';

	type Preview = {
		status: 'selected' | 'empty' | 'unavailable';
		question: string;
		plan: ContextPlanV1 | null;
		ranker: {
			durationMs: number;
			costUsd: number | null;
			checked: number;
			unchecked: number;
		} | null;
		candidates: ContextFinderCandidateV1[];
		coverage: { fullChars: number; summaryChars: number; budgetChars: number };
	};

	let {
		projectId,
		question,
		onSelection
	}: {
		projectId: string;
		question: string;
		onSelection: (selection: EvidenceSelection | null) => void;
	} = $props();

	let preview = $state.raw<(Preview & { projectId: string }) | null>(null);
	let edits = $state.raw<ContextPlanEditsV1>(EMPTY_CONTEXT_PLAN_EDITS);
	let pending = $state(false);
	let error = $state('');
	let addKey = $state('');
	let generation = 0;
	// Hidden evidence must never ride along with a review.
	onDestroy(() => onSelection(null));

	// A preview belongs to one project and question; editing either hides it.
	const current = $derived(
		preview && preview.projectId === projectId && preview.question === question.trim()
			? preview
			: null
	);
	const plan = $derived(current?.plan ? applyContextPlanEdits(current.plan, edits) : null);
	const full = $derived(plan?.items.filter((item) => item.tier === 'full') ?? []);
	const nearby = $derived(plan?.items.filter((item) => item.tier === 'summary') ?? []);
	const pinCount = $derived(full.filter((item) => item.pinned).length);
	const addable = $derived(
		(current?.candidates ?? []).filter(
			(candidate) => !plan?.items.some((item) => item.id === candidate.id)
		)
	);

	function publish(nextEdits: ContextPlanEditsV1) {
		edits = nextEdits;
		const base = current;
		onSelection(
			base?.plan
				? {
						plan: applyContextPlanEdits(base.plan, nextEdits),
						question: base.question,
						projectId: base.projectId
					}
				: null
		);
	}

	async function find() {
		const trimmed = question.trim();
		if (pending || !projectId || trimmed.length < 3) return;
		const requested = { projectId, question: trimmed };
		const mine = ++generation;
		pending = true;
		error = '';
		try {
			const response = await fetch('/api/agent/context-finder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				cache: 'no-store',
				body: JSON.stringify(requested)
			});
			const body = await response.json().catch(() => ({}));
			if (mine !== generation) return;
			if (!response.ok || !body.preview)
				throw new Error(
					typeof body.error === 'string' ? body.error : 'Jev could not find evidence.'
				);
			// Bind to the text we sent; the server may normalize it (NFC, line endings).
			preview = { ...(body.preview as Preview), ...requested };
			addKey = '';
			edits = EMPTY_CONTEXT_PLAN_EDITS;
			publish(EMPTY_CONTEXT_PLAN_EDITS);
		} catch (cause) {
			if (mine === generation)
				error = cause instanceof Error ? cause.message : 'Jev could not find evidence.';
		} finally {
			if (mine === generation) pending = false;
		}
	}

	function togglePin(item: ContextPlanItemV1) {
		const pins = item.pinned
			? edits.pins.filter((id) => id !== item.id)
			: [...edits.pins, item.id];
		publish({
			...edits,
			pins,
			added: item.pinned ? edits.added.filter((x) => x.id !== item.id) : edits.added
		});
	}

	function drop(item: ContextPlanItemV1) {
		publish({
			pins: edits.pins.filter((id) => id !== item.id),
			drops: [...edits.drops, item.id],
			added: edits.added.filter((x) => x.id !== item.id)
		});
	}

	function add() {
		const candidate = addable.find((x) => x.id === addKey);
		if (!candidate) return;
		addKey = '';
		publish({
			...edits,
			drops: edits.drops.filter((id) => id !== candidate.id),
			added: [...edits.added, candidate]
		});
	}

	const score = (p: number | null) => (p === null ? 'added' : p.toFixed(2));
	const kindLabel = (kind: string) => kind[0]!.toUpperCase() + kind.slice(1);
</script>

<section class="rounded-lg border border-border bg-muted/20 p-4" aria-labelledby="evidence-heading">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 id="evidence-heading" class="text-sm font-semibold text-foreground">
				Working from
			</h2>
			<p class="mt-1 text-xs text-muted-foreground">
				Jev searches the whole project for this question and picks the sections the
				specialist reads. Pin, drop, or add before you start.
			</p>
		</div>
		<button
			type="button"
			onclick={find}
			disabled={pending || !projectId || question.trim().length < 3}
			class="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground disabled:opacity-40"
		>
			{pending ? 'Finding…' : current ? 'Find again' : 'Find evidence'}
		</button>
	</div>

	{#if error}
		<p role="alert" class="mt-3 text-sm text-destructive">{error}</p>
	{/if}

	{#if current}
		<div class="mt-4 space-y-3" role="status" aria-live="polite">
			<p class="text-xs text-muted-foreground">
				{#if current.ranker}
					Checked {current.ranker.checked} records{current.ranker.unchecked
						? ` (${current.ranker.unchecked} older ones skipped)`
						: ''} in {Math.round(current.ranker.durationMs)} ms{current.ranker
						.costUsd !== null
						? ` · $${current.ranker.costUsd.toFixed(4)}`
						: ''}
				{/if}
				{#if hasContextPlanEdits(edits)}· Edited by you{/if}
			</p>

			{#if current.status === 'unavailable'}
				<p class="text-sm text-foreground">
					Jev couldn’t rank this project right now. If you start the review anyway, Jev
					tries again when it begins.
				</p>
			{:else if !plan || plan.items.length === 0}
				<p class="text-sm text-foreground">
					Jev found nothing clearly relevant. Add a record below, or the specialist will
					say what evidence is missing.
				</p>
			{/if}

			{#if full.length}
				<ul class="space-y-2" aria-label="Loaded in full">
					{#each full as item (item.id)}
						<li
							class="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2"
						>
							<div class="min-w-0 text-sm text-foreground">
								<span aria-hidden="true">●</span>
								<span class="text-xs text-muted-foreground"
									>{kindLabel(item.kind)}</span
								>
								<span class="font-medium">{item.title}</span>
								{#if item.sections.length}
									<span class="block text-xs text-muted-foreground">
										› {item.sections.map((s) => s.heading).join(' · ')}
									</span>
								{:else if item.kind === 'document'}
									<span class="block text-xs text-muted-foreground"
										>› Opening</span
									>
								{/if}
							</div>
							<div class="flex shrink-0 items-center gap-2">
								<span class="text-xs tabular-nums text-muted-foreground"
									>{score(item.p)}</span
								>
								<button
									type="button"
									onclick={() => togglePin(item)}
									disabled={!item.pinned &&
										pinCount >= CONTEXT_FINDER_POLICY.maxPins}
									aria-pressed={!!item.pinned}
									aria-label={`${item.pinned ? 'Unpin' : 'Pin'} ${item.title}`}
									class="min-h-11 rounded-md px-2 text-xs font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-40"
									>{item.pinned ? 'Pinned' : 'Pin'}</button
								>
								<button
									type="button"
									onclick={() => drop(item)}
									aria-label={`Drop ${item.title}`}
									class="min-h-11 rounded-md px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
									>Drop</button
								>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if nearby.length}
				<details class="rounded-md border border-border bg-background px-3 py-2">
					<summary
						class="min-h-11 cursor-pointer py-2 text-xs font-medium text-foreground"
					>
						{nearby.length} nearby (the specialist sees one line each)
					</summary>
					<ul class="space-y-1 pb-2" aria-label="Nearby, summary only">
						{#each nearby as item (item.id)}
							<li
								class="flex items-center justify-between gap-3 text-sm text-foreground"
							>
								<span class="min-w-0 truncate">
									<span aria-hidden="true">◐</span>
									<span class="text-xs text-muted-foreground"
										>{kindLabel(item.kind)}</span
									>
									{item.title}
								</span>
								<span class="flex shrink-0 items-center gap-2">
									<span class="text-xs tabular-nums text-muted-foreground"
										>{score(item.p)}</span
									>
									<button
										type="button"
										onclick={() => togglePin(item)}
										disabled={pinCount >= CONTEXT_FINDER_POLICY.maxPins}
										aria-label={`Pin ${item.title}`}
										class="min-h-11 rounded-md px-2 text-xs font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-40"
										>Pin</button
									>
									<button
										type="button"
										onclick={() => drop(item)}
										aria-label={`Drop ${item.title}`}
										class="min-h-11 rounded-md px-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
										>Drop</button
									>
								</span>
							</li>
						{/each}
					</ul>
				</details>
			{/if}

			{#if addable.length}
				<div class="flex flex-wrap items-end gap-2">
					<label class="min-w-0 flex-1 text-xs font-medium text-foreground">
						Add a record Jev missed
						<select
							bind:value={addKey}
							class="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						>
							<option value="">Choose a record</option>
							{#each addable as candidate (candidate.id)}
								<option value={candidate.id}
									>{kindLabel(candidate.kind)} · {candidate.title}</option
								>
							{/each}
						</select>
					</label>
					<button
						type="button"
						onclick={add}
						disabled={!addKey || pinCount >= CONTEXT_FINDER_POLICY.maxPins}
						class="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground disabled:opacity-40"
						>Add</button
					>
				</div>
			{/if}

			{#if hasContextPlanEdits(edits)}
				<button
					type="button"
					onclick={() => publish(EMPTY_CONTEXT_PLAN_EDITS)}
					class="min-h-11 text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
					>Undo my edits</button
				>
			{/if}
		</div>
	{:else if !pending}
		<p class="mt-3 text-xs text-muted-foreground">
			Skip this and Jev still picks evidence when the review starts; you just won’t see or
			edit it first.
		</p>
	{/if}
</section>
