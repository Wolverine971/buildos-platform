<!-- apps/web/src/routes/workflow-lab/+page.svelte -->
<script lang="ts">
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import ChatSessionAuditActions from '$lib/components/agent/ChatSessionAuditActions.svelte';
	import type { PageData } from './$types';
	import type { WorkbenchVersionSummary } from '$lib/types/specialist-workbench';
	import type { PublishedSpecialistSelection } from '$lib/services/agentic-chat-v2/worker-transport-client';
	import ContextFinderPanel, { type EvidenceSelection } from './ContextFinderPanel.svelte';
	type Recommendation = {
		id: string;
		status: 'selected' | 'uncertain' | 'unavailable' | 'pending';
		selected: WorkbenchVersionSummary | null;
		ranking: Array<{ name: string; draftId: string; version: number; probability: number }>;
		confidence: number | null;
		margin: number | null;
		reason: string;
		durationMs: number | null;
		costUsd: number | null;
	};
	type RecommendationRequest = { requestId: string; projectId: string; question: string };
	let { data }: { data: PageData } = $props();
	let projectId = $state('');
	let question = $state(
		'What should we prioritize next, and what risks or missing information could change that recommendation?'
	);
	let specialistKey = $state('');
	let suggestedVersions = $state.raw<WorkbenchVersionSummary[]>([]);
	const availableSpecialists = $derived([
		...data.publishedSpecialists,
		...suggestedVersions.filter(
			(suggested) =>
				!data.publishedSpecialists.some(
					(version) =>
						version.draftId === suggested.draftId &&
						version.version === suggested.version
				)
		)
	]);
	const selectedSpecialist = $derived(
		availableSpecialists.find(
			(version) => `${version.draftId}:${version.version}` === specialistKey
		) ?? null
	);
	let recommendation = $state.raw<Recommendation | null>(null);
	let recommendationRequest: RecommendationRequest | null = null;
	let recommendationGeneration = 0;
	let recommendationPending = $state(false);
	let recommendationError = $state('');
	let appliedRecommendation = $state.raw<PublishedSpecialistSelection | null>(null);
	const selectedDecision = $derived(
		appliedRecommendation &&
			selectedSpecialist &&
			appliedRecommendation.draftId === selectedSpecialist.draftId &&
			appliedRecommendation.version === selectedSpecialist.version &&
			appliedRecommendation.snapshotHash === selectedSpecialist.snapshotHash &&
			appliedRecommendation.selectionProjectId === projectId &&
			appliedRecommendation.selectionQuestion === question.trim()
			? appliedRecommendation
			: null
	);
	// Evidence the user found (and maybe edited) for the current project and question.
	let evidenceSelection = $state.raw<EvidenceSelection | null>(null);
	const selectedEvidence = $derived(
		evidenceSelection &&
			evidenceSelection.projectId === projectId &&
			evidenceSelection.question === question.trim()
			? evidenceSelection
			: null
	);
	let review = $state<{
		projectId: string;
		question: string;
		name: string;
		specialist: (WorkbenchVersionSummary & PublishedSpecialistSelection) | null;
	} | null>(null);
	// The chat session that actually exists for this review, reported by the modal. Never
	// guessed from the project or from "most recent"; cleared whenever a new review starts.
	let sessionId = $state<string | null>(null);

	function clearRecommendation() {
		recommendationGeneration += 1;
		recommendation = null;
		recommendationRequest = null;
		recommendationError = '';
		appliedRecommendation = null;
	}

	async function askJev() {
		if (recommendationPending || !projectId || question.trim().length < 3) return;
		const request = recommendationRequest ?? {
			requestId: crypto.randomUUID(),
			projectId,
			question: question.trim()
		};
		recommendationRequest = request;
		const generation = ++recommendationGeneration;
		recommendationPending = true;
		recommendationError = '';
		recommendation = null;
		appliedRecommendation = null;
		try {
			const response = await fetch('/api/agent/specialists/recommendations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				cache: 'no-store',
				body: JSON.stringify(request)
			});
			const body = await response.json();
			if (
				generation !== recommendationGeneration ||
				request.projectId !== projectId ||
				request.question !== question.trim()
			)
				return;
			if (!response.ok || !body.recommendation) {
				throw new Error(
					typeof body.error === 'string'
						? body.error
						: 'Jev could not recommend a specialist. You can still choose one yourself.'
				);
			}
			recommendation = body.recommendation as Recommendation;
			// A stuck claim or a failed Jev call would replay forever under the same ID; the next
			// ask starts a new decision. Network errors keep the ID so a retry replays unbilled.
			if (recommendation.status === 'pending' || recommendation.status === 'unavailable')
				recommendationRequest = null;
		} catch (cause) {
			if (generation === recommendationGeneration) {
				recommendationError =
					cause instanceof Error
						? cause.message
						: 'Jev is unavailable. You can still choose a specialist yourself.';
			}
		} finally {
			recommendationPending = false;
		}
	}

	function useRecommendation() {
		const version = recommendation?.selected;
		const request = recommendationRequest;
		if (
			!version ||
			recommendation?.status !== 'selected' ||
			!request ||
			request.projectId !== projectId ||
			request.question !== question.trim()
		)
			return;
		if (
			!availableSpecialists.some(
				(item) => item.draftId === version.draftId && item.version === version.version
			)
		) {
			suggestedVersions = [...suggestedVersions, version];
		}
		specialistKey = `${version.draftId}:${version.version}`;
		appliedRecommendation = {
			draftId: version.draftId,
			version: version.version,
			snapshotHash: version.snapshotHash,
			selectionDecisionId: recommendation.id,
			selectionQuestion: request.question,
			selectionProjectId: request.projectId
		};
	}

	function percent(value: number | null) {
		return typeof value === 'number' && Number.isFinite(value)
			? `${Math.round(value * 100)}%`
			: '—';
	}
	function start(event: SubmitEvent) {
		event.preventDefault();
		const project = data.projects.find((project) => project.id === projectId);
		if (project && question.trim().length >= 3) {
			sessionId = null;
			review = {
				projectId,
				question: question.trim(),
				name: project.name,
				specialist: selectedSpecialist
					? {
							...selectedSpecialist,
							...selectedDecision,
							...(selectedEvidence
								? {
										contextPlan: selectedEvidence.plan,
										contextPlanQuestion: selectedEvidence.question,
										contextPlanProjectId: selectedEvidence.projectId
									}
								: {})
						}
					: null
			};
		}
	}
</script>

<svelte:head><title>Workflow lab · BuildOS</title></svelte:head>

<main class="mx-auto flex min-h-[calc(100dvh-5rem)] max-w-5xl flex-col gap-6 px-4 py-6 sm:px-8">
	<header>
		<p class="text-xs uppercase tracking-widest text-muted-foreground">
			BuildOS · Internal prototype
		</p>
		<h1 class="mt-2 text-2xl font-semibold text-foreground">One question. Two perspectives.</h1>
		<p class="mt-2 max-w-2xl text-sm text-muted-foreground">
			A planner divides your question between a project analyst and a risk reviewer. BuildOS
			combines their findings into one recommendation.
		</p>
		<div class="mt-3 flex flex-wrap gap-x-6 gap-y-1">
			<a
				href="/workflow-lab/specialists"
				class="inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
				>Open specialist workbench →</a
			>
			<a
				href="/workflow-lab/compare"
				class="inline-flex min-h-11 items-center text-sm font-medium text-accent underline-offset-4 hover:underline"
				>Compare answers →</a
			>
		</div>
	</header>
	{#if review}
		<div class="flex items-center justify-between gap-3">
			<p class="min-w-0 truncate text-sm text-muted-foreground">
				Reviewing <strong class="text-foreground">{review.name}</strong>
				{#if review.specialist}
					with {review.specialist.name} · v{review.specialist.version}
				{/if}
			</p>
			<div class="flex shrink-0 items-center gap-2">
				<!-- Admin-only: Logs / Trace / Export for the real session. Renders nothing until
				     the modal reports a session id, and nothing for non-admins. Links open in a
				     new tab so the running review is never lost. -->
				<ChatSessionAuditActions {sessionId} />
				<a class="text-sm underline" href="/workflow-lab" data-sveltekit-reload
					>New review</a
				>
			</div>
		</div>
		<div class="min-h-[36rem] flex-1 overflow-hidden rounded-xl border border-border bg-card">
			<AgentChatModal
				isOpen={true}
				embedded={true}
				contextType="project"
				entityId={review.projectId}
				initialProjectFocus={{
					projectId: review.projectId,
					projectName: review.name,
					focusType: 'project-wide',
					focusEntityId: null,
					focusEntityName: null
				}}
				initialDraft={`/workflow ${review.question}`}
				publishedSpecialist={review.specialist}
				autoSendInitialDraft={true}
				onSessionChange={(id) => {
					sessionId = id;
				}}
				onClose={() => {
					review = null;
					sessionId = null;
				}}
				composerPlaceholder="Start another review with /workflow …"
			/>
		</div>
		<p class="text-xs text-muted-foreground">
			Use /workflow for each review. Other messages use ordinary project chat. Leaving this
			page does not cancel a running review; use Stop in chat.
		</p>
	{:else}
		<form
			onsubmit={start}
			class="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-5 sm:p-7"
		>
			<label class="block text-sm font-medium text-foreground"
				>Project
				<select
					bind:value={projectId}
					onchange={clearRecommendation}
					required
					class="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2"
				>
					<option value="" disabled>Choose a project</option>
					{#each data.projects as project (project.id)}<option value={project.id}
							>{project.name}</option
						>{/each}
				</select>
			</label>
			{#if data.publishedSpecialistsEnabled}
				<label class="block text-sm font-medium text-foreground">
					Specialist
					<select
						bind:value={specialistKey}
						onchange={() => (appliedRecommendation = null)}
						aria-describedby="specialist-selection-help"
						class="mt-2 block w-full rounded-md border border-border bg-background px-3 py-2"
					>
						<option value="">Built-in project analyst</option>
						{#each availableSpecialists as version (`${version.draftId}:${version.version}`)}
							<option value={`${version.draftId}:${version.version}`}>
								{version.name} · v{version.version}
							</option>
						{/each}
					</select>
				</label>
				<p id="specialist-selection-help" class="text-sm text-muted-foreground">
					{#if selectedSpecialist}
						This published version works alongside a risk reviewer. Its instructions,
						knowledge, and allowed tools are fixed for each run; later draft edits do
						not change it.
					{:else if data.publishedSpecialists.length === 0}
						Publish a specialist in the workbench to use its instructions and knowledge
						in a document review here.
					{:else}
						Choose a published specialist to run a document review with its instructions
						and knowledge.
					{/if}
				</p>
				{#if data.specialistLoadError}
					<p role="status" class="text-sm text-destructive">{data.specialistLoadError}</p>
				{/if}
			{:else}
				<p class="text-sm text-muted-foreground">
					Published specialist runs are not enabled yet. You can keep building and
					publishing versions in the specialist workbench.
				</p>
			{/if}
			<label class="block text-sm font-medium text-foreground"
				>What would you like to understand?
				<textarea
					bind:value={question}
					oninput={clearRecommendation}
					required
					minlength="3"
					maxlength="6000"
					rows="4"
					class="mt-2 block w-full resize-y rounded-md border border-border bg-background px-3 py-2 leading-relaxed"
				></textarea>
			</label>
			{#if data.jevRecommendationsEnabled && data.publishedSpecialistsEnabled}
				<section
					class="rounded-lg border border-border bg-muted/20 p-4"
					aria-labelledby="jev-heading"
				>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<div>
							<h2 id="jev-heading" class="text-sm font-semibold text-foreground">
								Choose with Jev
							</h2>
							<p class="mt-1 text-xs text-muted-foreground">
								Rank your published specialists for this question, then choose
								whether to use the result.
							</p>
						</div>
						<button
							type="button"
							onclick={askJev}
							disabled={recommendationPending ||
								!projectId ||
								question.trim().length < 3 ||
								availableSpecialists.length === 0}
							class="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground disabled:opacity-40"
						>
							{recommendationPending ? 'Asking Jev…' : 'Ask Jev'}
						</button>
					</div>
					{#if recommendationError}<p role="alert" class="mt-3 text-sm text-destructive">
							{recommendationError}
						</p>{/if}
					{#if recommendation}
						<div class="mt-4 space-y-3" role="status" aria-live="polite">
							<p class="text-sm font-medium text-foreground">
								{#if recommendation.status === 'selected' && recommendation.selected}
									Jev suggests {recommendation.selected.name} · v{recommendation
										.selected.version}
								{:else if recommendation.status === 'uncertain'}Jev is unsure which
									specialist fits best.
								{:else if recommendation.status === 'pending'}Jev has not finished
									this request.
								{:else}Jev could not make a recommendation.{/if}
							</p>
							<p class="text-xs leading-relaxed text-muted-foreground">
								{recommendation.reason}
							</p>
							{#if recommendation.ranking.length > 0}
								<ol class="space-y-2" aria-label="Specialist ranking">
									{#each recommendation.ranking.slice(0, 5) as ranked (`${ranked.draftId}:${ranked.version}`)}
										<li
											class="flex items-center justify-between gap-3 text-xs text-foreground"
										>
											<span>{ranked.name} · v{ranked.version}</span><span
												class="tabular-nums text-muted-foreground"
												>{percent(ranked.probability)}</span
											>
										</li>
									{/each}
								</ol>
							{/if}
							<p class="text-xs text-muted-foreground">
								Confidence {percent(recommendation.confidence)} · Lead {percent(
									recommendation.margin
								)}
								{#if recommendation.durationMs !== null}
									· {Math.round(recommendation.durationMs)} ms{/if}
								{#if recommendation.costUsd !== null}
									· ${recommendation.costUsd.toFixed(4)}{/if}
							</p>
							{#if recommendation.status === 'selected' && recommendation.selected}
								<button
									type="button"
									onclick={useRecommendation}
									disabled={!!selectedDecision}
									class="min-h-11 rounded-md border border-accent/50 px-3 py-2 text-sm font-medium text-foreground disabled:opacity-50"
								>
									{selectedDecision
										? 'Selected for this review'
										: 'Use this specialist'}
								</button>
								<p class="text-xs text-muted-foreground">
									Start the review below when you’re ready.
								</p>
							{/if}
						</div>
					{/if}
				</section>
			{/if}
			{#if data.contextFinderEnabled && selectedSpecialist}
				<ContextFinderPanel
					{projectId}
					{question}
					onSelection={(selection) => (evidenceSelection = selection)}
				/>
			{/if}
			<p class="text-sm text-muted-foreground">
				Reads saved project context and shows both specialists’ findings. This review does
				not edit your project or search the web.
			</p>
			<button
				type="submit"
				disabled={!projectId || question.trim().length < 3}
				class="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
				>{selectedSpecialist ? 'Run specialist review' : 'Start project review'}</button
			>
			{#if data.projects.length === 0}<p class="text-sm text-muted-foreground">
					Create a project first, then return here to review it.
				</p>{/if}
		</form>
	{/if}
</main>
