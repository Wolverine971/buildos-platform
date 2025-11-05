<!-- apps/web/src/lib/components/project/PhaseGenerationConfirmationModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		AlertTriangle,
		Calendar,
		ChevronDown,
		ChevronUp,
		Clock,
		Info,
		Loader2,
		Target,
		CalendarDays,
		Layers,
		RefreshCw
	} from 'lucide-svelte';

	import type { PhaseWithTasks } from '$lib/types/project-page.types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import PhaseInstructionsInput from '$lib/components/phases/PhaseInstructionsInput.svelte';

	export let isOpen = false;
	export let projectId: string;
	export let projectStartDate: string | null;
	export let projectEndDate: string | null;
	export let existingPhases: PhaseWithTasks[] = [];
	export let isRegeneration = false;
	export let calendarConnected = false;

	const dispatch = createEventDispatcher();

	// Scheduling method options
	const schedulingMethods = [
		{
			value: 'phases_only',
			label: 'Put tasks into phases',
			description: 'Organize tasks into phases without specific scheduling',
			icon: Layers,
			disabled: false
		},
		{
			value: 'schedule_in_phases',
			label: 'Schedule tasks in phases',
			description: 'Assign tasks to phases and schedule them within phase durations',
			icon: Target,
			disabled: false
		},
		{
			value: 'calendar_optimized',
			label: 'Schedule all tasks to calendar',
			description: 'Intelligently schedule around your existing calendar events',
			icon: CalendarDays,
			disabled: !calendarConnected
		}
	];

	// Task status options
	const statusOptions = [
		{ value: 'backlog', label: 'Backlog', defaultSelected: true },
		{ value: 'in_progress', label: 'In Progress', defaultSelected: true },
		{ value: 'blocked', label: 'Blocked', defaultSelected: true },
		{ value: 'done', label: 'Done', defaultSelected: false }
	];

	// State
	let loading = false;
	let previewData: any = null;
	let selectedStatuses = statusOptions
		.filter((opt) => opt.defaultSelected)
		.map((opt) => opt.value);
	let selectedSchedulingMethod = projectEndDate ? 'schedule_in_phases' : 'phases_only'; // Default based on available dates
	let localProjectStartDate = projectStartDate;
	let localProjectEndDate = projectEndDate;
	let showTaskConflicts = false;
	let showRescheduledTasks = false;
	let showTaskBreakdown = false;
	let error: string | null = null;

	// Recurring task state
	let includeRecurringTasks = false;
	let allowRecurringReschedule = false;
	let showRecurringTasks = false;

	// Task date handling
	let preserveExistingDates = false; // Default: reschedule all tasks

	// Historical phase preservation
	let preserveHistoricalPhases = true; // Default: preserve historical phases during regeneration

	// User instructions for phase generation
	let userInstructions = '';

	// Calendar event handling
	let calendarHandling: 'update' | 'clear_and_reschedule' | 'preserve' = 'update'; // Default to current behavior
	let preserveRecurringEvents = false;
	let calendarEventCount = 0; // Will be populated from preview data

	// Reactive calculations
	$: totalSelectedTasks = previewData?.task_counts?.total || 0;
	$: hasConflicts =
		previewData?.conflicts &&
		(previewData.conflicts.past_incomplete_tasks?.length > 0 ||
			previewData.conflicts.outside_timeline_tasks?.length > 0);
	$: hasRescheduled = previewData?.rescheduled_tasks?.length > 0;
	$: selectedMethod = schedulingMethods.find((m) => m.value === selectedSchedulingMethod);
	$: hasRecurringTasks = previewData?.recurring_task_info?.count > 0;

	// Load preview data when modal opens or selections change
	$: if (isOpen) {
		loadPreviewData();
	}

	async function loadPreviewData() {
		if (!selectedStatuses.length) {
			previewData = null;
			return;
		}

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/phases/preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selected_statuses: selectedStatuses,
					project_start_date: localProjectStartDate,
					project_end_date: localProjectEndDate,
					scheduling_method: selectedSchedulingMethod,
					include_recurring_tasks: includeRecurringTasks,
					allow_recurring_reschedule: allowRecurringReschedule,
					preserve_existing_dates: preserveExistingDates,
					preserve_historical_phases: preserveHistoricalPhases,
					user_instructions: userInstructions
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to load preview');
			}

			// Handle new ApiResponse format
			if (result.success) {
				previewData = result.data;
				// Extract calendar event count from preview data if available
				calendarEventCount = result.data?.calendar_event_count || 0;
			} else {
				throw new Error(result.error || 'Failed to load preview');
			}
		} catch (err) {
			console.error('Error loading preview:', err);
			error = err instanceof Error ? err.message : 'Failed to load preview';
		} finally {
			loading = false;
		}
	}

	function toggleStatus(status: string) {
		if (selectedStatuses.includes(status)) {
			selectedStatuses = selectedStatuses.filter((s) => s !== status);
		} else {
			selectedStatuses = [...selectedStatuses, status];
		}
	}

	function handleSchedulingMethodChange(method: string) {
		if (schedulingMethods.find((m) => m.value === method)?.disabled) return;
		selectedSchedulingMethod = method;
	}

	function handleProjectDateChange() {
		// Reload preview when project dates change
		loadPreviewData();
	}

	function handleCancel() {
		dispatch('cancel');
	}

	function handleConfirm() {
		if (!previewData) return;

		const confirmData = {
			selected_statuses: selectedStatuses,
			scheduling_method: selectedSchedulingMethod,
			project_start_date: localProjectStartDate,
			project_end_date: localProjectEndDate,
			task_count: totalSelectedTasks,
			project_dates_changed:
				localProjectStartDate !== projectStartDate ||
				localProjectEndDate !== projectEndDate,
			calendar_handling: calendarHandling,
			preserve_recurring_events: preserveRecurringEvents,
			include_recurring_tasks: includeRecurringTasks,
			allow_recurring_reschedule: allowRecurringReschedule,
			preserve_existing_dates: preserveExistingDates,
			preserve_historical_phases: preserveHistoricalPhases,
			user_instructions: userInstructions
		};

		console.log('PhaseGenerationConfirmationModal - sending confirm data:', confirmData);

		dispatch('confirm', confirmData);
	}

	function formatDate(dateString: string | null): string {
		if (!dateString) return 'Not set';
		return new Date(dateString).toLocaleDateString();
	}

	function formatTaskDate(dateString: string | null): string {
		if (!dateString) return 'No date';
		const date = new Date(dateString);
		const now = new Date();
		const isPast = date < now;
		return `${date.toLocaleDateString()}${isPast ? ' (past)' : ''}`;
	}
</script>

<Modal {isOpen} onClose={handleCancel} size="lg">
	<div slot="header" class="p-4 sm:p-5 md:p-6 border-b border-gray-200 dark:border-gray-700">
		<h3 class="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
			{isRegeneration ? 'Regenerate Project Phases' : 'Generate Project Phases'}
		</h3>
		<p class="text-sm text-gray-500 dark:text-gray-400 mt-2">
			{isRegeneration
				? 'Configure how to regenerate phases and schedule tasks'
				: 'Configure how to generate phases and schedule tasks'}
		</p>
	</div>

	<div class="p-4 sm:p-5 md:p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
		<!-- Regeneration Warning -->
		{#if isRegeneration && existingPhases.length > 0}
			<div
				class="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
			>
				<div class="flex items-start gap-2">
					<AlertTriangle
						class="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
					/>
					<div class="flex-1">
						<h4 class="font-medium text-amber-800 dark:text-amber-200">
							Regenerating Phases
						</h4>
						<p class="text-sm text-amber-700 dark:text-amber-300 mt-1">
							{preserveHistoricalPhases
								? `Historical phases will be preserved. Completed tasks from future phases will be moved to historical phases, and new phases will be created for remaining work.`
								: `This will delete all ${existingPhases.length} existing phases and create new ones. Tasks currently assigned to phases will be moved to the backlog and then reassigned to new phases.`}
							<strong>This action cannot be undone.</strong>
						</p>

						<!-- Preserve/Wipe Toggle -->
						<div class="mt-4 space-y-2">
							<label class="flex items-start gap-2">
								<input
									type="radio"
									bind:group={preserveHistoricalPhases}
									value={true}
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
								<div>
									<span
										class="font-medium text-sm text-amber-800 dark:text-amber-200"
									>
										Preserve historical phases
									</span>
									<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
										Keep completed and current phases. Move completed future
										tasks to historical phases.
									</p>
								</div>
							</label>

							<label class="flex items-start gap-2">
								<input
									type="radio"
									bind:group={preserveHistoricalPhases}
									value={false}
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
								<div>
									<span
										class="font-medium text-sm text-amber-800 dark:text-amber-200"
									>
										Start fresh
									</span>
									<p class="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
										Delete all existing phases and create completely new ones.
									</p>
								</div>
							</label>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Scheduling Method Selection -->
		<div class="mb-6">
			<h4 class="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
				<Target class="w-4 h-4" />
				Scheduling Method
			</h4>
			<div class="space-y-3">
				{#each schedulingMethods as method}
					<div
						class="relative border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors {selectedSchedulingMethod ===
						method.value
							? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
							: ''} {method.disabled ? 'opacity-50 cursor-not-allowed' : ''}"
						onclick={() => handleSchedulingMethodChange(method.value)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								handleSchedulingMethodChange(method.value);
							}
						}}
						role="radio"
						tabindex="0"
						aria-checked={selectedSchedulingMethod === method.value}
						aria-disabled={method.disabled}
					>
						<div class="flex items-start gap-2">
							<!-- Radio button -->
							<div class="flex items-center h-5">
								<input
									type="radio"
									name="scheduling-method"
									value={method.value}
									bind:group={selectedSchedulingMethod}
									disabled={method.disabled}
									class="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
							</div>

							<!-- Icon -->
							<svelte:component
								this={method.icon}
								class="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5"
							/>

							<!-- Content -->
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<h5 class="font-medium text-gray-900 dark:text-white">
										{method.label}
									</h5>
									{#if method.disabled}
										<span
											class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-1 rounded"
										>
											Calendar required
										</span>
									{/if}
								</div>
								<p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
									{method.description}
								</p>

								{#if selectedSchedulingMethod === method.value}
									<div
										class="mt-2 text-xs text-primary-600 dark:text-primary-400"
									>
										{#if method.value === 'phases_only'}
											Tasks will be organized into phases without specific
											start dates.
										{:else if method.value === 'schedule_in_phases'}
											Tasks will be scheduled within their assigned phase
											durations. Existing task dates may change.
										{:else if method.value === 'calendar_optimized'}
											Tasks will be scheduled around your existing calendar
											events while respecting phase boundaries.
										{/if}
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Project Dates Section -->
		<div class="mb-6">
			<h4 class="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
				<Calendar class="w-4 h-4" />
				Project Timeline
				{#if selectedSchedulingMethod === 'phases_only'}
					<span
						class="text-xs bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-2 py-1 rounded"
					>
						Start date required
					</span>
				{:else}
					<span
						class="text-xs bg-primary-100 dark:bg-primary-900/20 text-primary-800 dark:text-primary-200 px-2 py-1 rounded"
					>
						Required for scheduling
					</span>
				{/if}
			</h4>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<FormField label="Start Date" labelFor="project-start-date">
					<TextInput
						id="project-start-date"
						type="date"
						bind:value={localProjectStartDate}
						onchange={handleProjectDateChange}
						size="md"
						required
					/>
				</FormField>
				<FormField label="End Date" labelFor="project-end-date">
					<TextInput
						id="project-end-date"
						type="date"
						bind:value={localProjectEndDate}
						onchange={handleProjectDateChange}
						size="md"
						required={selectedSchedulingMethod !== 'phases_only'}
					/>
				</FormField>
			</div>
			{#if localProjectStartDate !== projectStartDate || localProjectEndDate !== projectEndDate}
				<div
					class="mt-2 p-2 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded text-sm text-primary-700 dark:text-primary-300"
				>
					<Info class="w-4 h-4 inline mr-1" />
					Project dates will be updated
				</div>
			{/if}
		</div>

		<!-- Phase Generation Instructions -->
		<div class="mb-6">
			<PhaseInstructionsInput
				bind:instructions={userInstructions}
				disabled={loading}
				on:change={() => {
					// Optional: could trigger preview reload on instruction change
					// For now, instructions will be used when confirming
				}}
			/>
		</div>

		<!-- Task Date Handling (only show for scheduling methods) -->
		{#if selectedSchedulingMethod !== 'phases_only'}
			<div class="mb-6">
				<h4 class="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
					<Clock class="w-4 h-4" />
					Task Date Handling
				</h4>
				<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
					<label class="flex items-start gap-2 cursor-pointer">
						<input
							type="checkbox"
							bind:checked={preserveExistingDates}
							onchange={loadPreviewData}
							class="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
						/>
						<div>
							<span class="text-sm font-medium text-gray-900 dark:text-white">
								Preserve existing task dates
							</span>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								When checked, tasks with existing dates will keep their current
								scheduling. When unchecked (default), all tasks will be rescheduled
								optimally within phases.
							</p>
						</div>
					</label>

					{#if !preserveExistingDates}
						<div
							class="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded"
						>
							<div class="flex items-start gap-2">
								<Info
									class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
								/>
								<p class="text-xs text-blue-700 dark:text-blue-300">
									Tasks will be rescheduled to optimal dates within their assigned
									phases. This ensures better workflow and timeline alignment.
								</p>
							</div>
						</div>
					{:else}
						<div
							class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded"
						>
							<div class="flex items-start gap-2">
								<AlertTriangle
									class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
								/>
								<p class="text-xs text-amber-700 dark:text-amber-300">
									Tasks will maintain their current dates. This may result in less
									optimal phase organization if task dates conflict with phase
									timelines.
								</p>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Calendar Event Handling (only show if calendar is connected and scheduling) -->
			{#if calendarConnected}
				<div class="mb-6">
					<h4
						class="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2"
					>
						<CalendarDays class="w-4 h-4" />
						Calendar Event Handling
					</h4>
					<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
						<div class="space-y-3">
							<label class="flex items-start gap-2">
								<input
									type="radio"
									bind:group={calendarHandling}
									value="update"
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
								<div>
									<span class="text-sm font-medium text-gray-900 dark:text-white">
										Update existing events
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Keep existing calendar events and update their times to
										match new phase schedules
									</p>
								</div>
							</label>

							<label class="flex items-start gap-2">
								<input
									type="radio"
									bind:group={calendarHandling}
									value="clear_and_reschedule"
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
								<div>
									<span class="text-sm font-medium text-gray-900 dark:text-white">
										Clear and recreate events
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Delete existing calendar events and create fresh ones with
										new schedules
									</p>
								</div>
							</label>

							<label class="flex items-start gap-2">
								<input
									type="radio"
									bind:group={calendarHandling}
									value="preserve"
									class="mt-1 w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
								/>
								<div>
									<span class="text-sm font-medium text-gray-900 dark:text-white">
										Don't modify calendar events
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										Leave existing calendar events unchanged during phase
										regeneration
									</p>
								</div>
							</label>
						</div>

						{#if calendarHandling === 'clear_and_reschedule'}
							<div
								class="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded"
							>
								<div class="flex items-start gap-2">
									<AlertTriangle
										class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
									/>
									<div class="flex-1">
										<p class="text-xs text-amber-700 dark:text-amber-300">
											This will delete {calendarEventCount || 'all'} existing calendar
											events and create new ones. This action cannot be undone.
										</p>

										{#if hasRecurringTasks}
											<label
												class="flex items-start gap-2 cursor-pointer mt-3"
											>
												<input
													type="checkbox"
													bind:checked={preserveRecurringEvents}
													class="mt-0.5 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
												/>
												<span
													class="text-xs text-amber-700 dark:text-amber-300"
												>
													Preserve recurring event series
												</span>
											</label>
										{/if}
									</div>
								</div>
							</div>
						{/if}
					</div>
				</div>
			{/if}
		{/if}

		<!-- Task Status Selection -->
		<div class="mb-6">
			<h4 class="font-medium text-gray-900 dark:text-white mb-4">Include Tasks by Status</h4>
			<div class="flex flex-wrap gap-2">
				{#each statusOptions as option}
					<Button
						onclick={() => toggleStatus(option.value)}
						variant={selectedStatuses.includes(option.value) ? 'primary' : 'outline'}
						size="sm"
						class="rounded-full"
					>
						{option.label}
						{#if previewData?.task_counts?.by_status?.[option.value]}
							({previewData.task_counts.by_status[option.value]})
						{/if}
					</Button>
				{/each}
			</div>
		</div>

		<!-- Recurring Tasks Section -->
		{#if hasRecurringTasks}
			<div class="mb-6">
				<div class="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
					<div class="flex items-start gap-2">
						<RefreshCw
							class="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5"
						/>
						<div class="flex-1">
							<h4 class="font-medium text-gray-900 dark:text-white">
								Recurring Tasks
								<span class="text-sm text-gray-500 dark:text-gray-400">
									({previewData?.recurring_task_info?.count || 0} found)
								</span>
							</h4>

							<div class="mt-3 space-y-3">
								<label class="flex items-start gap-2 cursor-pointer">
									<input
										type="checkbox"
										bind:checked={includeRecurringTasks}
										onchange={loadPreviewData}
										class="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
									/>
									<div>
										<span
											class="text-sm font-medium text-gray-900 dark:text-white"
										>
											Include recurring tasks in phase planning
										</span>
										<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
											Consider weekly meetings, reviews, and other recurring
											tasks when organizing phases
										</p>
									</div>
								</label>

								{#if includeRecurringTasks}
									<div
										class="ml-6 pl-2 border-l-2 border-gray-200 dark:border-gray-700"
									>
										<label class="flex items-start gap-2 cursor-pointer">
											<input
												type="checkbox"
												bind:checked={allowRecurringReschedule}
												onchange={loadPreviewData}
												class="mt-1 w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500 dark:focus:ring-primary-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
											/>
											<div>
												<span
													class="text-sm font-medium text-gray-900 dark:text-white"
												>
													Allow AI to suggest rescheduling recurring tasks
												</span>
												<p
													class="text-xs text-gray-500 dark:text-gray-400 mt-1"
												>
													The AI may suggest changes to align recurring
													tasks with phase boundaries
												</p>
											</div>
										</label>

										{#if allowRecurringReschedule}
											<div
												class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded"
											>
												<div class="flex items-start gap-2">
													<Info
														class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
													/>
													<p
														class="text-xs text-amber-700 dark:text-amber-300"
													>
														When enabled, the AI may suggest moving
														weekly meetings to phase start dates or
														adjusting review cycles to align with phase
														completions. You'll review all suggestions
														before they're applied.
													</p>
												</div>
											</div>
										{/if}
									</div>
								{/if}

								<!-- Show recurring tasks list -->
								{#if showRecurringTasks && previewData?.recurring_task_info?.tasks}
									<div class="mt-3">
										<Button
											onclick={() => (showRecurringTasks = false)}
											class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
										>
											<ChevronUp class="w-3 h-3" />
											Hide recurring tasks
										</Button>
										<div class="mt-2 space-y-1 max-h-32 overflow-y-auto">
											{#each previewData.recurring_task_info.tasks as task}
												<div
													class="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2"
												>
													<span class="font-medium"
														>{task.title || 'Untitled'}</span
													>
													<span class="text-gray-400">•</span>
													<span>{task.recurrence_pattern}</span>
												</div>
											{/each}
										</div>
									</div>
								{:else if previewData?.recurring_task_info?.tasks?.length > 0}
									<button
										onclick={() => (showRecurringTasks = true)}
										class="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 flex items-center gap-1"
									>
										<ChevronDown class="w-3 h-3" />
										Show recurring tasks
									</button>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Loading State -->
		{#if loading}
			<div class="flex items-center justify-center py-8">
				<Loader2 class="w-6 h-6 animate-spin text-primary-600 dark:text-primary-400" />
				<span class="ml-2 text-gray-600 dark:text-gray-400">Loading preview...</span>
			</div>
		{:else if error}
			<div
				class="mb-6 p-4 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg"
			>
				<p class="text-sm text-rose-700 dark:text-rose-300">{error}</p>
			</div>
		{:else if previewData}
			<!-- Summary -->
			<div class="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
				<h4 class="font-medium text-gray-900 dark:text-white mb-2">Generation Summary</h4>
				<div class="space-y-1 text-sm text-gray-600 dark:text-gray-300">
					<p><strong>{totalSelectedTasks}</strong> tasks will be processed</p>
					<p>
						Method: <strong>{selectedMethod?.label}</strong>
					</p>
					<p>
						Timeline: <strong>{formatDate(localProjectStartDate)}</strong>
						{#if localProjectEndDate}
							to <strong>{formatDate(localProjectEndDate)}</strong>
						{:else}
							(open-ended)
						{/if}
					</p>
					{#if previewData.estimated_phases}
						<p>
							Estimated <strong>{previewData.estimated_phases}</strong> phases will be
							created
						</p>
					{/if}
				</div>
			</div>

			<!-- Conflicts Section -->
			{#if hasConflicts}
				<div class="mb-6">
					<Button
						onclick={() => (showTaskConflicts = !showTaskConflicts)}
						variant="ghost"
						size="md"
						fullWidth
						class="justify-between bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/30"
					>
						<div class="flex items-center gap-2">
							<AlertTriangle class="w-4 h-4 text-rose-600 dark:text-rose-400" />
							<span class="font-medium text-rose-800 dark:text-rose-200">
								Task Conflicts Detected
							</span>
						</div>
						{#if showTaskConflicts}
							<ChevronUp class="w-4 h-4 text-rose-600 dark:text-rose-400" />
						{:else}
							<ChevronDown class="w-4 h-4 text-rose-600 dark:text-rose-400" />
						{/if}
					</Button>

					{#if showTaskConflicts}
						<div
							class="mt-2 p-3 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg"
						>
							<!-- Past Incomplete Tasks -->
							{#if previewData.conflicts.past_incomplete_tasks?.length > 0}
								<div class="mb-4">
									<h5 class="font-medium text-gray-900 dark:text-white mb-2">
										Past Due Tasks ({previewData.conflicts.past_incomplete_tasks
											.length})
									</h5>
									<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
										{#if selectedSchedulingMethod === 'phases_only'}
											These tasks have past dates and will be moved to phases
											without dates:
										{:else}
											These tasks have past dates and will be rescheduled:
										{/if}
									</p>
									<div class="space-y-1 max-h-32 overflow-y-auto">
										{#each previewData.conflicts.past_incomplete_tasks as task}
											<div
												class="text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded"
											>
												<div class="font-medium">{task.title}</div>
												<div class="text-gray-500 dark:text-gray-400">
													Status: {task.status} • Scheduled: {formatTaskDate(
														task.start_date
													)}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Outside Timeline Tasks -->
							{#if previewData.conflicts.outside_timeline_tasks?.length > 0}
								<div>
									<h5 class="font-medium text-gray-900 dark:text-white mb-2">
										Outside Timeline ({previewData.conflicts
											.outside_timeline_tasks.length})
									</h5>
									<p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
										{#if selectedSchedulingMethod === 'phases_only'}
											These tasks have dates outside the project timeline and
											will be moved to phases without dates:
										{:else}
											These tasks have dates outside the project timeline and
											will be rescheduled:
										{/if}
									</p>
									<div class="space-y-1 max-h-32 overflow-y-auto">
										{#each previewData.conflicts.outside_timeline_tasks as task}
											<div
												class="text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded"
											>
												<div class="font-medium">{task.title}</div>
												<div class="text-gray-500 dark:text-gray-400">
													Status: {task.status} • Scheduled: {formatTaskDate(
														task.start_date
													)}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Rescheduled Tasks Section (only show for scheduling methods) -->
			{#if hasRescheduled && selectedSchedulingMethod !== 'phases_only'}
				<div class="mb-6">
					<Button
						onclick={() => (showRescheduledTasks = !showRescheduledTasks)}
						variant="ghost"
						size="md"
						fullWidth
						class="justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30"
					>
						<div class="flex items-center gap-2">
							<Clock class="w-4 h-4 text-amber-600 dark:text-amber-400" />
							<span class="font-medium text-amber-800 dark:text-amber-200">
								{previewData.rescheduled_tasks.length} Tasks Will Be Rescheduled
							</span>
						</div>
						{#if showRescheduledTasks}
							<ChevronUp class="w-4 h-4 text-amber-600 dark:text-amber-400" />
						{:else}
							<ChevronDown class="w-4 h-4 text-amber-600 dark:text-amber-400" />
						{/if}
					</Button>

					{#if showRescheduledTasks}
						<div
							class="mt-2 p-3 bg-white dark:bg-gray-800 border border-yellow-200 dark:border-yellow-800 rounded-lg"
						>
							<div class="space-y-1 max-h-32 overflow-y-auto">
								{#each previewData.rescheduled_tasks as task}
									<div class="text-xs p-2 bg-gray-50 dark:bg-gray-700 rounded">
										<div class="font-medium">{task.title}</div>
										<div class="text-gray-500 dark:text-gray-400">
											Current: {formatTaskDate(task.current_date)} → New:
											{formatTaskDate(task.suggested_date)}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Task Breakdown -->
			{#if totalSelectedTasks > 0}
				<div class="mb-6">
					<Button
						onclick={() => (showTaskBreakdown = !showTaskBreakdown)}
						variant="ghost"
						size="md"
						fullWidth
						class="justify-between bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/30"
					>
						<div class="flex items-center gap-2">
							<Info class="w-4 h-4 text-primary-600 dark:text-primary-400" />
							<span class="font-medium text-primary-800 dark:text-primary-200">
								View Task Breakdown ({totalSelectedTasks})
							</span>
						</div>
						{#if showTaskBreakdown}
							<ChevronUp class="w-4 h-4 text-primary-600 dark:text-primary-400" />
						{:else}
							<ChevronDown class="w-4 h-4 text-primary-600 dark:text-primary-400" />
						{/if}
					</Button>

					{#if showTaskBreakdown && previewData.task_breakdown}
						<div
							class="mt-2 p-3 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg"
						>
							{#each Object.entries(previewData.task_breakdown) as [status, tasks]}
								{#if tasks.length > 0}
									<div class="mb-4 last:mb-0">
										<h5
											class="font-medium text-gray-900 dark:text-white mb-1 capitalize"
										>
											{status.replace('_', ' ')} ({tasks.length})
										</h5>
										<div class="space-y-1 max-h-24 overflow-y-auto">
											{#each tasks as task}
												<div
													class="text-xs p-1.5 bg-gray-50 dark:bg-gray-700 rounded"
												>
													<div class="font-medium">
														{task.title}
													</div>
													{#if task.start_date && selectedSchedulingMethod !== 'phases_only'}
														<div
															class="text-gray-500 dark:text-gray-400"
														>
															{formatTaskDate(task.start_date)}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		{/if}
	</div>

	<div
		slot="footer"
		class="p-4 sm:p-5 md:p-6 border-t border-gray-200 dark:border-gray-700 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4"
	>
		<Button onclick={handleCancel} variant="secondary" size="md" class="w-full sm:w-auto"
			>Cancel</Button
		>
		<Button
			onclick={handleConfirm}
			disabled={!previewData || totalSelectedTasks === 0 || loading || !localProjectStartDate}
			variant="primary"
			size="md"
			{loading}
			class="w-full sm:w-auto"
		>
			{isRegeneration ? 'Regenerate Phases' : 'Generate Phases'}
		</Button>
	</div>
</Modal>
