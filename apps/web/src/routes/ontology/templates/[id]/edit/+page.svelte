<!-- apps/web/src/routes/ontology/templates/[id]/edit/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import Button from '$lib/components/ui/Button.svelte';
	import TemplateForm from '$lib/components/ontology/templates/TemplateForm.svelte';
	import MetadataEditor from '$lib/components/ontology/templates/MetadataEditor.svelte';
	import FacetDefaultsEditor from '$lib/components/ontology/templates/FacetDefaultsEditor.svelte';
	import FsmEditor from '$lib/components/ontology/templates/FsmEditor.svelte';
	import SchemaBuilder from '$lib/components/ontology/templates/SchemaBuilder.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Form state
	let saving = $state(false);
	let error = $state<string | null>(null);
	let validationErrors = $state<Array<{ field: string; message: string }>>([]);

	// Step tracking for wizard
	let currentStep = $state(1);
	const totalSteps = 5;

	// Component references
	let metadataEditorRef: any;
	let facetEditorRef: any;
	let fsmEditorRef: any;
	let schemaBuilderRef: any;

	// Collected form data (initialize with existing template data)
	let basicFormData = $state<any>({
		type_key: data.template.type_key,
		name: data.template.name,
		scope: data.template.scope,
		status: data.template.status,
		parent_template_id: data.template.parent_template_id,
		is_abstract: data.template.is_abstract
	});

	const steps = [
		{ number: 1, name: 'Basic Info', description: 'Template name, type, and scope' },
		{ number: 2, name: 'Metadata', description: 'Description, realm, and keywords' },
		{ number: 3, name: 'Facet Defaults', description: 'Context, scale, and stage' },
		{ number: 4, name: 'State Machine', description: 'FSM states and transitions' },
		{ number: 5, name: 'JSON Schema', description: 'Property structure and validation' }
	];

	async function handleBasicFormSubmit(event: CustomEvent) {
		basicFormData = event.detail;
		currentStep = 2; // Move to metadata step
	}

	async function handleMetadataNext() {
		currentStep = 3; // Move to facets step
	}

	async function handleFacetNext() {
		currentStep = 4; // Move to FSM step
	}

	async function handleFsmNext() {
		currentStep = 5; // Move to Schema step
	}

	async function handleFinalSubmit() {
		if (!basicFormData) {
			error = 'Basic form data is missing';
			return;
		}

		try {
			saving = true;
			error = null;
			validationErrors = [];

			// Collect all form data
			const metadata = metadataEditorRef?.getMetadata() || data.template.metadata || {};
			const facetDefaults =
				facetEditorRef?.getFacetDefaults() || data.template.facet_defaults || {};
			const fsm = fsmEditorRef?.getFsm() || data.template.fsm || null;
			const schema = schemaBuilderRef?.getSchema() || data.template.schema || null;

			const templateData = {
				...basicFormData,
				metadata,
				facet_defaults: facetDefaults,
				fsm,
				schema
			};

			// Submit to API using PUT for update
			const response = await fetch(`/api/onto/templates/${data.template.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(templateData)
			});

			const result = await response.json();

			if (!response.ok) {
				if (result.details?.validationErrors) {
					validationErrors = result.details.validationErrors;
					error = 'Please fix validation errors and try again';
				} else {
					error = result.error || 'Failed to update template';
				}
				return;
			}

			// Success! Redirect back to templates page
			goto('/ontology/templates');
		} catch (err) {
			console.error('[Template Edit] Error:', err);
			error = err instanceof Error ? err.message : 'An unexpected error occurred';
		} finally {
			saving = false;
		}
	}

	function handleCancel() {
		goto('/ontology/templates');
	}

	function goToStep(step: number) {
		if (step < currentStep) {
			currentStep = step;
		}
	}
</script>

<svelte:head>
	<title>Edit Template: {data.template.name} | Ontology | BuildOS</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
	<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
		<!-- Header -->
		<header class="mb-8">
			<Button variant="ghost" size="sm" onclick={handleCancel} class="mb-4">
				<svg
					class="w-4 h-4 mr-2"
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
				Back to Templates
			</Button>

			<h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">
				Edit Template
			</h1>
			<p class="text-base sm:text-lg text-gray-600 dark:text-gray-400 mb-2">
				{data.template.name}
				<span class="text-sm text-gray-500 dark:text-gray-500"
					>({data.template.type_key})</span
				>
			</p>
			<p class="text-sm text-gray-600 dark:text-gray-400">
				Step {currentStep} of {totalSteps}: {steps.find((s) => s.number === currentStep)
					?.name}
			</p>
		</header>

		<!-- Progress Indicator -->
		<div class="mb-8">
			<div class="flex items-center justify-between">
				{#each steps as step}
					<button
						type="button"
						onclick={() => goToStep(step.number)}
						disabled={step.number > currentStep}
						class="flex flex-col items-center gap-2 flex-1 {step.number > currentStep
							? 'opacity-50 cursor-not-allowed'
							: 'cursor-pointer hover:opacity-80'}"
					>
						<div
							class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors {step.number ===
							currentStep
								? 'bg-blue-600 dark:bg-blue-500 text-white'
								: step.number < currentStep
									? 'bg-green-600 dark:bg-green-500 text-white'
									: 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}"
						>
							{#if step.number < currentStep}
								<svg
									class="w-5 h-5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{:else}
								{step.number}
							{/if}
						</div>
						<div class="text-center hidden sm:block">
							<div
								class="text-xs font-semibold {step.number === currentStep
									? 'text-blue-600 dark:text-blue-400'
									: step.number < currentStep
										? 'text-green-600 dark:text-green-400'
										: 'text-gray-500 dark:text-gray-500'}"
							>
								{step.name}
							</div>
							<div class="text-xs text-gray-500 dark:text-gray-400">
								{step.description}
							</div>
						</div>
					</button>
					{#if step.number < totalSteps}
						<div
							class="flex-1 h-0.5 mx-2 {step.number < currentStep
								? 'bg-green-600 dark:bg-green-500'
								: 'bg-gray-200 dark:bg-gray-700'}"
						></div>
					{/if}
				{/each}
			</div>
		</div>

		<!-- Error Display -->
		{#if error}
			<div
				class="mb-6 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
			>
				<p class="text-sm text-red-800 dark:text-red-300 font-medium">{error}</p>
			</div>
		{/if}

		{#if validationErrors.length > 0}
			<div
				class="mb-6 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
			>
				<p class="text-sm text-amber-800 dark:text-amber-300 font-medium mb-2">
					Validation Errors:
				</p>
				<ul class="list-disc list-inside space-y-1">
					{#each validationErrors as valError}
						<li class="text-sm text-amber-700 dark:text-amber-400">
							<strong>{valError.field}:</strong>
							{valError.message}
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Step Content -->
		<div class="space-y-6">
			{#if currentStep === 1}
				<TemplateForm
					mode="edit"
					initialData={basicFormData}
					availableParents={data.availableParents}
					loading={saving}
					onsubmit={handleBasicFormSubmit}
					on:cancel={handleCancel}
				/>
			{:else if currentStep === 2}
				<MetadataEditor
					loading={saving}
					initialMetadata={data.template.metadata}
					bind:this={metadataEditorRef}
				/>
				<div class="flex flex-col sm:flex-row gap-3">
					<Button
						variant="secondary"
						size="md"
						fullWidth={true}
						onclick={() => (currentStep = 1)}
						disabled={saving}
						class="sm:flex-1"
					>
						Back
					</Button>
					<Button
						variant="primary"
						size="md"
						fullWidth={true}
						onclick={handleMetadataNext}
						disabled={saving}
						class="sm:flex-1"
					>
						Next
					</Button>
				</div>
			{:else if currentStep === 3}
				<FacetDefaultsEditor
					loading={saving}
					initialFacets={data.template.facet_defaults}
					bind:this={facetEditorRef}
				/>
				<div class="flex flex-col sm:flex-row gap-3">
					<Button
						variant="secondary"
						size="md"
						fullWidth={true}
						onclick={() => (currentStep = 2)}
						disabled={saving}
						class="sm:flex-1"
					>
						Back
					</Button>
					<Button
						variant="primary"
						size="md"
						fullWidth={true}
						onclick={handleFacetNext}
						disabled={saving}
						class="sm:flex-1"
					>
						Next
					</Button>
				</div>
			{:else if currentStep === 4}
				<FsmEditor
					loading={saving}
					initialFsm={data.template.fsm}
					bind:this={fsmEditorRef}
				/>
				<div class="flex flex-col sm:flex-row gap-3">
					<Button
						variant="secondary"
						size="md"
						fullWidth={true}
						onclick={() => (currentStep = 3)}
						disabled={saving}
						class="sm:flex-1"
					>
						Back
					</Button>
					<Button
						variant="primary"
						size="md"
						fullWidth={true}
						onclick={handleFsmNext}
						disabled={saving}
						class="sm:flex-1"
					>
						Next
					</Button>
				</div>
			{:else if currentStep === 5}
				<SchemaBuilder
					loading={saving}
					initialSchema={data.template.schema}
					bind:this={schemaBuilderRef}
				/>
				<div class="flex flex-col sm:flex-row gap-3">
					<Button
						variant="secondary"
						size="md"
						fullWidth={true}
						onclick={() => (currentStep = 4)}
						disabled={saving}
						class="sm:flex-1"
					>
						Back
					</Button>
					<Button
						variant="primary"
						size="md"
						fullWidth={true}
						onclick={handleFinalSubmit}
						disabled={saving}
						class="sm:flex-1"
					>
						{saving ? 'Updating Template...' : 'Update Template'}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</div>
