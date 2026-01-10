<!-- apps/web/src/lib/components/voice-notes/VoiceNoteRecorder.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { AlertCircle, LoaderCircle, Mic, Square } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { voiceRecordingService } from '$lib/services/voiceRecording.service';
	import { uploadVoiceNote } from '$lib/services/voice-notes.service';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { isRecording, liveTranscript } from '$lib/utils/voice';

	interface Props {
		onSave: (voiceNote: VoiceNote) => void;
		onError?: (error: string) => void;
		maxDuration?: number;
		showTranscript?: boolean;
		linkedEntityType?: string;
		linkedEntityId?: string;
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

	let isVoiceSupported = $state(false);
	let canUseLiveTranscript = $state(false);
	let isInitializing = $state(false);
	let isUploading = $state(false);
	let uploadProgress = $state(0);
	let recordingDuration = $state(0);
	let recordedDuration = $state(0);
	let recordingStartedAt = $state<number | null>(null);
	let audioBlob = $state<Blob | null>(null);
	let transcriptSnapshot = $state('');
	let errorMessage = $state('');

	let durationUnsubscribe: (() => void) | null = null;

	const isCurrentlyRecording = $derived($isRecording);
	const liveTranscriptValue = $derived($liveTranscript);

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function setError(message: string) {
		errorMessage = message;
		onError(message);
	}

	function resetCapture() {
		audioBlob = null;
		transcriptSnapshot = '';
		recordedDuration = 0;
		uploadProgress = 0;
		errorMessage = '';
	}

	async function startRecording() {
		if (!isVoiceSupported || isCurrentlyRecording || isUploading) return;
		resetCapture();
		isInitializing = true;
		recordingStartedAt = Date.now();

		try {
			await voiceRecordingService.startRecording('');
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to start recording';
			setError(message);
			recordingStartedAt = null;
		} finally {
			isInitializing = false;
		}
	}

	async function stopRecording() {
		if (!isCurrentlyRecording) return;

		const durationSnapshot = Math.max(
			recordingDuration,
			recordingStartedAt ? Math.floor((Date.now() - recordingStartedAt) / 1000) : 0
		);
		recordedDuration = durationSnapshot;
		recordingStartedAt = null;
		transcriptSnapshot = liveTranscriptValue.trim();

		const blob = await voiceRecordingService.stopRecording('', { skipTranscription: true });
		audioBlob = blob;

		if (!blob) {
			setError('No audio captured. Please try again.');
		}
	}

	async function cancelRecording() {
		if (isCurrentlyRecording) {
			await voiceRecordingService.stopRecording('', { skipTranscription: true });
		}
		resetCapture();
	}

	async function saveRecording() {
		if (!audioBlob || isUploading) return;
		isUploading = true;
		uploadProgress = 0;
		errorMessage = '';

		try {
			const voiceNote = await uploadVoiceNote({
				audioBlob,
				durationSeconds: recordedDuration || undefined,
				linkedEntityType,
				linkedEntityId,
				transcribe,
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

	onMount(() => {
		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();

		voiceRecordingService.initialize({
			onTextUpdate: () => {},
			onError: (message) => setError(message),
			onPhaseChange: () => {},
			onCapabilityUpdate: (update) => {
				canUseLiveTranscript = update.canUseLiveTranscript;
			}
		});

		durationUnsubscribe = voiceRecordingService.getRecordingDuration().subscribe((value) => {
			recordingDuration = value;
			if (maxDuration && value >= maxDuration && isCurrentlyRecording) {
				stopRecording();
			}
		});

		voiceRecordingService.prewarmMicrophone().catch(() => {
			// Pre-warm is best-effort; ignore failures.
		});
	});

	onDestroy(() => {
		durationUnsubscribe?.();
		voiceRecordingService.cleanup();
	});
</script>

<div class="rounded-xl border border-border bg-card p-4 shadow-ink">
	<div class="flex items-start justify-between gap-4">
		<div>
			<p class="text-sm font-semibold text-foreground">Voice note</p>
			<p class="text-xs text-muted-foreground">
				{#if !isVoiceSupported}
					Voice recording is not supported in this browser.
				{:else if isCurrentlyRecording}
					Recording... tap again to stop.
				{:else if audioBlob}
					Review and save your recording.
				{:else}
					Tap the mic to start a recording.
				{/if}
			</p>
		</div>
		<div class="text-xs font-mono text-muted-foreground">
			{formatDuration(isCurrentlyRecording ? recordingDuration : recordedDuration)}
		</div>
	</div>

	<div class="mt-4 flex items-center gap-3">
		<button
			class={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-all ${
				isCurrentlyRecording
					? 'border-red-600 bg-red-600 text-white shadow-ink-strong'
					: 'border-border bg-card text-foreground shadow-ink'
			} ${!isVoiceSupported || isUploading ? 'opacity-50 cursor-not-allowed' : 'pressable'}`}
			disabled={!isVoiceSupported || isUploading || isInitializing}
			on:click={isCurrentlyRecording ? stopRecording : startRecording}
			aria-label={isCurrentlyRecording ? 'Stop recording' : 'Start recording'}
		>
			{#if isInitializing}
				<LoaderCircle class="h-5 w-5 animate-spin" />
			{:else if isCurrentlyRecording}
				<Square class="h-5 w-5" />
				<span
					class="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-red-500"
				/>
			{:else}
				<Mic class="h-5 w-5" />
			{/if}
		</button>

		<div class="text-sm text-muted-foreground">
			{#if isInitializing}
				Preparing microphone...
			{:else if isCurrentlyRecording}
				{formatDuration(recordingDuration)} / {formatDuration(maxDuration)}
			{:else if audioBlob}
				Ready to upload
			{:else}
				Ready
			{/if}
		</div>
	</div>

	{#if showTranscript}
		<div class="mt-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
			{#if isCurrentlyRecording && canUseLiveTranscript}
				<p class="mb-1 text-xs text-muted-foreground">Live transcript</p>
				<p>{liveTranscriptValue || 'Listening...'}</p>
			{:else if transcriptSnapshot}
				<p class="mb-1 text-xs text-muted-foreground">Transcript preview</p>
				<p>{transcriptSnapshot}</p>
			{:else}
				<p class="text-xs text-muted-foreground">
					Transcript will appear here when available.
				</p>
			{/if}
		</div>
	{/if}

	{#if isUploading}
		<div class="mt-4">
			<div class="h-2 w-full rounded-full bg-muted">
				<div
					class="h-2 rounded-full bg-accent transition-all"
					style={`width: ${Math.round(uploadProgress * 100)}%`}
				/>
			</div>
			<p class="mt-1 text-xs text-muted-foreground">
				Uploading… {Math.round(uploadProgress * 100)}%
			</p>
		</div>
	{/if}

	{#if !isCurrentlyRecording && audioBlob}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button onclick={saveRecording} loading={isUploading} variant="primary" size="sm">
				Save voice note
			</Button>
			<Button onclick={cancelRecording} variant="ghost" size="sm" disabled={isUploading}>
				Discard
			</Button>
		</div>
	{:else if isCurrentlyRecording}
		<div class="mt-4 flex flex-wrap gap-2">
			<Button onclick={stopRecording} variant="warning" size="sm">Stop recording</Button>
			<Button onclick={cancelRecording} variant="ghost" size="sm">Cancel</Button>
		</div>
	{/if}

	{#if errorMessage}
		<div class="mt-4 flex items-center gap-2 text-sm text-red-600">
			<AlertCircle class="h-4 w-4" />
			<span>{errorMessage}</span>
		</div>
	{/if}
</div>
