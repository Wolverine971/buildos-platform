<!-- apps/web/src/lib/components/briefs/BriefAudioPlayer.svelte -->
<script lang="ts">
	import { AlertCircle, LoaderCircle, RefreshCw, Volume2 } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';

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
	let error = $state<string | null>(null);
	let requestId = 0;

	let formattedDuration = $derived.by(() => {
		if (!durationMs || durationMs < 0) return null;
		const totalSeconds = Math.round(durationMs / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	});

	$effect(() => {
		const id = briefId;
		const status = audioStatus;
		const path = audioStoragePath;

		if (status === 'ready' && path) {
			void loadSignedUrl(id);
		} else {
			signedUrl = null;
			error = null;
		}
	});

	async function loadSignedUrl(id: string) {
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
				signedUrl = result.data.url;
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
	}
</script>

<div class="rounded-lg border border-border bg-muted/40 p-3">
	<div class="mb-2 flex items-center justify-between gap-3">
		<div class="flex min-w-0 items-center gap-2">
			<Volume2 class="h-4 w-4 shrink-0 text-accent" />
			<span class="text-sm font-medium text-foreground">Audio narration</span>
		</div>
		{#if formattedDuration}
			<span class="shrink-0 text-xs text-muted-foreground">{formattedDuration}</span>
		{/if}
	</div>

	{#if isLoading}
		<div class="flex items-center gap-2 text-sm text-muted-foreground">
			<LoaderCircle class="h-4 w-4 animate-spin" />
			Loading audio...
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
		<audio controls preload="metadata" src={signedUrl} class="block w-full"></audio>
	{/if}
</div>
