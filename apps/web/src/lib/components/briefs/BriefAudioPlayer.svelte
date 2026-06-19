<!-- apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte -->
<script lang="ts">
	import { AlertCircle, LoaderCircle, Pause, Play, RefreshCw } from 'lucide-svelte';
	import { tick } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';

	const PLAYBACK_SPEEDS = [1, 1.5, 2] as const;
	type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

	let {
		briefId,
		audioStatus,
		audioStoragePath,
		durationMs = null
	}: {
		briefId: string;
		audioStatus?: string | null;
		audioStoragePath?: string | null;
		durationMs?: number | null;
	} = $props();

	let signedUrl = $state<string | null>(null);
	let isLoading = $state(false);
	let isPlaying = $state(false);
	let error = $state<string | null>(null);
	let audioElement = $state<HTMLAudioElement | null>(null);
	let currentTime = $state(0);
	let mediaDurationSeconds = $state(0);
	let playbackSpeed = $state<PlaybackSpeed>(1);
	let requestId = 0;

	let fallbackDurationSeconds = $derived(durationMs && durationMs > 0 ? durationMs / 1000 : 0);
	let durationSeconds = $derived(mediaDurationSeconds || fallbackDurationSeconds);
	let hasDuration = $derived(durationSeconds > 0);
	let progressPercent = $derived(
		hasDuration ? Math.min(100, Math.max(0, (currentTime / durationSeconds) * 100)) : 0
	);
	let formattedCurrentTime = $derived(formatTime(currentTime));
	let formattedDuration = $derived(hasDuration ? formatTime(durationSeconds) : '--:--');
	let formattedRemainingTime = $derived(
		hasDuration ? formatTime(Math.max(durationSeconds - currentTime, 0)) : '--:--'
	);
	let seekLabel = $derived(
		hasDuration
			? `Playback progress, ${formattedCurrentTime} of ${formattedDuration}`
			: 'Playback progress'
	);

	$effect(() => {
		if (!briefId) return;
		currentTime = 0;
		mediaDurationSeconds = 0;
		isPlaying = false;
		error = null;

		if (audioElement) {
			audioElement.pause();
			audioElement.currentTime = 0;
		}
	});

	function formatTime(seconds: number): string {
		if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
		const totalSeconds = Math.round(seconds);
		const minutes = Math.floor(totalSeconds / 60);
		const secondsRemainder = totalSeconds % 60;
		return `${minutes}:${secondsRemainder.toString().padStart(2, '0')}`;
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

	function syncMediaState() {
		if (!audioElement) return;

		if (Number.isFinite(audioElement.duration) && audioElement.duration > 0) {
			mediaDurationSeconds = audioElement.duration;
		}

		currentTime = audioElement.currentTime;
		audioElement.playbackRate = playbackSpeed;
		setPreservesPitch(audioElement);
	}

	$effect(() => {
		const id = briefId;
		const status = audioStatus;
		const path = audioStoragePath;

		if (status === 'ready' && path) {
			void loadSignedUrl(id);
		} else {
			signedUrl = null;
			isPlaying = false;
			currentTime = 0;
			error = null;
		}
	});

	async function loadSignedUrl(id: string): Promise<string | null> {
		const currentRequestId = ++requestId;
		isLoading = true;
		error = null;

		try {
			const response = await fetch(`/api/daily-briefs/${id}/audio-url`);
			const result = await response.json().catch(() => null);

			if (!response.ok || !result?.success || !result.data?.url) {
				throw new Error(result?.message || 'Failed to load audio');
			}

			if (currentRequestId === requestId) {
				const url = result.data.url as string;
				signedUrl = url;
				return url;
			}
		} catch (err) {
			if (currentRequestId === requestId) {
				error = err instanceof Error ? err.message : 'Failed to load audio';
				signedUrl = null;
			}
		} finally {
			if (currentRequestId === requestId) {
				isLoading = false;
			}
		}

		return null;
	}

	async function togglePlayback() {
		if (isLoading) return;

		if (isPlaying) {
			audioElement?.pause();
			return;
		}

		const url = signedUrl ?? (await loadSignedUrl(briefId));
		if (!url) return;

		await tick();

		try {
			if (audioElement) {
				if (audioElement.ended) {
					audioElement.currentTime = 0;
					currentTime = 0;
				}
				audioElement.playbackRate = playbackSpeed;
				setPreservesPitch(audioElement);
			}
			await audioElement?.play();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to play audio';
		}
	}

	function seek(event: Event) {
		const target = event.currentTarget as HTMLInputElement;
		const nextTime = Number.parseFloat(target.value);
		if (!Number.isFinite(nextTime)) return;

		const boundedTime = hasDuration
			? Math.min(Math.max(nextTime, 0), durationSeconds)
			: Math.max(nextTime, 0);

		currentTime = boundedTime;

		if (audioElement) {
			try {
				audioElement.currentTime = boundedTime;
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to seek audio';
			}
		}
	}

	function setPlaybackSpeed(speed: PlaybackSpeed) {
		playbackSpeed = speed;
		if (audioElement) {
			audioElement.playbackRate = speed;
			setPreservesPitch(audioElement);
		}
	}
</script>

<div class="rounded-lg border border-border bg-card/85 p-3 shadow-ink tx tx-frame tx-weak">
	{#if isLoading}
		<div class="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
			<LoaderCircle class="h-4 w-4 animate-spin text-accent" />
			Loading audio
		</div>
	{:else if error}
		<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex items-center gap-2 text-sm text-destructive">
				<AlertCircle class="h-4 w-4 shrink-0" />
				<span>{error}</span>
			</div>
			<Button
				variant="outline"
				size="sm"
				icon={RefreshCw}
				onclick={() => loadSignedUrl(briefId)}
			>
				Retry
			</Button>
		</div>
	{:else if signedUrl}
		<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
			<div class="flex min-w-0 items-center gap-2">
				<button
					type="button"
					class="pressable flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-accent bg-accent text-accent-foreground shadow-ink transition-colors hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
					onclick={togglePlayback}
					disabled={isLoading}
					aria-label={isPlaying ? 'Pause audio narration' : 'Play audio narration'}
					title={isPlaying ? 'Pause' : 'Play'}
				>
					{#if isPlaying}
						<Pause class="h-4 w-4" />
					{:else}
						<Play class="ml-0.5 h-4 w-4" />
					{/if}
				</button>

				<div class="min-w-0 flex-1">
					<input
						type="range"
						min="0"
						max={durationSeconds || 0}
						step="0.1"
						value={currentTime}
						oninput={seek}
						disabled={!hasDuration}
						class="brief-audio-range"
						style={`--progress: ${progressPercent}%`}
						aria-label={seekLabel}
					/>
					<div
						class="mt-1 flex items-center justify-between gap-2 text-[0.68rem] leading-none text-muted-foreground"
					>
						<span class="tabular-nums"
							>{formattedCurrentTime} / {formattedDuration}</span
						>
						<span class="truncate text-right tabular-nums"
							>{formattedRemainingTime} left</span
						>
					</div>
				</div>
			</div>

			<div
				class="grid grid-cols-3 overflow-hidden rounded-md border border-border bg-muted/60 p-0.5"
				aria-label="Playback speed"
			>
				{#each PLAYBACK_SPEEDS as speed}
					<button
						type="button"
						class="pressable rounded px-2.5 py-1.5 text-xs font-semibold tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {playbackSpeed ===
						speed
							? 'bg-accent text-accent-foreground shadow-ink'
							: 'text-muted-foreground hover:bg-background hover:text-foreground'}"
						onclick={() => setPlaybackSpeed(speed)}
						aria-pressed={playbackSpeed === speed}
						title={`${speed}x playback speed`}
					>
						{speed}x
					</button>
				{/each}
			</div>

			<audio
				bind:this={audioElement}
				preload="metadata"
				src={signedUrl}
				class="hidden"
				onloadedmetadata={syncMediaState}
				ondurationchange={syncMediaState}
				ontimeupdate={syncMediaState}
				onplay={() => (isPlaying = true)}
				onpause={() => (isPlaying = false)}
				onratechange={syncMediaState}
				onended={() => {
					isPlaying = false;
					currentTime = durationSeconds || currentTime;
				}}
			></audio>
		</div>
	{/if}
</div>

<style>
	.brief-audio-range {
		--track-height: 0.45rem;
		appearance: none;
		-webkit-appearance: none;
		width: 100%;
		height: 1.4rem;
		cursor: pointer;
		background: transparent;
	}

	.brief-audio-range:disabled {
		cursor: not-allowed;
		opacity: 0.65;
	}

	.brief-audio-range::-webkit-slider-runnable-track {
		height: var(--track-height);
		border-radius: 999px;
		background: linear-gradient(
			to right,
			hsl(var(--accent)) 0 var(--progress),
			hsl(var(--border) / 0.9) var(--progress) 100%
		);
	}

	.brief-audio-range::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 1rem;
		height: 1rem;
		margin-top: calc((var(--track-height) - 1rem) / 2);
		border: 2px solid hsl(var(--background));
		border-radius: 999px;
		background: hsl(var(--accent));
		box-shadow: 0 1px 4px hsl(var(--foreground) / 0.24);
	}

	.brief-audio-range::-moz-range-track {
		height: var(--track-height);
		border-radius: 999px;
		background: hsl(var(--border) / 0.9);
	}

	.brief-audio-range::-moz-range-progress {
		height: var(--track-height);
		border-radius: 999px;
		background: hsl(var(--accent));
	}

	.brief-audio-range::-moz-range-thumb {
		width: 1rem;
		height: 1rem;
		border: 2px solid hsl(var(--background));
		border-radius: 999px;
		background: hsl(var(--accent));
		box-shadow: 0 1px 4px hsl(var(--foreground) / 0.24);
	}

	.brief-audio-range:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 3px;
		border-radius: 999px;
	}
</style>
