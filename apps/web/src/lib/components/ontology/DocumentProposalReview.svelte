<!-- apps/web/src/lib/components/ontology/DocumentProposalReview.svelte -->
<script module lang="ts">
	export type DocumentProposalApplyReceipt = { versionWarning: string | null };
</script>

<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { AlertTriangle, Check, LoaderCircle, RefreshCcw, Sparkles, X } from '$lib/icons/lucide';
	import {
		assertDocumentPatchIntegrity,
		type DocumentPatchV1
	} from '@buildos/shared-agent-ops/ontology/document-patch';
	import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { createDocumentFieldDiff } from '$lib/utils/document-diff';
	import DocumentSplitDiffView from './DocumentSplitDiffView.svelte';

	type Proposal = {
		id: string;
		status: string;
		instruction: string;
		patch: DocumentPatchV1;
		conflict_reason: string | null;
		version_warning?: string | null;
	};

	interface Props {
		documentId: string;
		baseContent: string;
		selectionFrom: number;
		selectionTo: number;
		selectedMarkdown: string;
		documentTitle?: string;
		initialInstruction?: string;
		onBeforeApply?: () => boolean | Promise<boolean>;
		onApplyStateChange?: (applying: boolean) => void;
		onVoiceStateChange?: (busy: boolean) => void;
		onApplied?: (receipt: DocumentProposalApplyReceipt) => void | Promise<void>;
		onReselect?: (instruction: string) => void;
		onClose?: () => void;
	}

	let {
		documentId,
		baseContent,
		selectionFrom,
		selectionTo,
		selectedMarkdown,
		documentTitle = '',
		initialInstruction = '',
		onBeforeApply,
		onApplyStateChange,
		onVoiceStateChange,
		onApplied,
		onReselect,
		onClose
	}: Props = $props();

	// Each review instance belongs to one captured selection (keyed by the parent).
	let instruction = $state(untrack(() => initialInstruction));
	let proposal = $state.raw<Proposal | null>(null);
	let generating = $state(false);
	let applying = $state(false);
	let errorMessage = $state<string | null>(null);
	let conflictReason = $state<string | null>(null);
	let replacesProposalId = $state<string | null>(null);
	let isRecording = $state(false);
	let isInitializing = $state(false);
	let isStopping = $state(false);
	let isTranscribing = $state(false);
	const voiceBusy = $derived(isRecording || isInitializing || isStopping || isTranscribing);
	let disposed = false;
	let refreshingAppliedDocument = false;
	let requestController: AbortController | null = null;

	$effect(() => {
		onVoiceStateChange?.(voiceBusy);
	});

	onDestroy(() => {
		disposed = true;
		requestController?.abort();
		// Once applied, the parent owns the lock until its refresh completes.
		// Otherwise release it if a reload removes an unfinished review.
		if (!refreshingAppliedDocument) onApplyStateChange?.(false);
		onVoiceStateChange?.(false);
	});

	function focusInstruction(element: HTMLElement) {
		let cancelled = false;
		void tick().then(() => {
			if (!cancelled && element.isConnected) {
				element.querySelector('textarea')?.focus({ preventScroll: true });
			}
		});
		return () => {
			cancelled = true;
		};
	}

	function beginRequest() {
		requestController?.abort();
		const controller = new AbortController();
		requestController = controller;
		const identity = { documentId, baseContent, selectionFrom, selectionTo };
		return {
			controller,
			identity,
			isCurrent: () =>
				!disposed &&
				!controller.signal.aborted &&
				requestController === controller &&
				documentId === identity.documentId &&
				baseContent === identity.baseContent &&
				selectionFrom === identity.selectionFrom &&
				selectionTo === identity.selectionTo
		};
	}

	const operation = $derived(proposal?.patch.operations[0] ?? null);
	const diffFields = $derived.by(() => {
		if (!operation) return [];
		return [
			createDocumentFieldDiff(
				'selection',
				'Selected passage',
				operation.anchor.before_markdown,
				operation.replacement_markdown,
				2
			)
		];
	});

	function readProposal(value: unknown, expectedDocumentId: string): Proposal {
		const candidate = value as Proposal | null;
		if (
			!candidate ||
			typeof candidate.id !== 'string' ||
			typeof candidate.instruction !== 'string' ||
			!candidate.patch
		) {
			throw new Error('The proposal response was incomplete. Please try again.');
		}
		assertDocumentPatchIntegrity(candidate.patch);
		if (
			candidate.patch.document_id !== expectedDocumentId ||
			candidate.patch.operations.length !== 1
		) {
			throw new Error(
				'The proposal does not match this document selection. Select the passage again.'
			);
		}
		return candidate;
	}

	async function readPayload(response: Response) {
		return response.json().catch(() => null) as Promise<{
			data?: { proposal?: unknown; version_warning?: string | null };
			error?: string;
			message?: string;
			code?: string;
			details?: { proposal?: unknown };
		} | null>;
	}

	async function generateProposal() {
		const nextInstruction = instruction.trim();
		if (!nextInstruction || generating || applying || voiceBusy || conflictReason) return;
		const request = beginRequest();
		generating = true;
		errorMessage = null;
		try {
			const response = await fetch(
				`/api/onto/documents/${request.identity.documentId}/proposals`,
				{
					method: 'POST',
					signal: request.controller.signal,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						instruction: nextInstruction,
						selection_from: request.identity.selectionFrom,
						selection_to: request.identity.selectionTo,
						base_content_hash: hashDocumentContent(request.identity.baseContent),
						...(replacesProposalId ? { replaces_proposal_id: replacesProposalId } : {})
					})
				}
			);
			const payload = await readPayload(response);
			if (!request.isCurrent()) return;
			if (!response.ok) {
				conflictReason =
					response.status === 409 ? (payload?.code ?? 'DOCUMENT_SELECTION_STALE') : null;
				throw new Error(
					payload?.error || payload?.message || 'Failed to generate proposal'
				);
			}
			proposal = readProposal(payload?.data?.proposal, request.identity.documentId);
		} catch (error) {
			if (request.isCurrent())
				errorMessage =
					error instanceof Error ? error.message : 'Failed to generate proposal';
		} finally {
			if (request.isCurrent()) generating = false;
		}
	}

	async function applyProposal() {
		if (!proposal || proposal.status !== 'pending' || applying || voiceBusy || conflictReason)
			return;
		const targetProposal = proposal;
		const request = beginRequest();
		applying = true;
		onApplyStateChange?.(true);
		errorMessage = null;
		try {
			const mayApply = (await onBeforeApply?.()) ?? true;
			if (!request.isCurrent()) return;
			if (!mayApply) {
				errorMessage =
					'The document could not be prepared. Resolve its save warning, then try again.';
				return;
			}
			const response = await fetch(
				`/api/onto/documents/${request.identity.documentId}/proposals/${targetProposal.id}/apply`,
				{
					method: 'POST',
					signal: request.controller.signal
				}
			);
			const payload = await readPayload(response);
			if (!request.isCurrent()) return;
			if (!response.ok) {
				conflictReason = response.status === 409 ? (payload?.code ?? 'CONFLICT') : null;
				throw new Error(payload?.error || payload?.message || 'Failed to apply proposal');
			}
			const applied = readProposal(payload?.data?.proposal, request.identity.documentId);
			if (applied.id !== targetProposal.id || applied.status !== 'applied') {
				throw new Error(
					'The apply result could not be confirmed. Try again to check its status.'
				);
			}
			proposal = applied;
			const warning = payload?.data?.version_warning ?? applied.version_warning;
			refreshingAppliedDocument = true;
			await onApplied?.({
				versionWarning:
					typeof warning === 'string' && warning.trim() ? warning.trim() : null
			});
		} catch (error) {
			if (request.isCurrent())
				errorMessage = error instanceof Error ? error.message : 'Failed to apply proposal';
		} finally {
			if (request.isCurrent()) {
				applying = false;
				onApplyStateChange?.(false);
			}
		}
	}

	function startOver() {
		if (conflictReason) {
			onReselect?.(instruction);
			return;
		}
		replacesProposalId = proposal?.id ?? replacesProposalId;
		proposal = null;
		errorMessage = null;
	}
</script>

<section
	class="mx-1.5 mb-1.5 shrink-0 overflow-hidden rounded-xl border border-accent/30 bg-card shadow-ink tx tx-frame tx-weak sm:mx-2 sm:mb-2"
	aria-label="Agent document proposal"
>
	<header class="flex items-center gap-2 border-b border-border bg-accent/5 px-3 py-2">
		<span
			class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent"
		>
			<Sparkles class="h-4 w-4" />
		</span>
		<div class="min-w-0 flex-1">
			<p class="text-sm font-semibold text-foreground">Revise selected text</p>
			<p class="truncate text-xs text-muted-foreground">
				{documentTitle || 'Document'} · {selectedMarkdown.length.toLocaleString()} selected characters
			</p>
		</div>
		<button
			type="button"
			onclick={onClose}
			class="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
			disabled={applying || voiceBusy}
			aria-label="Close proposal review"
		>
			<X class="h-4 w-4" />
		</button>
	</header>

	<div class="max-h-[42vh] overflow-y-auto p-3">
		{#if !proposal}
			<div class="mb-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
				<p class="micro-label mb-1 text-muted-foreground">SELECTED MARKDOWN</p>
				<p
					class="line-clamp-3 whitespace-pre-wrap font-mono text-xs leading-5 text-foreground"
				>
					{selectedMarkdown}
				</p>
			</div>

			<div {@attach focusInstruction}>
				<TextareaWithVoice
					bind:value={instruction}
					bind:isRecording
					bind:isInitializing
					bind:isStopping
					bind:isTranscribing
					aria-label="Proposal instruction"
					placeholder="Describe the change you want…"
					rows={2}
					maxRows={5}
					autoResize={true}
					maxLength={4000}
					enableVoice={true}
					showStatusRow={false}
					hintText="Type or speak an instruction"
					voiceNoteSource="document-proposal"
					disabled={generating}
					textareaClass="text-sm"
				/>
			</div>

			<div class="mt-3 flex justify-end">
				<Button
					type="button"
					size="sm"
					onclick={generateProposal}
					disabled={!instruction.trim() ||
						generating ||
						voiceBusy ||
						Boolean(conflictReason)}
				>
					{#if generating}
						<LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
						Drafting proposal…
					{:else}
						<Sparkles class="mr-1.5 h-4 w-4" />
						Generate proposal
					{/if}
				</Button>
			</div>
		{:else}
			<div class="mb-3 flex items-start justify-between gap-3">
				<div>
					<p class="micro-label text-muted-foreground">INSTRUCTION</p>
					<p class="mt-1 text-sm text-foreground">{proposal.instruction}</p>
				</div>
				<span
					class="shrink-0 rounded-full bg-warning/10 px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-warning"
				>
					Review required
				</span>
			</div>

			<DocumentSplitDiffView
				fields={diffFields}
				fromLabel="Current selection"
				toLabel="Agent proposal"
			/>

			{#if conflictReason}
				<div
					class="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
				>
					<AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p class="font-medium">The target changed while you were reviewing.</p>
						<p class="mt-0.5 text-xs opacity-80">
							Select the latest passage and regenerate. Nothing was partially applied.
						</p>
					</div>
				</div>
			{/if}

			<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={startOver}
					disabled={applying}
				>
					<RefreshCcw class="mr-1.5 h-3.5 w-3.5" />
					{conflictReason ? 'Select again' : 'Revise instruction'}
				</Button>
				<Button
					type="button"
					size="sm"
					onclick={applyProposal}
					disabled={applying || Boolean(conflictReason) || proposal.status !== 'pending'}
				>
					{#if applying}
						<LoaderCircle class="mr-1.5 h-4 w-4 animate-spin" />
						Applying…
					{:else}
						<Check class="mr-1.5 h-4 w-4" />
						Apply proposal
					{/if}
				</Button>
			</div>
		{/if}

		{#if conflictReason && !proposal}
			<div
				class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning"
				role="status"
			>
				<p>The document changed. Select the latest passage to continue.</p>
				<Button type="button" variant="ghost" size="sm" onclick={startOver}
					>Select again</Button
				>
			</div>
		{/if}
		{#if voiceBusy}
			<p class="mt-2 text-xs text-muted-foreground" role="status">
				Finish recording and transcription before generating a proposal.
			</p>
		{/if}

		{#if errorMessage}
			<p class="mt-3 text-sm text-destructive" role="alert">{errorMessage}</p>
		{/if}
	</div>
</section>
