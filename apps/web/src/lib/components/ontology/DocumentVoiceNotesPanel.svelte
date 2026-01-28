<!-- apps/web/src/lib/components/ontology/DocumentVoiceNotesPanel.svelte -->
<!--
	Document Voice Notes Panel - Voice recordings linked to document

	Features:
	- List voice recordings for document
	- Refresh and delete functionality
	- Loading and error states
	- Svelte 5 runes with export functions for imperative API
	- Inkprint design with semantic textures

	Inkprint Patterns:
	- Card: frame texture (wt-paper) - canonical data container
	- Header: strip texture - section separator
	- Loading: pulse texture - processing state
	- Error: static texture - blocker state
	- Empty: bloom texture - creation opportunity
	- Buttons: grain texture + pressable
	- Metadata: micro-label pattern

	Imperative API (bind:this):
	- refresh() - reload voice notes
	- upsertVoiceNote(note) - add or update note
-->
<script lang="ts">
	import { Mic, RefreshCw, LoaderCircle, AlertCircle } from 'lucide-svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import VoiceNoteList from '$lib/components/voice-notes/VoiceNoteList.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { deleteVoiceNote, listVoiceNotes } from '$lib/services/voice-notes.service';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	interface Props {
		documentId: string;
		projectId?: string;
		limit?: number;
		showTranscript?: boolean;
	}

	let {
		documentId,
		projectId,
		limit = 25,
		showTranscript = false
	}: Props = $props();

	let voiceNotes = $state<VoiceNote[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);

	// Computed count for badge
	const noteCount = $derived(voiceNotes.length);

	$effect(() => {
		if (documentId) {
			voiceNotes = [];
			errorMessage = null;
			loadNotes();
		}
	});

	async function loadNotes() {
		if (!documentId) return;
		isLoading = true;
		errorMessage = null;
		try {
			voiceNotes = await listVoiceNotes({
				linkedEntityType: 'document',
				linkedEntityId: documentId,
				limit
			});
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to load voice recordings';
			errorMessage = message;
			void logOntologyClientError(error, {
				endpoint: '/api/voice-notes',
				method: 'GET',
				projectId,
				entityType: 'document',
				entityId: documentId,
				operation: 'document_voice_notes_load'
			});
		} finally {
			isLoading = false;
		}
	}

	async function handleDelete(id: string) {
		try {
			await deleteVoiceNote(id);
			voiceNotes = voiceNotes.filter((note) => note.id !== id);
		} catch (error) {
			errorMessage =
				error instanceof Error ? error.message : 'Failed to delete voice note';
		}
	}

	function handleRetry() {
		void loadNotes();
	}

	function matchesDocument(note: VoiceNote): boolean {
		if (note.linked_entity_type && note.linked_entity_type !== 'document') return false;
		if (note.linked_entity_id && note.linked_entity_id !== documentId) return false;
		return true;
	}

	// Svelte 5: export functions still work with bind:this for imperative API
	export function refresh() {
		void loadNotes();
	}

	export function upsertVoiceNote(note: VoiceNote) {
		if (!matchesDocument(note)) return;
		voiceNotes = [note, ...voiceNotes.filter((existing) => existing.id !== note.id)];
		if (limit && voiceNotes.length > limit) {
			voiceNotes = voiceNotes.slice(0, limit);
		}
	}
</script>

<!-- Frame texture (canonical data container) + Paper weight (standard UI) -->
<Card variant="elevated" class="tx tx-frame tx-weak wt-paper">
	<CardHeader variant="default" class="tx tx-strip tx-weak">
		<div class="flex items-center justify-between w-full gap-2">
			<!-- Micro-label pattern for header -->
			<div class="flex items-center gap-2 min-w-0 flex-1">
				<Mic class="w-3.5 h-3.5 text-muted-foreground shrink-0" />
				<h3 class="micro-label text-muted-foreground flex items-center gap-1.5">
					VOICE RECORDINGS
					{#if noteCount > 0}
						<span
							class="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 text-[0.6rem] font-semibold bg-muted text-foreground rounded-full"
							>{noteCount}</span
						>
					{/if}
				</h3>
			</div>
			<button
				type="button"
				onclick={loadNotes}
				class="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50 pressable tx tx-grain tx-weak wt-paper"
				disabled={isLoading}
				aria-label="Refresh voice recordings"
			>
				<RefreshCw class={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
			</button>
		</div>
		<p class="text-[0.65rem] text-muted-foreground/70 mt-0.5 leading-tight">
			Audio captured while editing this document.
		</p>
	</CardHeader>

	<CardBody padding="sm">
		{#if isLoading}
			<!-- Loading state with pulse texture -->
			<div class="flex items-center justify-center py-4 tx tx-pulse tx-weak">
				<LoaderCircle class="w-4 h-4 text-muted-foreground animate-spin" />
			</div>
		{:else if errorMessage}
			<!-- Error state with static texture -->
			<div class="px-2 py-3 text-center tx tx-static tx-weak rounded-lg">
				<AlertCircle class="w-4 h-4 text-destructive mx-auto mb-1.5" />
				<p class="text-[0.7rem] text-destructive mb-1.5">{errorMessage}</p>
				<button
					type="button"
					onclick={handleRetry}
					class="inline-flex items-center gap-1 text-[0.6rem] text-accent hover:underline pressable"
				>
					<RefreshCw class="w-3 h-3" />
					Retry
				</button>
			</div>
		{:else if noteCount === 0}
			<!-- Empty state with bloom texture -->
			<div class="px-2 py-4 text-center tx tx-bloom tx-weak rounded-lg">
				<Mic class="w-5 h-5 text-muted-foreground/50 mx-auto mb-1.5" />
				<p class="text-xs text-muted-foreground/70">No voice recordings yet</p>
			</div>
		{:else}
			<div class="max-h-56 overflow-y-auto">
				<VoiceNoteList
					{voiceNotes}
					{showTranscript}
					compact
					timestampMode="absolute"
					onDelete={handleDelete}
				/>
			</div>
		{/if}
	</CardBody>
</Card>
