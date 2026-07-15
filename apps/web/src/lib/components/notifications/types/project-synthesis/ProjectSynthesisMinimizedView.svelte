<!-- apps/web/src/lib/components/notifications/types/project-synthesis/ProjectSynthesisMinimizedView.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import { Sparkles, CheckCircle, AlertCircle, LoaderCircle } from '$lib/icons/lucide';
	import NotificationPreviewContent from '../../NotificationPreviewContent.svelte';
	import { getNotificationPreview } from '../../notification-preview';
	import type {
		ProjectSynthesisNotification,
		StepsProgress
	} from '$lib/types/notification.types';

	let { notification }: { notification: ProjectSynthesisNotification } = $props();

	const stepsProgress = $derived(
		notification.progress?.type === 'steps' ? (notification.progress as StepsProgress) : null
	);

	const progressPercentage = $derived(
		stepsProgress && stepsProgress.totalSteps > 0
			? Math.min(
					100,
					Math.max(
						0,
						Math.round(
							((stepsProgress.currentStep + 1) / stepsProgress.totalSteps) * 100
						)
					)
				)
			: 0
	);

	const result = $derived(notification.data.result);
	const content = $derived(getNotificationPreview(notification));
</script>

<div class="flex items-start gap-3 p-4">
	<!-- Icon -->
	<div class="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center">
		{#if notification.status === 'success'}
			<CheckCircle class="h-5 w-5 text-success" aria-hidden="true" />
		{:else if notification.status === 'error'}
			<AlertCircle class="h-5 w-5 text-destructive" aria-hidden="true" />
		{:else}
			<LoaderCircle
				class="h-5 w-5 animate-spin text-info motion-reduce:animate-none"
				aria-hidden="true"
			/>
		{/if}
	</div>

	<!-- Content -->
	<div class="min-w-0 flex-1">
		<NotificationPreviewContent {...content} icon={Sparkles} />

		<!-- Processing state -->
		{#if notification.status === 'processing'}
			<!-- Progress bar -->
			<div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					class="h-1.5 rounded-full bg-info transition-all duration-300 motion-reduce:transition-none"
					style="width: {progressPercentage}%"
				></div>
			</div>

			<!-- Success state -->
		{:else if notification.status === 'success' && result}
			<div class="mt-2 flex flex-wrap items-center gap-1.5">
				{#if result.consolidationCount > 0}
					<span class="rounded-md bg-info/10 px-2 py-0.5 text-xs font-medium text-info">
						{result.consolidationCount} Consolidation{result.consolidationCount === 1
							? ''
							: 's'}
					</span>
				{/if}
				{#if result.newTasksCount > 0}
					<span
						class="rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success"
					>
						{result.newTasksCount} New
					</span>
				{/if}
				{#if result.deletionsCount > 0}
					<span
						class="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
					>
						{result.deletionsCount} Deletion{result.deletionsCount === 1 ? '' : 's'}
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>
