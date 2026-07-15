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
		CalendarDays,
		Flag,
		FolderKanban,
		AlertTriangle,
		ClipboardCheck,
		Layers,
		Link2
	} from '$lib/icons/lucide';
	import NotificationPreviewContent from '../../NotificationPreviewContent.svelte';
	import { getNotificationPreview } from '../../notification-preview';
	import type { AgentRunNotification } from '$lib/types/notification.types';
	import type { AgentRunStatus } from '@buildos/shared-types';

	let { notification }: { notification: AgentRunNotification } = $props();

	let runStatus = $derived(notification.data.runStatus);
	let entityCount = $derived(notification.data.entityCount ?? 0);
	let content = $derived(getNotificationPreview(notification));

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
					cls: 'animate-spin text-muted-foreground motion-reduce:animate-none'
				};
			default:
				return {
					icon: LoaderCircle,
					cls: 'animate-spin text-info motion-reduce:animate-none'
				};
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
			case 'calendar_event':
				return CalendarDays;
			case 'milestone':
				return Flag;
			case 'project':
				return FolderKanban;
			case 'risk':
				return AlertTriangle;
			case 'output':
				return Layers;
			case 'relationship':
				return Link2;
			case 'multiple':
				return Layers;
			case 'audit':
				return ClipboardCheck;
			default:
				return /\baudit\b/i.test(label) ? ClipboardCheck : Bot;
		}
	}

	let statusIcon = $derived(iconFor(runStatus));
	let EntityIcon = $derived(iconForEntity(notification.data.entityType, content.actionLabel));
</script>

<div class="flex items-start gap-3 p-4">
	<div class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
		{#if statusIcon}
			{@const StatusIcon = statusIcon.icon}
			<StatusIcon class="h-5 w-5 {statusIcon.cls}" aria-hidden="true" />
		{/if}
	</div>

	<div class="min-w-0 flex-1">
		<NotificationPreviewContent {...content} icon={EntityIcon} />
	</div>

	{#if entityCount > 0}
		<div
			class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs text-success"
			aria-label={`${entityCount} completed ${entityCount === 1 ? 'change' : 'changes'}`}
		>
			<FilePen class="h-3 w-3" aria-hidden="true" />
			{entityCount}
		</div>
	{:else if runStatus === 'proposal_ready' && notification.data.result?.proposed_changes}
		<div
			class="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-info/10 px-2 py-1 text-xs text-info"
			aria-label={`${notification.data.result.proposed_changes.changes.length} proposed ${notification.data.result.proposed_changes.changes.length === 1 ? 'change' : 'changes'}`}
		>
			<FilePlus class="h-3 w-3" aria-hidden="true" />
			{notification.data.result.proposed_changes.changes.length}
		</div>
	{/if}
</div>
