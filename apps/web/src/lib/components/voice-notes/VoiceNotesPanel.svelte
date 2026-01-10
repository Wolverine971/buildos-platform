<!-- apps/web/src/lib/components/voice-notes/VoiceNotesPanel.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { RefreshCw } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import VoiceNoteRecorder from './VoiceNoteRecorder.svelte';
	import VoiceNoteList from './VoiceNoteList.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { deleteVoiceNote, listVoiceNotes } from '$lib/services/voice-notes.service';

	interface Props {
		linkedEntityType?: string;
		linkedEntityId?: string;
		showTranscript?: boolean;
		transcribe?: boolean;
	}

	let {
		linkedEntityType,
		linkedEntityId,
		showTranscript = true,
		transcribe = false
	}: Props = $props();

	let voiceNotes = $state<VoiceNote[]>([]);
	let isLoading = $state(false);
	let errorMessage = $state('');

	async function loadNotes() {
		isLoading = true;
		errorMessage = '';
		try {
			voiceNotes = await listVoiceNotes({
				linkedEntityType,
				linkedEntityId,
				limit: 50
			});
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to load voice notes';
		} finally {
			isLoading = false;
		}
	}

	async function handleDelete(id: string) {
		try {
			await deleteVoiceNote(id);
			voiceNotes = voiceNotes.filter((note) => note.id !== id);
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : 'Failed to delete voice note';
		}
	}

	function handleSave(note: VoiceNote) {
		voiceNotes = [note, ...voiceNotes];
	}

	onMount(() => {
		loadNotes();
	});
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h2 class="text-base font-semibold text-foreground">Voice notes</h2>
			<p class="text-sm text-muted-foreground">Record, save, and replay short voice notes.</p>
		</div>
		<Button onclick={loadNotes} variant="ghost" size="sm" disabled={isLoading}>
			<RefreshCw class={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
			<span class="ml-2">Refresh</span>
		</Button>
	</div>

	<VoiceNoteRecorder
		onSave={handleSave}
		onError={(message) => (errorMessage = message)}
		{linkedEntityType}
		{linkedEntityId}
		{showTranscript}
		{transcribe}
	/>

	{#if errorMessage}
		<p class="text-sm text-red-600">{errorMessage}</p>
	{/if}

	{#if isLoading}
		<p class="text-sm text-muted-foreground">Loading voice notes…</p>
	{:else}
		<VoiceNoteList {voiceNotes} {showTranscript} onDelete={handleDelete} />
	{/if}
</div>
