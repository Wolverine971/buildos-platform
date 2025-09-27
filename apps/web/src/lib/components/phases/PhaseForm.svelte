<!-- src/lib/components/phases/PhaseForm.svelte -->
<script lang="ts">
	import { Save, X, AlertTriangle } from 'lucide-svelte';
	import { createEventDispatcher } from 'svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import {
		validatePhaseDateAgainstProject,
		getPhaseeDateConstraintsWithPartner,
		canCreatePhaseInProject,
		type ProjectBoundaries
	} from '$lib/utils/dateValidation';
	import { formatDateForDisplay } from '$utils/date-utils';

	export let isCreating = false;
	export let formData = {
		name: '',
		description: '',
		start_date: '',
		end_date: ''
	};
	export let project: ProjectBoundaries = { start_date: null, end_date: null };

	const dispatch = createEventDispatcher();

	// Validation state
	let validationErrors: { [key: string]: string } = {};
	let validationWarnings: { [key: string]: string } = {};
	let isFormValid = true;

	// Check if project can support phase creation
	$: projectCreationCheck = canCreatePhaseInProject(project);

	// Reactive validation
	$: {
		validationErrors = {};
		validationWarnings = {};

		// Basic validation
		if (!formData.name?.trim()) {
			validationErrors.name = 'Phase name is required';
		}

		if (!formData.start_date && !formData.end_date) {
			validationErrors.general = 'Phase must have at least a start date or end date';
		}

		// Date validation against project boundaries
		if (formData.start_date || formData.end_date) {
			const validation = validatePhaseDateAgainstProject(
				formData.start_date || null,
				formData.end_date || null,
				project
			);

			if (!validation.isValid && validation.error) {
				validationErrors.dates = validation.error;
			} else if (validation.warning) {
				validationWarnings.dates = validation.warning;
			}
		}

		// Check if both dates are provided and start is after end
		if (formData.start_date && formData.end_date) {
			const startDate = new Date(formData.start_date);
			const endDate = new Date(formData.end_date);

			if (startDate >= endDate) {
				validationErrors.end_date = 'End date must be after start date';
			}
		}

		isFormValid = Object.keys(validationErrors).length === 0;
	}

	// Get date constraints for inputs
	$: startDateConstraints = getPhaseeDateConstraintsWithPartner(
		project,
		true, // isStartDate
		formData.end_date
	);

	$: endDateConstraints = getPhaseeDateConstraintsWithPartner(
		project,
		false, // isStartDate
		formData.start_date
	);

	function handleSubmit() {
		if (!isFormValid) {
			dispatch('error', 'Please fix the validation errors before submitting');
			return;
		}

		// Final validation check
		const finalValidation = validatePhaseDateAgainstProject(
			formData.start_date || null,
			formData.end_date || null,
			project
		);

		if (!finalValidation.isValid) {
			dispatch('error', finalValidation.error || 'Invalid phase dates');
			return;
		}

		dispatch('submit', formData);
	}

	function handleCancel() {
		dispatch('cancel');
	}
</script>

{#if isCreating}
	<div
		class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
	>
		<div class="mb-3">
			<h3 class="text-sm font-medium text-gray-900 dark:text-white">Create New Phase</h3>
			{#if project.start_date || project.end_date}
				<p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
					Project timeline:
					{#if project.start_date}{formatDateForDisplay(project.start_date)}{:else}No
						start{/if}
					-
					{#if project.end_date}{formatDateForDisplay(project.end_date)}{:else}No end{/if}
				</p>
			{/if}
		</div>

		{#if !projectCreationCheck.canCreate}
			<!-- Project cannot support phase creation -->
			<div
				class="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 border border-yellow-200 dark:border-yellow-800 mb-3"
				role="alert"
			>
				<div class="flex">
					<AlertTriangle class="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
					<div class="ml-2">
						<p class="text-sm text-yellow-800 dark:text-yellow-200">
							{projectCreationCheck.message}
						</p>
					</div>
				</div>
			</div>
		{:else}
			<!-- General validation error -->
			{#if validationErrors.general}
				<div
					class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 mb-3 border border-red-200 dark:border-red-800"
					role="alert"
				>
					<div class="flex">
						<AlertTriangle class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
						<p class="text-sm text-red-800 dark:text-red-200 ml-2">
							{validationErrors.general}
						</p>
					</div>
				</div>
			{/if}

			<!-- Date validation error -->
			{#if validationErrors.dates}
				<div
					class="rounded-lg bg-red-50 dark:bg-red-900/20 p-3 mb-3 border border-red-200 dark:border-red-800"
					role="alert"
				>
					<div class="flex">
						<AlertTriangle class="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
						<p class="text-sm text-red-800 dark:text-red-200 ml-2">
							{validationErrors.dates}
						</p>
					</div>
				</div>
			{/if}

			<!-- Date validation warning -->
			{#if validationWarnings.dates}
				<div
					class="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 mb-3 border border-yellow-200 dark:border-yellow-800"
					role="alert"
				>
					<div class="flex">
						<AlertTriangle class="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />
						<p class="text-sm text-yellow-800 dark:text-yellow-200 ml-2">
							{validationWarnings.dates}
						</p>
					</div>
				</div>
			{/if}

			<div class="space-y-3">
				<FormField
					label="Phase Name"
					labelFor="phase-name"
					required
					error={validationErrors.name}
				>
					<TextInput
						id="phase-name"
						bind:value={formData.name}
						placeholder="e.g., Planning, Development, Testing"
						class={validationErrors.name ? 'border-red-300 dark:border-red-700' : ''}
					/>
				</FormField>

				<FormField
					label="Description"
					labelFor="phase-description"
					error={validationErrors.description}
				>
					<Textarea
						id="phase-description"
						bind:value={formData.description}
						placeholder="Brief description of this phase..."
						rows={2}
						class={validationErrors.description
							? 'border-red-300 dark:border-red-700'
							: ''}
					/>
				</FormField>

				<div class="grid grid-cols-2 gap-3">
					<FormField
						label="Start Date"
						labelFor="start-date"
						error={validationErrors.start_date}
						hint={project.start_date
							? `Project starts: ${formatDateForDisplay(project.start_date)}`
							: undefined}
					>
						<TextInput
							id="start-date"
							type="date"
							bind:value={formData.start_date}
							min={startDateConstraints.min}
							max={startDateConstraints.max}
							class={validationErrors.start_date
								? 'border-red-300 dark:border-red-700'
								: ''}
						/>
					</FormField>

					<FormField
						label="End Date"
						labelFor="end-date"
						error={validationErrors.end_date}
						hint={project.end_date
							? `Project ends: ${formatDateForDisplay(project.end_date)}`
							: undefined}
					>
						<TextInput
							id="end-date"
							type="date"
							bind:value={formData.end_date}
							min={endDateConstraints.min}
							max={endDateConstraints.max}
							class={validationErrors.end_date
								? 'border-red-300 dark:border-red-700'
								: ''}
						/>
					</FormField>
				</div>

				<div class="flex items-center gap-2 pt-2">
					<Button
						on:click={handleSubmit}
						variant="primary"
						size="sm"
						disabled={!isFormValid || !projectCreationCheck.canCreate}
					>
						<Save class="w-4 h-4 mr-1.5" />
						Create Phase
					</Button>
					<Button on:click={handleCancel} variant="outline" size="sm">
						<X class="w-4 h-4 mr-1.5" />
						Cancel
					</Button>
				</div>
			</div>
		{/if}
	</div>
{/if}
