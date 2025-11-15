<!-- apps/web/src/lib/components/projects/NewProjectModal.svelte -->
<script lang="ts">
	import { Brain, PenTool, Loader2, FileText } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	export let creatingProject: boolean = false;
	export let isFirstProject: boolean = false;

	const dispatch = createEventDispatcher<{
		close: void;
		brainDump: void;
		createEmpty: void;
		quickForm: void;
	}>();

	function handleClose() {
		dispatch('close');
	}

	function handleBrainDump() {
		dispatch('brainDump');
	}

	function handleCreateEmpty() {
		dispatch('createEmpty');
	}

	function handleQuickForm() {
		dispatch('quickForm');
	}
</script>

<Modal {isOpen} onClose={handleClose} title="Create a New Project" size="md">
	<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-4 sm:space-y-6">
		<!-- Conditional Explanation based on user experience -->
		<div class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
			{#if isFirstProject}
				<!-- First-time user messaging -->
				<p class="mb-3">
					<strong>Welcome to BuildOS!</strong> We recommend starting with a brain dump - just
					share your ideas and thoughts about your project, and BuildOS will intelligently
					organize them into a structured plan with tasks and phases.
				</p>
				<p>
					This AI-powered approach helps turn scattered ideas into organized project
					plans, making it easier to get started and ensuring important details aren't
					overlooked.
				</p>
			{:else}
				<!-- Experienced user messaging -->
				<p class="mb-3">
					<strong>Quick start:</strong> Use the brain dump feature to quickly organize your
					thoughts into a structured project, or create an empty project to build from scratch.
				</p>
				<p>
					The brain dump approach uses AI to structure your ideas into tasks and phases,
					while an empty project gives you full control over the setup.
				</p>
			{/if}
		</div>

		<!-- Options -->
		<div class="space-y-3">
			<!-- Brain Dump Option -->
			<Button
				type="button"
				onclick={handleBrainDump}
				variant="outline"
				size="lg"
				fullWidth={true}
				btnType="container"
				class="text-left border-2 border-primary-200 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-800 hover:border-primary-300 dark:hover:border-primary-700"
			>
				<div class="flex items-start space-x-3 w-full">
					<div class="flex-shrink-0 mt-1">
						<Brain class="w-5 h-5 text-primary-600 dark:text-primary-400" />
					</div>
					<div class="flex-1 min-w-0">
						<h4
							class="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mb-1"
						>
							{#if isFirstProject}
								Share your project ideas (Recommended)
							{:else}
								Brain dump about a project
							{/if}
						</h4>
						<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							{#if isFirstProject}
								Tell us about your project and we'll help organize it into
								actionable tasks and phases
							{:else}
								AI-powered organization of your thoughts into structured tasks and
								phases
							{/if}
						</p>
					</div>
				</div>
			</Button>

			<!-- Quick Project Option -->
			<Button
				type="button"
				onclick={handleQuickForm}
				variant="outline"
				size="lg"
				fullWidth={true}
				btnType="container"
				class="text-left border-2 border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 hover:border-blue-300 dark:hover:border-blue-700"
			>
				<div class="flex items-start space-x-3 w-full">
					<div class="flex-shrink-0 mt-1">
						<FileText class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div class="flex-1 min-w-0">
						<h4
							class="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white mb-1"
						>
							Quick project setup
						</h4>
						<p class="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
							Create a project with essential details using a simple form
						</p>
					</div>
				</div>
			</Button>
		</div>
	</div>

	<div
		slot="footer"
		class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700"
	>
		<Button type="button" onclick={handleClose} variant="secondary" size="md">Cancel</Button>
	</div>
</Modal>
