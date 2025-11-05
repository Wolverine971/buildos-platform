<!-- apps/web/src/lib/components/phases/RecurringTasksSection.svelte -->
<script lang="ts">
	import { RefreshCw, ChevronDown, ChevronRight, Calendar, Clock } from 'lucide-svelte';
	import type { TaskWithCalendarEvents } from '$lib/types/project-page.types';
	import { createEventDispatcher } from 'svelte';
	import BacklogTaskItem from './BacklogTaskItem.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { format, addDays } from 'date-fns';

	export let recurringTasks: TaskWithCalendarEvents[] = [];
	export let projectId: string;

	const dispatch = createEventDispatcher();

	// Collapsed by default
	let isCollapsed = true;

	function toggleCollapsed() {
		isCollapsed = !isCollapsed;
	}

	// Helper function to get recurrence pattern text
	function getRecurrenceText(pattern: string): string {
		const patterns: Record<string, string> = {
			daily: 'Daily',
			weekdays: 'Weekdays',
			weekly: 'Weekly',
			biweekly: 'Biweekly',
			monthly: 'Monthly',
			quarterly: 'Quarterly',
			yearly: 'Yearly'
		};
		return patterns[pattern] || pattern || 'Custom';
	}

	// Helper function to calculate next occurrence
	function getNextOccurrence(task: any): string {
		if (!task.start_date) return 'Not scheduled';

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const startDate = new Date(task.start_date);
		startDate.setHours(0, 0, 0, 0);

		// If task hasn't started yet, next occurrence is the start date
		if (startDate > today) {
			return format(startDate, 'MMM d, yyyy');
		}

		// Check if task has ended
		if (task.recurrence_ends) {
			const endDate = new Date(task.recurrence_ends);
			endDate.setHours(0, 0, 0, 0);
			if (endDate < today) {
				return 'Ended';
			}
		}

		// Calculate next occurrence based on pattern
		let nextDate = new Date(today);

		switch (task.recurrence_pattern) {
			case 'daily':
				// If today is an occurrence, show tomorrow, otherwise show today
				if (hasInstanceToday(task)) {
					nextDate = addDays(today, 1);
				}
				break;

			case 'weekdays':
				// Find next weekday
				do {
					nextDate = addDays(nextDate, 1);
				} while (nextDate.getDay() === 0 || nextDate.getDay() === 6);
				break;

			case 'weekly':
				// Calculate next weekly occurrence from start date
				const dayOfWeek = startDate.getDay();
				nextDate = new Date(today);
				while (nextDate.getDay() !== dayOfWeek || nextDate <= today) {
					nextDate = addDays(nextDate, 1);
				}
				break;

			case 'biweekly':
				// Calculate weeks since start
				const weeksSinceStart = Math.floor(
					(today.getTime() - startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
				);
				const weeksToNext = weeksSinceStart % 2 === 0 ? 2 : 1;
				nextDate = addDays(startDate, (weeksSinceStart + weeksToNext) * 7);
				break;

			case 'monthly':
				// Same day next month
				const dayOfMonth = startDate.getDate();
				nextDate = new Date(today);
				nextDate.setDate(dayOfMonth);
				if (nextDate <= today) {
					nextDate.setMonth(nextDate.getMonth() + 1);
				}
				// Handle month-end edge cases
				if (nextDate.getDate() !== dayOfMonth) {
					nextDate.setDate(0); // Last day of previous month
				}
				break;

			case 'quarterly':
				nextDate = new Date(startDate);
				while (nextDate <= today) {
					nextDate.setMonth(nextDate.getMonth() + 3);
				}
				break;

			case 'yearly':
				nextDate = new Date(startDate);
				nextDate.setFullYear(today.getFullYear());
				if (nextDate <= today) {
					nextDate.setFullYear(nextDate.getFullYear() + 1);
				}
				break;

			default:
				return 'Custom schedule';
		}

		// Check if next occurrence is within recurrence end date
		if (task.recurrence_ends) {
			const endDate = new Date(task.recurrence_ends);
			if (nextDate > endDate) {
				return 'No more occurrences';
			}
		}

		return format(nextDate, 'MMM d, yyyy');
	}

	// Helper to check if a task has an active instance today
	function hasInstanceToday(task: any): boolean {
		// This would check the recurring_task_instances table
		// For now, return a simple check
		if (!task.start_date) return false;

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const startDate = new Date(task.start_date);
		startDate.setHours(0, 0, 0, 0);

		if (startDate > today) return false;

		// Simple check based on pattern
		switch (task.recurrence_pattern) {
			case 'daily':
				return true;
			case 'weekdays':
				const dayOfWeek = today.getDay();
				return dayOfWeek >= 1 && dayOfWeek <= 5;
			case 'weekly':
				const daysSinceStart = Math.floor(
					(today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
				);
				return daysSinceStart % 7 === 0;
			default:
				return false;
		}
	}
</script>

<section
	class="recurring-section border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900"
	aria-labelledby="recurring-heading"
	aria-describedby="recurring-description"
>
	<!-- Header -->
	<Button
		variant="ghost"
		size="lg"
		fullWidth
		btnType="container"
		onclick={toggleCollapsed}
		aria-expanded={!isCollapsed}
		aria-controls="recurring-content"
		class="p-4 bg-blue-50 dark:bg-blue-900/20 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 min-h-[56px] rounded-none rounded-t-lg justify-start font-normal border-none"
	>
		<div class="flex items-center justify-between gap-3 w-full">
			<div class="flex items-center min-w-0 flex-1 gap-3">
				{#if isCollapsed}
					<ChevronRight
						class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 dark:text-blue-400 transition-colors"
						aria-hidden="true"
					/>
				{:else}
					<ChevronDown
						class="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 dark:text-blue-400 transition-colors"
						aria-hidden="true"
					/>
				{/if}

				<RefreshCw
					class="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400"
					aria-hidden="true"
				/>

				<div class="flex-1 min-w-0">
					<h3
						id="recurring-heading"
						class="font-semibold text-base sm:text-lg text-gray-900 dark:text-white truncate"
					>
						Recurring Tasks
					</h3>
				</div>
			</div>

			<div class="flex items-center gap-2 flex-shrink-0">
				<span
					id="recurring-description"
					class="text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-200 dark:bg-blue-800/50 px-3 py-1.5 rounded-full"
					aria-label="{recurringTasks.length} recurring tasks"
				>
					{recurringTasks.length}
				</span>

				<span class="hidden sm:inline text-xs text-gray-400 dark:text-gray-500 ml-1">
					{isCollapsed ? 'Click to expand' : 'Click to collapse'}
				</span>
			</div>
		</div>
	</Button>

	<!-- Content -->
	<div
		id="recurring-content"
		class="content-wrapper {isCollapsed ? 'collapsed' : 'expanded'}"
		role="region"
		aria-label="Recurring tasks list"
	>
		<div
			class="content-inner border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
		>
			<div class="p-4">
				{#if recurringTasks.length > 0}
					<div
						class="recurring-tasks-list space-y-3"
						role="list"
						aria-label="Recurring tasks"
					>
						{#each recurringTasks as task, index (task.id)}
							<div
								role="listitem"
								class="recurring-task-item bg-gray-50 dark:bg-gray-800 rounded-lg p-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
								animate:flip={{ duration: 300, easing: cubicOut }}
								onclick={() => dispatch('editTask', { task })}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										dispatch('editTask', { task });
									}
								}}
								tabindex="0"
								aria-label="Click to edit {task.title}"
							>
								<div class="flex items-start justify-between gap-3">
									<div class="flex-1 min-w-0">
										<!-- Title with today indicator -->
										<div class="flex items-center gap-2 mb-1">
											<h4
												class="font-medium text-sm sm:text-base text-gray-900 dark:text-white truncate"
											>
												{task.title}
											</h4>
											{#if hasInstanceToday(task)}
												<span
													class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
												>
													Today
												</span>
											{/if}
											{#if task.status && task.status !== 'backlog' && task.status !== 'in_progress'}
												<span
													class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
												>
													{task.status}
												</span>
											{/if}
										</div>

										<!-- Task description -->
										{#if task.description}
											<p
												class="text-xs sm:text-sm text-gray-600 dark:text-gray-400 line-clamp-1 mb-2"
											>
												{task.description}
											</p>
										{/if}

										<!-- Metadata row -->
										<div
											class="flex flex-wrap items-center gap-3 text-xs sm:text-sm"
										>
											<!-- Recurrence pattern -->
											<span
												class="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400"
											>
												<RefreshCw class="w-3 h-3" />
												{getRecurrenceText(task.recurrence_pattern)}
											</span>

											<!-- Start date -->
											{#if task.start_date}
												<span
													class="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"
												>
													<Calendar class="w-3 h-3" />
													Started: {format(
														new Date(task.start_date),
														'MMM d, yyyy'
													)}
												</span>
											{:else}
												<span
													class="inline-flex items-center gap-1 text-orange-500 dark:text-orange-400"
												>
													<Calendar class="w-3 h-3" />
													No start date set
												</span>
											{/if}

											<!-- Next occurrence -->
											{#if task.start_date}
												<span
													class="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"
												>
													<Clock class="w-3 h-3" />
													Next: {getNextOccurrence(task)}
												</span>
											{/if}

											<!-- End date if exists -->
											{#if task.recurrence_ends}
												<span
													class="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400"
												>
													<Clock class="w-3 h-3" />
													Ends: {format(
														new Date(task.recurrence_ends),
														'MMM d, yyyy'
													)}
												</span>
											{/if}

											<!-- Priority -->
											{#if task.priority}
												<span
													class="px-2 py-0.5 rounded text-xs font-medium {task.priority ===
													'high'
														? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
														: task.priority === 'medium'
															? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
															: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}"
												>
													{task.priority}
												</span>
											{/if}

											<!-- Duration if exists -->
											{#if task.duration_minutes}
												<span
													class="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400"
												>
													⏱️ {task.duration_minutes} min
												</span>
											{/if}
										</div>
									</div>

									<!-- Actions -->
									<div class="flex items-center gap-1 flex-shrink-0">
										<Button
											variant="ghost"
											size="sm"
											onclick={(e) => {
												e.stopPropagation();
												dispatch('editTask', { task });
											}}
											aria-label="Edit {task.title}"
											class="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
										>
											<svg
												class="w-4 h-4"
												fill="none"
												stroke="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
												/>
											</svg>
										</Button>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="empty-state text-center py-8 text-gray-500 dark:text-gray-400">
						<RefreshCw
							class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600"
						/>
						<p class="text-sm">No recurring tasks in this project</p>
						<p class="text-xs mt-1 text-gray-400 dark:text-gray-500">
							Create recurring tasks to see them here
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</section>

<style>
	/* Content wrapper animations */
	.content-wrapper {
		overflow: hidden;
		transition: all 0.3s ease;
	}

	.content-wrapper.collapsed {
		max-height: 0;
		opacity: 0;
	}

	.content-wrapper.expanded {
		max-height: 80vh;
		opacity: 1;
	}

	/* List layout */
	.recurring-tasks-list {
		max-height: 60vh;
		overflow-y: auto;
		-webkit-overflow-scrolling: touch;
	}

	@media (max-width: 640px) {
		.content-wrapper.expanded {
			max-height: 60vh;
		}

		.recurring-tasks-list {
			max-height: 50vh;
		}
	}

	/* Task item hover effects */
	.recurring-task-item {
		transition: all 0.2s ease;
	}

	.recurring-task-item:hover {
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.recurring-task-item:focus-visible {
		outline: 2px solid rgb(59 130 246);
		outline-offset: 2px;
	}

	/* Line clamp utility */
	.line-clamp-1 {
		display: -webkit-box;
		-webkit-line-clamp: 1;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* Dark mode adjustments */
	:global(.dark) .recurring-task-item:hover {
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
	}
</style>
