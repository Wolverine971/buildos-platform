<!-- apps/web/src/lib/components/notifications/types/time-block/TimeBlockModalContent.svelte -->
<svelte:options runes={true} />

<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import { LoaderCircle, AlertCircle, CheckCircle, Calendar, Clock, X } from '$lib/icons/lucide';
	import type { TimeBlockNotification } from '$lib/types/notification.types';
	import { format } from 'date-fns';
	import Button from '$components/ui/Button.svelte';

	let {
		notification,
		onminimize,
		onclose
	}: {
		notification: TimeBlockNotification;
		onminimize?: () => void;
		onclose?: () => void;
	} = $props();

	let formattedDate = $derived(
		notification.data.startTime
			? format(new Date(notification.data.startTime), 'EEEE, MMM d, yyyy')
			: ''
	);

	let formattedTime = $derived(
		notification.data.startTime && notification.data.endTime
			? `${format(new Date(notification.data.startTime), 'h:mm a')} – ${format(
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
				iconClass: 'h-6 w-6 shrink-0 animate-spin text-accent motion-reduce:animate-none',
				message:
					notification.data.suggestionsState?.progress ?? 'Generating AI suggestions...'
			};
		}
		if (status === 'warning') {
			return {
				icon: AlertCircle,
				iconClass: 'h-6 w-6 shrink-0 text-warning',
				message: 'AI suggestions unavailable. Time block created successfully.'
			};
		}
		if (status === 'success') {
			return {
				icon: CheckCircle,
				iconClass: 'h-6 w-6 shrink-0 text-success',
				message: 'Suggestions are ready.'
			};
		}
		if (status === 'error') {
			return {
				icon: AlertCircle,
				iconClass: 'h-6 w-6 shrink-0 text-destructive',
				message: 'The time block could not be created.'
			};
		}
		return {
			icon: Clock,
			iconClass: 'h-6 w-6 shrink-0 text-muted-foreground',
			message: ''
		};
	});

	function handleMinimize() {
		onminimize?.();
	}

	function handleDismiss() {
		onclose?.();
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
	showCloseButton={false}
	ariaLabel="Time block suggestions"
	closeOnBackdrop={true}
>
	{#snippet header()}
		{@const StatusIcon = statusCopy.icon}
		<div class="flex items-center gap-3 px-6 py-4 border-b">
			<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/60">
				{#if StatusIcon}
					<StatusIcon class={statusCopy.iconClass} aria-hidden="true" />
				{/if}
			</div>
			<div class="flex-1">
				<h2 class="text-xl font-semibold text-foreground">
					{notification.data.blockType === 'project'
						? 'Project time block'
						: 'Build block'}
				</h2>
				{#if statusCopy.message}
					<p class="text-sm text-muted-foreground mt-1" aria-live="polite">
						{statusCopy.message}
					</p>
				{/if}
			</div>
			<Button
				onclick={handleClose}
				variant="ghost"
				size="sm"
				icon={X}
				class="shrink-0"
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
							<Clock class="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
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
						<h4 class="text-sm font-medium text-foreground mb-3">AI-suggested tasks</h4>

						<div class="space-y-3">
							{#each notification.data.suggestions as suggestion, index (suggestion.task_id ?? suggestion)}
								<div class="rounded-lg border border-border bg-card p-3">
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
											<span class="rounded-full bg-muted px-2 py-0.5">
												{suggestion.priority}
											</span>
										{/if}
										{#if suggestion.project_name && notification.data.blockType === 'build'}
											<span class="text-info">
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
							class="rounded-lg border border-info/30 bg-info/10 p-3 text-sm text-info"
						>
							{notification.data.suggestionsSummary}
						</div>
					{/if}
				</div>
			{/if}

			{#if status === 'error'}
				<div
					class="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
				>
					{notification.data.error ?? 'The time block could not be created.'}
				</div>
			{/if}

			{#if notification.data.calendarEventLink}
				<div class="flex gap-2 pt-2">
					<Button
						onclick={handleOpenCalendar}
						variant="primary"
						size="md"
						icon={Calendar}
						class="flex-1"
					>
						Open in Google Calendar
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
