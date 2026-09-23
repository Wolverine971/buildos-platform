<!-- apps/web/src/lib/components/voice-notes/VoiceNoteRecorder.svelte -->
<!-- Record → review → save a standalone voice note. Words appear as you talk; the transcript is final by the time you review. -->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { AlertCircle, LoaderCircle, Mic, Square } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import VoiceLevelMeter from '$lib/components/voice/VoiceLevelMeter.svelte';
	import VoiceStatusLine from '$lib/components/voice/VoiceStatusLine.svelte';
	import { uploadVoiceNote } from '$lib/services/voice-notes.service';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import {
		VoiceDictation,
		formatDictationDuration,
		type DictationResult
	} from '$lib/voice/dictation-session.svelte';

	interface Props {
		onSave: (voiceNote: VoiceNote) => void;
		onError?: (error: string) => void;
		/** Seconds; recording stops on its own at this length. */
		maxDuration?: number;
		showTranscript?: boolean;
		linkedEntityType?: string;
		linkedEntityId?: string;
		/** Ask the server to transcribe on save if the recording has no transcript yet. */
		transcribe?: boolean;
	}

	let {
		onSave,
		onError = () => {},
		maxDuration = 300,
		showTranscript = true,
		linkedEntityType,
		linkedEntityId,
		transcribe = false
	}: Props = $props();

	let recording = $state<DictationResult | null>(null);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let errorMessage = $state('');

	const dictation = new VoiceDictation({
		onCommit: (result) => {
			if (!result.audio) {
				setError('No audio captured. Please try again.');
				return;
			}
			recording = result;
		}
	});

	const isCapturing = $derived(dictation.isCapturing);
	const liveWords = $derived(dictation.text);

	$effect(() => {
		if (
			maxDuration &&
			dictation.phase === 'recording' &&
			dictation.elapsedMs >= maxDuration * 1000
		) {
			void dictation.stop();
		}
	});

	function setError(message: string) {
		errorMessage = message;
		onError(message);
	}

	function resetCapture() {
		recording = null;
		uploadProgress = 0;
		errorMessage = '';
	}

	async function startRecording() {
		if (!dictation.supported || dictation.isBusy || isUploading) return;
		resetCapture();
		const started = await dictation.start();
		if (!started && dictation.error) setError(dictation.error.message);
	}

	function stopRecording() {
		void dictation.stop();
	}

	function cancelRecording() {
		if (dictation.isBusy) dictation.cancel();
		resetCapture();
	}

	async function saveRecording() {
		if (!recording?.audio || isUploading) return;
		isUploading = true;
		uploadProgress = 0;
		errorMessage = '';
		const hasTranscript = recording.text.length > 0;

		try {
			const voiceNote = await uploadVoiceNote({
				audioBlob: recording.audio,
				durationSeconds: recording.durationSeconds || undefined,
				linkedEntityType,
				linkedEntityId,
				transcript: hasTranscript ? recording.text : null,
				transcriptionStatus: hasTranscript ? 'complete' : null,
				transcriptionSource: hasTranscript ? recording.transcriptionSource : null,
				transcriptionModel: recording.transcriptionModel,
				metadata: { source_component: 'voice-note-recorder' },
				transcribe: transcribe && !hasTranscript,
				onProgress: (progress) => {
					uploadProgress = progress;
				}
			});

			onSave(voiceNote);
			resetCapture();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to upload voice note';
			setError(message);
		} finally {
			isUploading = false;
		}
	}

	onDestroy(() => {
		// Leaving the page mid-recording discards it; nothing was saved yet.
		if (dictation.isBusy) dictation.cancel();
	});
</script>

<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-semibold text-foreground">Voice note</p>
			<p class="text-xs text-muted-foreground">
				{#if !dictation.supported}
					Voice recording is not supported in this browser.
				{:else if isCapturing}
					Recording… tap again to stop.
				{:else if dictation.phase === 'finishing'}
					Finishing the transcript…
				{:else if recording}
					Review and save your recording.
				{:else}
					Tap the mic to start a recording.
				{/if}
			</p>
		</div>
		<div class="text-xs font-mono text-muted-foreground">
			{formatDictationDuration(
				isCapturing ? dictation.elapsedMs : (recording?.durationSeconds ?? 0) * 1000
			)}
		</div>
	</div>

	<div class="mt-4 flex items-center gap-3">
		<button
			class={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
				dictation.phase === 'recording'
					? 'border-destructive bg-destructive text-destructive-foreground shadow-ink-strong'
					: 'border-border bg-card text-foreground shadow-ink'
			} ${!dictation.supported || isUploading ? 'opacity-50 cursor-not-allowed' : 'pressable'}`}
			disabled={!dictation.supported ||
				isUploading ||
				dictation.phase === 'starting' ||
				dictation.phase === 'finishing'}
			onclick={dictation.phase === 'recording' ? stopRecording : startRecording}
			aria-label={dictation.phase === 'recording' ? 'Stop recording' : 'Start recording'}
		>
			{#if dictation.phase === 'starting' || dictation.phase === 'finishing'}
				<LoaderCircle class="h-5 w-5 animate-spin motion-reduce:animate-none" />
			{:else if dictation.phase === 'recording'}
				<Square class="h-5 w-5 fill-current" />
			{:else}
				<Mic class="h-5 w-5" />
			{/if}
		</button>

		<div class="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
			{#if dictation.phase === 'recording'}
				<VoiceLevelMeter levels={dictation.levels} />
				<span class="tabular-nums">
					{formatDictationDuration(dictation.elapsedMs)} / {formatDictationDuration(
						maxDuration * 1000
					)}
				</span>
			{:else if dictation.isBusy || dictation.error}
				<VoiceStatusLine {dictation} showKeyHint={false} />
			{:else if recording}
				Ready to save
			{:else}
				Ready
			{/if}
		</div>
	</div>

	{#if showTranscript}
		<div class="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
			{#if dictation.isBusy}
				<p class="mb-1 text-xs text-muted-foreground">Transcript</p>
				{#if liveWords}
					<p>
						<span>{dictation.confirmedText}</span>
						{#if dictation.confirmedText && dictation.draftText}{' '}{/if}
						<span class="text-muted-foreground">{dictation.draftText}</span>
					</p>
				{:else}
					<p class="text-muted-foreground">Listening…</p>
				{/if}
			{:else if recording?.text}
				<p class="mb-1 text-xs text-muted-foreground">Transcript</p>
				<p>{recording.text}</p>
			{:else}
				<p class="text-xs text-muted-foreground">Your words appear here as you talk.</p>
			{/if}
		</div>
	{/if}

	{#if isUploading}
		<div class="mt-4">
			<div class="h-2 w-full rounded-full bg-muted">
				<div
					class="h-2 rounded-full bg-accent transition-all"
					style={`width: ${Math.round(uploadProgress * 100)}%`}
				></div>
			</div>
			<p class="mt-1 text-xs text-muted-foreground">
				Uploading… {Math.round(uploadProgress * 100)}%
			</p>
		</div>
	{/if}

	{#if !dictation.isBusy && recording}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button onclick={saveRecording} loading={isUploading} variant="primary" size="sm">
				Save voice note
			</Button>
			<Button onclick={cancelRecording} variant="ghost" size="sm" disabled={isUploading}>
				Discard
			</Button>
		</div>
	{:else if dictation.phase === 'recording'}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button onclick={stopRecording} variant="warning" size="sm">Stop recording</Button>
			<Button onclick={cancelRecording} variant="ghost" size="sm">Cancel</Button>
		</div>
	{/if}

	{#if errorMessage}
		<div class="mt-4 flex items-center gap-2 text-sm text-destructive">
			<AlertCircle class="h-4 w-4" />
			<span>{errorMessage}</span>
		</div>
	{/if}
</div>
