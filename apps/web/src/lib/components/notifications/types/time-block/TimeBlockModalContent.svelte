<!-- apps/web/src/lib/components/notifications/types/time-block/TimeBlockModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { createEventDispatcher } from 'svelte';
	import { LoaderCircle, AlertCircle, CheckCircle, Calendar, Clock, X } from 'lucide-svelte';
	import type { TimeBlockNotification } from '$lib/types/notification.types';
	import { format } from 'date-fns';
	import Button from '$components/ui/Button.svelte';

	let { notification }: { notification: TimeBlockNotification } = $props();

	const dispatch = createEventDispatcher();

	let formattedDate = $derived(
		notification.data.startTime
			? format(new Date(notification.data.startTime), 'EEEE, MMM d, yyyy')
			: ''
	);

	let formattedTime = $derived(
		notification.data.startTime && notification.data.endTime
			? `${format(new Date(notification.data.startTime), 'h:mm a')} - ${format(
					new Date(notification.data.endTime),
					'h:mm a'
				)}`
			: ''
	);

	let durationText = $derived.by(() => {
		const durationMinutes = notification.data.durationMinutes ?? 0;
		if (!durationMinutes) {
			return '';
		}

		const hours = Math.floor(durationMinutes / 60);
		const minutes = durationMinutes % 60;
		const parts: string[] = [];
		if (hours > 0) {
			parts.push(`${hours}h`);
		}
		if (minutes > 0) {
			parts.push(`${minutes}m`);
		}
		return parts.join(' ') || '0m';
	});

	const status = $derived(notification.status);

	const statusCopy = $derived.by(() => {
		if (status === 'processing') {
			return {
				icon: LoaderCircle,
				iconClass: 'w-6 h-6 text-purple-600 dark:text-purple-400 animate-spin',
				message:
					notification.data.suggestionsState?.progress ?? 'Generating AI suggestions...'
			};
		}
		if (status === 'warning') {
			return {
				icon: AlertCircle,
				iconClass: 'w-6 h-6 text-amber-600 dark:text-amber-400',
				message: 'AI suggestions unavailable. Time block created successfully.'
			};
		}
		if (status === 'success') {
			return {
				icon: CheckCircle,
				iconClass: 'w-6 h-6 text-green-600 dark:text-green-400',
				message: 'Suggestions ready!'
			};
		}
		return {
			icon: Clock,
			iconClass: 'w-6 h-6 text-muted-foreground',
			message: ''
		};
	});

	function handleMinimize() {
		dispatch('minimize');
	}

	function handleDismiss() {
		dispatch('close');
	}

	function handleClose() {
		if (status === 'processing') {
			handleMinimize();
		} else {
			handleDismiss();
		}
	}

	function handleOpenCalendar() {
		if (typeof window === 'undefined') return;
		const link = notification.data.calendarEventLink;
		if (link) {
			window.open(link, '_blank', 'noopener,noreferrer');
		}
	}
</script>

<Modal
	isOpen={true}
	onClose={handleClose}
	size="lg"
	showCloseButton={true}
	title="Time Block Suggestions"
	closeOnBackdrop={true}
>
	{#snippet header()}
		{@const StatusIcon = statusCopy.icon}
		<div class="flex items-center gap-3 px-6 py-4 border-b">
			{#if StatusIcon}
				<StatusIcon class={statusCopy.iconClass} />
			{/if}
			<div class="flex-1">
				<h2 class="text-xl font-semibold text-foreground">
					{notification.data.blockType === 'project'
						? 'Project Time Block'
						: 'Build Block'}
				</h2>
				{#if statusCopy.message}
					<p class="text-sm text-muted-foreground mt-1">
						{statusCopy.message}
					</p>
				{/if}
			</div>
			<Button
				onclick={handleClose}
				variant="ghost"
				size="sm"
				icon={X}
				class="!p-2 flex-shrink-0"
				aria-label="Close dialog"
			/>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-6 py-5 space-y-6">
			<div class="space-y-2">
				{#if formattedDate}
					<p class="text-sm text-muted-foreground">{formattedDate}</p>
				{/if}

				<div class="p-4 bg-muted rounded-lg space-y-2">
					{#if formattedTime}
						<div class="flex items-center text-sm text-foreground">
							<Clock class="w-4 h-4 mr-2" />
							{formattedTime}
							{#if durationText}
								<span class="ml-2 text-muted-foreground">({durationText})</span>
							{/if}
						</div>
					{/if}

					{#if notification.data.projectName}
						<div class="text-sm text-foreground">
							<span class="font-medium">Project:</span>
							{notification.data.projectName}
						</div>
					{/if}
				</div>
			</div>

			{#if status === 'success' && notification.data.suggestions?.length}
				<div class="space-y-4">
					<div>
						<h4 class="text-sm font-medium text-foreground mb-3">AI Suggested Tasks</h4>

						<div class="space-y-3">
							{#each notification.data.suggestions as suggestion, index}
								<div class="p-3 bg-card border border-border rounded">
									<div class="text-sm font-medium text-foreground">
										{index + 1}. {suggestion.title}
									</div>
									{#if suggestion.reason}
										<div class="text-xs text-muted-foreground mt-1">
											{suggestion.reason}
										</div>
									{/if}
									<div
										class="flex items-center gap-3 mt-2 text-xs text-muted-foreground"
									>
										{#if suggestion.estimated_minutes}
											<span>{suggestion.estimated_minutes} min</span>
										{/if}
										{#if suggestion.priority}
											<span class="px-2 py-0.5 bg-muted rounded">
												{suggestion.priority}
											</span>
										{/if}
										{#if suggestion.project_name && notification.data.blockType === 'build'}
											<span class="text-blue-600 dark:text-blue-400">
												{suggestion.project_name}
											</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>

					{#if notification.data.suggestionsSummary}
						<div
							class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-sm text-blue-800 dark:text-blue-200"
						>
							{notification.data.suggestionsSummary}
						</div>
					{/if}
				</div>
			{/if}

			{#if status === 'warning' && !notification.data.suggestions?.length}
				<div class="flex items-center text-amber-700 dark:text-amber-300">
					<AlertCircle class="w-5 h-5 mr-2" />
					<span class="text-sm">
						AI suggestions unavailable. Your time block was still created successfully.
					</span>
				</div>
			{/if}

			{#if status === 'processing'}
				<div class="flex items-center text-purple-700 dark:text-purple-300">
					<LoaderCircle class="w-5 h-5 mr-2 animate-spin" />
					<span class="text-sm">
						{notification.data.suggestionsState?.progress ??
							'Generating AI suggestions...'}
					</span>
				</div>
			{/if}

			{#if notification.data.calendarEventLink}
				<div class="flex gap-2 pt-2">
					<button
						onclick={handleOpenCalendar}
						class="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
					>
						<Calendar class="w-4 h-4" />
						Open in Google Calendar
					</button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
