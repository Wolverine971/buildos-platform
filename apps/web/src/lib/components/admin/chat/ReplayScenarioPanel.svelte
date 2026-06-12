<!-- apps/web/src/lib/components/admin/chat/ReplayScenarioPanel.svelte -->
<script lang="ts">
	import { RefreshCw } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { PromptEvalScenario } from '$lib/services/admin/chat-session-audit-types';

	type ReplayResult = {
		sessionId: string | null;
		turnRunId: string;
		status: string;
		scenarioSlug: string;
	} | null;

	let {
		evalScenarios,
		selectedReplayScenario,
		selectedReplayScenarioSlug = $bindable(''),
		isLoadingEvalScenarios = false,
		isRunningReplay = false,
		replayError = null,
		lastReplayResult = null,
		onRun
	}: {
		evalScenarios: PromptEvalScenario[];
		selectedReplayScenario: PromptEvalScenario | null;
		selectedReplayScenarioSlug: string;
		isLoadingEvalScenarios?: boolean;
		isRunningReplay?: boolean;
		replayError?: string | null;
		lastReplayResult?: ReplayResult;
		onRun: () => void;
	} = $props();
</script>

<div class="bg-card border border-border rounded-lg p-3 shadow-ink space-y-2">
	<div class="flex flex-wrap items-start gap-2">
		<div class="min-w-[9rem] pt-1">
			<div class="text-sm font-semibold text-foreground">Replay Scenario</div>
			<div class="text-xs text-muted-foreground">Run one audited prompt.</div>
		</div>
		<select
			class="min-w-[240px] flex-1 text-sm border border-border bg-background rounded-lg px-3 py-2 text-foreground"
			value={selectedReplayScenarioSlug}
			onchange={(event) =>
				(selectedReplayScenarioSlug = (event.currentTarget as HTMLSelectElement).value)}
			disabled={isLoadingEvalScenarios || isRunningReplay}
		>
			<option value="">
				{isLoadingEvalScenarios ? 'Loading scenarios...' : 'Select replay scenario'}
			</option>
			{#each evalScenarios as scenario}
				<option value={scenario.slug}>{scenario.title}</option>
			{/each}
		</select>
		<Button
			onclick={onRun}
			disabled={!selectedReplayScenarioSlug || isRunningReplay}
			loading={isRunningReplay}
			icon={RefreshCw}
			variant="secondary"
			size="sm"
			class="pressable shrink-0"
		>
			Replay
		</Button>
	</div>
	{#if selectedReplayScenario}
		<div class="rounded-lg border border-border bg-background px-3 py-2">
			<div class="text-xs font-medium text-foreground">
				{selectedReplayScenario.title}
			</div>
			<div class="mt-0.5 text-xs text-muted-foreground line-clamp-2">
				{selectedReplayScenario.description}
			</div>
			{#if selectedReplayScenario.replayRequest?.message}
				<div class="mt-1 text-xs text-foreground/80 truncate">
					Prompt: "{selectedReplayScenario.replayRequest.message}"
				</div>
			{/if}
		</div>
	{/if}
	{#if replayError}
		<div class="text-xs text-destructive">{replayError}</div>
	{/if}
	{#if lastReplayResult}
		<div class="text-xs text-muted-foreground">
			Last replay: {lastReplayResult.scenarioSlug} -> {lastReplayResult.status} on turn
			{lastReplayResult.turnRunId}
			{#if lastReplayResult.sessionId}
				(session {lastReplayResult.sessionId})
			{/if}
		</div>
	{/if}
</div>
