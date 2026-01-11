<!-- apps/web/src/lib/components/voice-notes/VoiceNoteGroupPanel.svelte -->
<!-- INKPRINT: Ultra-compact voice note panel with inline collapsed / block expanded pattern -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { ChevronDown, ChevronUp, Mic, Play, Square, Trash2 } from 'lucide-svelte';
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import VoiceNotePlayer from './VoiceNotePlayer.svelte';
	import { deleteVoiceNote } from '$lib/services/voice-notes.service';
	import type { VoiceNote } from '$lib/types/voice-notes';

	interface Props {
		groupId: string;
		voiceNotes: VoiceNote[];
		showTranscript?: boolean;
		playAllGapMs?: number;
		onDeleteNote?: (groupId: string, noteId: string) => void;
		/** Inline mode: chip inline with timestamp, expanded panel takes full width */
		inline?: boolean;
	}

	let {
		groupId,
		voiceNotes,
		showTranscript = false,
		playAllGapMs = 300,
		onDeleteNote,
		inline = false
	}: Props = $props();

	let isExpanded = $state(false);
	let isPlayingAll = $state(false);
	let playAllIndex = $state<number | null>(null);
	let deleteTarget = $state<VoiceNote | null>(null);
	let deleteLoading = $state(false);
	let deleteError = $state('');

	let playAllToken = 0;
	let playerRefs: Array<VoiceNotePlayer | null> = [];

	const totalDuration = $derived(
		voiceNotes.reduce((sum, n) => sum + (n.duration_seconds || 0), 0)
	);

	function formatDuration(seconds: number | null): string {
		if (!seconds || !Number.isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function toggleExpanded(e: MouseEvent) {
		e.stopPropagation();
		if (isExpanded) {
			stopPlayAll();
		}
		isExpanded = !isExpanded;
	}

	function stopPlayAll() {
		playAllToken += 1;
		isPlayingAll = false;
		playAllIndex = null;
		playerRefs.forEach((player) => player?.stop());
	}

	async function handlePlayAll(e: MouseEvent) {
		e.stopPropagation();
		if (isPlayingAll) {
			stopPlayAll();
			return;
		}

		if (voiceNotes.length === 0) return;

		isPlayingAll = true;
		const token = (playAllToken += 1);

		for (let index = 0; index < voiceNotes.length; index += 1) {
			if (token !== playAllToken) break;
			playAllIndex = index;
			const player = playerRefs[index];
			if (player) {
				await player.playFromStart();
			}
			if (token !== playAllToken) break;
			await new Promise((resolve) => setTimeout(resolve, playAllGapMs));
		}

		if (token === playAllToken) {
			isPlayingAll = false;
			playAllIndex = null;
		}
	}

	function promptDelete(note: VoiceNote, e: MouseEvent) {
		e.stopPropagation();
		deleteError = '';
		deleteTarget = note;
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		deleteLoading = true;
		deleteError = '';

		try {
			await deleteVoiceNote(deleteTarget.id);
			onDeleteNote?.(groupId, deleteTarget.id);
			deleteTarget = null;
		} catch (error) {
			deleteError =
				error instanceof Error ? error.message : 'Failed to delete voice note segment';
		} finally {
			deleteLoading = false;
		}
	}

	function cancelDelete() {
		deleteTarget = null;
		deleteError = '';
	}

	onDestroy(() => {
		stopPlayAll();
	});
</script>

<!-- Chip button (shared styling) -->
{#snippet chipButton()}
	<button
		type="button"
		class="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-accent/50 hover:bg-accent/5 hover:text-accent pressable"
		onclick={toggleExpanded}
		aria-expanded={isExpanded}
		aria-label={isExpanded ? 'Collapse voice notes' : 'Expand voice notes'}
	>
		<Mic class="h-2.5 w-2.5" />
		{#if voiceNotes.length > 0}
			<span class="tabular-nums">{voiceNotes.length}</span>
			<span class={inline ? 'hidden xs:inline' : ''}>·</span>
			<span class={inline ? 'hidden xs:inline tabular-nums' : 'tabular-nums'}
				>{formatDuration(totalDuration)}</span
			>
		{:else}
			<span>...</span>
		{/if}
		{#if isExpanded}
			<ChevronUp class="h-2.5 w-2.5" />
		{:else}
			<ChevronDown class="h-2.5 w-2.5" />
		{/if}
	</button>
{/snippet}

<!-- Expanded panel content (shared) -->
{#snippet expandedPanel()}
	<!-- Controls row -->
	<div class="flex items-center gap-2">
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[0.65rem] font-semibold text-foreground shadow-ink transition-colors hover:border-accent hover:bg-accent/5 pressable disabled:opacity-50"
			disabled={voiceNotes.length === 0}
			onclick={handlePlayAll}
		>
			{#if isPlayingAll}
				<Square class="h-2.5 w-2.5" />
				<span>Stop</span>
			{:else}
				<Play class="h-2.5 w-2.5" />
				<span>Play all</span>
			{/if}
		</button>
		{#if isPlayingAll && playAllIndex !== null}
			<span class="text-[0.6rem] tabular-nums text-accent">
				{playAllIndex + 1}/{voiceNotes.length}
			</span>
		{/if}
	</div>

	<!-- Voice notes list -->
	{#if voiceNotes.length === 0}
		<p class="mt-1.5 text-[0.65rem] italic text-muted-foreground">Voice notes uploading...</p>
	{:else}
		<div class="mt-1.5 space-y-1">
			{#each voiceNotes as voiceNote, index (voiceNote.id)}
				<div
					class="group rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 {playAllIndex ===
					index
						? 'ring-1 ring-accent/50'
						: ''}"
				>
					<!-- Segment header: number + duration + delete -->
					<div class="flex items-center justify-between gap-2">
						<span
							class="text-[0.6rem] font-medium uppercase tracking-wide text-muted-foreground"
						>
							{index + 1}/{voiceNotes.length} · {formatDuration(
								voiceNote.duration_seconds
							)}
						</span>
						<button
							type="button"
							class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-[0.6rem] text-destructive/70 hover:text-destructive transition-opacity"
							onclick={(e) => promptDelete(voiceNote, e)}
							aria-label="Delete segment"
						>
							<Trash2 class="h-3 w-3" />
						</button>
					</div>
					<!-- Compact player -->
					<div class="mt-1">
						<VoiceNotePlayer
							bind:this={playerRefs[index]}
							{voiceNote}
							{showTranscript}
							compact
						/>
					</div>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<!-- INLINE MODE: Chip inline, expanded panel as sibling for full width -->
{#if inline}
	{@render chipButton()}
	{#if isExpanded}
		<div
			class="w-full self-stretch rounded-lg border border-border/50 bg-card p-2 shadow-ink tx tx-frame tx-weak"
		>
			{@render expandedPanel()}
		</div>
	{/if}
{:else}
	<!-- BLOCK MODE: Everything in a wrapper -->
	<div class="contents">
		{@render chipButton()}
		{#if isExpanded}
			<div
				class="mt-1.5 w-full rounded-lg border border-border/50 bg-card p-2 shadow-ink tx tx-frame tx-weak"
			>
				{@render expandedPanel()}
			</div>
		{/if}
	</div>
{/if}

<ConfirmationModal
	isOpen={!!deleteTarget}
	title="Delete voice note?"
	confirmText="Delete"
	confirmVariant="danger"
	loading={deleteLoading}
	loadingText="Deleting..."
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This will permanently remove the selected voice note segment.
		</p>
	{/snippet}

	{#snippet details()}
		{#if deleteTarget}
			<div class="mt-2 space-y-1.5 text-xs text-muted-foreground">
				<div>
					<span class="font-semibold text-foreground">Length:</span>
					{formatDuration(deleteTarget.duration_seconds)}
				</div>
				{#if deleteTarget.transcript}
					<div>
						<span class="font-semibold text-foreground">Transcript:</span>
						<p
							class="mt-0.5 rounded-md border border-border bg-muted/50 p-1.5 text-[0.65rem] text-foreground line-clamp-3"
						>
							{deleteTarget.transcript}
						</p>
					</div>
				{/if}
				{#if deleteError}
					<p class="text-[0.65rem] text-destructive">{deleteError}</p>
				{/if}
			</div>
		{/if}
	{/snippet}
</ConfirmationModal>
