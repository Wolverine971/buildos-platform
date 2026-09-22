<!-- apps/web/src/lib/components/agent/AnswerComparisonLab.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		Check,
		Columns2,
		Eye,
		Lock,
		Plus,
		ThumbsUp,
		TriangleAlert,
		X
	} from '$lib/icons/lucide';
	import {
		ANSWER_COMPARISON_LABELS,
		ANSWER_COMPARISON_LIMITS
	} from '$lib/types/answer-comparison';
	import type {
		AnswerComparisonLabData,
		CandidateInput,
		CandidateReceipts,
		ComparisonDetail,
		ComparisonLabel,
		ComparisonSetKind,
		ComparisonSummary,
		CreateComparisonRequest,
		RevealRequest,
		RubricScore,
		Scoreboard,
		VoteChoice,
		VoteRequest
	} from '$lib/types/answer-comparison';

	let { initial }: { initial: AnswerComparisonLabData } = $props();
	// The route keys this lab by its loaded data. Within one editing session, server
	// responses update these copies without discarding unsaved builder or vote input.
	const seed = untrack(() => initial);
	const sources = seed.sources;
	const sourcesNotice = seed.sourcesNotice;

	let comparisons = $state.raw<ComparisonSummary[]>(seed.comparisons);
	let scoreboard = $state.raw<Scoreboard>(seed.scoreboard);
	let includeHeldOut = $state(false);

	let selectedId = $state('');
	let detail = $state.raw<ComparisonDetail | null>(null);
	let busy = $state<'load' | 'create' | 'vote' | 'reveal' | 'scoreboard' | null>(null);
	let error = $state('');
	let notice = $state('');

	// Builder state
	let showBuilder = $state(false);
	let sourceMode = $state<'runs' | 'manual'>(sources.length ? 'runs' : 'manual');
	let selectedGroupKey = $state(sources[0]?.key ?? '');
	let selectedRunIds = $state<string[]>(
		sources[0] ? sources[0].runs.map((run) => run.turnRunId) : []
	);
	let manualQuestion = $state('');
	type ManualCandidateForm = { id: string; name: string; answer: string; note: string };
	let manualCandidates = $state<ManualCandidateForm[]>([]);
	let title = $state('');
	let titleTouched = $state(false);
	let setKind = $state<ComparisonSetKind>('exploratory');
	let requiredFactsText = $state('');
	let createId = $state(crypto.randomUUID());

	// Vote form state
	let voteChoice = $state<VoteChoice>('candidate');
	let votePreferredLabel = $state<ComparisonLabel | null>(null);
	let voteReason = $state('');
	let voteRubric = $state<Partial<Record<ComparisonLabel, RubricScore>>>({});

	const fieldClass =
		'mt-2 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60';

	const selectedGroup = $derived(sources.find((group) => group.key === selectedGroupKey) ?? null);
	const questionText = $derived(
		sourceMode === 'manual' ? manualQuestion : (selectedGroup?.question ?? '')
	);
	const totalCandidates = $derived(
		(sourceMode === 'runs' ? selectedRunIds.length : 0) + manualCandidates.length
	);
	const validManualCandidates = $derived(
		manualCandidates.every((c) => c.name.trim().length > 0 && c.answer.trim().length > 0)
	);
	const canSubmitBuilder = $derived(
		totalCandidates >= 2 &&
			totalCandidates <= ANSWER_COMPARISON_LIMITS.candidatesPerComparison &&
			title.trim().length > 0 &&
			validManualCandidates &&
			(sourceMode === 'manual' ? manualQuestion.trim().length > 0 : !!selectedGroup)
	);
	// Canonical A-F order for the vote buttons, regardless of the order candidates arrived in.
	const orderedLabels = $derived(
		detail
			? ANSWER_COMPARISON_LABELS.filter((label) =>
					detail!.candidates.some((candidate) => candidate.label === label)
				)
			: []
	);

	$effect(() => {
		if (!titleTouched) title = questionText.slice(0, 60);
	});

	function clearNotice() {
		error = '';
		notice = '';
	}

	function reportError(cause: unknown) {
		error = cause instanceof Error ? cause.message : 'Something went wrong. Please try again.';
	}

	function defaultRubric(): RubricScore {
		return { requiredFacts: 1, unsupportedClaims: 0, abstention: 'not_applicable' };
	}

	function formatUsd(costMicroUsd: number | null): string {
		return costMicroUsd == null ? 'unknown' : `$${(costMicroUsd / 1e6).toFixed(4)}`;
	}

	function formatLatency(latencyMs: number | null): string {
		return latencyMs == null ? 'unknown' : `${(latencyMs / 1000).toFixed(1)} s`;
	}

	function formatMean(value: number | null): string {
		return value == null ? '—' : value.toFixed(1);
	}

	function formatDate(value: string): string {
		return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(value)
		);
	}

	function contextHashDisplay(comparison: ComparisonDetail): string {
		return comparison.packet.contextHash
			? comparison.packet.contextHash.slice(0, 12)
			: 'manual packet';
	}

	function receiptsLine(receipts: CandidateReceipts | null): string {
		if (!receipts) return 'unknown';
		const calls = receipts.modelCalls == null ? 'unknown' : String(receipts.modelCalls);
		const models = receipts.models.length ? receipts.models.join(', ') : 'none';
		const unsettled = receipts.settled === false ? ' (unsettled)' : '';
		return `Cost ${formatUsd(receipts.costMicroUsd)} · Latency ${formatLatency(receipts.latencyMs)} · ${calls} model calls · models: ${models}${unsettled}`;
	}

	function voteStatusLabel(summary: ComparisonSummary): string {
		if (!summary.vote) return 'Not voted';
		return summary.vote.revealed ? 'Sealed' : 'Voted · not revealed';
	}

	function choiceButtonClass(active: boolean): string {
		return [
			'min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			active
				? 'border-accent bg-accent/5 text-accent'
				: 'border-border text-foreground hover:bg-muted/50'
		].join(' ');
	}

	function setRubricField<K extends keyof RubricScore>(
		label: ComparisonLabel,
		field: K,
		value: RubricScore[K]
	) {
		voteRubric = {
			...voteRubric,
			[label]: { ...(voteRubric[label] ?? defaultRubric()), [field]: value }
		};
	}

	// The two 0-2 rubric selects share the same shape; only the copy differs.
	const numericRubricFields: {
		key: 'requiredFacts' | 'unsupportedClaims';
		heading: string;
		options: [0 | 1 | 2, string][];
	}[] = [
		{
			key: 'requiredFacts',
			heading: 'Required facts',
			options: [
				[0, '0 Missing'],
				[1, '1 Partial'],
				[2, '2 All present']
			]
		},
		{
			key: 'unsupportedClaims',
			heading: 'Unsupported claims',
			options: [
				[0, '0 None'],
				[1, '1 Some'],
				[2, '2 Many']
			]
		}
	];

	function initVoteForm() {
		if (!detail) return;
		const vote = detail.vote;
		voteChoice = vote?.choice ?? 'candidate';
		votePreferredLabel = vote ? vote.preferredLabel : (detail.candidates[0]?.label ?? null);
		voteReason = vote?.reason ?? '';
		const rubric: Partial<Record<ComparisonLabel, RubricScore>> = {};
		for (const candidate of detail.candidates) {
			const saved = vote?.rubricScores?.[candidate.label];
			rubric[candidate.label] = saved ? { ...saved } : defaultRubric();
		}
		voteRubric = rubric;
	}

	function summaryFromDetail(comparison: ComparisonDetail): ComparisonSummary {
		return {
			id: comparison.id,
			title: comparison.title,
			setKind: comparison.setKind,
			candidateCount: comparison.candidates.length,
			createdAt: comparison.createdAt,
			vote: comparison.vote
				? { choice: comparison.vote.choice, revealed: comparison.revealed }
				: null
		};
	}

	function applyDetail(comparison: ComparisonDetail) {
		detail = comparison;
		selectedId = comparison.id;
		const summary = summaryFromDetail(comparison);
		comparisons = comparisons.some((item) => item.id === comparison.id)
			? comparisons.map((item) => (item.id === comparison.id ? summary : item))
			: [summary, ...comparisons];
		initVoteForm();
	}

	async function postAction<T>(
		body: CreateComparisonRequest | VoteRequest | RevealRequest
	): Promise<T> {
		const response = await fetch('/api/agent/specialists/comparisons', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			cache: 'no-store',
			body: JSON.stringify(body)
		});
		const result = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(
				typeof result.error === 'string'
					? result.error
					: 'The request could not be completed. Please try again.'
			);
		}
		return result as T;
	}

	async function toggleHeldOut(event: Event) {
		const checked = (event.currentTarget as HTMLInputElement).checked;
		includeHeldOut = checked;
		busy = 'scoreboard';
		clearNotice();
		try {
			const response = await fetch(
				`/api/agent/specialists/comparisons${checked ? '?heldOut=1' : ''}`,
				{ cache: 'no-store' }
			);
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error || 'Could not load the scoreboard.');
			scoreboard = (result as AnswerComparisonLabData).scoreboard;
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function loadComparison(id: string) {
		if (busy) return;
		busy = 'load';
		clearNotice();
		try {
			const response = await fetch(
				`/api/agent/specialists/comparisons?id=${encodeURIComponent(id)}`,
				{ cache: 'no-store' }
			);
			const result = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(result.error || 'Could not load this comparison.');
			applyDetail((result as { comparison: ComparisonDetail }).comparison);
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	function resetBuilder() {
		sourceMode = sources.length ? 'runs' : 'manual';
		selectedGroupKey = sources[0]?.key ?? '';
		selectedRunIds = sources[0] ? sources[0].runs.map((run) => run.turnRunId) : [];
		manualQuestion = '';
		manualCandidates = [];
		title = '';
		titleTouched = false;
		setKind = 'exploratory';
		requiredFactsText = '';
		createId = crypto.randomUUID();
	}

	function selectGroup(key: string) {
		selectedGroupKey = key;
		const group = sources.find((item) => item.key === key);
		selectedRunIds = group ? group.runs.map((run) => run.turnRunId) : [];
	}

	function toggleRun(turnRunId: string, checked: boolean) {
		selectedRunIds = checked
			? [...selectedRunIds, turnRunId]
			: selectedRunIds.filter((id) => id !== turnRunId);
	}

	function addManualCandidate() {
		if (totalCandidates >= ANSWER_COMPARISON_LIMITS.candidatesPerComparison) return;
		manualCandidates = [
			...manualCandidates,
			{ id: crypto.randomUUID(), name: '', answer: '', note: '' }
		];
	}

	function removeManualCandidate(id: string) {
		manualCandidates = manualCandidates.filter((item) => item.id !== id);
	}

	async function createComparison() {
		if (busy || !canSubmitBuilder) return;
		busy = 'create';
		clearNotice();
		const requiredFacts = requiredFactsText
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean);
		const candidates: CandidateInput[] = [
			...(sourceMode === 'runs'
				? selectedRunIds.map((turnRunId) => ({ kind: 'workflow_run' as const, turnRunId }))
				: []),
			...manualCandidates.map((c) => ({
				kind: 'manual' as const,
				name: c.name.trim(),
				answer: c.answer,
				note: c.note.trim() ? c.note.trim() : null
			}))
		];
		const body: CreateComparisonRequest = {
			action: 'create',
			id: createId,
			title: title.trim(),
			setKind,
			requiredFacts,
			source:
				sourceMode === 'manual'
					? { kind: 'manual', question: manualQuestion }
					: { kind: 'workflow_runs', turnRunIds: selectedRunIds },
			candidates
		};
		try {
			const result = await postAction<{ comparison: ComparisonDetail }>(body);
			applyDetail(result.comparison);
			showBuilder = false;
			notice = 'Comparison created.';
			resetBuilder();
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function saveVote() {
		if (!detail || busy) return;
		busy = 'vote';
		clearNotice();
		try {
			const body: VoteRequest = {
				action: 'vote',
				comparisonId: detail.id,
				choice: voteChoice,
				preferredLabel: voteChoice === 'candidate' ? votePreferredLabel : null,
				reason: voteReason,
				rubricScores: voteRubric
			};
			const result = await postAction<{ comparison: ComparisonDetail }>(body);
			applyDetail(result.comparison);
			notice = 'Vote saved.';
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}

	async function reveal() {
		if (!detail || busy || !detail.vote) return;
		busy = 'reveal';
		clearNotice();
		try {
			const result = await postAction<{ comparison: ComparisonDetail }>({
				action: 'reveal',
				comparisonId: detail.id
			});
			applyDetail(result.comparison);
			notice = 'Vote sealed and revealed.';
		} catch (cause) {
			reportError(cause);
		} finally {
			busy = null;
		}
	}
</script>

<div class="space-y-5">
	{#if error}<p
			class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
			role="alert"
		>
			{error}
		</p>{/if}
	<p
		class={notice
			? 'rounded-lg border border-accent/40 bg-accent/5 p-3 text-sm text-foreground'
			: 'sr-only'}
		role="status"
		aria-live="polite"
	>
		{notice}
	</p>

	<div class="grid items-start gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
		<div class="min-w-0 space-y-5">
			<section
				class="rounded-xl border border-border bg-card p-5 shadow-ink"
				aria-labelledby="scoreboard-heading"
			>
				<h2 id="scoreboard-heading" class="font-semibold text-foreground">Scoreboard</h2>
				<p class="mt-1 text-xs text-muted-foreground">
					Sealed votes only. A vote is sealed when you reveal.
				</p>
				<label class="mt-3 flex items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						class="size-4 accent-[hsl(var(--accent))]"
						checked={includeHeldOut}
						disabled={busy === 'scoreboard'}
						onchange={toggleHeldOut}
					/>Include held-out set</label
				>
				<p class="mt-2 text-xs text-muted-foreground">
					{scoreboard.sealedVotes} sealed vote{scoreboard.sealedVotes === 1
						? ''
						: 's'}{#if scoreboard.heldOutExcluded > 0}
						· {scoreboard.heldOutExcluded} held-out excluded{/if}
				</p>
				{#if scoreboard.rows.length === 0}
					<p class="mt-4 text-sm text-muted-foreground">No sealed votes yet.</p>
				{:else}
					<div class="mt-4 overflow-x-auto">
						<table class="w-full min-w-[520px] text-left text-sm">
							<thead>
								<tr
									class="border-b border-border text-xs uppercase tracking-wider text-muted-foreground"
								>
									<th class="py-2 pr-3 font-medium">Name</th>
									<th class="py-2 pr-3 font-medium">W / L / T</th>
									<th class="py-2 pr-3 font-medium">Facts</th>
									<th class="py-2 pr-3 font-medium">Unsupported</th>
									<th class="py-2 pr-3 font-medium">Cost</th>
									<th class="py-2 font-medium">Latency</th>
								</tr>
							</thead>
							<tbody>
								{#each scoreboard.rows as row (row.name)}
									<tr
										class="border-b border-border/60 text-foreground last:border-0"
									>
										<td class="py-2 pr-3">{row.name}</td>
										<td class="py-2 pr-3 tabular-nums"
											>{row.wins} / {row.losses} / {row.ties}</td
										>
										<td class="py-2 pr-3 tabular-nums"
											>{formatMean(row.requiredFactsMean)}</td
										>
										<td class="py-2 pr-3 tabular-nums"
											>{formatMean(row.unsupportedClaimsMean)}</td
										>
										<td class="py-2 pr-3 tabular-nums"
											>{formatUsd(row.costMicroUsdMean)}</td
										>
										<td class="py-2 tabular-nums"
											>{formatLatency(row.latencyMsMean)}</td
										>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</section>

			<section
				class="rounded-xl border border-border bg-card p-5 shadow-ink"
				aria-labelledby="comparisons-heading"
			>
				<h2 id="comparisons-heading" class="font-semibold text-foreground">Comparisons</h2>
				{#if comparisons.length === 0}
					<p class="mt-3 text-sm text-muted-foreground">
						No comparisons yet. Build one below.
					</p>
				{:else}
					<ul class="mt-3 space-y-2">
						{#each comparisons as summary (summary.id)}
							<li>
								<button
									type="button"
									disabled={busy === 'load'}
									aria-pressed={selectedId === summary.id}
									onclick={() => loadComparison(summary.id)}
									class={[
										'block min-h-11 w-full rounded-lg border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
										selectedId === summary.id
											? 'border-accent bg-accent/5'
											: 'border-border hover:bg-muted/50'
									].join(' ')}
								>
									<span class="flex items-center justify-between gap-2">
										<span class="truncate text-sm font-medium text-foreground"
											>{summary.title}</span
										>
										<span
											class="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
											>{summary.setKind === 'held_out'
												? 'Held-out'
												: 'Exploratory'}</span
										>
									</span>
									<span
										class="mt-1 flex items-center gap-2 text-xs text-muted-foreground"
									>
										<span
											>{summary.candidateCount} candidate{summary.candidateCount ===
											1
												? ''
												: 's'}</span
										>
										<span>·</span>
										<span>{voteStatusLabel(summary)}</span>
									</span>
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			{#if !showBuilder}
				<Button variant="outline" size="sm" icon={Plus} onclick={() => (showBuilder = true)}
					>New comparison</Button
				>
			{:else}
				<section
					class="rounded-xl border border-border bg-card p-5 shadow-ink"
					aria-labelledby="builder-heading"
				>
					<div class="flex items-center justify-between gap-3">
						<h2 id="builder-heading" class="font-semibold text-foreground">
							New comparison
						</h2>
						<Button
							variant="ghost"
							size="sm"
							icon={X}
							disabled={busy === 'create'}
							onclick={() => (showBuilder = false)}>Close</Button
						>
					</div>
					<fieldset disabled={busy === 'create'} class="mt-4 space-y-4">
						<legend class="sr-only">New comparison</legend>

						{#if sources.length > 0}
							<div class="flex flex-wrap gap-4" role="radiogroup" aria-label="Source">
								<label class="flex items-center gap-2 text-sm text-foreground"
									><input
										type="radio"
										name="source-mode"
										checked={sourceMode === 'runs'}
										onchange={() => (sourceMode = 'runs')}
									/>From pilot runs</label
								>
								<label class="flex items-center gap-2 text-sm text-foreground"
									><input
										type="radio"
										name="source-mode"
										checked={sourceMode === 'manual'}
										onchange={() => (sourceMode = 'manual')}
									/>Write the question</label
								>
							</div>
						{/if}
						{#if sourcesNotice}<p
								class="rounded-lg border border-border bg-muted/20 p-2 text-xs text-muted-foreground"
							>
								{sourcesNotice}
							</p>{/if}

						{#if sourceMode === 'runs' && sources.length > 0}
							<label class="block text-sm font-medium text-foreground"
								>Source
								<select
									class={fieldClass}
									value={selectedGroupKey}
									onchange={(event) => selectGroup(event.currentTarget.value)}
								>
									{#each sources as group (group.key)}
										<option value={group.key}
											>{group.question.slice(0, 80)} · {group.runs.length} runs</option
										>
									{/each}
								</select></label
							>
							{#if selectedGroup}
								<div class="space-y-2">
									{#each selectedGroup.runs as run (run.turnRunId)}
										<label
											class="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3 text-sm"
										>
											<input
												type="checkbox"
												class="mt-1 size-4 accent-[hsl(var(--accent))]"
												checked={selectedRunIds.includes(run.turnRunId)}
												onchange={(event) =>
													toggleRun(
														run.turnRunId,
														event.currentTarget.checked
													)}
											/>
											<span class="min-w-0">
												<span class="block font-medium text-foreground"
													>{run.name}</span
												>
												<span
													class="mt-0.5 block text-xs text-muted-foreground"
													>{run.finishedAt
														? formatDate(run.finishedAt)
														: 'unknown finish time'} · {run.answerChars.toLocaleString()}
													chars</span
												>
												<span
													class="mt-0.5 block text-xs text-muted-foreground"
													>{receiptsLine(run.receipts)}</span
												>
											</span>
										</label>
									{/each}
								</div>
							{/if}
						{:else}
							{#if sources.length === 0}<p class="text-sm text-muted-foreground">
									No finished pilot runs with a recorded question yet. You can
									still compare written answers.
								</p>{/if}
							<label class="block text-sm font-medium text-foreground"
								>Question<textarea
									class={`${fieldClass} resize-y`}
									bind:value={manualQuestion}
									maxlength={ANSWER_COMPARISON_LIMITS.questionChars}
									rows="3"
									required
									placeholder="What question are these answers responding to?"
								></textarea></label
							>
						{/if}

						<div class="space-y-3 border-t border-border pt-4">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-sm font-semibold text-foreground">
									Written answers
								</h3>
								<span class="text-xs tabular-nums text-muted-foreground"
									>{manualCandidates.length}</span
								>
							</div>
							{#each manualCandidates as candidate, index (candidate.id)}
								<div
									class="space-y-2 rounded-lg border border-border bg-muted/20 p-3"
								>
									<div class="flex items-center justify-between gap-3">
										<p class="text-xs font-medium text-muted-foreground">
											Written answer {index + 1}
										</p>
										<Button
											variant="ghost"
											size="sm"
											icon={X}
											aria-label={`Remove written answer ${index + 1}`}
											onclick={() => removeManualCandidate(candidate.id)}
											>Remove</Button
										>
									</div>
									<label class="block text-xs font-medium text-foreground"
										>Name<input
											class={fieldClass}
											bind:value={candidate.name}
											maxlength={ANSWER_COMPARISON_LIMITS.candidateNameChars}
											required
											placeholder="e.g. GPT-4o direct"
										/></label
									>
									<label class="block text-xs font-medium text-foreground"
										>Answer<textarea
											class={`${fieldClass} resize-y`}
											bind:value={candidate.answer}
											maxlength={ANSWER_COMPARISON_LIMITS.answerChars}
											rows="5"
											required
										></textarea></label
									>
									<label class="block text-xs font-medium text-foreground"
										>Note (optional)<input
											class={fieldClass}
											bind:value={candidate.note}
											placeholder="Where this answer came from"
										/></label
									>
								</div>
							{/each}
							<Button
								variant="outline"
								size="sm"
								icon={Plus}
								disabled={totalCandidates >=
									ANSWER_COMPARISON_LIMITS.candidatesPerComparison}
								onclick={addManualCandidate}>Add a written answer</Button
							>
						</div>

						<label class="block text-sm font-medium text-foreground"
							>Title<input
								class={fieldClass}
								value={title}
								maxlength={ANSWER_COMPARISON_LIMITS.titleChars}
								required
								oninput={(event) => {
									title = event.currentTarget.value;
									titleTouched = true;
								}}
							/></label
						>

						<div role="radiogroup" aria-label="Set kind" class="space-y-2">
							<p class="text-sm font-medium text-foreground">Set kind</p>
							<label class="flex items-center gap-2 text-sm text-foreground"
								><input
									type="radio"
									name="set-kind"
									checked={setKind === 'exploratory'}
									onchange={() => (setKind = 'exploratory')}
								/>Exploratory</label
							>
							<label class="flex items-center gap-2 text-sm text-foreground"
								><input
									type="radio"
									name="set-kind"
									checked={setKind === 'held_out'}
									onchange={() => (setKind = 'held_out')}
								/>Held-out</label
							>
							<p class="text-xs text-muted-foreground">
								Held-out comparisons stay out of the scoreboard until you include
								them.
							</p>
						</div>

						<label class="block text-sm font-medium text-foreground"
							>Required facts<textarea
								class={`${fieldClass} resize-y`}
								bind:value={requiredFactsText}
								maxlength={ANSWER_COMPARISON_LIMITS.requiredFactChars *
									ANSWER_COMPARISON_LIMITS.requiredFacts}
								rows="4"
								placeholder="One fact per line"
							></textarea></label
						>
						<p class="!-mt-2 text-xs text-muted-foreground">
							What a correct answer must state. You judge these, no model does.
						</p>
					</fieldset>
					<div class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
						<Button
							size="sm"
							icon={Check}
							loading={busy === 'create'}
							disabled={!canSubmitBuilder || !!busy}
							onclick={createComparison}>Create comparison</Button
						>
						<span class="text-xs text-muted-foreground"
							>{totalCandidates} of {ANSWER_COMPARISON_LIMITS.candidatesPerComparison}
							candidates</span
						>
					</div>
				</section>
			{/if}
		</div>

		<div class="min-w-0">
			{#if detail}
				<div class="space-y-4">
					<div class="rounded-xl border border-border bg-card p-5 shadow-ink">
						<div class="flex flex-wrap items-start justify-between gap-3">
							<div>
								<h2 class="text-lg font-semibold text-foreground">
									{detail.title}
								</h2>
								<p class="mt-1 text-xs text-muted-foreground">
									Created {formatDate(detail.createdAt)}
								</p>
							</div>
							<span
								class="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
								>{detail.setKind === 'held_out' ? 'Held-out' : 'Exploratory'}</span
							>
						</div>
						<p class="mt-3 font-mono text-xs text-muted-foreground">
							Packet: {contextHashDisplay(detail)}
						</p>
						<div
							class="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground"
						>
							{detail.question}
						</div>
					</div>

					<div class="rounded-xl border border-border bg-card p-5 shadow-ink">
						<h3 class="text-sm font-semibold text-foreground">Required facts</h3>
						{#if detail.rubric.requiredFacts.length === 0}
							<p class="mt-2 text-sm text-muted-foreground">None recorded.</p>
						{:else}
							<ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-foreground">
								{#each detail.rubric.requiredFacts as fact, index (index)}<li>
										{fact}
									</li>{/each}
							</ul>
						{/if}
					</div>

					{#each detail.candidates as candidate (candidate.id)}
						<div class="rounded-xl border border-border bg-card p-5 shadow-ink">
							<div class="flex items-center justify-between gap-3">
								<h3 class="text-base font-semibold text-foreground">
									Answer {candidate.label}
								</h3>
								{#if candidate.disclosureRisk}
									<span
										class="inline-flex items-center gap-1.5 text-xs font-medium text-warning"
										><TriangleAlert class="size-3.5" />This answer names its
										producer; the blind may have leaked.</span
									>
								{/if}
							</div>
							<div
								class="mt-3 max-h-[28rem] overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-sm leading-relaxed text-foreground"
							>
								{candidate.answer}
							</div>

							<div class="mt-4 grid gap-3 sm:grid-cols-3">
								{#each numericRubricFields as field (field.key)}
									<label class="block text-xs font-medium text-foreground"
										>{field.heading}
										<select
											class={fieldClass}
											disabled={!!busy || detail.revealed}
											value={voteRubric[candidate.label]?.[field.key] ??
												(field.key === 'requiredFacts' ? 1 : 0)}
											onchange={(event) =>
												setRubricField(
													candidate.label,
													field.key,
													Number(event.currentTarget.value) as 0 | 1 | 2
												)}
										>
											{#each field.options as [value, text] (value)}<option
													{value}>{text}</option
												>{/each}
										</select></label
									>
								{/each}
								<label class="block text-xs font-medium text-foreground"
									>Abstention
									<select
										class={fieldClass}
										disabled={!!busy || detail.revealed}
										value={voteRubric[candidate.label]?.abstention ??
											'not_applicable'}
										onchange={(event) =>
											setRubricField(
												candidate.label,
												'abstention',
												event.currentTarget
													.value as RubricScore['abstention']
											)}
									>
										<option value="appropriate">Declined appropriately</option>
										<option value="inappropriate"
											>Should have declined or answered</option
										>
										<option value="not_applicable">Not applicable</option>
									</select></label
								>
							</div>

							{#if detail.revealed}
								<div class="mt-4 space-y-1 border-t border-border pt-4">
									<h4
										class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
									>
										Produced by
									</h4>
									{#if candidate.identity?.kind === 'workflow_run'}
										<p class="text-sm text-foreground">
											{candidate.identity.name}
										</p>
										<p class="text-xs text-muted-foreground">
											Workflow run · plan {candidate.identity.planVersion ??
												'unknown'} · policy
											{candidate.identity.policyRef ?? 'unknown'} ·
											{candidate.identity.terminalOutcome ??
												'unknown outcome'}
										</p>
										<p class="text-xs text-muted-foreground">
											Finished {candidate.identity.finishedAt
												? formatDate(candidate.identity.finishedAt)
												: 'unknown'}{#if candidate.identity.specialist}
												· {candidate.identity.specialist.label} v{candidate
													.identity.specialist.version ?? '—'}{/if}
										</p>
										<p
											class="break-all font-mono text-xs text-muted-foreground"
										>
											{candidate.identity.turnRunId}
										</p>
									{:else if candidate.identity?.kind === 'manual'}
										<p class="text-sm text-foreground">
											{candidate.identity.name}
										</p>
										{#if candidate.identity.note}<p
												class="text-xs text-muted-foreground"
											>
												{candidate.identity.note}
											</p>{/if}
									{/if}
									<p class="text-xs text-muted-foreground">
										{receiptsLine(candidate.receipts)}
									</p>
								</div>
							{/if}
						</div>
					{/each}

					<section
						class="rounded-xl border border-border bg-card p-5 shadow-ink"
						aria-labelledby="vote-heading"
					>
						<div class="flex items-center justify-between gap-3">
							<h2 id="vote-heading" class="font-semibold text-foreground">
								Your vote
							</h2>
							{#if detail.revealed}
								<span
									class="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground"
									><Lock class="size-3.5" />Sealed</span
								>
							{/if}
						</div>
						<fieldset disabled={!!busy || detail.revealed} class="mt-4 space-y-4">
							<legend class="sr-only">Vote</legend>
							<div class="flex flex-wrap gap-2">
								{#each orderedLabels as label (label)}
									<button
										type="button"
										aria-pressed={voteChoice === 'candidate' &&
											votePreferredLabel === label}
										onclick={() => {
											voteChoice = 'candidate';
											votePreferredLabel = label;
										}}
										class={choiceButtonClass(
											voteChoice === 'candidate' &&
												votePreferredLabel === label
										)}>Prefer {label}</button
									>
								{/each}
								<button
									type="button"
									aria-pressed={voteChoice === 'tie'}
									onclick={() => {
										voteChoice = 'tie';
										votePreferredLabel = null;
									}}
									class={choiceButtonClass(voteChoice === 'tie')}>Tie</button
								>
								<button
									type="button"
									aria-pressed={voteChoice === 'neither'}
									onclick={() => {
										voteChoice = 'neither';
										votePreferredLabel = null;
									}}
									class={choiceButtonClass(voteChoice === 'neither')}
									>Neither</button
								>
							</div>
							<label class="block text-sm font-medium text-foreground"
								>Why?<textarea
									class={`${fieldClass} resize-y`}
									bind:value={voteReason}
									maxlength={ANSWER_COMPARISON_LIMITS.reasonChars}
									rows="3"
									required
									placeholder="Why? Cite what the packet supports."
								></textarea></label
							>
						</fieldset>
						<div
							class="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4"
						>
							<Button
								size="sm"
								icon={ThumbsUp}
								loading={busy === 'vote'}
								disabled={!!busy || detail.revealed || !voteReason.trim()}
								onclick={saveVote}>Save vote</Button
							>
							<Button
								size="sm"
								variant="outline"
								icon={Eye}
								loading={busy === 'reveal'}
								disabled={!!busy || detail.revealed || !detail.vote}
								onclick={reveal}>Reveal</Button
							>
							{#if !detail.vote && !detail.revealed}<span
									class="text-xs text-muted-foreground"
									>Save a vote before revealing.</span
								>{/if}
						</div>
					</section>
				</div>
			{:else}
				<div
					class="rounded-xl border border-dashed border-border bg-card p-8 text-center shadow-ink"
				>
					<div
						class="mx-auto flex size-12 items-center justify-center rounded-xl border border-border bg-muted/50"
					>
						<Columns2 class="size-5 text-muted-foreground" />
					</div>
					<h2 class="mt-4 text-base font-semibold text-foreground">
						Blind review, then reveal
					</h2>
					<p class="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
						<span class="block">Pick runs that answered the same question.</span>
						<span class="block">Vote blind, with no names attached.</span>
						<span class="block">Reveal to see who wrote what and what it cost.</span>
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
