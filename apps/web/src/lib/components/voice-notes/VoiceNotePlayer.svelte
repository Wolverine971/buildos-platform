<!-- apps/web/src/lib/components/voice-notes/VoiceNotePlayer.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { AlertCircle, LoaderCircle, Pause, Play } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { getVoiceNotePlaybackUrl } from '$lib/services/voice-notes.service';
	import {
		PLAYBACK_SPEEDS,
		getStoredPlaybackSpeed,
		storePlaybackSpeed,
		type PlaybackSpeed
	} from '$lib/utils/playback-speed-storage';

	interface Props {
		voiceNote: VoiceNote;
		showTranscript?: boolean;
		compact?: boolean;
	}

	let { voiceNote, showTranscript = true, compact = false }: Props = $props();

	let audio: HTMLAudioElement | null = $state(null);
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(voiceNote.duration_seconds || 0);
	let playbackSpeed = $state<PlaybackSpeed>(getStoredPlaybackSpeed());
	let speedIndex = $state(
		Math.max(0, PLAYBACK_SPEEDS.indexOf(getStoredPlaybackSpeed() as PlaybackSpeed))
	);
	let playbackUrl = $state<string | null>(null);
	let playbackExpiresAt = $state<number | null>(null);
	let isLoading = $state(false);
	let errorMessage = $state('');

	const formattedCurrentTime = $derived(formatTime(currentTime));
	const formattedDuration = $derived(formatTime(duration));
	const formattedRemainingTime = $derived(
		formatTime(duration > 0 ? (duration - currentTime) / playbackSpeed : 0)
	);

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	function setPreservesPitch(target: HTMLAudioElement) {
		const withPitch = target as HTMLAudioElement & {
			preservesPitch?: boolean;
			mozPreservesPitch?: boolean;
			webkitPreservesPitch?: boolean;
		};
		if ('preservesPitch' in withPitch) withPitch.preservesPitch = true;
		if ('mozPreservesPitch' in withPitch) withPitch.mozPreservesPitch = true;
		if ('webkitPreservesPitch' in withPitch) withPitch.webkitPreservesPitch = true;
	}

	async function ensurePlaybackUrl(): Promise<string | null> {
		const bufferMs = 30 * 1000;
		if (playbackUrl && playbackExpiresAt && Date.now() < playbackExpiresAt - bufferMs) {
			if (audio && audio.src !== playbackUrl) {
				audio.src = playbackUrl;
			}
			return playbackUrl;
		}

		isLoading = true;
		errorMessage = '';
		try {
			const result = await getVoiceNotePlaybackUrl(voiceNote.id);
			playbackUrl = result.url;
			playbackExpiresAt = new Date(result.expiresAt).getTime();
			if (audio) {
				audio.src = playbackUrl;
				audio.load();
			}
			return playbackUrl;
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Failed to load audio';
			errorMessage = message;
			return null;
		} finally {
			isLoading = false;
		}
	}

	async function togglePlayback() {
		if (!audio || isLoading) return;
		const url = await ensurePlaybackUrl();
		if (!url) return;

		if (isPlaying) {
			audio.pause();
			return;
		}

		try {
			await audio.play();
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Playback failed';
			errorMessage = message;
		}
	}

	function seek(event: Event) {
		if (!audio) return;
		const target = event.target as HTMLInputElement;
		const value = Number.parseFloat(target.value);
		if (Number.isFinite(value)) {
			audio.currentTime = value;
		}
	}

	function cycleSpeed() {
		speedIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
		playbackSpeed = PLAYBACK_SPEEDS[speedIndex];
		if (audio) {
			audio.playbackRate = playbackSpeed;
		}
		storePlaybackSpeed(playbackSpeed);
	}

	function setSpeed(speed: PlaybackSpeed) {
		const index = PLAYBACK_SPEEDS.indexOf(speed);
		if (index === -1) return;
		speedIndex = index;
		playbackSpeed = speed;
		if (audio) {
			audio.playbackRate = speed;
		}
		storePlaybackSpeed(speed);
	}

	onMount(() => {
		audio = new Audio();
		audio.preload = 'metadata';
		audio.playbackRate = playbackSpeed;
		setPreservesPitch(audio);

		audio.addEventListener('loadedmetadata', () => {
			if (!audio) return;
			duration = Number.isFinite(audio.duration) ? audio.duration : duration;
		});

		audio.addEventListener('timeupdate', () => {
			if (!audio) return;
			currentTime = audio.currentTime;
		});

		audio.addEventListener('play', () => {
			isPlaying = true;
		});

		audio.addEventListener('pause', () => {
			isPlaying = false;
		});

		audio.addEventListener('ended', () => {
			isPlaying = false;
			currentTime = 0;
		});
	});

	onDestroy(() => {
		if (audio) {
			audio.pause();
			audio.src = '';
		}
	});
</script>

<div class="space-y-3">
	<div>
		<input
			type="range"
			min="0"
			max={duration || 0}
			step="0.1"
			value={currentTime}
			on:input={seek}
			class="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted"
			aria-label="Playback progress"
		/>
		<div class="mt-1 flex items-center justify-between text-xs text-muted-foreground">
			<span class="font-mono">{formattedCurrentTime}</span>
			<span class="font-mono">{formattedDuration}</span>
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-3">
		<Button onclick={togglePlayback} variant="primary" size="sm" disabled={isLoading}>
			{#if isLoading}
				<LoaderCircle class="h-4 w-4 animate-spin" />
			{:else if isPlaying}
				<Pause class="h-4 w-4" />
			{:else}
				<Play class="h-4 w-4" />
			{/if}
			<span class="ml-2">{isPlaying ? 'Pause' : 'Play'}</span>
		</Button>

		<button
			class="pressable rounded-md border border-border bg-muted px-3 py-1 text-xs font-semibold text-foreground"
			on:click={cycleSpeed}
			aria-label="Change playback speed"
		>
			{playbackSpeed}x
		</button>

		{#if !compact}
			<div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
				<span class="font-mono">{formattedRemainingTime} remaining</span>
				<div class="flex gap-1">
					{#each PLAYBACK_SPEEDS as speed}
						<button
							class={`rounded-md px-2 py-0.5 text-xs transition-colors ${
								playbackSpeed === speed
									? 'bg-accent text-accent-foreground'
									: 'bg-muted text-muted-foreground hover:bg-muted/80'
							}`}
							on:click={() => setSpeed(speed)}
						>
							{speed}x
						</button>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	{#if showTranscript && voiceNote.transcript}
		<div class="rounded-lg border border-border bg-muted/50 p-3 text-sm text-foreground">
			<p class="mb-1 text-xs text-muted-foreground">Transcript</p>
			<p>{voiceNote.transcript}</p>
		</div>
	{/if}

	{#if errorMessage}
		<div class="flex items-center gap-2 text-sm text-red-600">
			<AlertCircle class="h-4 w-4" />
			<span>{errorMessage}</span>
		</div>
	{/if}
</div>
