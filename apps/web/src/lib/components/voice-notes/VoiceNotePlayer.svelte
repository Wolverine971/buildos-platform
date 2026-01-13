<!-- apps/web/src/lib/components/voice-notes/VoiceNotePlayer.svelte -->
<!-- INKPRINT: Ultra-compact audio player with high information density -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { AlertCircle, LoaderCircle, Pause, Play, Trash2 } from 'lucide-svelte';
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
		/** Optional segment info for multi-note groups */
		segmentIndex?: number;
		segmentTotal?: number;
		/** Callback when delete is requested (compact mode only) */
		onDelete?: () => void;
	}

	let {
		voiceNote,
		showTranscript = true,
		compact = false,
		segmentIndex,
		segmentTotal,
		onDelete
	}: Props = $props();

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
	let playAllHandlers = new Map<() => void, () => void>();

	const formattedCurrentTime = $derived(formatTime(currentTime));
	const formattedDuration = $derived(formatTime(duration));
	const formattedRemainingTime = $derived(
		formatTime(duration > 0 ? (duration - currentTime) / playbackSpeed : 0)
	);
	const progressPercent = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);

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

	export async function playFromStart(): Promise<void> {
		if (!audio || isLoading) return;
		const url = await ensurePlaybackUrl();
		if (!url) return;

		audio.currentTime = 0;

		return new Promise((resolve) => {
			const handleEnded = () => {
				playAllHandlers.delete(resolve);
				resolve();
			};

			playAllHandlers.set(resolve, handleEnded);
			audio?.addEventListener('ended', handleEnded, { once: true });
			audio
				?.play()
				.then(() => {
					// Playback started.
				})
				.catch(() => {
					playAllHandlers.delete(resolve);
					resolve();
				});
		});
	}

	export function stop() {
		if (!audio) return;
		audio.pause();
		audio.currentTime = 0;
		for (const [resolve, handler] of playAllHandlers.entries()) {
			audio.removeEventListener('ended', handler);
			resolve();
		}
		playAllHandlers.clear();
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
		stop();
		if (audio) {
			audio.src = '';
		}
	});
</script>

{#if compact}
	<!-- COMPACT MODE: Single-line ultra-dense layout -->
	<div class="flex items-center gap-1.5">
		<!-- Segment indicator (if in multi-note group) -->
		{#if segmentIndex !== undefined && segmentTotal !== undefined}
			<span class="shrink-0 text-[0.55rem] font-medium tabular-nums text-muted-foreground/70">
				{segmentIndex + 1}/{segmentTotal}
			</span>
		{/if}

		<!-- Play/Pause button -->
		<button
			type="button"
			class="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground shadow-ink transition-colors hover:border-accent hover:bg-accent/5 pressable disabled:opacity-50"
			onclick={togglePlayback}
			disabled={isLoading}
			aria-label={isPlaying ? 'Pause' : 'Play'}
		>
			{#if isLoading}
				<LoaderCircle class="h-3 w-3 animate-spin" />
			{:else if isPlaying}
				<Pause class="h-3 w-3" />
			{:else}
				<Play class="h-3 w-3 ml-0.5" />
			{/if}
		</button>

		<!-- Progress bar (custom styled for density) -->
		<div class="relative flex-1 h-5 flex items-center">
			<div class="relative w-full h-1.5 rounded-full bg-muted overflow-hidden">
				<div
					class="absolute inset-y-0 left-0 bg-accent/70 rounded-full transition-[width] duration-100"
					style="width: {progressPercent}%"
				></div>
			</div>
			<input
				type="range"
				min="0"
				max={duration || 0}
				step="0.1"
				value={currentTime}
				oninput={seek}
				class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
				aria-label="Seek"
			/>
		</div>

		<!-- Time display -->
		<span class="shrink-0 text-[0.6rem] tabular-nums text-muted-foreground">
			{formattedCurrentTime}/{formattedDuration}
		</span>

		<!-- Speed button -->
		<button
			type="button"
			class="shrink-0 rounded border border-border/60 bg-muted/50 px-1 py-0.5 text-[0.55rem] font-bold tabular-nums text-muted-foreground transition-colors hover:border-accent/50 hover:text-accent pressable"
			onclick={cycleSpeed}
			aria-label="Change playback speed"
		>
			{playbackSpeed}x
		</button>

		<!-- Delete button (inline with speed, only if onDelete provided) -->
		{#if onDelete}
			<button
				type="button"
				class="shrink-0 flex items-center justify-center h-5 w-5 rounded border border-border/40 bg-muted/30 text-muted-foreground/60 transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive pressable"
				onclick={(e) => {
					e.stopPropagation();
					onDelete();
				}}
				aria-label="Delete segment"
			>
				<Trash2 class="h-2.5 w-2.5" />
			</button>
		{/if}
	</div>

	<!-- Compact transcript (optional, single line with ellipsis) -->
	{#if showTranscript && voiceNote.transcript}
		<p class="mt-1 text-[0.6rem] leading-tight text-muted-foreground line-clamp-2">
			{voiceNote.transcript}
		</p>
	{/if}

	<!-- Error display -->
	{#if errorMessage}
		<p class="mt-1 flex items-center gap-1 text-[0.6rem] text-destructive">
			<AlertCircle class="h-2.5 w-2.5" />
			<span class="truncate">{errorMessage}</span>
		</p>
	{/if}
{:else}
	<!-- FULL MODE: Standard layout with all controls -->
	<div class="space-y-2">
		<div>
			<input
				type="range"
				min="0"
				max={duration || 0}
				step="0.1"
				value={currentTime}
				oninput={seek}
				class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted"
				aria-label="Playback progress"
			/>
			<div
				class="mt-0.5 flex items-center justify-between text-[0.65rem] text-muted-foreground"
			>
				<span class="tabular-nums">{formattedCurrentTime}</span>
				<span class="tabular-nums">{formattedDuration}</span>
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<Button onclick={togglePlayback} variant="primary" size="sm" disabled={isLoading}>
				{#if isLoading}
					<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
				{:else if isPlaying}
					<Pause class="h-3.5 w-3.5" />
				{:else}
					<Play class="h-3.5 w-3.5" />
				{/if}
				<span class="ml-1.5">{isPlaying ? 'Pause' : 'Play'}</span>
			</Button>

			<button
				type="button"
				class="pressable rounded-md border border-border bg-muted px-2 py-0.5 text-[0.65rem] font-semibold tabular-nums text-foreground"
				onclick={cycleSpeed}
				aria-label="Change playback speed"
			>
				{playbackSpeed}x
			</button>

			<div class="flex flex-wrap items-center gap-1.5 text-[0.65rem] text-muted-foreground">
				<span class="tabular-nums">{formattedRemainingTime} left</span>
				<div class="hidden sm:flex gap-0.5">
					{#each PLAYBACK_SPEEDS as speed}
						<button
							type="button"
							class="rounded px-1.5 py-0.5 text-[0.6rem] tabular-nums transition-colors pressable {playbackSpeed ===
							speed
								? 'bg-accent text-accent-foreground'
								: 'bg-muted text-muted-foreground hover:bg-muted/80'}"
							onclick={() => setSpeed(speed)}
						>
							{speed}x
						</button>
					{/each}
				</div>
			</div>
		</div>

		{#if showTranscript && voiceNote.transcript}
			<div class="rounded-md border border-border bg-muted/50 p-2 text-sm text-foreground">
				<p class="mb-0.5 text-[0.6rem] uppercase tracking-wide text-muted-foreground">
					Transcript
				</p>
				<p class="text-[0.75rem] leading-relaxed">{voiceNote.transcript}</p>
			</div>
		{/if}

		{#if errorMessage}
			<div class="flex items-center gap-1.5 text-[0.7rem] text-destructive">
				<AlertCircle class="h-3 w-3" />
				<span>{errorMessage}</span>
			</div>
		{/if}
	</div>
{/if}
