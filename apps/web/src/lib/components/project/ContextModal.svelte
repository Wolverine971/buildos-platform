<!-- apps/web/src/lib/components/project/ContextModal.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import { ProjectService } from '$lib/services/projectService';
	import type { FormConfig } from '$lib/types/form';

	export let isOpen = false;
	export let context: string | null = null; // markdown string
	export let projectId: string;
	export let onClose: () => void;

	// Get project service instance
	const projectService = ProjectService.getInstance();

	// Simple form configuration with just one markdown field
	const formConfig: FormConfig = {
		context: {
			type: 'textarea',
			label: 'Project Context',
			placeholder:
				'Enter your project context in markdown format...\n\n## Example Section\nYour content here\n\n## Another Section\nMore content...',
			rows: 20,
			markdown: true,
			description:
				'Use markdown formatting to structure your project context. You can include headers, lists, links, and other markdown elements.'
		}
	};

	// Initial data for the form
	let initialData: Record<string, any> = {};

	// Handle form submission
	async function handleSubmit(formData: Record<string, any>) {
		// Update the project context
		await projectService.updateProject(projectId, {
			context: formData.context || ''
		});

		onClose();
	}

	// Update initial data when modal opens or context changes
	$: if (isOpen) {
		initialData = {
			context: context || ''
		};
	}

	onMount(() => {
		initialData = {
			context: context || ''
		};
	});
</script>

<FormModal
	{isOpen}
	title="Edit Project Context"
	submitText="Save Context"
	loadingText="Saving..."
	{formConfig}
	{initialData}
	onSubmit={handleSubmit}
	{onClose}
	size="xl"
></FormModal>
