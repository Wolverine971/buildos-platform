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
	- Base Modal: /apps/web/src/lib/components/ui/FormModal.svelte
-->
<script lang="ts">
	import { ChevronRight, Loader } from 'lucide-svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { FormConfig } from '$lib/types/form';

	interface Props {
		projectId: string;
		plans?: Array<{ id: string; name: string }>;
		onClose: () => void;
		onCreated?: (taskId: string) => void;
	}

	let { projectId, plans = [], onClose, onCreated }: Props = $props();

	let selectedTemplate = $state<any>(null);
	let templates = $state<any[]>([]);
	let isLoadingTemplates = $state(true);
	let templateError = $state('');
	let showTemplateSelection = $state(true);

	// Template categories for better organization
	const templateCategories = $derived(
		templates.reduce((acc: Record<string, any[]>, template) => {
			const category = template.metadata?.category || 'General';
			if (!acc[category]) acc[category] = [];
			acc[category].push(template);
			return acc;
		}, {})
	);

	// Form configuration for task details
	const formConfig = $derived<FormConfig>({
		title: {
			type: 'text',
			label: 'Task Title',
			required: true,
			placeholder: 'Enter task title...',
			value: selectedTemplate?.metadata?.name_pattern?.replace('{{project}}', 'Project') || ''
		},
		description: {
			type: 'textarea',
			label: 'Description',
			placeholder: 'Describe the task...',
			rows: 3
		},
		priority: {
			type: 'select',
			label: 'Priority',
			value: 3,
			options: [
				{ value: 1, label: 'P1 - Critical' },
				{ value: 2, label: 'P2 - High' },
				{ value: 3, label: 'P3 - Medium' },
				{ value: 4, label: 'P4 - Low' },
				{ value: 5, label: 'P5 - Nice to have' }
			]
		},
		...(plans.length > 0 && {
			plan_id: {
				type: 'select',
				label: 'Plan (optional)',
				options: [
					{ value: '', label: 'No plan' },
					...plans.map((plan) => ({ value: plan.id, label: plan.name }))
				]
			}
		}),
		state_key: {
			type: 'select',
			label: 'Initial State',
			value: selectedTemplate?.fsm?.initial || 'todo',
			options: [
				{ value: 'todo', label: 'To Do' },
				{ value: 'in_progress', label: 'In Progress' },
				{ value: 'blocked', label: 'Blocked' },
				{ value: 'done', label: 'Done' },
				{ value: 'archived', label: 'Archived' }
			]
		}
	});

	// Load templates when modal opens
	$effect(() => {
		loadTemplates();
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
		showTemplateSelection = false;
	}

	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		const requestBody = {
			project_id: projectId,
			type_key: selectedTemplate?.type_key || 'task.basic',
			title: formData.title?.trim(),
			description: formData.description?.trim() || null,
			priority: formData.priority || 3,
			plan_id: formData.plan_id || null,
			state_key: formData.state_key || 'todo',
			props: {
				description: formData.description?.trim() || null,
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
	}

	function handleCancel() {
		if (selectedTemplate && showTemplateSelection === false) {
			// Go back to template selection
			showTemplateSelection = true;
			selectedTemplate = null;
		} else {
			// Close the modal
			onClose();
		}
	}
</script>

<FormModal
	title={showTemplateSelection ? 'Select Task Template' : 'Create New Task'}
	config={showTemplateSelection ? {} : formConfig}
	onSubmit={handleSubmit}
	onCancel={handleCancel}
	submitLabel="Create Task"
	cancelLabel={selectedTemplate && !showTemplateSelection ? 'Back' : 'Cancel'}
	hideForm={showTemplateSelection}
>
	<svelte:fragment slot="before-form">
		{#if showTemplateSelection}
			<!-- Template Selection -->
			{#if isLoadingTemplates}
				<div class="flex items-center justify-center py-12">
					<Loader class="w-8 h-8 animate-spin text-gray-400" />
				</div>
			{:else if templateError}
				<div class="text-center py-8">
					<p class="text-red-600 dark:text-red-400 mb-4">{templateError}</p>
					<Button variant="secondary" onclick={loadTemplates}>Try Again</Button>
				</div>
			{:else}
				<div class="space-y-6">
					{#each Object.entries(templateCategories) as [category, categoryTemplates]}
						<div>
							<h3
								class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-3"
							>
								{category}
							</h3>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{#each categoryTemplates as template}
									<button
										onclick={() => selectTemplate(template)}
										class="p-4 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all text-left group"
									>
										<div class="flex items-start justify-between mb-2">
											<h4
												class="font-semibold text-gray-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-300"
											>
												{template.name}
											</h4>
											<ChevronRight
												class="w-4 h-4 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex-shrink-0"
											/>
										</div>
										{#if template.metadata?.description}
											<p
												class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2"
											>
												{template.metadata.description}
											</p>
										{/if}
										{#if template.metadata?.typical_duration}
											<div class="mt-2 flex items-center gap-2">
												<span
													class="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-gray-600 dark:text-gray-400"
												>
													{template.metadata.typical_duration}
												</span>
											</div>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/each}

					{#if templates.length === 0}
						<div class="text-center py-12">
							<p class="text-gray-500 dark:text-gray-400">
								No task templates available
							</p>
						</div>
					{/if}
				</div>
			{/if}
		{:else if selectedTemplate}
			<!-- Show selected template info -->
			<div
				class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 mb-6"
			>
				<div class="flex items-start gap-3">
					<div class="flex-1">
						<h4 class="font-semibold text-blue-900 dark:text-blue-100 mb-1">
							{selectedTemplate.name}
						</h4>
						{#if selectedTemplate.metadata?.description}
							<p class="text-sm text-blue-700 dark:text-blue-300">
								{selectedTemplate.metadata.description}
							</p>
						{/if}
					</div>
					<button
						type="button"
						onclick={() => {
							showTemplateSelection = true;
							selectedTemplate = null;
						}}
						class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
					>
						Change
					</button>
				</div>
			</div>
		{/if}
	</svelte:fragment>
</FormModal>
