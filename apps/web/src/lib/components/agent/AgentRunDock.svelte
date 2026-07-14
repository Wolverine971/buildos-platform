<!-- apps/web/src/lib/components/agent/AgentRunDock.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	/**
	 * In-chat run dock (Agent Work UI-P4): a compact strip listing the Agent Runs
	 * this chat session spawned (via delegate_task), so the user can watch them
	 * work without leaving the conversation. Same `agent_runs` data as the global
	 * Run Stack, filtered by parent_session_id (03 §6).
	 */
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		XCircle,
		CircleHelp,
		FileDiff,
		Pause,
		Bot,
		ChevronRight
	} from '$lib/icons/lucide';
	import type { AgentRunStatus } from '@buildos/shared-types';
	import type { AgentRunRow } from '$lib/services/agentRunsRealtime.service';
	import {
		agentRunDisplayTitle,
		agentRunStatusLabel,
		buildAgentRunCardPreview
	} from '$lib/services/agent-run-notification-data';

	let {
		runs,
		activeCount,
		onOpen
	}: {
		runs: AgentRunRow[];
		activeCount: number;
		onOpen?: (runId: string) => void;
	} = $props();

	function iconFor(status: AgentRunStatus) {
		switch (status) {
			case 'completed':
				return { icon: CheckCircle, cls: 'text-success' };
			case 'partial':
				return { icon: AlertCircle, cls: 'text-warning' };
			case 'failed':
				return { icon: AlertCircle, cls: 'text-destructive' };
			case 'cancelled':
				return { icon: XCircle, cls: 'text-muted-foreground' };
			case 'needs_input':
				return { icon: CircleHelp, cls: 'text-warning' };
			case 'proposal_ready':
				return { icon: FileDiff, cls: 'text-info' };
			case 'paused':
				return { icon: Pause, cls: 'text-muted-foreground' };
			case 'queued':
				return {
					icon: LoaderCircle,
					cls: 'text-muted-foreground animate-spin motion-reduce:animate-none'
				};
			default:
				return {
					icon: LoaderCircle,
					cls: 'text-info animate-spin motion-reduce:animate-none'
				};
		}
	}
</script>

{#if runs.length}
	<div class="border-t border-border bg-muted/30 px-3 py-2">
		<div class="flex items-center gap-1.5 mb-1.5">
			<Bot class="w-3.5 h-3.5 text-muted-foreground" />
			<span class="text-xs font-medium text-muted-foreground">
				{#if activeCount > 0}
					{activeCount} active item{activeCount === 1 ? '' : 's'}
				{:else}
					Agent work
				{/if}
			</span>
		</div>
		<div class="space-y-1">
			{#each runs as run (run.id)}
				{@const ic = iconFor(run.status)}
				{@const StatusIcon = ic.icon}
				{@const display = buildAgentRunCardPreview(run)}
				{@const title = agentRunDisplayTitle(
					display.activityLabel,
					display.targetLabel,
					run.label
				)}
				{@const contextLabel =
					display.projectName ??
					(run.context_type === 'global' ? 'Workspace' : 'Project')}
				<button
					type="button"
					class="flex min-h-11 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 text-left shadow-ink transition pressable"
					aria-label={`Open ${contextLabel}: ${title}. ${agentRunStatusLabel(run.status)}`}
					onclick={() => onOpen?.(run.id)}
				>
					<StatusIcon class="w-4 h-4 flex-shrink-0 {ic.cls}" />
					<span class="min-w-0 flex-1">
						<span class="flex items-center gap-1.5">
							<span
								class="min-w-0 flex-1 truncate text-xs font-medium text-foreground"
								>{title}</span
							>
							<span class="flex-shrink-0 text-[0.7rem] text-muted-foreground"
								>{agentRunStatusLabel(run.status)}</span
							>
						</span>
						<span class="block truncate text-[0.7rem] text-muted-foreground">
							{contextLabel} · {display.preview}
						</span>
					</span>
					<ChevronRight class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
				</button>
			{/each}
		</div>
	</div>
{/if}
