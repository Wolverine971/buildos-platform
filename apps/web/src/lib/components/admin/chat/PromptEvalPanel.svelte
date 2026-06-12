<!-- apps/web/src/lib/components/admin/chat/PromptEvalPanel.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { formatDateTime, prettyJson } from '$lib/services/admin/chat-session-audit-formatters';
	import { evalAssertionCount } from '$lib/services/admin/chat-session-audit-evals';
	import { stringValue } from '$lib/services/admin/chat-session-audit-payload';
	import type {
		PromptEvalScenario,
		TimelineGroup
	} from '$lib/services/admin/chat-session-audit-types';

	let {
		run,
		evalScenarios,
		isLoadingEvalScenarios,
		selectedEvalScenarioByTurnId,
		runningEvalByTurnId,
		evalErrorByTurnId,
		updateSelectedEvalScenario,
		runPromptEval
	}: {
		run: NonNullable<TimelineGroup['run']>;
		evalScenarios: PromptEvalScenario[];
		isLoadingEvalScenarios: boolean;
		selectedEvalScenarioByTurnId: Record<string, string>;
		runningEvalByTurnId: Record<string, boolean>;
		evalErrorByTurnId: Record<string, string | null>;
		updateSelectedEvalScenario: (turnRunId: string, value: string) => void;
		runPromptEval: (turnRunId: string) => void | Promise<void>;
	} = $props();
</script>

<div class="rounded-lg border border-border bg-background p-2.5 space-y-2">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="text-xs font-medium text-foreground">Prompt Eval</div>
		<div class="flex flex-wrap items-center gap-2">
			<select
				class="min-w-[220px] text-xs border border-border bg-card rounded px-2 py-1.5 text-foreground"
				value={selectedEvalScenarioByTurnId[run.id] ?? ''}
				onchange={(event) =>
					updateSelectedEvalScenario(
						run.id,
						(event.currentTarget as HTMLSelectElement).value
					)}
				disabled={isLoadingEvalScenarios || runningEvalByTurnId[run.id]}
			>
				<option value="">
					{isLoadingEvalScenarios ? 'Loading scenarios...' : 'Select scenario'}
				</option>
				{#each evalScenarios as scenario}
					<option value={scenario.slug}>{scenario.title}</option>
				{/each}
			</select>
			<Button
				variant="secondary"
				size="sm"
				class="pressable"
				disabled={!selectedEvalScenarioByTurnId[run.id] || runningEvalByTurnId[run.id]}
				loading={runningEvalByTurnId[run.id]}
				onclick={() => runPromptEval(run.id)}
			>
				Run Eval
			</Button>
		</div>
	</div>
	{#if evalErrorByTurnId[run.id]}
		<div class="text-xs text-destructive">
			{evalErrorByTurnId[run.id]}
		</div>
	{/if}
	{#if run.eval_runs.length > 0}
		<div class="space-y-2">
			{#each run.eval_runs as evalRun}
				<details class="rounded border border-border bg-card p-2 text-xs">
					<summary
						class="cursor-pointer list-none flex flex-wrap items-center justify-between gap-2"
					>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-1.5">
								<span
									class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-foreground/80"
								>
									{evalRun.scenario_slug}
								</span>
								<span
									class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium {evalRun.status ===
									'passed'
										? 'bg-success/10 text-success'
										: evalRun.status === 'failed'
											? 'bg-destructive/10 text-destructive'
											: 'bg-warning/10 text-warning'}"
								>
									{evalRun.status}
								</span>
							</div>
							<div class="mt-1 text-xs text-muted-foreground">
								{formatDateTime(evalRun.started_at)} · {stringValue(
									evalAssertionCount(evalRun.summary, 'passed')
								)} passed · {stringValue(
									evalAssertionCount(evalRun.summary, 'failed')
								)} failed
							</div>
						</div>
					</summary>
					<div class="mt-2 space-y-2">
						<pre
							class="whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground bg-background border border-border rounded p-2">{prettyJson(
								evalRun.summary
							)}</pre>
						{#if evalRun.assertions.length > 0}
							<pre
								class="whitespace-pre-wrap break-words overflow-x-auto text-xs text-foreground bg-background border border-border rounded p-2">{prettyJson(
									evalRun.assertions
								)}</pre>
						{/if}
					</div>
				</details>
			{/each}
		</div>
	{:else}
		<div class="text-xs text-muted-foreground">No evals recorded for this turn yet.</div>
	{/if}
</div>
