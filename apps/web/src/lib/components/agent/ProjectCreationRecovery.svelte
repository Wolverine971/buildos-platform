<!-- apps/web/src/lib/components/agent/ProjectCreationRecovery.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { checkProjectCreation } from './project-creation-recovery';

	let {
		sessionId,
		paused = false,
		busy = false,
		onResume,
		onCreated
	}: {
		sessionId: string;
		paused?: boolean;
		busy?: boolean;
		onResume: () => void;
		onCreated: (projectIds: string[]) => void | Promise<void>;
	} = $props();
	let retry = $state(0);
	let status = $state<'checking' | 'working' | 'review' | 'unavailable' | 'waiting'>('checking');
	const message = $derived(
		status === 'checking'
			? 'Checking your original conversation…'
			: status === 'working'
				? 'BuildOS is still working. Your project summary will appear here when the turn finishes.'
				: status === 'review'
					? 'No saved project was found yet. Continue the conversation to review the response or answer a question.'
					: status === 'waiting'
						? 'This is taking longer than expected. Check again or open the conversation for the latest progress.'
						: 'The status check couldn’t connect. Your draft is still here. Check again or resume the conversation.'
	);

	$effect(() => {
		const id = sessionId;
		void retry;
		if (paused) return;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		let checks = 0;
		status = 'checking';
		async function check() {
			try {
				const progress = await checkProjectCreation(id, controller.signal);
				if (controller.signal.aborted) return;
				if (progress.status === 'saved') {
					await onCreated(progress.projectIds);
					return;
				}
				status = progress.status;
				if (progress.status === 'working') {
					checks += 1;
					if (checks >= 20) status = 'waiting';
					else timer = setTimeout(check, checks < 5 ? 5_000 : 15_000);
				}
			} catch {
				if (!controller.signal.aborted) status = 'unavailable';
			}
		}
		void check();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	});
</script>

<section
	class="rounded-xl border border-accent/30 bg-accent/5 p-4"
	aria-label="Project setup in progress"
>
	<h3 class="text-sm font-semibold text-foreground">Continue your project setup</h3>
	<p class="mt-2 text-sm text-muted-foreground" role="status">{message}</p>
	<div class="mt-3 flex flex-wrap gap-2">
		<Button variant="primary" onclick={onResume} disabled={busy} loading={busy}
			>Resume setup chat</Button
		>
		{#if status === 'unavailable' || status === 'waiting' || status === 'review'}
			<Button variant="outline" onclick={() => retry++} disabled={busy}>Check status</Button>
		{/if}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">
		This opens the same conversation without resending your request.
	</p>
</section>
