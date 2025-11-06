<!-- apps/web/src/lib/components/ontology/GoalCreateModal.svelte -->
<!--
	Goal Creation Modal Component

	Creates goals within the BuildOS ontology system using a two-step flow:
	1. Template selection
	2. Goal details entry with measurement criteria

	Documentation:
	- Ontology System Overview: /apps/web/docs/features/ontology/README.md
	- Data Models & Schema: /apps/web/docs/features/ontology/DATA_MODELS.md
	- Implementation Guide: /apps/web/docs/features/ontology/IMPLEMENTATION_SUMMARY.md
	- Modal Component Guide: /apps/web/docs/technical/components/modals/QUICK_REFERENCE.md

	Related Files:
	- API Endpoint: /apps/web/src/routes/api/onto/goals/create/+server.ts
	- Base Modal: /apps/web/src/lib/components/ui/FormModal.svelte
	- Plan Creation: /apps/web/src/lib/components/ontology/PlanCreateModal.svelte
-->
<script lang="ts">
	import { ChevronRight, Loader, Target } from 'lucide-svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { FormConfig } from '$lib/types/form';

	interface Props {
		projectId: string;
		onClose: () => void;
		onCreated?: (goalId: string) => void;
	}

	let { projectId, onClose, onCreated }: Props = $props();

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

	// Form configuration for goal details
	const formConfig = $derived<FormConfig>({
		name: {
			type: 'text',
			label: 'Goal Name',
			required: true,
			placeholder: 'Enter goal name...',
			value: selectedTemplate?.metadata?.name_pattern?.replace('{{project}}', 'Project') || ''
		},
		description: {
			type: 'textarea',
			label: 'Description',
			placeholder: 'Describe what you want to achieve...',
			rows: 3
		},
		measurement_criteria: {
			type: 'textarea',
			label: 'Success Criteria',
			placeholder:
				"How will you measure success? (e.g., 'Complete 5 tasks per week', 'Increase revenue by 20%')",
			rows: 2,
			value: selectedTemplate?.default_props?.measurement_criteria || ''
		},
		priority: {
			type: 'select',
			label: 'Priority',
			value: 'medium',
			options: [
				{ value: 'high', label: 'High Priority' },
				{ value: 'medium', label: 'Medium Priority' },
				{ value: 'low', label: 'Low Priority' }
			]
		},
		target_date: {
			type: 'date',
			label: 'Target Date (optional)'
		},
		state_key: {
			type: 'select',
			label: 'Initial State',
			value: selectedTemplate?.fsm?.initial || 'draft',
			options: [
				{ value: 'draft', label: 'Draft' },
				{ value: 'active', label: 'Active' },
				{ value: 'on_track', label: 'On Track' },
				{ value: 'at_risk', label: 'At Risk' },
				{ value: 'achieved', label: 'Achieved' },
				{ value: 'missed', label: 'Missed' }
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
			const response = await fetch('/api/onto/templates?scope=goal');
			if (!response.ok) throw new Error('Failed to load templates');

			const data = await response.json();
			templates = data.data?.templates || [];
			templateError = '';
		} catch (err) {
			console.error('Error loading templates:', err);
			templateError = 'Failed to load goal templates';
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
			type_key: selectedTemplate?.type_key || 'goal.basic',
			name: formData.name?.trim(),
			description: formData.description?.trim() || null,
			state_key: formData.state_key || 'draft',
			props: {
				description: formData.description?.trim() || null,
				target_date: formData.target_date || null,
				measurement_criteria: formData.measurement_criteria?.trim() || null,
				priority: formData.priority || 'medium',
				...(selectedTemplate?.default_props || {})
			}
		};

		const response = await fetch('/api/onto/goals/create', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(requestBody)
		});

		const result = await response.json();

		if (!response.ok) {
			throw new Error(result.error || 'Failed to create goal');
		}

		// Success! Call the callback
		if (onCreated) {
			onCreated(result.data.goal.id);
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
	title={showTemplateSelection ? 'Select Goal Template' : 'Create New Goal'}
	config={showTemplateSelection ? {} : formConfig}
	onSubmit={handleSubmit}
	onCancel={handleCancel}
	submitLabel="Create Goal"
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
										{#if template.metadata?.measurement_type}
											<div class="mt-2 flex items-center gap-2">
												<Target class="w-3 h-3 text-gray-500" />
												<span
													class="text-xs text-gray-600 dark:text-gray-400"
												>
													{template.metadata.measurement_type}
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
								No goal templates available
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
