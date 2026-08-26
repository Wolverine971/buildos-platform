<!-- apps/web/src/lib/components/profile/CyclesTab.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { CycleDefinition } from '@buildos/shared-types';
	import { AlertCircle, RefreshCw, Repeat } from '$lib/icons/lucide';
	import Button from '$lib/components/ui/Button.svelte';
	import TabHeader from './_shared/TabHeader.svelte';
	import CycleListRow from './cycles/CycleListRow.svelte';
	import type { CycleExecutionAuthority } from './cycles/cycle-presenter';

	interface Props {
		executionAuthority: CycleExecutionAuthority;
		fetcher?: typeof fetch;
	}

	let { executionAuthority, fetcher = fetch }: Props = $props();

	let cycles = $state.raw<CycleDefinition[]>([]);
	let loading = $state(true);
	let errorMessage = $state<string | null>(null);

	async function loadCycles() {
		loading = true;
		errorMessage = null;
		try {
			const response = await fetcher('/api/cycles');
			const result = await response.json().catch(() => null);
			if (!response.ok || !result?.success || !Array.isArray(result.data?.cycles)) {
				throw new Error(result?.message || result?.error || 'Failed to load Cycles.');
			}
			cycles = result.data.cycles as CycleDefinition[];
		} catch (error) {
			console.error('[Cycles settings] Failed to load Cycles:', error);
			errorMessage = 'Cycles could not be loaded right now.';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadCycles();
	});
</script>

<div class="min-w-0 space-y-4 sm:space-y-5">
	<TabHeader icon={Repeat} title="Cycles" description="Recurring work BuildOS can run for you." />

	{#if executionAuthority === 'preview'}
		<div
			class="rounded-lg border border-info/30 bg-info/10 p-4 shadow-ink tx tx-thread tx-weak"
		>
			<p class="text-sm font-semibold text-foreground">Read-only preview</p>
			<p class="mt-1 text-sm leading-relaxed text-muted-foreground">
				BuildOS is not managing these schedules yet. <a
					href="/profile?tab=briefs"
					class="font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>Brief Settings</a
				> remains the place to change Daily Brief timing.
			</p>
		</div>
	{/if}

	{#if loading}
		<div
			class="flex min-h-48 items-center justify-center rounded-lg border border-border bg-card p-6 text-center shadow-ink"
			role="status"
			aria-live="polite"
		>
			<div>
				<RefreshCw
					class="mx-auto h-6 w-6 animate-spin text-accent motion-reduce:animate-none"
					aria-hidden="true"
				/>
				<p class="mt-3 text-sm font-medium text-foreground">Loading Cycles…</p>
			</div>
		</div>
	{:else if errorMessage}
		<div
			class="rounded-lg border border-destructive/30 bg-destructive/10 p-5 text-center shadow-ink tx tx-static tx-weak"
		>
			<AlertCircle class="mx-auto h-6 w-6 text-destructive" aria-hidden="true" />
			<p class="mt-2 text-sm font-semibold text-foreground">{errorMessage}</p>
			<p class="mt-1 text-xs text-muted-foreground">Your settings have not changed.</p>
			<Button class="mt-4" variant="outline" size="sm" icon={RefreshCw} onclick={loadCycles}>
				Retry
			</Button>
		</div>
	{:else if cycles.length === 0}
		<div class="rounded-lg border-2 border-dashed border-border bg-card px-5 py-10 text-center">
			<Repeat class="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
			<h3 class="mt-3 text-base font-semibold text-foreground">No Cycles available yet</h3>
			<p class="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
				Cycles are recurring work BuildOS can run for you. Your available Cycles will appear
				here as they become available.
			</p>
		</div>
	{:else}
		<div class="min-w-0 space-y-3" aria-label="Available Cycles">
			{#each cycles as cycle (cycle.id)}
				<CycleListRow {cycle} authority={executionAuthority} />
			{/each}
		</div>
	{/if}
</div>
