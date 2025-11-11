<!-- apps/web/src/lib/components/ontology/GoalReverseEngineerModal.svelte -->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import type {
		GoalReverseEngineeringResult,
		ReverseEngineeredMilestoneSpec,
		ReverseEngineeredTaskSpec
	} from '$lib/services/ontology/goal-reverse-engineering.service';

	type EditableTask = ReverseEngineeredTaskSpec & {
		tempId: string;
		state_key: string;
		priority?: number | null;
		description?: string | null;
	};

	type EditableMilestone = ReverseEngineeredMilestoneSpec & {
		tempId: string;
		due_at: string | null;
		summary?: string | null;
		tasks: EditableTask[];
	};

	type ApprovePayload = {
		milestones: Array<{
			title: string;
			due_at: string | null;
			summary: string | null;
			type_key?: string | null;
			confidence?: number | null;
			tasks: Array<{
				title: string;
				description: string | null;
				state_key: string;
				priority: number | null;
			}>;
		}>;
	};

	interface Props {
		open?: boolean;
		goalName?: string;
		preview: GoalReverseEngineeringResult | null;
		loading?: boolean;
		onApprove?: (payload: ApprovePayload) => void;
		onCancel?: () => void;
	}

	const TASK_STATES = ['todo', 'in_progress', 'done', 'blocked'];

	function generateId() {
		return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 11);
	}

	let {
		open = $bindable(false),
		goalName = '',
		preview = null,
		loading = false,
		onApprove,
		onCancel
	}: Props = $props();

	let editableMilestones = $state<EditableMilestone[]>([]);
	let reasoning = $state('');
	let errorMessage = $state<string | null>(null);

	$effect(() => {
		if (!preview) {
			editableMilestones = [];
			reasoning = '';
			return;
		}

		reasoning = preview.reasoning ?? '';
		editableMilestones = preview.milestones.map((milestone) => ({
			tempId: generateId(),
			title: milestone.title,
			summary: milestone.summary ?? '',
			type_key: milestone.type_key,
			confidence: milestone.confidence,
			due_at: milestone.due_date ?? null,
			target_window_days: milestone.target_window_days,
			tasks: (milestone.tasks ?? []).map((task) => ({
				tempId: generateId(),
				title: task.title,
				description: task.description ?? '',
				type_key: task.type_key,
				state_key: task.state_key ?? 'todo',
				priority: task.priority ?? null,
				effort_days: task.effort_days
			})) as EditableTask[]
		}));
		errorMessage = null;
	});

	function updateMilestoneField(
		id: string,
		field: keyof EditableMilestone,
		value: string | null
	) {
		editableMilestones = editableMilestones.map((milestone) =>
			milestone.tempId === id ? { ...milestone, [field]: value } : milestone
		);
	}

	function updateTaskField(
		milestoneId: string,
		taskId: string,
		field: keyof EditableTask,
		value: string | null
	) {
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			const updatedTasks = milestone.tasks.map((task) =>
				task.tempId === taskId ? { ...task, [field]: value } : task
			);
			return { ...milestone, tasks: updatedTasks };
		});
	}

	function addMilestone() {
		editableMilestones = [
			...editableMilestones,
			{
				tempId: generateId(),
				title: 'New milestone',
				summary: '',
				type_key: 'milestone.standard',
				confidence: null,
				due_at: null,
				tasks: []
			}
		];
	}

	function removeMilestone(id: string) {
		editableMilestones = editableMilestones.filter((milestone) => milestone.tempId !== id);
	}

	function addTask(milestoneId: string) {
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			return {
				...milestone,
				tasks: [
					...milestone.tasks,
					{
						tempId: generateId(),
						title: 'New task',
						description: '',
						type_key: 'task.basic',
						state_key: 'todo',
						priority: 3
					}
				]
			};
		});
	}

	function removeTask(milestoneId: string, taskId: string) {
		editableMilestones = editableMilestones.map((milestone) => {
			if (milestone.tempId !== milestoneId) return milestone;
			return {
				...milestone,
				tasks: milestone.tasks.filter((task) => task.tempId !== taskId)
			};
		});
	}

	function handleClose() {
		onCancel?.();
		open = false;
	}

	function handleApprove() {
		const sanitized = editableMilestones
			.map((milestone) => {
				const sanitizedTasks = milestone.tasks
					.map((task) => ({
						title: task.title.trim(),
						description: (task.description ?? '').trim() || null,
						state_key: task.state_key || 'todo',
						priority: typeof task.priority === 'number' ? task.priority : null
					}))
					.filter((task) => task.title.length > 0);

				return {
					title: milestone.title.trim() || 'Milestone',
					due_at: milestone.due_at ? milestone.due_at : null,
					summary: (milestone.summary ?? '').trim() || null,
					type_key: milestone.type_key ?? 'milestone.standard',
					confidence: milestone.confidence,
					tasks: sanitizedTasks
				};
			})
			.filter((milestone) => milestone.tasks.length > 0);

		if (!sanitized.length) {
			errorMessage = 'Add at least one task before approving.';
			return;
		}

		errorMessage = null;
		onApprove?.({ milestones: sanitized });
	}
</script>

<Modal bind:isOpen={open} size="xl" title={`Reverse engineer ${goalName}`} onClose={handleClose}>
	<!-- Main content wrapper with proper padding -->
	<div class="p-4 sm:p-6 space-y-4 sm:space-y-6">
		{#if reasoning}
			<div
				class="p-3 sm:p-4 rounded-lg bg-blue-50 text-sm text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
			>
				<strong class="block mb-1 font-semibold">Model reasoning</strong>
				<p class="whitespace-pre-wrap text-sm">{reasoning}</p>
			</div>
		{/if}

		<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
			<h4 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Milestones</h4>
			<Button variant="secondary" size="sm" onclick={addMilestone}>Add milestone</Button>
		</div>

		{#if editableMilestones.length === 0}
			<p class="text-sm text-gray-500 dark:text-gray-400">
				No milestones yet. Use the button above to add one.
			</p>
		{/if}

		<div class="space-y-4 max-h-[55vh] sm:max-h-[60vh] overflow-y-auto pr-2">
			{#each editableMilestones as milestone (milestone.tempId)}
				<div
					class="border border-gray-200 dark:border-gray-700 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4"
				>
					<div class="flex flex-col gap-3">
						<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
							Milestone title
							<input
								class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
								value={milestone.title}
								oninput={(event) =>
									updateMilestoneField(
										milestone.tempId,
										'title',
										event.currentTarget.value
									)}
							/>
						</label>
						<div class="flex flex-col sm:flex-row gap-3">
							<label
								class="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Due date
								<input
									type="date"
									class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
									value={milestone.due_at ?? ''}
									oninput={(event) =>
										updateMilestoneField(
											milestone.tempId,
											'due_at',
											event.currentTarget.value || null
										)}
								/>
							</label>
							<label
								class="flex-1 text-sm font-medium text-gray-700 dark:text-gray-300"
							>
								Type key
								<input
									class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-mono"
									value={milestone.type_key ?? ''}
									oninput={(event) =>
										updateMilestoneField(
											milestone.tempId,
											'type_key',
											event.currentTarget.value || null
										)}
								/>
							</label>
						</div>
						<label class="text-sm font-medium text-gray-700 dark:text-gray-300">
							Summary
							<Textarea
								class="mt-1"
								rows={3}
								value={milestone.summary ?? ''}
								oninput={(event) =>
									updateMilestoneField(
										milestone.tempId,
										'summary',
										event.currentTarget.value?.trim() || null
									)}
							/>
						</label>
					</div>

					<div
						class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
					>
						<h5 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
							Tasks ({milestone.tasks.length})
						</h5>
						<div class="flex gap-2 flex-wrap">
							<Button
								variant="secondary"
								size="sm"
								onclick={() => addTask(milestone.tempId)}
							>
								Add task
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onclick={() => removeMilestone(milestone.tempId)}
							>
								Remove milestone
							</Button>
						</div>
					</div>

					<div class="space-y-3">
						{#if milestone.tasks.length === 0}
							<p class="text-sm text-gray-500 dark:text-gray-400">No tasks yet.</p>
						{:else}
							{#each milestone.tasks as task (task.tempId)}
								<div
									class="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-3 space-y-3"
								>
									<div class="flex flex-col gap-2">
										<label
											class="text-sm font-medium text-gray-700 dark:text-gray-200"
										>
											Task title
											<input
												class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
												value={task.title}
												oninput={(event) =>
													updateTaskField(
														milestone.tempId,
														task.tempId,
														'title',
														event.currentTarget.value
													)}
											/>
										</label>
										<label
											class="text-sm font-medium text-gray-700 dark:text-gray-200"
										>
											Description
											<Textarea
												class="mt-1"
												rows={2}
												value={task.description ?? ''}
												oninput={(event) =>
													updateTaskField(
														milestone.tempId,
														task.tempId,
														'description',
														event.currentTarget.value?.toString() ?? ''
													)}
											/>
										</label>
									</div>
									<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
										<label
											class="text-sm font-medium text-gray-700 dark:text-gray-200"
										>
											State
											<select
												class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm capitalize"
												value={task.state_key}
												onchange={(event) =>
													updateTaskField(
														milestone.tempId,
														task.tempId,
														'state_key',
														event.currentTarget.value
													)}
											>
												{#each TASK_STATES as stateOption}
													<option value={stateOption}
														>{stateOption.replace('_', ' ')}</option
													>
												{/each}
											</select>
										</label>
										<label
											class="text-sm font-medium text-gray-700 dark:text-gray-200"
										>
											Priority
											<input
												type="number"
												min="1"
												max="5"
												class="w-full mt-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
												value={task.priority ?? ''}
												oninput={(event) =>
													updateTaskField(
														milestone.tempId,
														task.tempId,
														'priority',
														event.currentTarget.value
													)}
											/>
										</label>
										<div class="flex items-end">
											<Button
												variant="ghost"
												size="sm"
												fullWidth
												onclick={() =>
													removeTask(milestone.tempId, task.tempId)}
											>
												Remove task
											</Button>
										</div>
									</div>
								</div>
							{/each}
						{/if}
					</div>
				</div>
			{/each}
		</div>

		{#if errorMessage}
			<p class="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
		{/if}
	</div>

	<div slot="footer" class="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 p-4 sm:p-6">
		<Button variant="ghost" onclick={handleClose} disabled={loading}>Cancel</Button>
		<Button variant="primary" onclick={handleApprove} {loading}>Approve & Create</Button>
	</div>
</Modal>
