<!-- apps/web/src/lib/components/ontology/TaskCreateModal.svelte -->
<!--
	Task Creation Modal Component

	Creates tasks within the BuildOS ontology system using a two-step flow:
	1. Template selection
	2. Task details entry

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/tasks/create/+server.ts
	- Edit Modal: /apps/web/src/lib/components/ontology/TaskEditModal.svelte
	- Base Modal: /apps/web/src/lib/components/ui/Modal.svelte
	- Form Modal: /apps/web/src/lib/components/ui/FormModal.svelte
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { ChevronRight, Loader, Save, CheckSquare, Sparkles } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import CardHeader from '$lib/components/ui/CardHeader.svelte';
	import CardBody from '$lib/components/ui/CardBody.svelte';
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { toastService } from '$lib/stores/toast.store';
	import { format } from 'date-fns';

	interface Props {
		projectId: string;
		plans?: Array<{ id: string; name: string }>;
		goals?: Array<{ id: string; name: string }>;
		milestones?: Array<{ id: string; title: string; due_at?: string }>;
		onClose: () => void;
		onCreated?: (taskId: string) => void;
	}

	let {
		projectId,
		plans = [],
		goals = [],
		milestones = [],
		onClose,
		onCreated
	}: Props = $props();

	let selectedTemplate = $state<any>(null);
	let templates = $state<any[]>([]);
	let isLoadingTemplates = $state(true);
	let templateError = $state('');
	let showTemplateSelection = $state(true);
	let isSaving = $state(false);
	let error = $state('');
	let slideDirection = $state<1 | -1>(1); // 1 = slide left, -1 = slide right

	// Form fields
	let title = $state('');
	let description = $state('');
	let priority = $state(3);
	let planId = $state('');
	let goalId = $state('');
	let milestoneId = $state('');
	let stateKey = $state('todo');
	let dueAt = $state('');

	// Template categories for better organization
	const templateCategories = $derived(
		templates.reduce((acc: Record<string, any[]>, template) => {
			const category = template.metadata?.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {})
	);

	// Load templates when modal opens (client-side only)
	$effect(() => {
		if (browser) {
			loadTemplates();
		}
	});

	async function loadTemplates() {
		try {
			isLoadingTemplates = true;
			const response = await fetch('/api/onto/templates?scope=task');
			if (!response.ok) throw new Error('Failed to load templates');

			const data = await response.json();
			templates = data.data?.templates || [];
			templateError = '';
		} catch (err) {
			console.error('Error loading templates:', err);
			templateError = 'Failed to load task templates';
		} finally {
			isLoadingTemplates = false;
		}
	}

	function selectTemplate(template: any) {
		selectedTemplate = template;
		// Pre-populate form fields with template defaults
		title = template.metadata?.name_pattern?.replace('{{project}}', 'Project') || '';
		stateKey = template.fsm?.initial || 'todo';
		slideDirection = 1;
		showTemplateSelection = false;
	}

	function formatDateTimeForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			// Format for HTML datetime-local input
			return format(dateObj, "yyyy-MM-dd'T'HH:mm");
		} catch (error) {
			console.warn('Failed to format datetime for input:', date, error);
			return '';
		}
	}

	function parseDateTimeFromInput(value: string): string | null {
		if (!value) return null;
		try {
			// The datetime-local input gives us a value in local time
			const date = new Date(value);
			if (isNaN(date.getTime())) return null;
			// Convert to ISO string for storage (UTC)
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse datetime from input:', value, error);
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
				type_key: selectedTemplate?.type_key || 'task.execute',
				title: title.trim(),
				description: description.trim() || null,
				priority: Number(priority),
				plan_id: planId || null,
				state_key: stateKey || 'todo',
				goal_id: goalId?.trim() || null,
				supporting_milestone_id: milestoneId?.trim() || null,
				due_at: parseDateTimeFromInput(dueAt),
				props: {
					description: description.trim() || null,
					...(selectedTemplate?.default_props || {})
				}
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

			// Success! Call the callback
			if (onCreated) {
				onCreated(result.data.task.id);
			}
			onClose();
		} catch (err) {
			console.error('Error creating task:', err);
			error = err instanceof Error ? err.message : 'Failed to create task';
			isSaving = false;
		}
	}

	function handleBack() {
		slideDirection = -1;
		showTemplateSelection = true;
		selectedTemplate = null;
		// Reset form
		title = '';
		description = '';
		priority = 3;
		planId = '';
		goalId = '';
		milestoneId = '';
		stateKey = 'todo';
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
		<!-- Custom gradient header - grey/dark grey -->
		<div
			class="flex-shrink-0 bg-gradient-to-r from-gray-600 via-gray-700 to-gray-800 dark:from-gray-700 dark:via-gray-800 dark:to-gray-900 text-white px-3 py-3 sm:px-6 sm:py-5 flex items-start justify-between gap-2 sm:gap-4 dither-gradient"
		>
			<div class="space-y-1 sm:space-y-2 min-w-0 flex-1">
				<p class="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.3em] sm:tracking-[0.4em] text-white/70">
					{showTemplateSelection ? 'New Task' : 'Task Details'}
				</p>
				<h2 class="text-lg sm:text-2xl font-bold leading-tight truncate">
					{showTemplateSelection ? 'Select a Template' : (title || 'Define your task')}
				</h2>
				{#if !showTemplateSelection && selectedTemplate}
					<div class="flex flex-wrap items-center gap-1.5 sm:gap-3 text-xs sm:text-sm">
						<span class="px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-white/20">{selectedTemplate.name}</span>
					</div>
				{/if}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onclick={handleClose}
				class="text-white/80 hover:text-white shrink-0 !p-1.5 sm:!p-2"
				disabled={isSaving}
			>
				<svg class="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					></path>
				</svg>
			</Button>
		</div>
	{/snippet}

	{#snippet children()}
	<div class="px-3 py-3 sm:px-6 sm:py-6">
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
						<div class="space-y-6">
							<!-- Header -->
							<div
								class="flex items-center gap-3 pb-4 border-b border-gray-200 dark:border-gray-700"
							>
								<div
									class="p-2 rounded bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/50 dark:to-purple-950/50 dither-soft"
								>
									<Sparkles class="w-5 h-5 text-accent-blue" />
								</div>
								<div>
									<h3 class="text-lg font-semibold text-gray-900 dark:text-white">
										Choose a Template
									</h3>
									<p class="text-sm text-gray-600 dark:text-gray-400">
										Select a task type to get started with the right structure
									</p>
								</div>
							</div>

							{#if isLoadingTemplates}
								<div class="flex items-center justify-center py-16">
									<Loader
										class="w-8 h-8 animate-spin text-gray-400 dark:text-gray-500"
									/>
								</div>
							{:else if templateError}
								<div class="text-center py-12">
									<p class="text-red-600 dark:text-red-400 mb-4">
										{templateError}
									</p>
									<Button variant="secondary" onclick={loadTemplates}
										>Try Again</Button
									>
								</div>
							{:else}
								<div class="space-y-6">
									{#each Object.entries(templateCategories) as [category, categoryTemplates]}
										<div>
											<h3
												class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2"
											>
												<span
													class="w-1.5 h-1.5 bg-accent-blue rounded-full"
												></span>
												{category}
											</h3>
											<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
												{#each categoryTemplates as template}
													<button
														type="button"
														onclick={() => selectTemplate(template)}
														class="card-industrial p-4 rounded text-left group hover:border-accent-orange transition-all duration-200"
													>
														<div
															class="flex items-start justify-between mb-2"
														>
															<h4
																class="font-semibold text-gray-900 dark:text-white group-hover:text-accent-blue transition-colors"
															>
																{template.name}
															</h4>
															<ChevronRight
																class="w-5 h-5 text-gray-400 group-hover:text-accent-blue flex-shrink-0 transition-transform group-hover:translate-x-0.5"
															/>
														</div>
														{#if template.metadata?.description}
															<p
																class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2"
															>
																{template.metadata.description}
															</p>
														{/if}
														{#if template.metadata?.typical_duration}
															<div
																class="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-surface-panel rounded"
															>
																<span
																	class="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide"
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

									{#if templates.length === 0}
										<div
											class="text-center py-12 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded"
										>
											<CheckSquare
												class="w-12 h-12 text-gray-400 mx-auto mb-3"
											/>
											<p class="text-sm text-gray-500 dark:text-gray-400">
												No task templates available
											</p>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{:else}
						<!-- TASK DETAILS FORM -->
						<form class="space-y-6" onsubmit={handleSubmit}>
							<!-- Selected Template Badge -->
							{#if selectedTemplate}
								<div
									class="rounded border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 dither-soft"
								>
									<div class="flex items-center justify-between gap-3">
										<div class="flex items-center gap-3 flex-1 min-w-0">
											<div
												class="p-2 rounded bg-surface-elevated shadow-subtle"
											>
												<CheckSquare class="w-4 h-4 text-accent-blue" />
											</div>
											<div class="flex-1 min-w-0">
												<h4
													class="text-sm font-semibold text-blue-900 dark:text-blue-100"
												>
													{selectedTemplate.name}
												</h4>
												{#if selectedTemplate.metadata?.description}
													<p
														class="text-xs text-blue-700 dark:text-blue-300 truncate"
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

								<FormField label="Initial State" labelFor="state" required={true}>
									<Select
										id="state"
										bind:value={stateKey}
										disabled={isSaving}
										size="md"
										placeholder="Select state"
									>
										<option value="todo">To Do</option>
										<option value="in_progress">In Progress</option>
										<option value="blocked">Blocked</option>
										<option value="done">Done</option>
										<option value="archived">Archived</option>
									</Select>
								</FormField>
							</div>

							<!-- Optional Associations -->
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
								{#if plans.length > 0}
									<FormField
										label="Plan"
										labelFor="plan"
										hint="Optional project plan"
									>
										<Select
											id="plan"
											bind:value={planId}
											disabled={isSaving}
											size="md"
											placeholder="No plan"
										>
											<option value="">No plan</option>
											{#each plans as plan}
												<option value={plan.id}>{plan.name}</option>
											{/each}
										</Select>
									</FormField>
								{/if}

								{#if goals.length > 0}
									<FormField
										label="Goal"
										labelFor="goal"
										hint="Link to a project goal"
									>
										<Select
											id="goal"
											bind:value={goalId}
											disabled={isSaving}
											size="md"
											placeholder="No goal"
										>
											<option value="">No goal</option>
											{#each goals as goal}
												<option value={goal.id}>{goal.name}</option>
											{/each}
										</Select>
									</FormField>
								{/if}

								{#if milestones.length > 0}
									<FormField
										label="Supporting Milestone"
										labelFor="milestone"
										hint="Connect to a milestone"
									>
										<Select
											id="milestone"
											bind:value={milestoneId}
											disabled={isSaving}
											size="md"
											placeholder="No milestone"
										>
											<option value="">No milestone</option>
											{#each milestones as milestone}
												<option value={milestone.id}>
													{milestone.title}
													{#if milestone.due_at}
														({new Date(
															milestone.due_at
														).toLocaleDateString()})
													{/if}
												</option>
											{/each}
										</Select>
									</FormField>
								{/if}
							</div>

							<!-- Scheduled Section -->
							<div
								class="border border-gray-200 dark:border-gray-700 rounded p-4 bg-surface-panel dither-soft"
							>
								<div class="flex items-center gap-2 mb-3">
									<span class="text-base">📅</span>
									<h3 class="text-sm font-semibold text-gray-900 dark:text-white">
										Scheduled
									</h3>
								</div>
								<FormField
									label="Due Date"
									labelFor="dueAt"
									hint="Optional deadline for this task"
								>
									<TextInput
										id="dueAt"
										type="datetime-local"
										bind:value={dueAt}
										disabled={isSaving}
										size="md"
										class="border-gray-200 dark:border-gray-600 bg-surface-elevated focus:ring-2 focus:ring-accent-orange"
									/>
								</FormField>
								{#if dueAt}
									<p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
										Due: {new Date(dueAt).toLocaleString('en-US', {
											weekday: 'short',
											month: 'short',
											day: 'numeric',
											hour: 'numeric',
											minute: '2-digit'
										})}
									</p>
								{/if}
							</div>

							{#if error}
								<div
									class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded"
								>
									<p class="text-sm text-red-700 dark:text-red-300">
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
			class="flex flex-row items-center justify-between gap-2 sm:gap-4 p-2 sm:p-6 border-t border-gray-200 dark:border-gray-700 bg-surface-panel dither-surface"
		>
			{#if showTemplateSelection}
				<div class="flex-1"></div>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onclick={handleClose}
					class="text-xs sm:text-sm px-2 sm:px-4"
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
					class="text-xs sm:text-sm px-2 sm:px-4"
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
						class="text-xs sm:text-sm px-2 sm:px-4"
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
						class="text-xs sm:text-sm px-2 sm:px-4"
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
