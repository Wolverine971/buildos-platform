<!-- src/lib/components/scheduling/ScheduleConflictAlert.svelte -->
<script lang="ts">
	import {
		AlertTriangle,
		AlertCircle,
		Info,
		X,
		CalendarDays,
		ChevronDown,
		ExternalLink
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ConflictInfo } from '$lib/utils/schedulingUtils';
	import { formatDate, formatTime } from '$lib/utils/schedulingUtils';

	export let conflicts: ConflictInfo[] = [];
	export let warnings: string[] = [];
	export let phaseValidationWarning: string | null = null;
	export let dismissible = false;
	export let compact = false;

	let dismissed = false;

	// Track expanded state for each section
	let phaseWarningExpanded = true;
	let errorConflictsExpanded = true;
	let warningConflictsExpanded = true;
	let generalWarningsExpanded = true;

	function getConflictIcon(type: string) {
		switch (type) {
			case 'calendar':
				return CalendarDays;
			case 'phase_boundary':
			case 'project_boundary':
				return AlertTriangle;
			default:
				return AlertCircle;
		}
	}

	function dismiss() {
		dismissed = true;
	}

	function scrollToTask(taskId: string) {
		const element = document.getElementById(`task-schedule-item-${taskId}`);
		if (element) {
			element.scrollIntoView({ behavior: 'smooth', block: 'center' });
			// Add a highlight effect
			element.classList.add('ring-2', 'ring-primary-500', 'ring-offset-2');
			setTimeout(() => {
				element.classList.remove('ring-2', 'ring-primary-500', 'ring-offset-2');
			}, 2000);
		}
	}

	// Group conflicts by severity
	$: errorConflicts = conflicts.filter((c) => c.severity === 'error');
	$: warningConflicts = conflicts.filter((c) => c.severity === 'warning');
	$: hasContent =
		(errorConflicts.length > 0 ||
			warningConflicts.length > 0 ||
			warnings.length > 0 ||
			phaseValidationWarning) &&
		!dismissed;
</script>

{#if hasContent}
	<div class="space-y-2">
		<!-- Phase Validation Warning -->
		{#if phaseValidationWarning}
			<div
				class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg"
			>
				<button
					onclick={() => (phaseWarningExpanded = !phaseWarningExpanded)}
					class="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 hover:bg-orange-100/50 dark:hover:bg-orange-900/30 transition-colors"
				>
					<AlertTriangle
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-600 dark:text-orange-400"
					/>
					<span class="text-sm text-orange-800 dark:text-orange-200 flex-1 text-left">
						Phase Validation Warning
					</span>
					<ChevronDown
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-600 dark:text-orange-400 transition-transform {phaseWarningExpanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
				{#if phaseWarningExpanded}
					<div class="px-3 sm:px-4 pb-2 sm:pb-3">
						<div class="flex items-start gap-2">
							<span class="text-sm text-orange-700 dark:text-orange-300 flex-1 ml-6">
								{phaseValidationWarning}
							</span>
							{#if dismissible}
								<Button
									onclick={dismiss}
									variant="ghost"
									size="sm"
									class="!p-0.5 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200"
								>
									<X class="w-3 h-3" />
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Error Conflicts -->
		{#if errorConflicts.length > 0}
			<div
				class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
			>
				<button
					onclick={() => (errorConflictsExpanded = !errorConflictsExpanded)}
					class="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 hover:bg-red-100/50 dark:hover:bg-red-900/30 transition-colors"
				>
					<AlertTriangle
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400"
					/>
					<span
						class="text-sm text-red-800 dark:text-red-200 flex-1 text-left font-medium"
					>
						Scheduling Conflicts ({errorConflicts.length})
					</span>
					<ChevronDown
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600 dark:text-red-400 transition-transform {errorConflictsExpanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
				{#if errorConflictsExpanded && !compact}
					<div class="px-3 sm:px-4 pb-2 sm:pb-3">
						<div class="flex items-start gap-2">
							<ul
								class="text-sm text-red-700 dark:text-red-300 space-y-2 flex-1 ml-6"
							>
								{#each errorConflicts as conflict}
									<li class="flex items-start gap-2">
										<svelte:component
											this={getConflictIcon(conflict.type)}
											class="w-3 h-3 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1">
											<span>{conflict.description}</span>
											{#if conflict.date}
												<span
													class="text-xs text-red-600 dark:text-red-400 ml-2"
												>
													({formatDate(conflict.date)}
													{formatTime(conflict.date)})
												</span>
											{/if}
											{#if conflict.taskId}
												<button
													onclick={() => scrollToTask(conflict.taskId)}
													class="inline-flex items-center gap-1 ml-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
												>
													<ExternalLink class="w-3 h-3" />
													View task
												</button>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
							{#if dismissible}
								<Button
									onclick={dismiss}
									variant="ghost"
									size="sm"
									class="!p-0.5 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200"
								>
									<X class="w-3 h-3" />
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Warning Conflicts -->
		{#if warningConflicts.length > 0}
			<div
				class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
			>
				<button
					onclick={() => (warningConflictsExpanded = !warningConflictsExpanded)}
					class="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors"
				>
					<AlertCircle
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
					/>
					<span
						class="text-sm text-amber-800 dark:text-amber-200 flex-1 text-left font-medium"
					>
						Warnings ({warningConflicts.length})
					</span>
					<ChevronDown
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600 dark:text-amber-400 transition-transform {warningConflictsExpanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
				{#if warningConflictsExpanded && !compact}
					<div class="px-3 sm:px-4 pb-2 sm:pb-3">
						<div class="flex items-start gap-2">
							<ul
								class="text-sm text-amber-700 dark:text-amber-300 space-y-2 flex-1 ml-6"
							>
								{#each warningConflicts as conflict}
									<li class="flex items-start gap-2">
										<svelte:component
											this={getConflictIcon(conflict.type)}
											class="w-3 h-3 flex-shrink-0 mt-0.5"
										/>
										<div class="flex-1">
											<span>{conflict.description}</span>
											{#if conflict.date}
												<span
													class="text-xs text-amber-600 dark:text-amber-400 ml-2"
												>
													({formatDate(conflict.date)}
													{formatTime(conflict.date)})
												</span>
											{/if}
											{#if conflict.taskId}
												<button
													onclick={() => scrollToTask(conflict.taskId)}
													class="inline-flex items-center gap-1 ml-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline transition-colors"
												>
													<ExternalLink class="w-3 h-3" />
													View task
												</button>
											{/if}
										</div>
									</li>
								{/each}
							</ul>
							{#if dismissible}
								<Button
									onclick={dismiss}
									variant="ghost"
									size="sm"
									class="!p-0.5 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
								>
									<X class="w-3 h-3" />
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- General Warnings -->
		{#if warnings.length > 0}
			<div
				class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
			>
				<button
					onclick={() => (generalWarningsExpanded = !generalWarningsExpanded)}
					class="w-full px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 transition-colors"
				>
					<Info class="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" />
					<span
						class="text-sm text-blue-800 dark:text-blue-200 flex-1 text-left font-medium"
					>
						Information ({warnings.length})
					</span>
					<ChevronDown
						class="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600 dark:text-blue-400 transition-transform {generalWarningsExpanded
							? 'rotate-180'
							: ''}"
					/>
				</button>
				{#if generalWarningsExpanded}
					<div class="px-3 sm:px-4 pb-2 sm:pb-3">
						<div class="flex items-start gap-2">
							<div class="flex-1 ml-6">
								{#if warnings.length === 1}
									<span class="text-sm text-blue-700 dark:text-blue-300">
										{warnings[0]}
									</span>
								{:else}
									<ul class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
										{#each warnings as warning}
											<li>{warning}</li>
										{/each}
									</ul>
								{/if}
							</div>
							{#if dismissible}
								<Button
									onclick={dismiss}
									variant="ghost"
									size="sm"
									class="!p-0.5 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200"
								>
									<X class="w-3 h-3" />
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}
