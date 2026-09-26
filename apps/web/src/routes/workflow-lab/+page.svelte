<!-- apps/web/src/routes/workflow-lab/+page.svelte -->
<script lang="ts">
	import AgentChatModal from '$lib/components/agent/AgentChatModal.svelte';
	import ChatSessionAuditActions from '$lib/components/agent/ChatSessionAuditActions.svelte';
	import Button from '$lib/components/ui/Button.svelte';
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
	const fieldClass =
		'block w-full rounded-md border border-border-strong bg-background px-3 text-base text-foreground shadow-ink-inner transition-colors placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm';
	const secondaryLinkClass =
		'inline-flex min-h-11 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground shadow-ink pressable hover:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:fine)]:min-h-9';
	const noticeClass =
		'rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive';
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
	// Why a review did not start. A Lab review never falls back to ordinary chat.
	let reviewError = $state('');
	// The in-chat toggle that starts the next review of the same kind. The selection
	// clears once the session changes, so every later review is chosen again.
	const nextReviewAction = $derived(review?.specialist ? 'Organize documents' : 'Review project');

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
		if (data.projectReviewEnabled && project && question.trim().length >= 3) {
			reviewError = '';
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

<div class="min-h-[calc(100dvh-5rem)] bg-background">
	<main
		class="mx-auto flex w-full flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 {review
			? 'max-w-5xl'
			: 'max-w-3xl'}"
	>
		<header>
			<div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div class="min-w-0">
					<p class="micro-label text-accent">Internal prototype</p>
					<h1 class="mt-2 text-xl font-semibold text-foreground sm:text-2xl">
						One question. Two perspectives.
					</h1>
				</div>
				<nav aria-label="Workflow lab" class="flex shrink-0 flex-wrap gap-2">
					<a href="/workflow-lab/specialists" class={secondaryLinkClass}
						>Specialist workbench</a
					>
					<a href="/workflow-lab/compare" class={secondaryLinkClass}>Compare answers</a>
				</nav>
			</div>
			<p class="mt-2 text-sm text-muted-foreground">
				A planner divides your question between a project analyst and a risk reviewer.
				BuildOS combines their findings into one recommendation.
			</p>
		</header>
		{#if review}
			<div class="flex items-center justify-between gap-3">
				<p class="min-w-0 truncate text-sm text-muted-foreground">
					Reviewing <strong class="font-semibold text-foreground">{review.name}</strong>
					{#if review.specialist}
						with {review.specialist.name} · v{review.specialist.version}
					{/if}
				</p>
				<div class="flex shrink-0 items-center gap-2">
					<!-- Admin-only: Logs / Trace / Export for the real session. Renders nothing until
					     the modal reports a session id, and nothing for non-admins. Links open in a
					     new tab so the running review is never lost. -->
					<ChatSessionAuditActions {sessionId} />
					<a class={secondaryLinkClass} href="/workflow-lab" data-sveltekit-reload
						>New review</a
					>
				</div>
			</div>
			<div
				class="min-h-[36rem] flex-1 overflow-hidden rounded-lg border border-border bg-card shadow-ink"
			>
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
					initialDraft={review.question}
					initialReviewIntent={review.specialist
						? 'document_organization'
						: 'project_review'}
					publishedSpecialist={review.specialist}
					autoSendInitialDraft={true}
					onInitialReviewUnavailable={(message) => {
						reviewError = message;
						review = null;
						sessionId = null;
					}}
					onSessionChange={(id) => {
						sessionId = id;
					}}
					onClose={() => {
						review = null;
						sessionId = null;
					}}
					composerPlaceholder={`Choose ${nextReviewAction} to run another review…`}
				/>
			</div>
			<p class="text-xs text-muted-foreground">
				For each later review, choose {nextReviewAction} above the message box. Other messages
				use ordinary project chat, which can change this project. Leaving this page does not
				cancel a running review; use Stop in chat.
			</p>
		{:else}
			<form onsubmit={start} class="rounded-lg border border-border bg-card shadow-ink">
				<div class="space-y-5 p-5 sm:p-6">
					<div>
						<label class="block">
							<span class="text-sm font-medium text-foreground">Project</span>
							<select
								bind:value={projectId}
								onchange={clearRecommendation}
								required
								class="{fieldClass} mt-1.5 min-h-11"
							>
								<option value="" disabled>Choose a project</option>
								{#each data.projects as project (project.id)}<option
										value={project.id}>{project.name}</option
									>{/each}
							</select>
						</label>
						{#if data.projects.length === 0}
							<p class="mt-1.5 text-xs text-muted-foreground">
								Create a project first, then return here to review it.
							</p>
						{:else if !data.publishedSpecialistsEnabled}
							<p class="mt-1.5 text-xs text-muted-foreground">
								Uses the built-in project analyst. Published specialist runs are not
								enabled yet; you can keep building versions in the specialist
								workbench.
							</p>
						{/if}
					</div>
					{#if data.publishedSpecialistsEnabled}
						<div>
							<label class="block">
								<span class="text-sm font-medium text-foreground">Specialist</span>
								<select
									bind:value={specialistKey}
									onchange={() => (appliedRecommendation = null)}
									aria-describedby="specialist-selection-help"
									class="{fieldClass} mt-1.5 min-h-11"
								>
									<option value="">Built-in project analyst</option>
									{#each availableSpecialists as version (`${version.draftId}:${version.version}`)}
										<option value={`${version.draftId}:${version.version}`}>
											{version.name} · v{version.version}
										</option>
									{/each}
								</select>
							</label>
							<p
								id="specialist-selection-help"
								class="mt-1.5 text-xs text-muted-foreground"
							>
								{#if selectedSpecialist}
									This published version works alongside a risk reviewer. Its
									instructions, knowledge, and allowed tools are fixed for each
									run; later draft edits do not change it.
								{:else if data.publishedSpecialists.length === 0}
									Publish a specialist in the workbench to use its instructions
									and knowledge in a document review here.
								{:else}
									Choose a published specialist to run a document review with its
									instructions and knowledge.
								{/if}
							</p>
							{#if data.specialistLoadError}
								<p role="status" class="{noticeClass} mt-2">
									{data.specialistLoadError}
								</p>
							{/if}
						</div>
					{/if}
					<label class="block">
						<span class="text-sm font-medium text-foreground"
							>What would you like to understand?</span
						>
						<textarea
							bind:value={question}
							oninput={clearRecommendation}
							required
							minlength="3"
							maxlength="6000"
							rows="4"
							class="{fieldClass} mt-1.5 resize-y py-2.5 leading-relaxed"
						></textarea>
					</label>
					{#if data.jevRecommendationsEnabled && data.publishedSpecialistsEnabled}
						<section
							class="rounded-lg border border-border bg-background p-4 shadow-ink-inner"
							aria-labelledby="jev-heading"
						>
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<h2
										id="jev-heading"
										class="text-sm font-semibold text-foreground"
									>
										Choose with Jev
									</h2>
									<p class="mt-1 text-xs text-muted-foreground">
										Rank your published specialists for this question, then
										choose whether to use the result.
									</p>
								</div>
								<Button
									variant="outline"
									size="sm"
									onclick={askJev}
									loading={recommendationPending}
									disabled={recommendationPending ||
										!projectId ||
										question.trim().length < 3 ||
										availableSpecialists.length === 0}
								>
									{recommendationPending ? 'Asking Jev…' : 'Ask Jev'}
								</Button>
							</div>
							{#if recommendationError}<p role="alert" class="{noticeClass} mt-3">
									{recommendationError}
								</p>{/if}
							{#if recommendation}
								<div class="mt-4 space-y-3" role="status" aria-live="polite">
									<p class="text-sm font-medium text-foreground">
										{#if recommendation.status === 'selected' && recommendation.selected}
											Jev suggests {recommendation.selected.name} · v{recommendation
												.selected.version}
										{:else if recommendation.status === 'uncertain'}Jev is
											unsure which specialist fits best.
										{:else if recommendation.status === 'pending'}Jev has not
											finished this request.
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
													<span>{ranked.name} · v{ranked.version}</span
													><span
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
										<Button
											variant="outline"
											size="sm"
											onclick={useRecommendation}
											disabled={!!selectedDecision}
										>
											{selectedDecision
												? 'Selected for this review'
												: 'Use this specialist'}
										</Button>
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
					{#if !data.projectReviewEnabled}
						<p role="status" class={noticeClass}>
							Project review is not enabled for this account, so reviews cannot start
							here.
						</p>
					{:else if reviewError}
						<p role="alert" class={noticeClass}>{reviewError}</p>
					{/if}
				</div>
				<div
					class="flex flex-col-reverse gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
				>
					<p class="text-xs text-muted-foreground sm:max-w-sm">
						Reads saved project context and shows both specialists’ findings. This
						review does not edit your project or search the web.
					</p>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						class="shrink-0"
						disabled={!data.projectReviewEnabled ||
							!projectId ||
							question.trim().length < 3}
						>{selectedSpecialist
							? 'Run specialist review'
							: 'Start project review'}</Button
					>
				</div>
			</form>
		{/if}
	</main>
</div>
