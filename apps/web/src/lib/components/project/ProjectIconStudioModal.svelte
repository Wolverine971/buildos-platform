<!-- apps/web/src/lib/components/project/ProjectIconStudioModal.svelte -->
<script lang="ts">
	import { dev } from '$app/environment';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import { LoaderCircle, Sparkles, RefreshCw, Check } from 'lucide-svelte';
	import { untrack } from 'svelte';

	type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
	type QueueJobStatus =
		| 'pending'
		| 'processing'
		| 'completed'
		| 'failed'
		| 'cancelled'
		| 'retrying';
	type IconStudioLogLevel = 'debug' | 'info' | 'warn' | 'error';

	interface IconGeneration {
		id: string;
		status: GenerationStatus;
		selected_candidate_id: string | null;
		error_message: string | null;
		created_at: string;
	}

	interface IconCandidate {
		id: string;
		candidate_index: number;
		concept: string;
		svg_sanitized: string;
		selected_at: string | null;
		created_at: string;
	}

	interface IconQueueJob {
		queue_job_id: string;
		status: QueueJobStatus | string;
		attempts: number;
		max_attempts: number;
		error_message: string | null;
		created_at: string;
		started_at: string | null;
		completed_at: string | null;
	}

	interface Props {
		isOpen?: boolean;
		projectId: string;
		projectName?: string;
		existingIconSvg?: string | null;
		existingIconConcept?: string | null;
		onClose?: () => void;
		onApplied?: () => void | Promise<void>;
	}

	let {
		isOpen = $bindable(false),
		projectId,
		projectName = 'Project',
		existingIconSvg = null,
		existingIconConcept = null,
		onClose,
		onApplied
	}: Props = $props();

	let steeringPrompt = $state('');
	const candidateCount = 4;

	let generationId = $state<string | null>(null);
	let generationStatus = $state<GenerationStatus | null>(null);
	let selectedCandidateId = $state<string | null>(null);
	let generationError = $state<string | null>(null);
	let candidates = $state<IconCandidate[]>([]);
	let queueJob = $state<IconQueueJob | null>(null);
	let stalledMessage = $state<string | null>(null);

	let isCreatingGeneration = $state(false);
	let isFetchingGeneration = $state(false);
	let isLoadingLatestGeneration = $state(false);
	let selectingCandidateId = $state<string | null>(null);
	let latestLoadRequestId = 0;

	let pollTimer: ReturnType<typeof setInterval> | null = null;
	const POLL_INTERVAL_MS = 2000;
	const STALL_WARNING_MS = 45000;

	const isGenerating = $derived(
		isCreatingGeneration || generationStatus === 'queued' || generationStatus === 'processing'
	);

	const modalTitle = $derived(existingIconSvg ? 'Edit Project Image' : 'Generate Project Image');

	function parseApiError(payload: any, fallback: string): string {
		if (typeof payload?.error === 'string' && payload.error.length > 0) return payload.error;
		if (typeof payload?.message === 'string' && payload.message.length > 0)
			return payload.message;
		return fallback;
	}

	function normalizeGenerationStatus(value: unknown): GenerationStatus | null {
		if (
			value === 'queued' ||
			value === 'processing' ||
			value === 'completed' ||
			value === 'failed' ||
			value === 'cancelled'
		) {
			return value;
		}
		return null;
	}

	function logIconStudio(
		level: IconStudioLogLevel,
		event: string,
		meta?: Record<string, unknown>
	) {
		if (level === 'debug' && !dev) return;

		const payload = {
			projectId,
			generationId,
			...(meta ?? {})
		};

		switch (level) {
			case 'debug':
				console.debug('[ProjectIconStudioModal]', event, payload);
				break;
			case 'info':
				console.info('[ProjectIconStudioModal]', event, payload);
				break;
			case 'warn':
				console.warn('[ProjectIconStudioModal]', event, payload);
				break;
			case 'error':
				console.error('[ProjectIconStudioModal]', event, payload);
				break;
		}
	}

	function startPolling() {
		if (typeof window === 'undefined' || pollTimer) return;

		logIconStudio('debug', 'Starting generation polling', {
			pollIntervalMs: POLL_INTERVAL_MS
		});

		pollTimer = window.setInterval(() => {
			if (!isOpen || !generationId) {
				stopPolling();
				return;
			}
			void fetchGeneration(generationId);
		}, POLL_INTERVAL_MS);
	}

	function stopPolling() {
		if (!pollTimer) return;
		clearInterval(pollTimer);
		pollTimer = null;
		logIconStudio('debug', 'Stopped generation polling');
	}

	// Reset state on open; clean up polling on close and destroy.
	// IMPORTANT: The body is wrapped in untrack() so the only dependency is `isOpen`.
	// Without untrack, logIconStudio reads `generationId` (a $state), which makes this
	// effect re-trigger whenever loadLatestGeneration or handleGenerate sets generationId,
	// creating an infinite reset loop that causes visible UI jumps.
	$effect(() => {
		if (isOpen) {
			untrack(() => {
				logIconStudio('debug', 'Modal opened, resetting icon generation state');
				steeringPrompt = '';
				generationId = null;
				generationStatus = null;
				selectedCandidateId = null;
				generationError = null;
				candidates = [];
				queueJob = null;
				stalledMessage = null;
				selectingCandidateId = null;
				isCreatingGeneration = false;
				isFetchingGeneration = false;
				isLoadingLatestGeneration = false;

				latestLoadRequestId += 1;
				const requestId = latestLoadRequestId;
				void loadLatestGeneration(requestId);
			});
		}

		return () => {
			stopPolling();
		};
	});

	async function loadLatestGeneration(requestId: number) {
		if (!isOpen || !projectId) return;

		isLoadingLatestGeneration = true;
		try {
			logIconStudio('debug', 'Loading latest icon generation for modal hydration');
			const response = await fetch(
				`/api/onto/projects/${projectId}/icon/generations?t=${Date.now()}`,
				{
					method: 'GET',
					cache: 'no-store',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' }
				}
			);

			const payload = await response.json().catch(() => null);
			if (!response.ok || payload?.success === false) {
				throw new Error(parseApiError(payload, 'Failed to load latest icon generation'));
			}
			if (requestId !== latestLoadRequestId || !isOpen) return;

			const data = payload?.data ?? {};
			const nextGenerationId =
				typeof data.generationId === 'string' ? data.generationId : null;
			const nextStatus = normalizeGenerationStatus(data.status);

			if (!nextGenerationId) {
				logIconStudio('debug', 'No previous icon generation found');
				return;
			}

			generationId = nextGenerationId;
			generationStatus = nextStatus;
			logIconStudio('info', 'Hydrating modal with previous icon generation', {
				nextGenerationId,
				nextStatus
			});

			await fetchGeneration(nextGenerationId);
			if (requestId !== latestLoadRequestId || !isOpen) return;

			if (generationStatus === 'queued' || generationStatus === 'processing') {
				startPolling();
			}
		} catch (error) {
			if (requestId !== latestLoadRequestId || !isOpen) return;

			logIconStudio('warn', 'Failed loading latest icon generation; studio remains usable', {
				error:
					error instanceof Error
						? { message: error.message, stack: dev ? error.stack : undefined }
						: error
			});
		} finally {
			if (requestId === latestLoadRequestId) {
				isLoadingLatestGeneration = false;
			}
		}
	}

	async function fetchGeneration(targetGenerationId: string) {
		if (!targetGenerationId || isFetchingGeneration) return;

		const fetchStartedAt = Date.now();
		const previousStatus = generationStatus;
		const previousQueueStatus = queueJob?.status ?? null;
		const previousCandidateCount = candidates.length;

		isFetchingGeneration = true;
		try {
			logIconStudio('debug', 'Fetching generation status', {
				targetGenerationId
			});

			const response = await fetch(
				`/api/onto/projects/${projectId}/icon/generations/${targetGenerationId}?t=${Date.now()}`,
				{
					method: 'GET',
					cache: 'no-store',
					credentials: 'same-origin',
					headers: { Accept: 'application/json' }
				}
			);

			const payload = await response.json().catch(() => null);
			if (!response.ok || payload?.success === false) {
				throw new Error(parseApiError(payload, 'Failed to load generation status'));
			}

			const data = payload?.data ?? {};
			const generation = (data.generation ?? null) as IconGeneration | null;
			const nextCandidates = (
				Array.isArray(data.candidates) ? data.candidates : []
			) as IconCandidate[];
			const nextQueueJob = (data.queueJob ?? null) as IconQueueJob | null;
			queueJob = nextQueueJob;

			let nextStatus = generationStatus;
			if (generation) {
				nextStatus = normalizeGenerationStatus(generation.status) ?? generationStatus;
				generationStatus = nextStatus;
				selectedCandidateId = generation.selected_candidate_id ?? null;
				generationError = generation.error_message ?? null;
			}

			candidates = nextCandidates;

			const nextQueueStatus = nextQueueJob?.status ?? null;
			if (
				nextStatus !== previousStatus ||
				nextQueueStatus !== previousQueueStatus ||
				nextCandidates.length !== previousCandidateCount
			) {
				logIconStudio('info', 'Generation state updated', {
					targetGenerationId,
					previousStatus,
					nextStatus,
					previousQueueStatus,
					nextQueueStatus,
					previousCandidateCount,
					nextCandidateCount: nextCandidates.length,
					queueJobId: nextQueueJob?.queue_job_id ?? null,
					queueAttempts: nextQueueJob?.attempts ?? null,
					queueMaxAttempts: nextQueueJob?.max_attempts ?? null,
					latencyMs: Date.now() - fetchStartedAt
				});
			}

			let isStillGenerating = nextStatus === 'queued' || nextStatus === 'processing';
			if (isStillGenerating && nextCandidates.length > 0) {
				logIconStudio(
					'warn',
					'Candidates exist while generation still marked active; reconciling to completed',
					{
						targetGenerationId,
						previousStatus,
						nextStatus,
						nextCandidateCount: nextCandidates.length,
						queueStatus: nextQueueJob?.status ?? null,
						queueJobId: nextQueueJob?.queue_job_id ?? null
					}
				);
				nextStatus = 'completed';
				generationStatus = 'completed';
				isStillGenerating = false;
			}

			if (isStillGenerating && nextQueueJob) {
				if (nextQueueJob.status === 'failed' || nextQueueJob.status === 'cancelled') {
					logIconStudio(
						'warn',
						'Queue job failed before generation reached terminal state',
						{
							targetGenerationId,
							queueStatus: nextQueueJob.status,
							queueJobId: nextQueueJob.queue_job_id,
							queueError: nextQueueJob.error_message
						}
					);
					generationStatus = 'failed';
					generationError =
						nextQueueJob.error_message ??
						generationError ??
						'Queue job failed before icon generation completed';
					stalledMessage = null;
					stopPolling();
					return;
				}

				if (nextQueueJob.status === 'completed' && previousQueueStatus !== 'completed') {
					logIconStudio(
						'warn',
						'Queue job completed but generation is still non-terminal',
						{
							targetGenerationId,
							generationStatus: nextStatus,
							queueJobId: nextQueueJob.queue_job_id
						}
					);
				}
			}

			if (isStillGenerating && generation?.created_at) {
				const startedAt = Date.parse(generation.created_at);
				if (Number.isFinite(startedAt) && Date.now() - startedAt >= STALL_WARNING_MS) {
					if (!stalledMessage) {
						logIconStudio('warn', 'Generation appears stalled waiting for worker', {
							targetGenerationId,
							generationCreatedAt: generation.created_at,
							stallWarningMs: STALL_WARNING_MS,
							queueStatus: nextQueueJob?.status ?? null,
							queueJobId: nextQueueJob?.queue_job_id ?? null
						});
					}
					stalledMessage =
						'Generation is taking longer than expected. Still waiting for worker completion...';
				}
			} else {
				stalledMessage = null;
			}

			if (!isStillGenerating) {
				logIconStudio('info', 'Generation reached terminal state', {
					targetGenerationId,
					generationStatus: nextStatus,
					candidateCount: nextCandidates.length
				});
				stopPolling();
			}
		} catch (error) {
			generationError =
				error instanceof Error ? error.message : 'Failed to load generation status';
			logIconStudio('error', 'Failed to fetch generation status', {
				targetGenerationId,
				error:
					error instanceof Error
						? { message: error.message, stack: dev ? error.stack : undefined }
						: error
			});
			stalledMessage = null;
			if (generationStatus !== 'queued' && generationStatus !== 'processing') {
				stopPolling();
			}
		} finally {
			isFetchingGeneration = false;
		}
	}

	async function handleGenerate() {
		if (isGenerating || selectingCandidateId || !projectId) return;

		latestLoadRequestId += 1;
		isLoadingLatestGeneration = false;
		logIconStudio('info', 'Starting icon generation request', {
			promptLength: steeringPrompt.trim().length,
			candidateCount
		});
		isCreatingGeneration = true;
		generationError = null;
		generationId = null;
		generationStatus = null;
		selectedCandidateId = null;
		candidates = [];
		queueJob = null;
		stalledMessage = null;
		stopPolling();

		try {
			const response = await fetch(`/api/onto/projects/${projectId}/icon/generations`, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json'
				},
				body: JSON.stringify({
					steeringPrompt: steeringPrompt.trim(),
					candidateCount
				})
			});

			const payload = await response.json().catch(() => null);
			if (!response.ok || payload?.success === false) {
				throw new Error(parseApiError(payload, 'Failed to start icon generation'));
			}

			const data = payload?.data ?? {};
			const nextGenerationId =
				typeof data.generationId === 'string' ? data.generationId : null;
			const nextStatus = normalizeGenerationStatus(data.status) ?? 'queued';
			const queueJobId = typeof data.queueJobId === 'string' ? data.queueJobId : null;

			if (!nextGenerationId) {
				throw new Error('Generation ID missing from response');
			}

			logIconStudio('info', 'Icon generation created', {
				nextGenerationId,
				nextStatus,
				queueJobId
			});
			generationId = nextGenerationId;
			generationStatus = nextStatus;

			await fetchGeneration(nextGenerationId);

			if (generationStatus === 'queued' || generationStatus === 'processing') {
				startPolling();
			}
		} catch (error) {
			generationError =
				error instanceof Error ? error.message : 'Failed to start icon generation';
			logIconStudio('error', 'Failed to create icon generation', {
				error:
					error instanceof Error
						? { message: error.message, stack: dev ? error.stack : undefined }
						: error,
				promptLength: steeringPrompt.trim().length,
				candidateCount
			});

			if (
				generationId &&
				(generationStatus === 'queued' || generationStatus === 'processing')
			) {
				logIconStudio(
					'warn',
					'Initial status fetch failed after generation creation; continuing polling',
					{ generationId, generationStatus }
				);
				startPolling();
			}
		} finally {
			isCreatingGeneration = false;
		}
	}

	async function handleRefreshStatus() {
		if (!generationId || isFetchingGeneration) return;
		logIconStudio('debug', 'Manual status refresh requested', { generationId });
		stalledMessage = null;
		await fetchGeneration(generationId);
		if (generationStatus === 'queued' || generationStatus === 'processing') {
			startPolling();
		}
	}

	async function handleSelectCandidate(candidateId: string) {
		if (!generationId || selectingCandidateId || isGenerating) return;

		logIconStudio('info', 'Selecting generated icon candidate', {
			generationId,
			candidateId
		});
		selectingCandidateId = candidateId;
		generationError = null;

		try {
			const response = await fetch(
				`/api/onto/projects/${projectId}/icon/generations/${generationId}/select`,
				{
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json'
					},
					body: JSON.stringify({ candidateId })
				}
			);

			const payload = await response.json().catch(() => null);
			if (!response.ok || payload?.success === false) {
				throw new Error(parseApiError(payload, 'Failed to apply icon'));
			}

			selectedCandidateId = candidateId;
			logIconStudio('info', 'Icon candidate applied successfully', {
				generationId,
				candidateId
			});
			await fetchGeneration(generationId);
			await onApplied?.();
			handleClose();
		} catch (error) {
			generationError = error instanceof Error ? error.message : 'Failed to apply icon';
			logIconStudio('error', 'Failed to apply icon candidate', {
				generationId,
				candidateId,
				error:
					error instanceof Error
						? { message: error.message, stack: dev ? error.stack : undefined }
						: error
			});
		} finally {
			selectingCandidateId = null;
		}
	}

	function handleClose() {
		logIconStudio('debug', 'Closing icon studio modal');
		isOpen = false;
		onClose?.();
	}
</script>

<Modal bind:isOpen onClose={handleClose} title={modalTitle} size="lg">
	<div class="p-3 space-y-3">
		<!-- Project context -->
		<div
			class="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 shadow-ink tx tx-frame tx-weak wt-paper sp-inline"
		>
			<ProjectIcon svg={existingIconSvg} concept={existingIconConcept} size="lg" />
			<div class="min-w-0">
				<p class="text-sm font-semibold text-foreground truncate">{projectName}</p>
				<p class="text-xs text-muted-foreground truncate">
					{existingIconConcept ?? 'No image selected yet'}
				</p>
			</div>
		</div>

		<!-- Steering prompt -->
		<div class="space-y-1">
			<label for="icon-steering-prompt" class="text-xs font-medium text-muted-foreground">
				Style direction
			</label>
			<Textarea
				id="icon-steering-prompt"
				bind:value={steeringPrompt}
				size="sm"
				rows={3}
				placeholder="Minimal mountain + trail vibe, clean line icon, no text."
			/>
		</div>

		<!-- Actions -->
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="primary"
				size="sm"
				disabled={isGenerating || selectingCandidateId !== null}
				loading={isCreatingGeneration}
				onclick={() => void handleGenerate()}
				icon={candidates.length > 0 ? RefreshCw : Sparkles}
			>
				{candidates.length > 0 ? 'Regenerate' : 'Generate'}
			</Button>
			{#if generationId}
				<Button
					variant="outline"
					size="sm"
					disabled={isFetchingGeneration}
					loading={isFetchingGeneration}
					onclick={() => void handleRefreshStatus()}
				>
					Refresh status
				</Button>
			{/if}
		</div>

		{#if isLoadingLatestGeneration && !isGenerating && candidates.length === 0}
			<div
				class="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground tx tx-static tx-weak wt-ghost sp-inline"
			>
				Loading previous image options...
			</div>
		{/if}

		<!-- Generating indicator -->
		{#if isGenerating}
			<div
				class="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground tx tx-pulse tx-weak wt-ghost sp-inline"
			>
				<LoaderCircle class="h-3.5 w-3.5 animate-spin shrink-0" />
				{#if generationStatus === 'queued'}
					Queued — waiting for worker...
				{:else}
					Generating image options...
				{/if}
			</div>
		{/if}

		{#if stalledMessage}
			<div
				class="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 tx tx-static tx-weak sp-inline"
			>
				{stalledMessage}
			</div>
		{/if}

		{#if queueJob && (generationStatus === 'queued' || generationStatus === 'processing' || stalledMessage)}
			<div
				class="rounded-md border border-border px-3 py-2 text-xs text-muted-foreground tx tx-static tx-weak wt-ghost sp-inline"
			>
				Queue: {queueJob.status} · attempts {queueJob.attempts}/{queueJob.max_attempts}
			</div>
		{/if}

		<!-- Error -->
		{#if generationError}
			<div
				class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive tx tx-static tx-weak sp-inline"
			>
				{generationError}
			</div>
		{/if}

		<!-- Candidates -->
		{#if candidates.length > 0}
			<div class="space-y-1.5">
				<p class="micro-label">Candidates</p>
				<div class="grid gap-2 sm:grid-cols-2">
					{#each candidates as candidate (candidate.id)}
						{@const isSelected =
							selectedCandidateId === candidate.id || Boolean(candidate.selected_at)}
						<div
							class="rounded-lg border p-2.5 shadow-ink transition-colors tx tx-bloom tx-weak wt-paper sp-inline
								{isSelected ? 'border-success/40 ring-1 ring-success/20' : 'border-border hover:border-accent/30'}"
						>
							<div class="flex items-start justify-between gap-2">
								<div class="flex items-center gap-2.5 min-w-0">
									<ProjectIcon
										svg={candidate.svg_sanitized}
										concept={candidate.concept}
										size="xl"
									/>
									<div class="min-w-0">
										<p class="text-sm font-medium text-foreground truncate">
											{candidate.concept}
										</p>
										<p class="text-xs text-muted-foreground">
											Option {candidate.candidate_index + 1}
										</p>
									</div>
								</div>
								<Button
									variant={isSelected ? 'success' : 'outline'}
									size="sm"
									disabled={isSelected ||
										isGenerating ||
										selectingCandidateId !== null}
									loading={selectingCandidateId === candidate.id}
									onclick={() => void handleSelectCandidate(candidate.id)}
									icon={isSelected ? Check : undefined}
								>
									{isSelected ? 'Applied' : 'Use'}
								</Button>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else if generationStatus === 'completed'}
			<div
				class="rounded-md border border-border px-3 py-2 text-sm text-muted-foreground tx tx-static tx-weak wt-ghost sp-inline"
			>
				No valid image options were produced. Try a more specific style direction.
			</div>
		{/if}
	</div>
</Modal>
