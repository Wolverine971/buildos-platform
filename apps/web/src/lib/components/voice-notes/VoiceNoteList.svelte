<!-- apps/web/src/lib/components/voice-notes/VoiceNoteList.svelte -->
<!-- INKPRINT: High-density voice note list with semantic styling -->
<script lang="ts">
	import ConfirmationModal from '$lib/components/ui/ConfirmationModal.svelte';
	import { Trash2 } from '$lib/icons/lucide';
	import VoiceNotePlayer from './VoiceNotePlayer.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';

	type TimestampMode = 'relative' | 'absolute' | 'both';

	interface Props {
		voiceNotes: VoiceNote[];
		showTranscript?: boolean;
		onDelete?: (id: string) => void;
		/** Compact mode for embedded use */
		compact?: boolean;
		timestampMode?: TimestampMode;
	}

	let {
		voiceNotes,
		showTranscript = true,
		onDelete,
		compact = false,
		timestampMode = 'relative'
	}: Props = $props();
	let deleteTarget = $state<VoiceNote | null>(null);
	let deleteLoading = $state(false);
	let deleteError = $state('');

	function formatRelative(value: string): string {
		try {
			const date = new Date(value);
			const now = new Date();
			const diffMs = now.getTime() - date.getTime();
			const diffMins = Math.floor(diffMs / 60000);
			const diffHours = Math.floor(diffMs / 3600000);
			const diffDays = Math.floor(diffMs / 86400000);

			if (diffMins < 1) return 'Just now';
			if (diffMins < 60) return `${diffMins}m ago`;
			if (diffHours < 24) return `${diffHours}h ago`;
			if (diffDays < 7) return `${diffDays}d ago`;
			return date.toLocaleDateString();
		} catch {
			return value;
		}
	}

	function formatAbsolute(value: string): string {
		try {
			const date = new Date(value);
			const now = new Date();
			const includeYear = now.getFullYear() !== date.getFullYear();
			return date.toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				...(includeYear ? { year: 'numeric' } : {}),
				hour: 'numeric',
				minute: '2-digit'
			});
		} catch {
			return value;
		}
	}

	function formatTimestamp(value: string): string {
		if (timestampMode === 'absolute') {
			return formatAbsolute(value);
		}
		if (timestampMode === 'both') {
			return `${formatAbsolute(value)} · ${formatRelative(value)}`;
		}
		return formatRelative(value);
	}

	function getTimestampValue(voiceNote: VoiceNote): string {
		return voiceNote.recorded_at ?? voiceNote.created_at;
	}

	function formatDuration(seconds: number | null): string {
		if (!seconds || !Number.isFinite(seconds)) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function promptDelete(note: VoiceNote) {
		deleteError = '';
		deleteTarget = note;
	}

	async function confirmDelete() {
		if (!deleteTarget || !onDelete) return;
		deleteLoading = true;
		deleteError = '';
		try {
			await onDelete(deleteTarget.id);
			deleteTarget = null;
		} catch (error) {
			deleteError = error instanceof Error ? error.message : 'Failed to delete voice note';
		} finally {
			deleteLoading = false;
		}
	}

	function cancelDelete() {
		deleteTarget = null;
		deleteError = '';
	}
</script>

{#if voiceNotes.length === 0}
	<p class="text-sm text-muted-foreground">No voice notes yet</p>
{:else}
	<div class={compact ? 'space-y-2' : 'space-y-3'}>
		{#each voiceNotes as voiceNote (voiceNote.id)}
			<div
				class="group rounded-xl border border-border bg-card tx tx-frame tx-weak {compact
					? 'p-2'
					: 'p-3'}"
				style="content-visibility: auto; contain-intrinsic-size: 0 70px;"
			>
				<!-- Header row: timestamp + status + delete -->
				<div class="flex items-center justify-between gap-2">
					<div class="flex items-center gap-2 text-2xs text-muted-foreground">
						<span class="font-medium">
							{formatTimestamp(getTimestampValue(voiceNote))}
						</span>
						<span class="text-border">·</span>
						<span class="font-mono tabular-nums"
							>{formatDuration(voiceNote.duration_seconds)}</span
						>
						{#if voiceNote.transcription_status === 'pending'}
							<span class="inline-flex items-center gap-1">
								<span
									class="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 motion-safe:animate-pulse"
									aria-hidden="true"
								></span>
								Transcribing
							</span>
						{:else if voiceNote.transcription_status === 'failed'}
							<span class="inline-flex items-center gap-1">
								<span
									class="h-1.5 w-1.5 rounded-full bg-destructive"
									aria-hidden="true"
								></span>
								Transcription failed
							</span>
						{/if}
					</div>
					{#if onDelete}
						<button
							type="button"
							class="-m-1 rounded-lg p-1 text-muted-foreground transition-[opacity,color,background-color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/50 hover:text-destructive focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
							onclick={() => promptDelete(voiceNote)}
							aria-label="Delete voice note"
						>
							<Trash2 class="h-3.5 w-3.5" />
						</button>
					{/if}
				</div>

				<!-- Player -->
				<div class={compact ? 'mt-1' : 'mt-2'}>
					<VoiceNotePlayer {voiceNote} {showTranscript} {compact} />
				</div>
			</div>
		{/each}
	</div>
{/if}

<ConfirmationModal
	isOpen={!!deleteTarget}
	title="Delete voice note?"
	confirmText="Delete"
	confirmVariant="danger"
	loading={deleteLoading}
	loadingText="Deleting"
	onconfirm={confirmDelete}
	oncancel={cancelDelete}
>
	{#snippet content()}
		<p class="text-sm text-muted-foreground">
			This will permanently remove the selected voice note.
		</p>
	{/snippet}

	{#snippet details()}
		{#if deleteTarget}
			<div class="mt-2 space-y-2 text-xs text-muted-foreground">
				<div>
					<span class="font-medium text-foreground">Length:</span>
					{formatDuration(deleteTarget.duration_seconds)}
				</div>
				{#if deleteTarget.transcript}
					<div>
						<span class="font-medium text-foreground">Transcript:</span>
						<p
							class="mt-1 rounded-lg border border-border bg-muted/50 p-2 text-2xs text-foreground line-clamp-3"
						>
							{deleteTarget.transcript}
						</p>
					</div>
				{/if}
				{#if deleteError}
					<p class="text-2xs text-destructive">{deleteError}</p>
				{/if}
			</div>
		{/if}
	{/snippet}
</ConfirmationModal>
