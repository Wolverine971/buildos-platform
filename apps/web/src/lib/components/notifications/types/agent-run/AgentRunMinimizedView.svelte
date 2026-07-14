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
		FilePlus,
		FileText,
		ListChecks,
		Target,
		Calendar,
		Flag,
		FolderKanban,
		AlertTriangle,
		ClipboardCheck,
		Layers
	} from '$lib/icons/lucide';
	import type { AgentRunNotification } from '$lib/types/notification.types';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let { notification }: { notification: AgentRunNotification } = $props();

	let runStatus = $derived(notification.data.runStatus);
	let entityCount = $derived(notification.data.entityCount ?? 0);
	let projectLabel = $derived(
		notification.data.projectName ??
			(notification.data.contextType === 'global' ? 'Workspace' : 'Project')
	);
	let activityLabel = $derived(notification.data.activityLabel || notification.data.label);
	let preview = $derived(notification.data.preview || notification.data.goal);

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

	function iconForEntity(entityType: string | null | undefined, label: string) {
		switch (entityType) {
			case 'document':
				return FileText;
			case 'task':
				return ListChecks;
			case 'goal':
				return Target;
			case 'plan':
				return Calendar;
			case 'milestone':
				return Flag;
			case 'project':
				return FolderKanban;
			case 'risk':
				return AlertTriangle;
			case 'output':
				return Layers;
			case 'audit':
				return ClipboardCheck;
			default:
				return /\baudit\b/i.test(label) ? ClipboardCheck : Bot;
		}
	}

	let statusIcon = $derived(iconFor(runStatus));
	let EntityIcon = $derived(iconForEntity(notification.data.entityType, activityLabel));
</script>

<div class="flex items-start gap-3 p-4">
	<div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
		{#if statusIcon}
			{@const StatusIcon = statusIcon.icon}
			<StatusIcon class="h-5 w-5 {statusIcon.cls} motion-reduce:animate-none" />
		{/if}
	</div>

	<div class="min-w-0 flex-1">
		<div
			class="truncate text-sm font-semibold text-foreground"
			aria-label={notification.data.projectName
				? `Project: ${notification.data.projectName}`
				: projectLabel}
		>
			{projectLabel}
		</div>

		<div class="mt-0.5 flex min-w-0 items-center gap-1.5">
			<EntityIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
			<span class="min-w-0 truncate text-xs">
				<span class="font-medium text-foreground">{activityLabel}</span>
				{#if notification.data.targetLabel}
					<span class="text-muted-foreground">
						<span aria-hidden="true"> · </span>{notification.data.targetLabel}
					</span>
				{/if}
			</span>
		</div>

		{#if preview}
			<div class="mt-1 line-clamp-2 break-words text-xs leading-4 text-muted-foreground">
				{preview}
			</div>
		{/if}
	</div>

	{#if entityCount > 0}
		<div
			class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs text-success"
			aria-label={`${entityCount} completed ${entityCount === 1 ? 'change' : 'changes'}`}
		>
			<FilePen class="h-3 w-3" />
			{entityCount}
		</div>
	{:else if runStatus === 'proposal_ready' && notification.data.result?.proposed_changes}
		<div
			class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-info/10 px-2 py-1 text-xs text-info"
			aria-label={`${notification.data.result.proposed_changes.changes.length} proposed ${notification.data.result.proposed_changes.changes.length === 1 ? 'change' : 'changes'}`}
		>
			<FilePlus class="h-3 w-3" />
			{notification.data.result.proposed_changes.changes.length}
		</div>
	{/if}
</div>
