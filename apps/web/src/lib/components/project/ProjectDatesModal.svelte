<!-- apps/web/src/lib/components/project/ProjectDatesModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import type { FormConfig } from '$lib/types/form';

	export let isOpen = false;
	export let projectStartDate: string | null;
	export let projectEndDate: string | null;
	export let projectId: string;

	const dispatch = createEventDispatcher();

	// Form configuration for date editing
	const formConfig: FormConfig = {
		start_date: {
			type: 'date',
			label: 'Project Start Date',
			placeholder: 'Select start date'
		},
		end_date: {
			type: 'date',
			label: 'Project End Date',
			placeholder: 'Select end date'
		}
	};

	// Prepare initial data
	$: initialData = {
		start_date: projectStartDate || '',
		end_date: projectEndDate || ''
	};

	async function handleSubmit(formData: Record<string, any>) {
		// Update project dates
		const response = await fetch(`/api/projects/${projectId}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				start_date: formData.start_date || null,
				end_date: formData.end_date || null
			})
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to update project dates');
		}

		const result = await response.json();

		// Dispatch success event
		dispatch('updated', {
			start_date: formData.start_date || null,
			end_date: formData.end_date || null
		});
	}

	function handleClose() {
		isOpen = false;
		dispatch('close');
	}
</script>

<FormModal
	{isOpen}
	title="Edit Project Timeline"
	submitText="Save Dates"
	loadingText="Saving..."
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	onClose={handleClose}
	size="sm"
>
	{#snippet afterForm()}
		<div class="mt-4">
			<div class="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
				<p class="text-sm text-blue-800 dark:text-blue-200">
					<strong>Note:</strong> Changing project dates may affect phase scheduling. Phases
					outside the new date range will need to be adjusted.
				</p>
			</div>
		</div>
	{/snippet}
</FormModal>
