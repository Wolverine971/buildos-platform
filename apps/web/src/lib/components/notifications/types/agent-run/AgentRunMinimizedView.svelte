<!-- apps/web/src/lib/components/notifications/types/agent-run/AgentRunMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import {
		LoaderCircle,
		CheckCircle,
		AlertCircle,
		XCircle,
		CircleHelp,
		FileDiff,
		Pause,
		Bot,
		FilePen,
		FilePlus
	} from 'lucide-svelte';
	import type { AgentRunNotification } from '$lib/types/notification.types';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let { notification }: { notification: AgentRunNotification } = $props();

	let runStatus = $derived(notification.data.runStatus);
	let message = $derived(
		notification.progress?.type !== 'steps' && notification.progress?.message
			? notification.progress.message
			: notification.data.goal
	);
	let entityCount = $derived(notification.data.entityCount ?? 0);

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

	let statusIcon = $derived(iconFor(runStatus));
</script>

<div class="p-4 flex items-center gap-3">
	<div class="flex-shrink-0">
		{#if statusIcon}
			{@const StatusIcon = statusIcon.icon}
			<StatusIcon class="w-5 h-5 {statusIcon.cls}" />
		{/if}
	</div>

	<div class="flex-1 min-w-0">
		<div class="flex items-center gap-1.5">
			<Bot class="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
			<span class="text-sm font-medium text-foreground truncate"
				>{notification.data.label}</span
			>
		</div>
		{#if message}
			<div class="text-xs text-muted-foreground truncate mt-0.5">{message}</div>
		{/if}
	</div>

	{#if entityCount > 0}
		<div
			class="ml-1 flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-success/10 rounded text-xs text-success"
		>
			<FilePen class="w-3 h-3" />
			{entityCount}
		</div>
	{:else if runStatus === 'proposal_ready' && notification.data.result?.proposed_changes}
		<div
			class="ml-1 flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 bg-info/10 rounded text-xs text-info"
		>
			<FilePlus class="w-3 h-3" />
			{notification.data.result.proposed_changes.changes.length}
		</div>
	{/if}
</div>
