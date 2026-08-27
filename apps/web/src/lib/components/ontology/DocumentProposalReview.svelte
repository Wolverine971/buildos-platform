<!-- apps/web/src/lib/components/ontology/DocumentProposalReview.svelte -->
<script lang="ts">
	import { AlertTriangle, Check, LoaderCircle, RefreshCcw, Sparkles, X } from 'lucide-svelte';
	import type { Json } from '@buildos/shared-types';
	import { hashDocumentContent } from '@buildos/shared-agent-ops/utils/document-outline';
	import type { DocumentPatchV1 } from '@buildos/shared-agent-ops/ontology/document-patch';
	import Button from '$lib/components/ui/Button.svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import { createDocumentFieldDiff } from '$lib/utils/document-diff';
	import DocumentSplitDiffView from './DocumentSplitDiffView.svelte';

	type Proposal = {
		id: string;
		status: string;
		instruction: string;
		patch: Json;
		conflict_reason: string | null;
	};

	interface Props {
		documentId: string;
		baseContent: string;
		selectionFrom: number;
		selectionTo: number;
		selectedMarkdown: string;
		documentTitle?: string;
		onBeforeApply?: () => boolean | Promise<boolean>;
		onApplyStateChange?: (applying: boolean) => void;
		onApplied?: () => void | Promise<void>;
		onClose?: () => void;
	}

	let {
		documentId,
		baseContent,
		selectionFrom,
		selectionTo,
		selectedMarkdown,
		documentTitle = '',
		onBeforeApply,
		onApplyStateChange,
		onApplied,
		onClose
	}: Props = $props();

	let instruction = $state('');
	let proposal = $state.raw<Proposal | null>(null);
	let generating = $state(false);
	let applying = $state(false);
	let errorMessage = $state<string | null>(null);
	let conflictReason = $state<string | null>(null);
	let replacesProposalId = $state<string | null>(null);

	const patch = $derived.by(() => {
		if (
			!proposal?.patch ||
			typeof proposal.patch !== 'object' ||
			Array.isArray(proposal.patch)
		) {
			return null;
		}
		return proposal.patch as unknown as DocumentPatchV1;
	});
	const operation = $derived(patch?.operations[0] ?? null);
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

	async function readPayload(response: Response) {
		return response.json().catch(() => null) as Promise<{
			data?: { proposal?: Proposal };
			error?: string;
			message?: string;
			code?: string;
			details?: { proposal?: Proposal };
		} | null>;
	}

	async function generateProposal() {
		const nextInstruction = instruction.trim();
		if (!nextInstruction || generating) return;
		generating = true;
		errorMessage = null;
		conflictReason = null;
		try {
			const response = await fetch(`/api/onto/documents/${documentId}/proposals`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					instruction: nextInstruction,
					selection_from: selectionFrom,
					selection_to: selectionTo,
					base_content_hash: hashDocumentContent(baseContent),
					...(replacesProposalId ? { replaces_proposal_id: replacesProposalId } : {})
				})
			});
			const payload = await readPayload(response);
			if (!response.ok || !payload?.data?.proposal) {
				throw new Error(
					payload?.error || payload?.message || 'Failed to generate proposal'
				);
			}
			proposal = payload.data.proposal;
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to generate proposal';
		} finally {
			generating = false;
		}
	}

	async function applyProposal() {
		if (!proposal || applying) return;
		applying = true;
		onApplyStateChange?.(true);
		errorMessage = null;
		conflictReason = null;
		try {
			const mayApply = (await onBeforeApply?.()) ?? true;
			if (!mayApply) return;
			const response = await fetch(
				`/api/onto/documents/${documentId}/proposals/${proposal.id}/apply`,
				{ method: 'POST' }
			);
			const payload = await readPayload(response);
			if (!response.ok) {
				conflictReason = response.status === 409 ? (payload?.code ?? 'CONFLICT') : null;
				proposal = payload?.details?.proposal ?? proposal;
				throw new Error(payload?.error || payload?.message || 'Failed to apply proposal');
			}
			proposal = payload?.data?.proposal ?? proposal;
			await onApplied?.();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to apply proposal';
		} finally {
			applying = false;
			onApplyStateChange?.(false);
		}
	}

	function startOver() {
		replacesProposalId = proposal?.id ?? replacesProposalId;
		proposal = null;
		errorMessage = null;
		conflictReason = null;
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
			disabled={generating || applying}
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

			<TextareaWithVoice
				bind:value={instruction}
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

			<div class="mt-3 flex justify-end">
				<Button
					type="button"
					size="sm"
					onclick={generateProposal}
					disabled={!instruction.trim() || generating}
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
					disabled={applying || Boolean(conflictReason)}
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

		{#if errorMessage}
			<p class="mt-3 text-sm text-destructive" role="alert">{errorMessage}</p>
		{/if}
	</div>
</section>
