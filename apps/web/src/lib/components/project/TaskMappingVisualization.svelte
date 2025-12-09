<!-- apps/web/src/lib/components/project/TaskMappingVisualization.svelte -->
<script lang="ts">
	import type { ParsedOperation } from '$lib/types/brain-dump';
	import {
		ArrowRight,
		Archive,
		Plus,
		GitMerge,
		AlertTriangle,
		CheckCircle,
		Clock,
		Flag
	} from 'lucide-svelte';

	export let operations: ParsedOperation[];
	export let tasks: any[];
	export let comparison: any[];

	// Group operations by type for clearer visualization
	$: updateOperations = operations.filter((op) => op.operation === 'update');
	$: createOperations = operations.filter((op) => op.operation === 'create');
	$: deleteOperations = operations.filter((op) => op.operation === 'delete');

	function getTaskById(taskId: string) {
		return tasks.find((t) => t.id === taskId);
	}

	function getOperationsByTaskId(taskId: string) {
		return operations.filter(
			(op) =>
				op.data.id === taskId ||
				op.data.parent_task_id === taskId ||
				(op.reasoning && op.reasoning.includes(taskId))
		);
	}

	function getConsolidationMappings() {
		const mappings = [];

		// From comparison data
		comparison.forEach((comp) => {
			if (comp.type === 'consolidated' && comp.originalTasks && comp.newTask) {
				mappings.push({
					type: 'consolidation',
					originalTasks: comp.originalTasks.map((id) => getTaskById(id)).filter(Boolean),
					newTask: comp.newTask,
					reasoning: comp.reasoning,
					operation: updateOperations.find((op) =>
						comp.originalTasks.includes(op.data.id)
					)
				});
			}
		});

		// From update operations that consolidate
		updateOperations.forEach((op) => {
			if (op.reasoning && op.reasoning.toLowerCase().includes('consolidat')) {
				const existingMapping = mappings.find((m) => m.operation?.id === op.id);
				if (!existingMapping) {
					const originalTask = getTaskById(op.data.id);
					if (originalTask) {
						mappings.push({
							type: 'update',
							originalTasks: [originalTask],
							newTask: {
								title: op.data.title || originalTask.title,
								description: op.data.description || originalTask.description,
								status: op.data.status || originalTask.status,
								priority: op.data.priority || originalTask.priority
							},
							reasoning: op.reasoning,
							operation: op
						});
					}
				}
			}
		});

		return mappings;
	}

	function getDeletedTasks() {
		const deletedOps = updateOperations.filter((op) => op.data.deleted_at);
		return deletedOps
			.map((op) => ({
				task: getTaskById(op.data.id),
				reasoning: op.reasoning,
				operation: op
			}))
			.filter((item) => item.task);
	}

	function getNewTasks() {
		return createOperations.map((op) => ({
			newTask: {
				title: op.data.title,
				description: op.data.description,
				status: op.data.status,
				priority: op.data.priority,
				task_type: op.data.task_type
			},
			reasoning: op.reasoning,
			operation: op
		}));
	}

	$: consolidationMappings = getConsolidationMappings();
	$: deletedTasks = getDeletedTasks();
	$: newTasks = getNewTasks();

	function getPriorityIcon(priority: string) {
		return Flag;
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'done':
				return CheckCircle;
			case 'in_progress':
				return Clock;
			case 'blocked':
				return AlertTriangle;
			default:
				return Clock;
		}
	}
</script>

<div class="space-y-8">
	<!-- Header -->
	<div class="text-center">
		<h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
			Task Synthesis Mapping
		</h3>
		<p class="text-sm text-gray-600 dark:text-gray-400">
			Visual representation of how your tasks will be transformed
		</p>
	</div>

	<!-- Summary Stats -->
	{#if consolidationMappings.length > 0 || newTasks.length > 0 || deletedTasks.length > 0}
		<div class="grid grid-cols-3 gap-4 mb-6">
			<div
				class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center"
			>
				<div class="text-2xl font-bold text-blue-600 dark:text-blue-400">
					{consolidationMappings.length}
				</div>
				<div class="text-xs text-blue-700 dark:text-blue-300">Consolidations</div>
			</div>
			<div
				class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center"
			>
				<div class="text-2xl font-bold text-green-600 dark:text-green-400">
					{newTasks.length}
				</div>
				<div class="text-xs text-green-700 dark:text-green-300">New Tasks</div>
			</div>
			<div
				class="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 text-center"
			>
				<div class="text-2xl font-bold text-orange-600 dark:text-orange-400">
					{deletedTasks.length}
				</div>
				<div class="text-xs text-orange-700 dark:text-orange-300">To Delete</div>
			</div>
		</div>
	{/if}

	<!-- Consolidations/Updates -->
	{#if consolidationMappings.length > 0}
		<div class="space-y-6">
			<h4 class="text-md font-medium text-gray-900 dark:text-white flex items-center">
				<GitMerge class="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
				Task Consolidations & Updates
			</h4>

			{#each consolidationMappings as mapping}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden"
				>
					<div
						class="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 px-6 py-2 border-b border-blue-200 dark:border-blue-800"
					>
						<span
							class="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase tracking-wider"
						>
							{mapping.type === 'consolidation' ? 'Consolidation' : 'Update'}
						</span>
					</div>

					<div class="p-6">
						<div class="grid md:grid-cols-11 gap-4 items-center">
							<!-- Original Tasks (Left - 4 cols) -->
							<div class="md:col-span-4 space-y-3">
								<h5
									class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
								>
									Original Task{mapping.originalTasks.length > 1 ? 's' : ''}
								</h5>
								{#each mapping.originalTasks as task}
									<div
										class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
									>
										<div class="flex items-start justify-between gap-2 mb-2">
											<h6
												class="font-medium text-gray-900 dark:text-gray-100 text-sm flex-1"
											>
												{task.title}
											</h6>
											<div class="flex items-center gap-1">
												{#if task.priority === 'high'}
													<Flag
														class="w-3 h-3 text-red-500 dark:text-red-400"
													/>
												{:else if task.priority === 'medium'}
													<Flag
														class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
													/>
												{:else}
													<Flag
														class="w-3 h-3 text-gray-400 dark:text-gray-500"
													/>
												{/if}
											</div>
										</div>
										{#if task.description}
											<p
												class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
											>
												{task.description}
											</p>
										{/if}
										<div class="flex items-center justify-between">
											<div class="flex items-center gap-1">
												{@const Status = getStatusIcon(task.status)}
												<Status
													class="w-3 h-3 {task.status === 'done'
														? 'text-green-600 dark:text-green-400'
														: task.status === 'in_progress'
															? 'text-blue-600 dark:text-blue-400'
															: task.status === 'blocked'
																? 'text-red-600 dark:text-red-400'
																: 'text-gray-500 dark:text-gray-400'}"
												/>
												<span
													class="text-xs text-gray-600 dark:text-gray-400"
												>
													{task.status.replace('_', ' ')}
												</span>
											</div>
											<span
												class="text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded"
											>
												{task.task_type?.replace('_', ' ')}
											</span>
										</div>
									</div>
								{/each}
							</div>

							<!-- Arrow (Center - 3 cols) -->
							<div class="md:col-span-3 flex justify-center py-4">
								<div class="flex flex-col items-center">
									<div
										class="p-3 bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-800 dark:to-blue-700 rounded-full mb-2"
									>
										<ArrowRight
											class="w-6 h-6 text-blue-700 dark:text-blue-200"
										/>
									</div>
									<span
										class="text-xs font-medium text-gray-600 dark:text-gray-400 text-center"
									>
										{mapping.type === 'consolidation'
											? 'Merge Into'
											: 'Transform To'}
									</span>
								</div>
							</div>

							<!-- New Task (Right - 4 cols) -->
							<div class="md:col-span-4">
								<h5
									class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
								>
									Updated Task
								</h5>
								<div
									class="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 shadow-sm"
								>
									<div class="flex items-start justify-between gap-2 mb-2">
										<h6
											class="font-medium text-gray-900 dark:text-gray-100 text-sm flex-1"
										>
											{mapping.newTask.title}
										</h6>
										<div class="flex items-center gap-1">
											{#if mapping.newTask.priority === 'high'}
												<Flag
													class="w-3 h-3 text-red-500 dark:text-red-400"
												/>
											{:else if mapping.newTask.priority === 'medium'}
												<Flag
													class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
												/>
											{:else}
												<Flag
													class="w-3 h-3 text-gray-400 dark:text-gray-500"
												/>
											{/if}
										</div>
									</div>
									{#if mapping.newTask.description}
										<p
											class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
										>
											{mapping.newTask.description}
										</p>
									{/if}
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1">
											{@const Status = getStatusIcon(mapping.newTask.status)}
											<Status
												class="w-3 h-3 {mapping.newTask.status === 'done'
													? 'text-green-600 dark:text-green-400'
													: mapping.newTask.status === 'in_progress'
														? 'text-blue-600 dark:text-blue-400'
														: mapping.newTask.status === 'blocked'
															? 'text-red-600 dark:text-red-400'
															: 'text-gray-500 dark:text-gray-400'}"
											/>
											<span class="text-xs text-gray-600 dark:text-gray-400">
												{mapping.newTask.status?.replace('_', ' ')}
											</span>
										</div>
										<span
											class="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded"
										>
											Updated
										</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Reasoning -->
						{#if mapping.reasoning}
							<div
								class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
							>
								<p class="text-xs text-blue-800 dark:text-blue-200">
									<span class="font-semibold">Reasoning:</span>
									{mapping.reasoning}
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- New Tasks -->
	{#if newTasks.length > 0}
		<div class="space-y-6">
			<h4 class="text-md font-medium text-gray-900 dark:text-white flex items-center">
				<Plus class="w-5 h-5 mr-2 text-green-600 dark:text-green-400" />
				New Tasks to Create
			</h4>

			{#each newTasks as newTaskItem}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden"
				>
					<div
						class="bg-gradient-to-r from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 px-6 py-2 border-b border-green-200 dark:border-green-800"
					>
						<span
							class="text-xs font-medium text-green-700 dark:text-green-300 uppercase tracking-wider"
						>
							New Task Creation
						</span>
					</div>

					<div class="p-6">
						<div class="grid md:grid-cols-11 gap-4 items-center">
							<!-- Empty Left (No original task - 4 cols) -->
							<div class="md:col-span-4 flex items-center justify-center">
								<div class="text-center p-8">
									<div
										class="w-20 h-20 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center mb-2 mx-auto"
									>
										<AlertTriangle
											class="w-8 h-8 text-gray-300 dark:text-gray-600"
										/>
									</div>
									<span class="text-xs text-gray-500 dark:text-gray-400"
										>Gap Identified</span
									>
								</div>
							</div>

							<!-- Arrow (Center - 3 cols) -->
							<div class="md:col-span-3 flex justify-center py-4">
								<div class="flex flex-col items-center">
									<div
										class="p-3 bg-gradient-to-br from-green-100 to-green-200 dark:from-green-800 dark:to-green-700 rounded-full mb-2"
									>
										<Plus class="w-6 h-6 text-green-700 dark:text-green-200" />
									</div>
									<span
										class="text-xs font-medium text-gray-600 dark:text-gray-400"
									>
										Fill Gap
									</span>
								</div>
							</div>

							<!-- New Task (Right - 4 cols) -->
							<div class="md:col-span-4">
								<h5
									class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
								>
									New Task
								</h5>
								<div
									class="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 shadow-sm"
								>
									<div class="flex items-start justify-between gap-2 mb-2">
										<h6
											class="font-medium text-gray-900 dark:text-gray-100 text-sm flex-1"
										>
											{newTaskItem.newTask.title}
										</h6>
										<div class="flex items-center gap-1">
											{#if newTaskItem.newTask.priority === 'high'}
												<Flag
													class="w-3 h-3 text-red-500 dark:text-red-400"
												/>
											{:else if newTaskItem.newTask.priority === 'medium'}
												<Flag
													class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
												/>
											{:else}
												<Flag
													class="w-3 h-3 text-gray-400 dark:text-gray-500"
												/>
											{/if}
										</div>
									</div>
									{#if newTaskItem.newTask.description}
										<p
											class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
										>
											{newTaskItem.newTask.description}
										</p>
									{/if}
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1">
											{@const Status = getStatusIcon(
												newTaskItem.newTask.status
											)}
											<Status
												class="w-3 h-3 text-gray-500 dark:text-gray-400"
											/>
											<span class="text-xs text-gray-600 dark:text-gray-400">
												{newTaskItem.newTask.status?.replace('_', ' ')}
											</span>
										</div>
										<span
											class="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded"
										>
											New
										</span>
									</div>
								</div>
							</div>
						</div>

						<!-- Reasoning -->
						{#if newTaskItem.reasoning}
							<div
								class="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg"
							>
								<p class="text-xs text-green-800 dark:text-green-200">
									<span class="font-semibold">Reasoning:</span>
									{newTaskItem.reasoning}
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Deleted Tasks -->
	{#if deletedTasks.length > 0}
		<div class="space-y-6">
			<h4 class="text-md font-medium text-gray-900 dark:text-white flex items-center">
				<Archive class="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
				Tasks to Delete
			</h4>

			{#each deletedTasks as deletedItem}
				<div
					class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden"
				>
					<div
						class="bg-gradient-to-r from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 px-6 py-2 border-b border-orange-200 dark:border-orange-800"
					>
						<span
							class="text-xs font-medium text-orange-700 dark:text-orange-300 uppercase tracking-wider"
						>
							Mark as Outdated
						</span>
					</div>

					<div class="p-6">
						<div class="grid md:grid-cols-11 gap-4 items-center">
							<!-- Original Task (Left - 4 cols) -->
							<div class="md:col-span-4">
								<h5
									class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3"
								>
									Current Task
								</h5>
								<div
									class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
								>
									<div class="flex items-start justify-between gap-2 mb-2">
										<h6
											class="font-medium text-gray-900 dark:text-gray-100 text-sm flex-1"
										>
											{deletedItem.task.title}
										</h6>
										<div class="flex items-center gap-1">
											{#if deletedItem.task.priority === 'high'}
												<Flag
													class="w-3 h-3 text-red-500 dark:text-red-400"
												/>
											{:else if deletedItem.task.priority === 'medium'}
												<Flag
													class="w-3 h-3 text-yellow-500 dark:text-yellow-400"
												/>
											{:else}
												<Flag
													class="w-3 h-3 text-gray-400 dark:text-gray-500"
												/>
											{/if}
										</div>
									</div>
									{#if deletedItem.task.description}
										<p
											class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-3"
										>
											{deletedItem.task.description}
										</p>
									{/if}
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-1">
											{@const Status = getStatusIcon(deletedItem.task.status)}
											<Status
												class="w-3 h-3 {deletedItem.task.status === 'done'
													? 'text-green-600 dark:text-green-400'
													: deletedItem.task.status === 'in_progress'
														? 'text-blue-600 dark:text-blue-400'
														: deletedItem.task.status === 'blocked'
															? 'text-red-600 dark:text-red-400'
															: 'text-gray-500 dark:text-gray-400'}"
											/>
											<span class="text-xs text-gray-600 dark:text-gray-400">
												{deletedItem.task.status?.replace('_', ' ')}
											</span>
										</div>
										<span
											class="text-xs text-gray-500 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded"
										>
											{deletedItem.task.task_type?.replace('_', ' ')}
										</span>
									</div>
								</div>
							</div>

							<!-- Arrow (Center - 3 cols) -->
							<div class="md:col-span-3 flex justify-center py-4">
								<div class="flex flex-col items-center">
									<div
										class="p-3 bg-gradient-to-br from-orange-100 to-orange-200 dark:from-orange-800 dark:to-orange-700 rounded-full mb-2"
									>
										<Archive
											class="w-6 h-6 text-orange-700 dark:text-orange-200"
										/>
									</div>
									<span
										class="text-xs font-medium text-gray-600 dark:text-gray-400"
									>
										Archive
									</span>
								</div>
							</div>

							<!-- Result (Right - 4 cols) -->
							<div class="md:col-span-4 flex items-center justify-center">
								<div class="text-center p-8">
									<div
										class="w-20 h-20 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg flex items-center justify-center mb-2 mx-auto"
									>
										<Archive
											class="w-10 h-10 text-orange-500 dark:text-orange-400"
										/>
									</div>
									<span
										class="text-xs font-medium text-orange-700 dark:text-orange-300"
									>
										Archived
									</span>
									<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
										No longer relevant
									</p>
								</div>
							</div>
						</div>

						<!-- Reasoning -->
						{#if deletedItem.reasoning}
							<div
								class="mt-4 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg"
							>
								<p class="text-xs text-orange-800 dark:text-orange-200">
									<span class="font-semibold">Reasoning:</span>
									{deletedItem.reasoning}
								</p>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Empty State -->
	{#if consolidationMappings.length === 0 && newTasks.length === 0 && deletedTasks.length === 0}
		<div class="text-center py-12">
			<div
				class="bg-gray-50 dark:bg-gray-800 rounded-xl p-8 border border-gray-200 dark:border-gray-700"
			>
				<AlertTriangle class="w-12 h-12 mx-auto mb-4 text-gray-400 dark:text-gray-500" />
				<p class="text-gray-600 dark:text-gray-400 font-medium">
					No task transformations found
				</p>
				<p class="text-sm text-gray-500 dark:text-gray-500 mt-2">
					The synthesis didn't identify any changes needed for your tasks
				</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.line-clamp-2 {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Smooth transitions for hover effects */
	:global(.dark) {
		color-scheme: dark;
	}
</style>
