<!-- apps/web/src/routes/admin/experiments/question-tree/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import AdminPageHeader from '$lib/components/admin/AdminPageHeader.svelte';
	import { ArrowRight, Loader2, Network, Plus, RefreshCw } from '$lib/icons/lucide';
	import type {
		ApiEnvelope,
		QuestionTreeCreateResult,
		QuestionTreeModelPolicy,
		QuestionTreeRun
	} from '$lib/services/question-tree/types';

	const bootstrapKey = (runId: string) => `question-tree:${runId}:bootstrap`;

	let question = $state('');
	let modelPolicy = $state<QuestionTreeModelPolicy>('paid_floor_strict');
	let nodeLimit = $state(100);
	let runs = $state.raw<QuestionTreeRun[]>([]);
	let loading = $state(true);
	let creating = $state(false);
	let error = $state<string | null>(null);

	function statusClasses(status: QuestionTreeRun['status']): string {
		if (status === 'completed') return 'bg-success/15 text-success';
		if (status === 'completed_partial' || status === 'quota_paused')
			return 'bg-warning/15 text-warning';
		if (status === 'failed' || status === 'cancelled')
			return 'bg-destructive/15 text-destructive';
		if (status === 'running' || status === 'synthesizing') return 'bg-info/15 text-info';
		return 'bg-muted text-muted-foreground';
	}

	async function loadRuns() {
		loading = true;
		error = null;
		try {
			const response = await fetch('/api/admin/experiments/question-tree/runs');
			const payload = (await response.json()) as ApiEnvelope<{ runs: QuestionTreeRun[] }>;
			if (!response.ok || !payload.success || !payload.data) {
				throw new Error(payload.error || 'Unable to load Question Tree runs');
			}
			runs = payload.data.runs;
		} catch (loadError) {
			error =
				loadError instanceof Error
					? loadError.message
					: 'Unable to load Question Tree runs';
		} finally {
			loading = false;
		}
	}

	async function createRun(event: SubmitEvent) {
		event.preventDefault();
		if (creating || question.trim().length < 3) return;
		creating = true;
		error = null;
		try {
			const response = await fetch('/api/admin/experiments/question-tree/runs', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					question: question.trim(),
					model_policy: modelPolicy,
					node_limit: Math.min(100, Math.max(1, nodeLimit))
				})
			});
			const payload = (await response.json()) as ApiEnvelope<QuestionTreeCreateResult>;
			if (!response.ok || !payload.success || !payload.data?.run?.id) {
				throw new Error(payload.error || 'Unable to create Question Tree run');
			}
			try {
				sessionStorage.setItem(
					bootstrapKey(payload.data.run.id),
					JSON.stringify(payload.data)
				);
			} catch {
				// The detail endpoint remains the fallback when storage is unavailable.
			}
			await goto(`/admin/experiments/question-tree/${payload.data.run.id}`);
		} catch (createError) {
			error =
				createError instanceof Error
					? createError.message
					: 'Unable to create Question Tree run';
		} finally {
			creating = false;
		}
	}

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		}).format(new Date(value));
	}

	onMount(loadRuns);
</script>

<svelte:head>
	<title>Question Tree Experiment - Admin - BuildOS</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="admin-page">
	<AdminPageHeader
		title="Question Tree"
		description="Model-only research that follows the most valuable unknowns deeper"
		icon={Network}
		backHref="/admin"
	/>

	<div class="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
		<section class="admin-panel p-5 sm:p-6">
			<div class="mb-5">
				<p class="text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
					New experiment
				</p>
				<h2 class="mt-1 text-xl font-bold text-foreground">Start with one hard question</h2>
				<p class="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
					The first agent will propose a few broad unknowns. Later agents may produce zero
					to three questions that strengthen, refine, or try to disprove the working
					thesis.
				</p>
			</div>

			<form class="space-y-4" onsubmit={createRun}>
				<label class="block">
					<span class="mb-1.5 block text-xs font-bold text-foreground"
						>Original question</span
					>
					<textarea
						bind:value={question}
						rows="6"
						maxlength="4000"
						placeholder="What question should this tree investigate?"
						class="w-full resize-y rounded-xl border border-border bg-background px-3.5 py-3 text-sm leading-relaxed text-foreground shadow-inner outline-none transition placeholder:text-muted-foreground focus:border-accent focus:ring-2 focus:ring-accent/20"
						required
					></textarea>
				</label>

				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="mb-1.5 block text-xs font-bold text-foreground"
							>Model lane</span
						>
						<select
							bind:value={modelPolicy}
							class="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
						>
							<option value="paid_floor_strict"
								>Ling 2.6 Flash · paid · recommended</option
							>
							<option value="free_strict"
								>Ling 3.0 Flash · free · quota-limited</option
							>
						</select>
					</label>
					<label class="block">
						<span class="mb-1.5 block text-xs font-bold text-foreground"
							>Node ceiling</span
						>
						<input
							type="number"
							bind:value={nodeLimit}
							min="1"
							max="100"
							class="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
						/>
					</label>
				</div>

				<div
					class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs leading-relaxed text-foreground"
				>
					This version has no web access or tools. Results are model-only analysis and are
					not externally verified. One hundred nodes is a ceiling, not a target.
				</div>

				<button
					type="submit"
					disabled={creating || question.trim().length < 3}
					class="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-accent-foreground shadow-ink transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if creating}
						<Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" />
						Creating run
					{:else}
						<Plus class="h-4 w-4" />
						Start Question Tree
					{/if}
				</button>
			</form>
		</section>

		<aside class="admin-panel p-5 sm:p-6">
			<p class="text-2xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
				Run contract
			</p>
			<div class="mt-4 space-y-4">
				<div class="border-l-2 border-accent pl-3">
					<p class="text-sm font-bold text-foreground">Adaptive depth</p>
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
						The scheduler selects globally valuable questions instead of filling each
						level.
					</p>
				</div>
				<div class="border-l-2 border-info pl-3">
					<p class="text-sm font-bold text-foreground">Epistemic pressure</p>
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
						Every answer separates likely truths, likely errors, and unresolved
						uncertainty.
					</p>
				</div>
				<div class="border-l-2 border-success pl-3">
					<p class="text-sm font-bold text-foreground">Cheap by design</p>
					<p class="mt-1 text-xs leading-relaxed text-muted-foreground">
						The paid lane is capped at $0.02 per run and normally costs far less.
					</p>
				</div>
			</div>
		</aside>
	</div>

	<section class="admin-panel overflow-hidden">
		<header class="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
			<div>
				<h2 class="text-base font-bold text-foreground">Recent runs</h2>
				<p class="text-xs text-muted-foreground">
					Open a run to inspect its live tree and synthesis.
				</p>
			</div>
			<button
				type="button"
				class="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
				onclick={loadRuns}
				aria-label="Refresh recent runs"
			>
				<RefreshCw
					class={loading ? 'h-4 w-4 animate-spin motion-reduce:animate-none' : 'h-4 w-4'}
				/>
			</button>
		</header>

		{#if error}
			<div
				class="border-b border-border bg-destructive/10 px-5 py-3 text-sm text-destructive"
			>
				{error}
			</div>
		{/if}
		{#if loading && runs.length === 0}
			<div class="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
				<Loader2 class="h-4 w-4 animate-spin motion-reduce:animate-none" /> Loading runs
			</div>
		{:else if runs.length === 0}
			<div class="p-10 text-center text-sm text-muted-foreground">
				No Question Tree runs yet.
			</div>
		{:else}
			<div class="divide-y divide-border">
				{#each runs as run (run.id)}
					<a
						href={`/admin/experiments/question-tree/${run.id}`}
						class="group flex items-center gap-4 px-5 py-4 transition hover:bg-muted/50"
					>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-2">
								<span
									class={[
										'rounded-md px-2 py-0.5 text-2xs font-bold',
										statusClasses(run.status)
									]}
								>
									{run.status.replace('_', ' ')}
								</span>
								<span class="text-2xs text-muted-foreground"
									>{formatDate(run.created_at)}</span
								>
							</div>
							<p class="mt-1.5 line-clamp-2 text-sm font-semibold text-foreground">
								{run.root_question}
							</p>
							<p class="mt-1 text-xs text-muted-foreground">
								{run.nodes_completed}/{run.nodes_created} answered · depth {run.deepest_depth}
								· ${run.usage.cost_usd.toFixed(5)}
							</p>
						</div>
						<ArrowRight
							class="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
						/>
					</a>
				{/each}
			</div>
		{/if}
	</section>
</div>
