<!-- apps/web/src/lib/components/notifications/types/agent-run/AgentRunSteerControl.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	/**
	 * Steer / pause / resume control for a live Agent Run (UI-P1.5, 03 §3a).
	 * The steer box posts a `steer` signal the worker injects into the run's next
	 * turn; the chip shows pending → applied (flips when a run.steer event lands).
	 */
	import { Send, Pause, Play, LoaderCircle, Check } from '$lib/icons/lucide';
	import Button from '$components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let {
		runId,
		runStatus,
		appliedSteerMessages = []
	}: {
		runId: string;
		runStatus: AgentRunStatus;
		appliedSteerMessages?: string[];
	} = $props();

	let steerText = $state('');
	let busy = $state(false);
	let pending = $state<Array<{ id: number; message: string }>>([]);
	let nextId = 0;

	let canSteer = $derived(
		runStatus === 'running' ||
			runStatus === 'paused' ||
			runStatus === 'queued' ||
			runStatus === 'needs_input'
	);
	let canPause = $derived(runStatus === 'running' || runStatus === 'queued');
	let canResume = $derived(runStatus === 'paused');

	let appliedMessageSet = $derived(new Set(appliedSteerMessages.map((m) => m.trim())));

	function isApplied(message: string): boolean {
		return appliedMessageSet.has(message);
	}

	async function sendSteer() {
		const message = steerText.trim();
		if (!message || busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/agent-runs/${runId}/steer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message })
			});
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				toastService.error(body?.error || 'Could not send this guidance');
				return;
			}
			pending = [...pending, { id: nextId++, message }];
			steerText = '';
		} catch {
			toastService.error('Could not send this guidance');
		} finally {
			busy = false;
		}
	}

	async function postControl(action: 'pause' | 'resume') {
		if (busy) return;
		busy = true;
		try {
			const res = await fetch(`/api/agent-runs/${runId}/${action}`, { method: 'POST' });
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				toastService.error(body?.error || `Could not ${action} this work`);
				return;
			}
			toastService.info(action === 'pause' ? 'Pausing work…' : 'Resuming work…');
		} catch {
			toastService.error(`Could not ${action} this work`);
		} finally {
			busy = false;
		}
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			void sendSteer();
		}
	}
</script>

<div class="rounded-lg border border-border bg-card p-2.5 space-y-2">
	{#if pending.length}
		<div class="flex flex-wrap gap-1.5">
			{#each pending as chip (chip.id)}
				<span
					class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs {isApplied(
						chip.message
					)
						? 'bg-success/10 text-success'
						: 'bg-muted text-muted-foreground'}"
					title={chip.message}
				>
					{#if isApplied(chip.message)}
						<Check class="w-3 h-3" /> applied
					{:else}
						<LoaderCircle class="w-3 h-3 animate-spin motion-reduce:animate-none" /> sending
					{/if}
					<span class="max-w-[140px] truncate">{chip.message}</span>
				</span>
			{/each}
		</div>
	{/if}

	<div class="flex items-end gap-2">
		<textarea
			bind:value={steerText}
			onkeydown={onKeydown}
			rows="1"
			disabled={!canSteer || busy}
			placeholder={canSteer
				? 'Add guidance for BuildOS…'
				: 'This work cannot be redirected now'}
			class="flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
		></textarea>
		<Button
			onclick={sendSteer}
			variant="primary"
			size="md"
			aria-label="Send guidance"
			disabled={!canSteer || busy || !steerText.trim()}
		>
			<Send class="w-4 h-4" />
		</Button>
	</div>

	<div class="flex items-center gap-2">
		{#if canPause}
			<Button
				onclick={() => postControl('pause')}
				variant="outline"
				size="sm"
				disabled={busy}
			>
				<Pause class="w-3.5 h-3.5 mr-1" /> Pause
			</Button>
		{/if}
		{#if canResume}
			<Button
				onclick={() => postControl('resume')}
				variant="primary"
				size="sm"
				disabled={busy}
			>
				<Play class="w-3.5 h-3.5 mr-1" /> Resume
			</Button>
		{/if}
	</div>
</div>
