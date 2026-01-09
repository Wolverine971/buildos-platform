<!-- apps/web/src/lib/components/ontology/TaskCreateModal.svelte -->
<!--
	Task Creation Modal Component (Auto-Classified)
	Creates tasks without type selection; type_key is classified after creation.

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/tasks/create/+server.ts
-->
<script lang="ts">
	import { ChevronRight, Save, CheckSquare, ListChecks } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { format } from 'date-fns';
	import { TASK_STATES } from '$lib/types/onto';
	import { logOntologyClientError } from '$lib/utils/ontology-client-logger';

	// Hardcoded task types (templates removed)
	interface TaskType {
		id: string;
		name: string;
		type_key: string;
		metadata: {
			category: string;
			description: string;
			typical_duration?: string;
		};
	}

	const TASK_TYPES: TaskType[] = [
		{
			id: 'execute',
			name: 'Execute Task',
			type_key: 'task.execute',
			metadata: {
				category: 'Execution',
				description: 'Standard actionable task to complete',
				typical_duration: '1-4 hours'
			}
		},
		{
			id: 'review',
			name: 'Review Task',
			type_key: 'task.review',
			metadata: {
				category: 'Review',
				description: 'Review or approve work from others',
				typical_duration: '30-60 min'
			}
		},
		{
			id: 'research',
			name: 'Research Task',
			type_key: 'task.research',
			metadata: {
				category: 'Research',
				description: 'Investigate or gather information',
				typical_duration: '2-8 hours'
			}
		},
		{
			id: 'plan',
			name: 'Planning Task',
			type_key: 'task.plan',
			metadata: {
				category: 'Planning',
				description: 'Plan, organize, or coordinate work',
				typical_duration: '1-2 hours'
			}
		},
		{
			id: 'meeting',
			name: 'Meeting',
			type_key: 'task.coordinate.meeting',
			metadata: {
				category: 'Collaboration',
				description: 'Scheduled meeting or discussion',
				typical_duration: '30-60 min'
			}
		}
	];

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (taskId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

	let selectedTemplate = $state<TaskType | null>(null);
	let showTemplateSelection = $state(false);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1);

	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state(3);
	let stateKey = $state('todo');
	let startAt = $state('');
	let dueAt = $state('');

	// Group types by category
	const templateCategories = $derived(
		TASK_TYPES.reduce((acc: Record<string, TaskType[]>, template) => {
			const category = template.metadata.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {})
	);

	function selectTemplate(template: TaskType) {
		selectedTemplate = template;
		title = '';
		stateKey = 'todo';
		slideDirection = 1;
		showTemplateSelection = false;
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch (err) {
			console.warn('Failed to parse datetime from input:', value, err);
			return null;
		}
	}

	async function handleSubmit(e: Event): Promise<void> {
		e.preventDefault();

		if (!title.trim()) {
			error = 'Task title is required';
			return;
		}

		isSaving = true;
		error = '';

		try {
			const requestBody = {
				project_id: projectId,
				title: title.trim(),
				description: description.trim() || null,
				priority: Number(priority),
				state_key: stateKey || 'todo',
				start_at: parseDateTimeFromInput(startAt),
				due_at: parseDateTimeFromInput(dueAt),
				classification_source: 'create_modal'
			};

			const response = await fetch('/api/onto/tasks/create', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(requestBody)
			});

			const result = await response.json();

			if (!response.ok) {
				throw new Error(result.error || 'Failed to create task');
			}

			if (onCreated) {
				onCreated(result.data.task.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating task:', err);
			void logOntologyClientError(err, {
				endpoint: '/api/onto/tasks/create',
				method: 'POST',
				projectId,
				entityType: 'task',
				operation: 'task_create'
			});
			error = err instanceof Error ? err.message : 'Failed to create task';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTemplateSelection = true;
		selectedTemplate = null;
		title = '';
		description = '';
		priority = 3;
		stateKey = 'todo';
		startAt = '';
		dueAt = '';
		error = '';
	}

	function handleClose() {
		onClose();
	}
</script>

<Modal
	isOpen={true}
	onClose={handleClose}
	size="xl"
	closeOnEscape={!isSaving}
	showCloseButton={false}
>
	{#snippet header()}
		<!-- Compact Inkprint header -->
		<div
			class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak"
		>
			<div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
				<div
					class="flex h-9 w-9 items-center justify-center rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0"
				>
					<ListChecks class="w-5 h-5" />
				</div>
				<div class="min-w-0 flex-1">
					<h2
						class="text-sm sm:text-base font-semibold leading-tight truncate text-foreground"
					>
						{title || 'New Task'}
					</h2>
					<p class="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
						Type will be auto-classified
					</p>
				</div>
			</div>
			<button
				type="button"
				onclick={handleClose}
				disabled={isSaving}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:hover:border-red-400/50 dark:hover:text-red-400 tx tx-grain tx-weak"
				aria-label="Close modal"
			>
				<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</button>
		</div>
	{/snippet}

	{#snippet children()}
		<div class="px-2 py-2 sm:px-6 sm:py-4">
			<!-- Horizontal Slide Animation Between Views -->
			<div class="relative overflow-hidden" style="min-height: 400px;">
				{#key showTemplateSelection}
					<div
						in:fly={{ x: slideDirection * 100, duration: 300, easing: cubicOut }}
						out:fly={{ x: slideDirection * -100, duration: 300, easing: cubicOut }}
						class="absolute inset-0 overflow-y-auto"
					>
						{#if showTemplateSelection}
							<!-- TEMPLATE SELECTION VIEW -->
							<div class="space-y-3 sm:space-y-4">
								<!-- Header -->
								<div class="flex items-center gap-3 pb-4 border-b border-border">
									<div class="p-2 rounded bg-muted tx tx-bloom tx-weak">
										<ListChecks class="w-5 h-5 text-accent" />
									</div>
									<div>
										<h3 class="text-lg font-semibold text-foreground">
											Choose a Task Type
										</h3>
										<p class="text-sm text-muted-foreground">
											Select a task type to get started with the right
											structure
										</p>
									</div>
								</div>

								<div class="space-y-4 sm:space-y-6">
									{#each Object.entries(templateCategories) as [category, categoryTemplates]}
										<div>
											<h3
												class="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2"
											>
												<span class="w-1.5 h-1.5 bg-accent rounded-full"
												></span>
												{category}
											</h3>
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{#each categoryTemplates as template}
													<button
														type="button"
														onclick={() => selectTemplate(template)}
														class="bg-card border border-border p-2.5 sm:p-4 rounded-lg text-left group hover:border-accent shadow-ink transition-all duration-200"
													>
														<div
															class="flex items-start justify-between mb-2"
														>
															<h4
																class="font-semibold text-foreground group-hover:text-accent transition-colors"
															>
																{template.name}
															</h4>
															<ChevronRight
																class="w-5 h-5 text-muted-foreground group-hover:text-accent flex-shrink-0 transition-transform group-hover:translate-x-0.5"
															/>
														</div>
														{#if template.metadata?.description}
															<p
																class="text-sm text-muted-foreground line-clamp-2 mb-2"
															>
																{template.metadata.description}
															</p>
														{/if}
														{#if template.metadata?.typical_duration}
															<div
																class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-muted rounded"
															>
																<span
																	class="text-xs font-semibold text-foreground uppercase tracking-wide"
																>
																	{template.metadata
																		.typical_duration}
																</span>
															</div>
														{/if}
													</button>
												{/each}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<!-- TASK DETAILS FORM -->
							<form class="space-y-3 sm:space-y-4" onsubmit={handleSubmit}>
								<!-- Selected Template Badge -->
								{#if selectedTemplate}
									<div
										class="rounded-lg border border-border bg-muted/30 p-2.5 sm:p-4 tx tx-grain tx-weak"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="flex items-center gap-3 flex-1 min-w-0">
												<div class="p-2 rounded bg-card shadow-ink">
													<CheckSquare class="w-4 h-4 text-accent" />
												</div>
												<div class="flex-1 min-w-0">
													<h4
														class="text-sm font-semibold text-foreground"
													>
														{selectedTemplate.name}
													</h4>
													{#if selectedTemplate.metadata?.description}
														<p
															class="text-xs text-muted-foreground truncate"
														>
															{selectedTemplate.metadata.description}
														</p>
													{/if}
												</div>
											</div>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												onclick={handleBack}
												class="shrink-0"
											>
												Change
											</Button>
										</div>
									</div>
								{/if}

								<!-- Task Title -->
								<FormField
									label="Task Title"
									labelFor="title"
									required={true}
									error={!title.trim() && error ? 'Task title is required' : ''}
								>
									<TextInput
										id="title"
										bind:value={title}
										placeholder="Enter task title..."
										inputmode="text"
										enterkeyhint="next"
										required={true}
										disabled={isSaving}
										error={!title.trim() && error ? true : false}
										size="md"
									/>
								</FormField>

								<!-- Description -->
								<FormField
									label="Description"
									labelFor="description"
									hint="Provide additional context about this task"
								>
									<Textarea
										id="description"
										bind:value={description}
										placeholder="Describe the task..."
										enterkeyhint="next"
										rows={4}
										disabled={isSaving}
										size="md"
									/>
								</FormField>

								<!-- Priority & State Grid -->
								<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
									<FormField label="Priority" labelFor="priority" required={true}>
										<Select
											id="priority"
											bind:value={priority}
											disabled={isSaving}
											size="md"
											placeholder="Select priority"
										>
											<option value={1}>P1 - Critical</option>
											<option value={2}>P2 - High</option>
											<option value={3}>P3 - Medium</option>
											<option value={4}>P4 - Low</option>
											<option value={5}>P5 - Nice to have</option>
										</Select>
									</FormField>

									<FormField
										label="Initial State"
										labelFor="state"
										required={true}
									>
										<Select
											id="state"
											bind:value={stateKey}
											disabled={isSaving}
											size="md"
											placeholder="Select state"
										>
											{#each TASK_STATES as state}
												<option value={state}>
													{state === 'todo'
														? 'To Do'
														: state === 'in_progress'
															? 'In Progress'
															: state === 'blocked'
																? 'Blocked'
																: state === 'done'
																	? 'Done'
																	: state}
												</option>
											{/each}
										</Select>
									</FormField>
								</div>

								<!-- Scheduled Section -->
								<div
									class="border border-border rounded-lg p-2.5 sm:p-4 bg-muted/30 tx tx-frame tx-weak"
								>
									<div class="flex items-center gap-2 mb-3">
										<span class="text-base">📅</span>
										<h3 class="text-sm font-semibold text-foreground">
											Scheduled
										</h3>
									</div>
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<FormField
											label="Start Date"
											labelFor="startAt"
											hint="When work should begin"
										>
											<TextInput
												id="startAt"
												type="datetime-local"
												bind:value={startAt}
												disabled={isSaving}
												size="md"
											/>
										</FormField>
										<FormField
											label="Due Date"
											labelFor="dueAt"
											hint="Deadline for this task"
										>
											<TextInput
												id="dueAt"
												type="datetime-local"
												bind:value={dueAt}
												disabled={isSaving}
												size="md"
											/>
										</FormField>
									</div>
									{#if startAt || dueAt}
										<div
											class="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground"
										>
											{#if startAt}
												<span>
													Start: {new Date(startAt).toLocaleString(
														'en-US',
														{
															weekday: 'short',
															month: 'short',
															day: 'numeric',
															hour: 'numeric',
															minute: '2-digit'
														}
													)}
												</span>
											{/if}
											{#if dueAt}
												<span>
													Due: {new Date(dueAt).toLocaleString('en-US', {
														weekday: 'short',
														month: 'short',
														day: 'numeric',
														hour: 'numeric',
														minute: '2-digit'
													})}
												</span>
											{/if}
										</div>
									{/if}
								</div>

								{#if error}
									<div
										class="p-4 bg-destructive/10 border border-destructive/30 rounded-lg"
									>
										<p class="text-sm text-destructive">
											{error}
										</p>
									</div>
								{/if}
							</form>
						{/if}
					</div>
				{/key}
			</div>
		</div>
	{/snippet}

	<!-- Footer Actions - buttons on one row, smaller on mobile -->
	{#snippet footer()}
		<div
			class="flex flex-row items-center justify-between gap-2 sm:gap-3 px-2 py-2 sm:px-4 sm:py-3 border-t border-border bg-muted/30 tx tx-grain tx-weak"
		>
			{#if showTemplateSelection}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					Cancel
				</Button>
			{:else}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleBack}
					disabled={isSaving}
					class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
				>
					<span class="hidden sm:inline">← Back</span>
					<span class="sm:hidden">←</span>
				</Button>
				<div class="flex flex-row items-center gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onclick={handleClose}
						disabled={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						size="sm"
						disabled={isSaving || !title.trim()}
						onclick={handleSubmit}
						loading={isSaving}
						class="text-xs sm:text-sm px-2 sm:px-4 tx tx-grain tx-weak"
					>
						<Save class="w-3 h-3 sm:w-4 sm:h-4" />
						<span class="hidden sm:inline">Create Task</span>
						<span class="sm:hidden">Create</span>
					</Button>
				</div>
			{/if}
		</div>
	{/snippet}
</Modal>
