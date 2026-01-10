<!-- apps/web/src/lib/components/voice-notes/VoiceNoteList.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { Trash2 } from 'lucide-svelte';
	import VoiceNotePlayer from './VoiceNotePlayer.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';

	interface Props {
		voiceNotes: VoiceNote[];
		showTranscript?: boolean;
		onDelete?: (id: string) => void;
	}

	let { voiceNotes, showTranscript = true, onDelete }: Props = $props();

	function formatDate(value: string): string {
		try {
			return new Date(value).toLocaleString();
		} catch {
			return value;
		}
	}
</script>

{#if voiceNotes.length === 0}
	<p class="text-sm text-muted-foreground">No voice notes yet.</p>
{:else}
	<div class="space-y-4">
		{#each voiceNotes as voiceNote (voiceNote.id)}
			<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<div class="text-xs text-muted-foreground">
						Recorded {formatDate(voiceNote.created_at)}
						{#if voiceNote.transcription_status === 'pending'}
							<span class="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px]">
								Transcribing...
							</span>
						{:else if voiceNote.transcription_status === 'failed'}
							<span
								class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700"
							>
								Transcription failed
							</span>
						{/if}
					</div>
					{#if onDelete}
						<Button onclick={() => onDelete?.(voiceNote.id)} variant="ghost" size="sm">
							<Trash2 class="h-4 w-4" />
							<span class="ml-2">Delete</span>
						</Button>
					{/if}
				</div>

				<div class="mt-3">
					<VoiceNotePlayer {voiceNote} {showTranscript} />
				</div>
			</div>
		{/each}
	</div>
{/if}
