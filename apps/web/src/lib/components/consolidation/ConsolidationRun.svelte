<!-- apps/web/src/lib/components/consolidation/ConsolidationRun.svelte -->
<!--
	A consolidation run, start to finish: the survey while it works, then up to
	four question cards at a time, what was decided without asking (each can be
	left as it is), and one Apply for everything with one Undo. Unanswered cards
	never apply: their docs stay as they are.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		chosenMerge,
		describeEdits,
		describeOps,
		mergePieceKey,
		type ConsolidationCluster,
		type ConsolidationQuestion
	} from '@buildos/shared-agent-ops/consolidation';
	import type { ConsolidationRunView } from './consolidation-types';
	import Button from '$lib/components/ui/Button.svelte';
	import ConsolidationMerge from './ConsolidationMerge.svelte';
	import ConsolidationQuestionCard from './ConsolidationQuestionCard.svelte';
	import { ArrowLeft, LoaderCircle, RotateCcw } from '$lib/icons/lucide';

	let { initial, projectName }: { initial: ConsolidationRunView; projectName: string } = $props();

	// Polled from the server while the worker is busy; replaced after every action.
	// svelte-ignore state_referenced_locally
	let view = $state.raw<ConsolidationRunView>(initial);
	let busyId = $state<string | null>(null);
	let actionError = $state<string | null>(null);
	let showAllDecided = $state(false);
	/** What Apply would unlink, waiting on "Apply anyway". */
	let confirmLines = $state<string[] | null>(null);

	const run = $derived(view.run);
	const plan = $derived(run.plan);
	const projectCount = $derived(run.project_ids.length);
	const docCount = $derived(
		typeof run.progress.documents === 'number' ? (run.progress.documents as number) : null
	);
	const openQuestions = $derived(view.questions.filter((question) => question.status === 'open'));
	// A card stays in its slot until answered: new cards arriving mid-poll (merge
	// questions rank first) must not push out one the owner is typing into.
	let slots: string[] = [];
	const shown = $derived.by(() => {
		const open = new Map(openQuestions.map((question) => [question.id, question]));
		const kept = slots.filter((id) => open.has(id));
		for (const question of openQuestions) {
			if (kept.length >= 4) break;
			if (!kept.includes(question.id)) kept.push(question.id);
		}
		slots = kept;
		return kept.map((id) => open.get(id)!);
	});
	const questionById = $derived(
		new Map(view.questions.map((question) => [question.id, question]))
	);
	const decided = $derived(
		(plan?.clusters ?? []).filter(
			(cluster) => !cluster.question_id && cluster.ops.some((op) => op.op !== 'keep')
		)
	);
	const checked = $derived(
		(plan?.clusters ?? []).filter(
			(cluster) => !cluster.question_id && cluster.ops.every((op) => op.op === 'keep')
		)
	);
	const answered = $derived(
		(plan?.clusters ?? []).filter((cluster) => {
			const question = cluster.question_id ? questionById.get(cluster.question_id) : null;
			return question && question.status !== 'open';
		})
	);
	const mergeByKey = $derived(new Map(view.merges.map((merge) => [merge.cluster_key, merge])));
	const merging = $derived(
		view.merges.some(
			(merge) =>
				merge.status !== 'ready' &&
				merge.status !== 'failed' &&
				!plan?.clusters.find((cluster) => cluster.key === merge.cluster_key)?.vetoed
		)
	);
	const working = $derived(
		run.status === 'surveying' ||
			run.status === 'applying' ||
			merging ||
			view.waiting.some((key) => isReplanning(key))
	);
	function mergeQuestions(key: string) {
		return view.questions.filter((question) => mergePieceKey(question.piece) === key);
	}

	function projectName_(id: string) {
		return plan?.projects[id]?.name ?? 'another project';
	}
	function docTitle(id: string) {
		return plan?.documents[id]?.title ?? 'a document';
	}
	const names = {
		project: projectName_,
		document: docTitle,
		inside: (id: string) => plan?.documents[id]?.inside ?? []
	};

	function isReplanning(key: string) {
		const cluster = plan?.clusters.find((item) => item.key === key);
		const question = cluster?.question_id ? questionById.get(cluster.question_id) : null;
		return Boolean(
			question &&
				question.status === 'answered' &&
				question.answer &&
				'reading' in question.answer &&
				!question.answer.reading.option_id
		);
	}

	function answerSummary(cluster: ConsolidationCluster): string {
		const question = cluster.question_id ? questionById.get(cluster.question_id) : null;
		if (!question?.answer) return '';
		const answer = question.answer;
		if (answer.via === 'text' || answer.via === 'chat') {
			return answer.reading.option_id
				? (question.options.find((option) => option.id === answer.reading.option_id)
						?.label ?? answer.reading.readback)
				: `“${answer.reading.readback}”`;
		}
		const label =
			question.options.find((option) => option.id === answer.option_id)?.label ?? '';
		return answer.via === 'skip' ? `Skipped: ${label.toLowerCase()}` : label;
	}

	// The latest request wins: a slow poll sent before an answer must not reopen its card.
	let refreshSeq = 0;
	async function refresh() {
		const seq = ++refreshSeq;
		const response = await fetch(`/api/consolidation/runs/${run.id}`);
		const body = await response.json().catch(() => null);
		if (seq === refreshSeq && response.ok && body?.data)
			view = body.data as ConsolidationRunView;
	}

	let timer: ReturnType<typeof setInterval> | null = null;
	$effect(() => {
		if (!working) return;
		timer = setInterval(() => void refresh(), 2500);
		return () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
	});
	onDestroy(() => {
		if (timer) clearInterval(timer);
	});

	async function post(path: string, body: Record<string, unknown> = {}) {
		const response = await fetch(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		});
		const json = await response.json().catch(() => null);
		if (!response.ok) throw new Error(json?.error || 'That did not work. Try again.');
		return json?.data ?? null;
	}

	async function submit(question: ConsolidationQuestion, body: Record<string, unknown>) {
		busyId = question.id;
		try {
			const data = await post(`/api/consolidation/questions/${question.id}`, body);
			await refresh();
			return { reply: typeof data?.reply === 'string' ? data.reply : null };
		} finally {
			busyId = null;
		}
	}

	async function act(kind: 'apply' | 'undo' | 'cancel', body: Record<string, unknown> = {}) {
		busyId = kind;
		actionError = null;
		confirmLines = null;
		try {
			const data = await post(`/api/consolidation/runs/${run.id}/${kind}`, body);
			if (kind === 'apply' && Array.isArray(data?.confirm)) confirmLines = data.confirm;
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'That did not work.';
		} finally {
			await refresh();
			busyId = null;
		}
	}

	async function veto(cluster: ConsolidationCluster) {
		busyId = cluster.key;
		actionError = null;
		try {
			await post(`/api/consolidation/runs/${run.id}/veto`, {
				cluster_key: cluster.key,
				vetoed: !cluster.vetoed
			});
			await refresh();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'That did not work.';
		} finally {
			busyId = null;
		}
	}

	function describeOption(question: ConsolidationQuestion) {
		const mergeKey = mergePieceKey(question.piece);
		if (mergeKey) {
			// Merge cards change facts in the draft, never documents.
			const facts = new Map(
				(mergeByKey.get(mergeKey)?.ledger?.facts ?? []).map((fact) => [fact.id, fact.text])
			);
			return (optionId: string) =>
				describeEdits(
					question.options.find((option) => option.id === optionId)?.edits ?? [],
					(id) => facts.get(id) ?? id
				);
		}
		return (optionId: string) =>
			describeOps(
				question.options.find((option) => option.id === optionId)?.ops ?? [],
				names
			);
	}

	async function retryMerge(key: string) {
		busyId = `merge:${key}`;
		actionError = null;
		try {
			await post(`/api/consolidation/runs/${run.id}/merge`, { cluster_key: key });
			await refresh();
		} catch (error) {
			actionError = error instanceof Error ? error.message : 'That did not work.';
		} finally {
			busyId = null;
		}
	}

	const KIND_LABEL: Record<ConsolidationCluster['kind'], string> = {
		misfiled: 'In the wrong project',
		fragments: 'Scattered notes',
		versions: 'Versions',
		superseded: 'Replaced',
		twins: 'Identical copies'
	};

	const stageText = $derived.by(() => {
		const stage = run.progress.stage;
		if (stage === 'grouping')
			return `Reading ${docCount ?? 'the'} docs across ${run.progress.projects ?? projectCount} projects`;
		if (stage === 'deciding')
			return `Deciding what to do with ${run.progress.groups ?? 'each'} groups`;
		return 'Starting';
	});

	const receipt = $derived(run.receipt);
</script>

<div class="grid gap-6">
	<header class="grid gap-2">
		<a
			href="/projects/{run.root_project_id}"
			class="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeft class="h-4 w-4" />{projectName}
		</a>
		<h1 class="text-2xl font-semibold text-foreground">Consolidate docs</h1>
		<p class="text-sm text-muted-foreground">
			{projectName}{projectCount > 1
				? ` and ${projectCount - 1} sub-project${projectCount === 2 ? '' : 's'}`
				: ''}{docCount !== null ? ` · ${docCount} docs` : ''}
		</p>
	</header>

	{#if run.status === 'surveying'}
		<div class="panel flex items-center gap-3" aria-live="polite">
			<LoaderCircle class="h-5 w-5 animate-spin text-muted-foreground" />
			<div>
				<p class="font-medium text-foreground">{stageText}…</p>
				<p class="text-sm text-muted-foreground">
					Nothing changes until you apply. You can leave this page; the work continues.
				</p>
			</div>
			<Button
				class="ml-auto"
				variant="ghost"
				size="sm"
				loading={busyId === 'cancel'}
				disabled={busyId !== null}
				onclick={() => act('cancel')}>Cancel</Button
			>
		</div>
		{#if actionError}<p class="text-sm text-destructive" role="alert">{actionError}</p>{/if}
	{:else if run.status === 'failed'}
		<div class="panel" role="alert">
			<p class="font-medium text-foreground">This survey did not finish.</p>
			<p class="text-sm text-muted-foreground">
				{run.error ?? 'Something went wrong.'} Nothing in your projects changed.
			</p>
		</div>
	{:else if run.status === 'cancelled'}
		<div class="panel">
			<p class="text-foreground">Cancelled. Nothing in your projects changed.</p>
		</div>
	{/if}

	{#if run.status === 'waiting' || run.status === 'review' || run.status === 'applying'}
		{#if openQuestions.length}
			<section class="grid gap-3" aria-labelledby="needs-you">
				<h2 id="needs-you" class="section-title">Needs you · {openQuestions.length}</h2>
				{#each shown as question (question.id)}
					<ConsolidationQuestionCard
						{question}
						busy={busyId === question.id}
						describe={describeOption(question)}
						onSubmit={(body) => submit(question, body)}
					/>
				{/each}
				{#if openQuestions.length > shown.length}
					<p class="text-sm text-muted-foreground">
						{openQuestions.length - shown.length} more after these.
					</p>
				{/if}
			</section>
		{/if}

		{#if decided.length}
			<section class="grid gap-2" aria-labelledby="decided">
				<h2 id="decided" class="section-title">Decided for you · {decided.length}</h2>
				<ul class="list">
					{#each showAllDecided ? decided : decided.slice(0, 8) as cluster (cluster.key)}
						<li class:vetoed={cluster.vetoed}>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">
									<span class="kind">{KIND_LABEL[cluster.kind]}</span>
									{cluster.title}
								</p>
								<p class="text-sm text-muted-foreground">
									{cluster.vetoed
										? 'Left as it is.'
										: describeOps(cluster.ops, names)}
									{#if cluster.reason && !cluster.vetoed}<span class="block"
											>{cluster.reason}</span
										>{/if}
								</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								loading={busyId === cluster.key}
								disabled={run.status === 'applying' || busyId === 'apply'}
								onclick={() => veto(cluster)}
							>
								{cluster.vetoed ? 'Do it' : 'Leave it'}
							</Button>
						</li>
					{/each}
				</ul>
				{#if decided.length > 8}
					<button
						type="button"
						class="w-fit text-sm text-muted-foreground underline"
						onclick={() => (showAllDecided = !showAllDecided)}
					>
						{showAllDecided ? 'Show fewer' : `Show all ${decided.length}`}
					</button>
				{/if}
			</section>
		{/if}

		{#if answered.length}
			<section class="grid gap-2" aria-labelledby="answered">
				<h2 id="answered" class="section-title">Your answers · {answered.length}</h2>
				<ul class="list">
					{#each answered as cluster (cluster.key)}
						{@const merge = mergeByKey.get(cluster.key)}
						{@const unstarted = !merge && chosenMerge(cluster, view.questions) !== null}
						<li>
							<div class="min-w-0">
								<p class="text-sm font-medium text-foreground">{cluster.title}</p>
								<p class="text-sm text-muted-foreground">
									{#if cluster.vetoed}
										Left as it is.
									{:else if mergeByKey.has(cluster.key)}
										{answerSummary(cluster)}
									{:else if isReplanning(cluster.key)}
										<LoaderCircle
											class="mr-1 inline h-3.5 w-3.5 animate-spin"
										/>Working out your answer: {answerSummary(cluster)}
									{:else}
										{answerSummary(cluster)}
									{/if}
								</p>
								{#if unstarted && !cluster.vetoed}
									<p class="mt-2 text-sm text-destructive" role="alert">
										The merge did not start. Nothing changed.
									</p>
									<Button
										class="mt-1"
										variant="secondary"
										size="sm"
										loading={busyId === `merge:${cluster.key}`}
										onclick={() => retryMerge(cluster.key)}>Try again</Button
									>
								{/if}
								{#if merge && !cluster.vetoed}
									<div class="mt-2">
										<ConsolidationMerge
											{merge}
											questions={mergeQuestions(cluster.key)}
											sourceTitle={docTitle}
											projectName={projectName_}
											busy={busyId === `merge:${cluster.key}`}
											onRetry={() => retryMerge(cluster.key)}
										/>
									</div>
								{/if}
							</div>
							{#if isReplanning(cluster.key) || merge || unstarted}
								<!-- Still being worked out, or a merge: it can be dropped for "leave it". -->
								<Button
									variant="ghost"
									size="sm"
									loading={busyId === cluster.key}
									disabled={run.status === 'applying' || busyId === 'apply'}
									onclick={() => veto(cluster)}
								>
									{cluster.vetoed ? 'Do it' : 'Leave it'}
								</Button>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if checked.length}
			<p class="text-sm text-muted-foreground">
				Also looked at and left alone: {checked.map((cluster) => cluster.title).join(', ')}.
			</p>
		{/if}

		{#if plan && plan.clusters.length === 0}
			<div class="panel">
				<p class="text-foreground">Nothing to consolidate. These docs look well filed.</p>
			</div>
		{/if}

		<div class="apply-bar">
			<div class="min-w-0 text-sm">
				<p class="font-medium text-foreground">
					{view.ready_count === 0
						? 'No changes to apply yet'
						: `${view.ready_count} change${view.ready_count === 1 ? '' : 's'} ready`}
				</p>
				<p class="text-muted-foreground">
					{#if view.waiting.length}
						{view.waiting.length} group{view.waiting.length === 1 ? '' : 's'} still waiting
						on you. Applying now leaves {view.waiting.length === 1 ? 'it' : 'them'} as {view
							.waiting.length === 1
							? 'it is'
							: 'they are'}.
					{:else}
						Moves and archives apply together. One Undo puts everything back.
					{/if}
				</p>
				{#if confirmLines}
					<div class="mt-2" role="alert">
						<p class="text-foreground">
							Moving these also changes things Undo may not bring back:
						</p>
						<ul class="ml-4 list-disc text-muted-foreground">
							{#each confirmLines as line (line)}<li>{line}</li>{/each}
						</ul>
						<div class="mt-2 flex flex-wrap gap-2">
							<Button
								variant="primary"
								size="sm"
								loading={busyId === 'apply'}
								disabled={busyId !== null}
								onclick={() => act('apply', { accept_side_effects: true })}
								>Apply anyway</Button
							>
							<Button
								variant="ghost"
								size="sm"
								disabled={busyId !== null}
								onclick={() => (confirmLines = null)}>Not now</Button
							>
						</div>
					</div>
				{/if}
				{#if actionError}<p class="text-destructive" role="alert">{actionError}</p>{/if}
			</div>
			<div class="flex flex-wrap gap-2">
				<Button
					variant="ghost"
					size="sm"
					disabled={busyId !== null || run.status === 'applying'}
					onclick={() => act('cancel')}>Cancel run</Button
				>
				<Button
					variant="primary"
					size="sm"
					loading={busyId === 'apply' || run.status === 'applying'}
					disabled={view.ready_count === 0 || busyId !== null || confirmLines !== null}
					onclick={() => act('apply')}
				>
					Apply {view.ready_count || ''}
				</Button>
			</div>
		</div>
	{/if}

	{#if (run.status === 'applied' || run.status === 'undone') && receipt}
		<section class="grid gap-3" aria-labelledby="receipt">
			<h2 id="receipt" class="section-title">
				{run.status === 'undone' ? 'Undone' : 'Applied'}
			</h2>
			<ul class="list">
				{#each receipt.moved as item (item.id)}
					<li>
						<p class="text-sm text-foreground">
							Moved {item.kind === 'task' ? 'task ' : ''}<b>{item.title}</b> to {projectName_(
								item.to_project_id
							)}
						</p>
					</li>
				{/each}
				{#each receipt.created ?? [] as item (item.id)}
					<li>
						<p class="text-sm text-foreground">
							Created <b>{item.title}</b> in {projectName_(item.project_id)}
						</p>
					</li>
				{/each}
				{#each receipt.archived as item (item.id)}
					<li>
						<p class="text-sm text-foreground">
							Archived <b>{item.title}</b>{#if item.replaced_by_id}; see “{docTitle(
									item.replaced_by_id
								)}”{/if}
						</p>
					</li>
				{/each}
				{#each receipt.failures as item, index (index)}
					<li><p class="text-sm text-destructive">{item.title}: {item.message}</p></li>
				{/each}
			</ul>
			{#if receipt.unanswered.length}
				<p class="text-sm text-muted-foreground">
					{receipt.unanswered.length} unanswered group{receipt.unanswered.length === 1
						? ' was'
						: 's were'} left as they were.
				</p>
			{/if}
			{#if run.status === 'applied'}
				{#if receipt.undo?.failures.length}
					<p class="text-sm text-destructive" role="alert">
						{run.error ?? 'Undo did not finish.'} Not put back yet: {receipt.undo.failures.join(
							'; '
						)}
					</p>
				{:else if run.error}
					<p class="text-sm text-muted-foreground">{run.error}</p>
				{/if}
				<div>
					<Button
						variant="secondary"
						size="sm"
						icon={RotateCcw}
						loading={busyId === 'undo'}
						onclick={() => act('undo')}
						>{receipt.undo ? 'Undo the rest' : 'Undo all'}</Button
					>
				</div>
				{#if actionError}<p class="text-sm text-destructive" role="alert">
						{actionError}
					</p>{/if}
			{:else if receipt.undo}
				<p class="text-sm text-muted-foreground">
					Put back what Apply changed{#if receipt.created?.length}; the merged doc{receipt
							.created.length === 1
							? ' was'
							: 's were'} archived{/if}.
				</p>
				{#if receipt.undo.left?.length}
					<p class="text-sm text-foreground">
						Left as they are, because they changed after Apply: {receipt.undo.left.join(
							'; '
						)}
					</p>
				{/if}
			{/if}
		</section>
	{/if}
</div>

<style>
	.panel {
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 16px 18px;
		background: hsl(var(--card));
	}
	.section-title {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}
	.list {
		display: grid;
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		background: hsl(var(--card));
		overflow: hidden;
	}
	.list li {
		display: flex;
		gap: 12px;
		align-items: flex-start;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid hsl(var(--border));
	}
	.list li:last-child {
		border-bottom: 0;
	}
	.list li.vetoed p {
		opacity: 0.6;
	}
	.kind {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
		margin-right: 6px;
	}
	.apply-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 20px;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border: 1px solid hsl(var(--foreground) / 0.85);
		border-radius: 12px;
		background: hsl(var(--card));
	}
</style>
