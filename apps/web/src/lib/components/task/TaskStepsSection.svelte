<!-- apps/web/src/lib/components/task/TaskStepsSection.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Brain, Plus, Edit3, Save, X, RefreshCw, CheckCircle, Clock } from 'lucide-svelte';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { Task, Project } from '$lib/types/project';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	export let task: Task;
	export let project: Project;

	const dispatch = createEventDispatcher();

	// Component state
	let isEditing = false;
	let isGenerating = false;
	let editableSteps = task.task_steps || '';

	// Reactive statements
	$: hasSteps = task.task_steps && task.task_steps.trim().length > 0;

	function startEditing() {
		isEditing = true;
		editableSteps = task.task_steps || '';
	}

	function cancelEditing() {
		isEditing = false;
		editableSteps = task.task_steps || '';
	}

	async function saveSteps() {
		// TODO: Implement save functionality
		console.log('Saving task steps:', editableSteps);

		// Placeholder for now - will implement API call later
		isEditing = false;
		dispatch('taskStepsUpdated');
	}

	async function generateSteps() {
		// TODO: Implement LLM generation
		console.log('Generating task steps for:', task.title);

		isGenerating = true;

		// Placeholder delay
		setTimeout(() => {
			editableSteps = `## Task Steps for: ${task.title}

### Prerequisites
- [ ] Review project context and requirements
- [ ] Ensure all dependencies are met
- [ ] Gather necessary resources and tools

### Implementation Steps
1. [ ] Break down the task into smaller components
2. [ ] Set up the development environment
3. [ ] Implement core functionality
4. [ ] Test the implementation
5. [ ] Review and refine

### Completion Criteria
- [ ] All functional requirements met
- [ ] Code reviewed and approved
- [ ] Documentation updated
- [ ] Testing completed successfully

### Next Actions
- [ ] Plan the first implementation step
- [ ] Schedule focused work time
- [ ] Identify any blockers or questions`;

			isGenerating = false;
			isEditing = true;
		}, 2000);
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex justify-between items-center">
		<div>
			<h2 class="text-lg font-semibold text-gray-900 dark:text-white">Task Steps</h2>
			<p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
				Break down this task into actionable steps and track progress
			</p>
		</div>

		{#if !isEditing}
			<div class="flex space-x-2">
				{#if hasSteps}
					<Button on:click={startEditing} variant="secondary" size="sm">
						<Edit3 class="w-4 h-4 mr-1.5" />
						Edit Steps
					</Button>
				{/if}

				<Button
					on:click={generateSteps}
					disabled={isGenerating}
					variant="primary"
					size="sm"
				>
					{#if isGenerating}
						<RefreshCw class="w-4 h-4 mr-1.5 animate-spin" />
						Generating...
					{:else}
						<Brain class="w-4 h-4 mr-1.5" />
						{hasSteps ? 'Regenerate' : 'Generate'} Steps
					{/if}
				</Button>
			</div>
		{:else}
			<div class="flex space-x-2">
				<Button on:click={cancelEditing} variant="ghost" size="sm">
					<X class="w-4 h-4 mr-1.5" />
					Cancel
				</Button>
				<Button on:click={saveSteps} variant="primary" size="sm">
					<Save class="w-4 h-4 mr-1.5" />
					Save Steps
				</Button>
			</div>
		{/if}
	</div>

	<!-- Content Area -->
	<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
		{#if isEditing}
			<!-- Edit Mode -->
			<div class="p-4">
				<Textarea
					bind:value={editableSteps}
					rows={20}
					size="md"
					placeholder="# Task Steps

## Prerequisites
- [ ] Item 1
- [ ] Item 2

## Implementation Steps
1. [ ] Step 1
2. [ ] Step 2
3. [ ] Step 3

## Completion Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Next Actions
- [ ] Next action 1
- [ ] Next action 2"
				/>

				<div
					class="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
				>
					<p class="text-sm text-blue-800 dark:text-blue-200">
						<strong>Tip:</strong> Use Markdown formatting with checkboxes (- [ ]) to create
						actionable task lists. You can organize steps into sections like Prerequisites,
						Implementation, and Completion Criteria.
					</p>
				</div>
			</div>
		{:else if hasSteps}
			<!-- Display Mode -->
			<div class="p-4">
				<div class="prose prose-sm dark:prose-invert max-w-none">
					{@html renderMarkdown(task.task_steps)}
				</div>
			</div>
		{:else if isGenerating}
			<!-- Generating State -->
			<div class="p-8 text-center">
				<RefreshCw
					class="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400 mx-auto mb-4"
				/>
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					Generating Task Steps
				</h3>
				<p class="text-gray-600 dark:text-gray-400">
					Analyzing the task and project context to create actionable steps...
				</p>
			</div>
		{:else}
			<!-- Empty State -->
			<div class="p-8 text-center">
				<Clock class="w-12 h-12 text-gray-400 mx-auto mb-4" />
				<h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
					No Task Steps Yet
				</h3>
				<p class="text-gray-600 dark:text-gray-400 mb-6">
					Break this task down into actionable steps to track your progress and stay
					organized.
				</p>

				<div class="space-y-3">
					<Button on:click={generateSteps} variant="primary" size="md">
						<Brain class="w-5 h-5 mr-2" />
						Generate Steps with AI
					</Button>

					<div class="text-sm text-gray-500 dark:text-gray-400">or</div>

					<Button on:click={startEditing} variant="secondary" size="md">
						<Plus class="w-5 h-5 mr-2" />
						Create Steps Manually
					</Button>
				</div>
			</div>
		{/if}
	</div>

	<!-- Context Information -->
	<div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
		<h4 class="text-sm font-medium text-gray-900 dark:text-white mb-2">
			Project Context Available for AI Generation
		</h4>
		<div class="text-sm text-gray-600 dark:text-gray-400 space-y-1">
			<div class="flex items-center space-x-2">
				<CheckCircle class="w-4 h-4 text-green-500" />
				<span>Task: "{task.title}"</span>
			</div>
			<div class="flex items-center space-x-2">
				<CheckCircle class="w-4 h-4 text-green-500" />
				<span>Project: "{project.name}"</span>
			</div>
			{#if task.description}
				<div class="flex items-center space-x-2">
					<CheckCircle class="w-4 h-4 text-green-500" />
					<span>Task description and requirements</span>
				</div>
			{/if}
			{#if project.context}
				<div class="flex items-center space-x-2">
					<CheckCircle class="w-4 h-4 text-green-500" />
					<span>Full project context and strategy</span>
				</div>
			{/if}
		</div>
	</div>
</div>
