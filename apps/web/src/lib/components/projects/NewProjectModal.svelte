<!-- apps/web/src/lib/components/projects/NewProjectModal.svelte -->
<!-- Inkprint Design System: Uses semantic tokens for consistent styling -->
<script lang="ts">
	import { Brain, FileText } from 'lucide-svelte';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let isOpen: boolean = false;

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
	{#snippet children()}
		<div class="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 space-y-4 sm:space-y-6">
			<!-- Conditional Explanation based on user experience -->
			<div class="text-xs sm:text-sm text-muted-foreground">
				{#if isFirstProject}
					<!-- First-time user messaging -->
					<p class="mb-3">
						<strong class="text-foreground">Welcome to BuildOS!</strong> We recommend starting
						with a brain dump - just share your ideas and thoughts about your project, and
						BuildOS will intelligently organize them into a structured plan with tasks and
						phases.
					</p>
					<p>
						This AI-powered approach helps turn scattered ideas into organized project
						plans, making it easier to get started and ensuring important details aren't
						overlooked.
					</p>
				{:else}
					<!-- Experienced user messaging -->
					<p class="mb-3">
						<strong class="text-foreground">Quick start:</strong> Use the brain dump feature
						to quickly organize your thoughts into a structured project, or create an empty
						project to build from scratch.
					</p>
					<p>
						The brain dump approach uses AI to structure your ideas into tasks and
						phases, while an empty project gives you full control over the setup.
					</p>
				{/if}
			</div>

			<!-- Options -->
			<div class="space-y-3">
				<!-- Brain Dump Option - Bloom texture (ideation/newness) -->
				<button
					type="button"
					onclick={handleBrainDump}
					class="w-full text-left rounded-lg border-2 border-accent/40 bg-accent/10 p-3 sm:p-4 shadow-ink tx tx-bloom tx-weak transition-all duration-200 hover:border-accent hover:shadow-ink-strong pressable"
				>
					<div class="flex items-start gap-3 w-full">
						<div
							class="flex-shrink-0 mt-0.5 p-2 rounded-md bg-accent/20 border border-accent/30"
						>
							<Brain class="w-5 h-5 text-accent" />
						</div>
						<div class="flex-1 min-w-0">
							<h4 class="text-sm sm:text-base font-semibold text-foreground mb-1">
								{#if isFirstProject}
									Share your project ideas
									<span
										class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-bold uppercase"
										>Recommended</span
									>
								{:else}
									Brain dump about a project
								{/if}
							</h4>
							<p class="text-xs sm:text-sm text-muted-foreground leading-relaxed">
								{#if isFirstProject}
									Tell us about your project and we'll help organize it into
									actionable tasks and phases
								{:else}
									AI-powered organization of your thoughts into structured tasks
									and phases
								{/if}
							</p>
						</div>
					</div>
				</button>

				<!-- Quick Project Option - Frame texture (structure) -->
				<button
					type="button"
					onclick={handleQuickForm}
					class="w-full text-left rounded-lg border-2 border-border bg-card p-3 sm:p-4 shadow-ink tx tx-frame tx-weak transition-all duration-200 hover:border-accent/60 hover:shadow-ink-strong pressable"
				>
					<div class="flex items-start gap-3 w-full">
						<div
							class="flex-shrink-0 mt-0.5 p-2 rounded-md bg-muted border border-border"
						>
							<FileText class="w-5 h-5 text-muted-foreground" />
						</div>
						<div class="flex-1 min-w-0">
							<h4 class="text-sm sm:text-base font-semibold text-foreground mb-1">
								Quick project setup
							</h4>
							<p class="text-xs sm:text-sm text-muted-foreground leading-relaxed">
								Create a project with essential details using a simple form
							</p>
						</div>
					</div>
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet footer()}
		<div class="flex justify-end px-3 sm:px-4 lg:px-6 py-3 sm:py-4 border-t border-border">
			<Button type="button" onclick={handleClose} variant="secondary" size="md">Cancel</Button
			>
		</div>
	{/snippet}
</Modal>
