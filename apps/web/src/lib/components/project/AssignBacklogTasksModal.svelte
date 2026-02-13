<!-- apps/web/src/lib/components/project/AssignBacklogTasksModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import {
		Inbox,
		Calendar,
		CalendarDays,
		Layers,
		Target,
		Info,
		LoaderCircle
	} from 'lucide-svelte';

	import type { TaskWithCalendarEvents, PhaseWithTasks } from '$lib/types/project-page.types';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { projectStoreV2 } from '$lib/stores/project.store';

	interface Props {
		isOpen?: boolean;
		projectId: string;
		backlogTasks?: TaskWithCalendarEvents[];
		phases?: PhaseWithTasks[];
		calendarConnected?: boolean;
		onclose?: () => void;
		ontasksAssigned?: (detail: { assignedTasks: any[]; totalAssigned: number }) => void;
	}

	let {
		isOpen = false,
		projectId,
		backlogTasks = [],
		phases = [],
		calendarConnected = false,
		onclose,
		ontasksAssigned
	}: Props = $props();

	const dispatch = createEventDispatcher();

	// Assignment method options
	const assignmentMethods = [
		{
			value: 'phases_only',
			label: 'Assign to phases only',
			description: 'Put tasks into phases without assigned dates',
			icon: Layers,
			disabled: false
		},
		{
			value: 'with_dates',
			label: 'Assign with dates',
			description: 'Put tasks into phases with assigned dates',
			icon: Target,
			disabled: false
		},
		{
			value: 'with_calendar',
			label: 'Assign and schedule to calendar',
			description: 'Put tasks into phases with dates and sync to calendar',
			icon: CalendarDays,
			disabled: !calendarConnected
		}
	];

	// State
	let loading = $state(false);
	let selectedMethod = $state('phases_only');
	let taskPhaseAssignments = $state<{ [taskId: string]: string }>({});
	let error = $state<string | null>(null);
	let initialized = $state(false);
	let autoAssign = $state(true); // Default to auto-assign

	// Sort phases by start date when modal opens or phases change
	let sortedPhases = $derived(
		phases.length > 0
			? [...phases].sort((a, b) => {
					// Phases without start dates go last
					if (!a.start_date && !b.start_date) return a.order - b.order;
					if (!a.start_date) return 1;
					if (!b.start_date) return -1;
					return new Date(a.start_date).getTime() - new Date(b.start_date).getTime();
				})
			: []
	);

	// Initialize task assignments (evenly distribute) - only once when modal opens
	$effect(() => {
		if (
			isOpen &&
			backlogTasks.length > 0 &&
			sortedPhases.length > 0 &&
			!initialized &&
			!autoAssign
		) {
			initializeAssignments();
			initialized = true;
		}
	});

	// Reset initialized flag when modal closes
	$effect(() => {
		if (!isOpen) {
			initialized = false;
		}
	});

	function initializeAssignments() {
		const assignments: { [taskId: string]: string } = {};
		const today = new Date();

		// Filter out phases that have ended
		const validPhases = sortedPhases.filter((phase) => {
			if (!phase.end_date) return true; // If no end date, phase is valid
			return new Date(phase.end_date) >= today;
		});

		if (validPhases.length === 0) {
			error = 'No valid phases available (all phases are in the past)';
			return;
		}

		backlogTasks.forEach((task, index) => {
			// Evenly distribute tasks across valid phases only
			const phaseIndex = index % validPhases.length;
			assignments[task.id] = validPhases[phaseIndex].id;
		});
		taskPhaseAssignments = assignments;
	}

	function handleAutoAssignChange(checked: boolean) {
		autoAssign = checked;
		if (!autoAssign && !initialized) {
			// Initialize assignments when switching to manual mode
			initializeAssignments();
			initialized = true;
		}
	}

	function handleMethodChange(method: string) {
		selectedMethod = method;
	}

	function handlePhaseChange(taskId: string, phaseId: string) {
		taskPhaseAssignments = {
			...taskPhaseAssignments,
			[taskId]: phaseId
		};
	}

	async function handleAssign() {
		if (loading) return;

		loading = true;
		error = null;

		try {
			const response = await fetch(`/api/projects/${projectId}/tasks/assign-backlog`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					taskIds: backlogTasks.map((t) => t.id),
					assignmentMethod: selectedMethod,
					phaseAssignments: autoAssign ? null : taskPhaseAssignments,
					autoAssign: autoAssign
				})
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to assign tasks');
			}

			// Update store with the assigned tasks
			if (result.data?.assignedTasks) {
				// First update each task in the store
				result.data.assignedTasks.forEach((task: any) => {
					projectStoreV2.updateTask(task);
				});

				// Force refresh phases to ensure UI updates completely
				await projectStoreV2.loadPhases(projectId, true);

				// Also refresh tasks to ensure backlog is updated
				await projectStoreV2.loadTasks(projectId, true);

				// Update stats to reflect new task distribution
				projectStoreV2.updateStats();
			}

			toastService.success(`Successfully assigned ${backlogTasks.length} tasks to phases`);

			// Emit a custom event to notify parent components about the update
			const eventData = {
				assignedTasks: result.data?.assignedTasks || [],
				totalAssigned: result.data?.totalAssigned || 0
			};
			ontasksAssigned?.(eventData);
			dispatch('tasksAssigned', eventData);

			handleClose();
		} catch (err) {
			error = 'Failed to assign tasks. Please try again.';
			toastService.error(error);
			console.error('Assign tasks error:', err);
		} finally {
			loading = false;
		}
	}

	function handleClose() {
		onclose?.();
		dispatch('close');
	}
</script>

<Modal {isOpen} onClose={handleClose} size="lg">
	{#snippet header()}
		<div
			class="flex items-center justify-between p-4 sm:p-5 md:p-6 border-b border-border"
		>
			<div class="flex items-center gap-2 sm:gap-3">
				<div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
					<Inbox class="w-5 h-5 text-blue-600 dark:text-blue-400" />
				</div>
				<div class="min-w-0">
					<h2 class="text-base sm:text-lg font-semibold text-foreground">
						Assign Backlog Tasks
					</h2>
					<p class="text-sm text-muted-foreground mt-1">
						{backlogTasks.length} task{backlogTasks.length !== 1 ? 's' : ''} to assign
					</p>
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="p-4 sm:p-5 md:p-6 space-y-4">
			{#if error}
				<div
					class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
				>
					<p class="text-sm text-red-600 dark:text-red-400">{error}</p>
				</div>
			{/if}

			<!-- Assignment Method Selection -->
			<div class="space-y-3">
				<h3 class="text-sm font-medium text-foreground">
					How would you like to assign these tasks?
				</h3>
				<div class="space-y-2">
					{#each assignmentMethods as method}
						{@const MethodIcon = method.icon}
						<Button
							onclick={() => handleMethodChange(method.value)}
							disabled={method.disabled}
							class="w-full p-3 sm:p-4 rounded-lg border-2 transition-all text-left
									{selectedMethod === method.value
								? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
								: 'border-border hover:border-border'}
									{method.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
						>
							<div class="flex items-start gap-3">
								<div
									class="p-2 rounded-lg {selectedMethod === method.value
										? 'bg-blue-100 dark:bg-blue-900/50'
										: 'bg-muted'}"
								>
									<MethodIcon
										class="w-4 h-4 {selectedMethod === method.value
											? 'text-blue-600 dark:text-blue-400'
											: 'text-muted-foreground'}"
									/>
								</div>
								<div class="flex-1">
									<p class="font-medium text-foreground">
										{method.label}
									</p>
									<p class="text-sm text-muted-foreground mt-0.5">
										{method.description}
									</p>
									{#if method.disabled && method.value === 'with_calendar'}
										<p
											class="text-xs text-orange-600 dark:text-orange-400 mt-1"
										>
											Calendar not connected
										</p>
									{/if}
								</div>
							</div>
						</Button>
					{/each}
				</div>
			</div>

			<!-- Auto-assign Toggle -->
			<div class="space-y-3">
				<div
					class="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
				>
					<label for="auto-assign" class="flex items-center cursor-pointer">
						<span class="text-sm font-medium text-foreground">
							Automatically assign tasks to phases
						</span>
					</label>
					<input
						id="auto-assign"
						type="checkbox"
						bind:checked={autoAssign}
						onchange={(e) => handleAutoAssignChange(e.currentTarget.checked)}
						class="h-5 w-5 text-blue-600 rounded border-border focus:ring-blue-500"
					/>
				</div>
				{#if autoAssign}
					<p class="text-sm text-muted-foreground pl-3">
						Tasks will be intelligently distributed across phases based on their
						dependencies and complexity.
					</p>
				{/if}
			</div>

			<!-- Phase Assignment (only shown when manual mode) -->
			{#if !autoAssign}
				<div class="space-y-3">
					<h3 class="text-sm font-medium text-foreground">
						Manually assign tasks to phases
					</h3>
					<div class="space-y-2 max-h-64 overflow-y-auto">
						{#each backlogTasks as task}
							<div
								class="flex items-center gap-3 p-2 bg-muted/50 rounded-lg"
							>
								<div class="flex-1 min-w-0">
									<p
										class="text-sm font-medium text-foreground truncate"
									>
										{task.title}
									</p>
								</div>
								<select
									bind:value={taskPhaseAssignments[task.id]}
									onchange={(e) =>
										handlePhaseChange(task.id, e.currentTarget.value)}
									class="px-3 py-1.5 text-sm bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
								>
									{#each sortedPhases as phase}
										{@const isPastPhase =
											phase.end_date && new Date(phase.end_date) < new Date()}
										<option
											value={phase.id}
											disabled={isPastPhase}
											class={isPastPhase ? 'text-muted-foreground' : ''}
										>
											{phase.name}
											{#if phase.start_date}
												<span class="text-xs text-muted-foreground">
													({new Date(phase.start_date).toLocaleDateString(
														'en-US',
														{
															month: 'short',
															day: 'numeric'
														}
													)})
												</span>
											{/if}
											{isPastPhase ? ' (Past)' : ''}
										</option>
									{/each}
								</select>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Info Box -->
			<div
				class="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
			>
				<div class="flex gap-2">
					<Info class="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
					<div class="text-sm text-blue-700 dark:text-blue-300">
						{#if selectedMethod === 'phases_only'}
							Tasks will be assigned to phases but remain unscheduled. You can
							schedule them later.
						{:else if selectedMethod === 'with_dates'}
							Tasks will be assigned dates based on their phase timeline.
						{:else if selectedMethod === 'with_calendar'}
							Tasks will be intelligently scheduled around your existing calendar
							events.
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div
			class="p-4 sm:p-5 md:p-6 border-t border-border bg-muted/50"
		>
			<div class="flex flex-col-reverse sm:flex-row gap-2 sm:gap-4 sm:justify-end">
				<Button
					onclick={handleClose}
					variant="outline"
					disabled={loading}
					class="w-full sm:w-auto"
				>
					Cancel
				</Button>
				<Button
					onclick={handleAssign}
					variant="primary"
					disabled={loading ||
						(!autoAssign && Object.keys(taskPhaseAssignments).length === 0)}
					{loading}
					class="w-full sm:w-auto"
				>
					{loading
						? 'Assigning...'
						: `Assign ${backlogTasks.length} Task${backlogTasks.length !== 1 ? 's' : ''}`}
				</Button>
			</div>
		</div>
	{/snippet}
</Modal>
