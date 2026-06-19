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
	} from 'lucide-svelte';
	import type { AgentRunStatus } from '@buildos/shared-types';
	import type { AgentRunRow } from '$lib/services/agentRunsRealtime.service';

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
				return { icon: LoaderCircle, cls: 'text-muted-foreground animate-spin' };
			default:
				return { icon: LoaderCircle, cls: 'text-info animate-spin' };
		}
	}

	function statusLabel(status: AgentRunStatus): string {
		switch (status) {
			case 'queued':
				return 'Queued';
			case 'running':
				return 'Working…';
			case 'paused':
				return 'Paused';
			case 'needs_input':
				return 'Needs input';
			case 'proposal_ready':
				return 'Proposal ready';
			case 'completed':
				return 'Done';
			case 'partial':
				return 'Partial';
			case 'failed':
				return 'Failed';
			case 'cancelled':
				return 'Cancelled';
			default:
				return status;
		}
	}
</script>

{#if runs.length}
	<div class="border-t border-border bg-muted/30 px-3 py-2">
		<div class="flex items-center gap-1.5 mb-1.5">
			<Bot class="w-3.5 h-3.5 text-muted-foreground" />
			<span class="text-xs font-medium text-muted-foreground">
				{#if activeCount > 0}
					{activeCount} agent{activeCount === 1 ? '' : 's'} working
				{:else}
					Agent runs
				{/if}
			</span>
		</div>
		<div class="space-y-1">
			{#each runs as run (run.id)}
				{@const ic = iconFor(run.status)}
				{@const StatusIcon = ic.icon}
				<button
					type="button"
					class="w-full flex items-center gap-2 rounded-md bg-card border border-border px-2 py-1.5 text-left hover:shadow-ink transition-shadow"
					onclick={() => onOpen?.(run.id)}
				>
					<StatusIcon class="w-4 h-4 flex-shrink-0 {ic.cls}" />
					<span class="flex-1 min-w-0 truncate text-xs text-foreground">{run.label}</span>
					<span class="flex-shrink-0 text-[11px] text-muted-foreground"
						>{statusLabel(run.status)}</span
					>
					<ChevronRight class="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
				</button>
			{/each}
		</div>
	</div>
{/if}
