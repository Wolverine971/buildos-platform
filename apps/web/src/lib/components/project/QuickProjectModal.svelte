<!-- apps/web/src/lib/components/project/QuickProjectModal.svelte -->
<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { browser } from '$app/environment';
	import { invalidateAll, goto } from '$app/navigation';
	import Modal from '$lib/components/ui/Modal.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import { X, Folder, Calendar, ChevronDown, ChevronRight, FileText, Tag } from 'lucide-svelte';
	import { ProjectService } from '$lib/services/projectService';
	import { toastService } from '$lib/stores/toast.store';
	import { supabase } from '$lib/supabase';
	import type { Database } from '@buildos/shared-types';

	type ProjectInsert = Database['public']['Tables']['projects']['Insert'];

	// Props using Svelte 5 $props() for runes mode compatibility
	let {
		isOpen = false,
		onClose = null,
		onSuccess = null
	}: {
		isOpen?: boolean;
		onClose?: (() => void) | null;
		onSuccess?: ((projectId: string) => void) | null;
	} = $props();

	const dispatch = createEventDispatcher<{
		close: void;
		create: { projectId: string };
		navigate: { url: string };
	}>();

	// Form state
	let formData = $state({
		name: '',
		description: '',
		startDate: new Date().toISOString().split('T')[0],
		endDate: '',
		tags: [] as string[],
		tagInput: '',
		context: '',
		includeContext: false
	});

	// UI state
	let isSubmitting = $state(false);
	let showContextSection = $state(false);
	let errors = $state<Record<string, string>>({});
	let innerWidth = $state(0);

	// Context framework placeholder
	const contextPlaceholder = `## Project Vision
Describe the overall purpose and goals of this project.

## Current Situation
What's the current state and what problems are we solving?

## Success Criteria
How will we measure success?

## Scope & Deliverables
What will this project produce?

## Key Milestones
Major checkpoints and timeline.

## Risks & Assumptions
What could go wrong and what are we assuming?`;

	// Computed states
	let isFormValid = $derived(
		formData.name.trim().length > 0 && formData.description.trim().length > 0 && !isSubmitting
	);

	let hasEndDate = $derived(formData.endDate !== '');
	let dateRangeValid = $derived(
		!hasEndDate || new Date(formData.endDate) > new Date(formData.startDate)
	);

	// Validation
	function validateForm(): boolean {
		const newErrors: Record<string, string> = {};

		if (!formData.name.trim()) {
			newErrors.name = 'Project name is required';
		}

		if (!formData.description.trim()) {
			newErrors.description = 'Project description is required';
		}

		if (hasEndDate && !dateRangeValid) {
			newErrors.endDate = 'End date must be after start date';
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	// Generate slug from name
	function generateSlug(name: string): string {
		return name
			.toLowerCase()
			.replace(/[^\w\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.trim();
	}

	// Add tag functionality
	function addTag() {
		const tag = formData.tagInput.trim();
		if (tag && !formData.tags.includes(tag)) {
			formData.tags = [...formData.tags, tag];
			formData.tagInput = '';
		}
	}

	function removeTag(index: number) {
		formData.tags = formData.tags.filter((_, i) => i !== index);
	}

	function handleTagKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			addTag();
		}
	}

	// Handle form submission
	async function handleSubmit() {
		if (!validateForm()) return;

		isSubmitting = true;

		try {
			// Get current user
			const {
				data: { user }
			} = await supabase.auth.getUser();
			if (!user) throw new Error('User not authenticated');

			// Build project data
			const projectData: ProjectInsert = {
				user_id: user.id,
				name: formData.name.trim(),
				description: formData.description.trim(),
				slug: generateSlug(formData.name),
				status: 'active',
				start_date: formData.startDate,
				end_date: formData.endDate || null,
				context:
					formData.includeContext && formData.context.trim()
						? formData.context.trim()
						: null,
				tags: formData.tags.length > 0 ? formData.tags : null
			};

			// Create project using service
			const projectService = ProjectService.getInstance();
			const project = await projectService.createProject(projectData);

			if (!project?.id) {
				throw new Error('Failed to create project - no ID returned');
			}

			// Show success message
			toastService.success(`Project "${formData.name}" created successfully!`);

			// Trigger success callback if provided
			if (onSuccess) {
				onSuccess(project.id);
			}

			// Dispatch events
			dispatch('create', { projectId: project.id });

			// Navigate to the new project
			const projectUrl = `/projects/${project.id}`;
			dispatch('navigate', { url: projectUrl });

			// Close modal and navigate
			handleClose();

			// Small delay to allow modal close animation
			setTimeout(() => {
				goto(projectUrl);
			}, 300);

			// Refresh data
			invalidateAll();
		} catch (error) {
			console.error('Failed to create project:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to create project';
			toastService.error(errorMessage);
			isSubmitting = false;
		}
	}

	// Handle modal close
	function handleClose() {
		if (isSubmitting) return;

		// Reset form
		formData = {
			name: '',
			description: '',
			startDate: new Date().toISOString().split('T')[0],
			endDate: '',
			tags: [],
			tagInput: '',
			context: '',
			includeContext: false
		};

		errors = {};
		showContextSection = false;

		// Trigger close
		if (onClose) {
			onClose();
		}
		dispatch('close');
	}

	// Toggle context section
	function toggleContextSection() {
		showContextSection = !showContextSection;
		formData.includeContext = showContextSection;
	}

	// Mobile detection
	let isMobile = $derived(innerWidth > 0 && innerWidth < 640);
</script>

<svelte:window bind:innerWidth />

<Modal
	{isOpen}
	onClose={handleClose}
	title=""
	size="lg"
	showCloseButton={!isSubmitting}
	closeOnBackdrop={!isSubmitting}
	closeOnEscape={!isSubmitting}
	persistent={isSubmitting}
	customClasses="quick-project-modal"
>
	<!-- Custom Header -->
	{#snippet header()}
		<div
			class="quick-project-header bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-purple-50/50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20"
		>
			<div class="header-content">
				<div class="flex items-center">
					<div
						class="p-2 bg-gradient-to-br from-blue-100/50 to-indigo-100/50 dark:from-blue-800/30 dark:to-indigo-800/30 rounded-xl mr-3"
					>
						<Folder class="w-5 h-5 text-blue-600 dark:text-blue-400" />
					</div>
					<div>
						<h2 class="text-xl font-bold text-gray-900 dark:text-white">
							Quick Project Setup
						</h2>
						<p class="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
							Get started with essential details
						</p>
					</div>
				</div>
				{#if !isSubmitting}
					<Button
						variant="ghost"
						onclick={handleClose}
						class="close-button"
						aria-label="Close dialog"
						icon={X}
					></Button>
				{/if}
			</div>
		</div>
	{/snippet}
	{#snippet children()}
		<!-- Form Content -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
			class="px-4 sm:px-6 py-6 space-y-6"
		>
			<!-- Basic Information Section -->
			<div class="space-y-4">
				<div class="border-b border-gray-200 dark:border-gray-700 pb-2">
					<h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">
						Basic Information
					</h3>
				</div>

				<!-- Project Name -->
				<FormField label="Project Name" required error={errors.name}>
					<input
						type="text"
						bind:value={formData.name}
						placeholder="Enter project name..."
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
					       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
					       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
					       min-h-[44px] transition-all duration-200"
						disabled={isSubmitting}
					/>
				</FormField>

				<!-- Project Description -->
				<FormField label="Project Description" required error={errors.description}>
					<textarea
						bind:value={formData.description}
						placeholder="What is this project about?"
						rows="4"
						class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
					       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
					       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
					       resize-none transition-all duration-200"
						disabled={isSubmitting}
					></textarea>
				</FormField>

				<!-- Project Tags -->
				<FormField label="Project Tags (Optional)">
					<div class="space-y-2">
						<div class="flex gap-2">
							<input
								type="text"
								bind:value={formData.tagInput}
								placeholder="Add tags (press Enter or comma)"
								onkeydown={handleTagKeydown}
								class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
							       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
							       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
							       min-h-[44px] transition-all duration-200"
								disabled={isSubmitting}
							/>
							<Button
								type="button"
								variant="secondary"
								onclick={addTag}
								disabled={!formData.tagInput.trim() || isSubmitting}
								class="min-h-[44px]"
							>
								<Tag class="w-4 h-4 mr-1" />
								Add
							</Button>
						</div>
						{#if formData.tags.length > 0}
							<div class="flex flex-wrap gap-2">
								{#each formData.tags as tag, i}
									<span
										class="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
									>
										{tag}
										<button
											type="button"
											onclick={() => removeTag(i)}
											class="ml-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200"
											disabled={isSubmitting}
										>
											×
										</button>
									</span>
								{/each}
							</div>
						{/if}
					</div>
				</FormField>
			</div>

			<!-- Timeline Section -->
			<div class="space-y-4">
				<div class="border-b border-gray-200 dark:border-gray-700 pb-2">
					<h3
						class="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center"
					>
						<Calendar class="w-4 h-4 mr-2" />
						Timeline
					</h3>
				</div>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<!-- Start Date -->
					<FormField label="Start Date">
						<input
							type="date"
							bind:value={formData.startDate}
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
						       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
						       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
						       min-h-[44px] transition-all duration-200"
							disabled={isSubmitting}
						/>
					</FormField>

					<!-- End Date -->
					<FormField label="End Date (Optional)" error={errors.endDate}>
						<input
							type="date"
							bind:value={formData.endDate}
							min={formData.startDate}
							class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
						       focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
						       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
						       min-h-[44px] transition-all duration-200"
							disabled={isSubmitting}
						/>
					</FormField>
				</div>
			</div>

			<!-- Optional Context Section -->
			<div class="space-y-4">
				<button
					type="button"
					onclick={toggleContextSection}
					class="w-full flex items-center justify-between p-3 bg-gradient-to-r from-gray-50 to-gray-100
				       dark:from-gray-800 dark:to-gray-750 rounded-lg hover:shadow-sm transition-all duration-200
				       border border-gray-200 dark:border-gray-700"
					disabled={isSubmitting}
				>
					<div class="flex items-center">
						<FileText class="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
						<span class="text-sm font-medium text-gray-900 dark:text-gray-100">
							Add Project Context Document (Optional)
						</span>
					</div>
					{#if showContextSection}
						<ChevronDown class="w-4 h-4 text-gray-500" />
					{:else}
						<ChevronRight class="w-4 h-4 text-gray-500" />
					{/if}
				</button>

				{#if showContextSection}
					<div class="space-y-4 animate-fadeIn">
						<div class="flex items-start gap-2">
							<FileText
								class="w-4 h-4 mt-1 text-gray-500 dark:text-gray-400 flex-shrink-0"
							/>
							<div class="flex-1">
								<p class="text-sm text-gray-600 dark:text-gray-400 mb-1">
									Define your project's vision, scope, and approach using
									markdown.
								</p>
								<p class="text-xs text-gray-500 dark:text-gray-400">
									This context document helps AI better understand and assist with
									your project.
								</p>
							</div>
						</div>

						<FormField label="Project Context Document">
							<div class="relative">
								<textarea
									bind:value={formData.context}
									placeholder={contextPlaceholder}
									rows="12"
									class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg
								       focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400
								       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
								       font-mono text-sm resize-y transition-all duration-200"
									disabled={isSubmitting}
								></textarea>
								<div class="absolute top-2 right-2">
									<span
										class="text-xs text-gray-400 bg-white dark:bg-gray-800 px-2 py-1 rounded"
									>
										Markdown
									</span>
								</div>
							</div>
							<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
								Tip: Use markdown formatting (## Headers, **bold**, - lists, etc.)
							</p>
						</FormField>
					</div>
				{/if}
			</div>
			<!-- Action Buttons -->
			<div
				class="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700"
			>
				{#if isMobile}
					<!-- Mobile layout -->
					<Button
						type="submit"
						variant="primary"
						size="lg"
						class="w-full min-h-[44px]"
						disabled={!isFormValid || isSubmitting}
						loading={isSubmitting}
					>
						{isSubmitting ? 'Creating Project...' : 'Create Project'}
					</Button>
					<Button
						type="button"
						variant="ghost"
						size="lg"
						class="w-full min-h-[44px]"
						onclick={handleClose}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
				{:else}
					<!-- Desktop layout -->
					<Button
						type="button"
						variant="ghost"
						onclick={handleClose}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!isFormValid || isSubmitting}
						loading={isSubmitting}
					>
						{isSubmitting ? 'Creating Project...' : 'Create Project'}
					</Button>
				{/if}
			</div>
		</form>
	{/snippet}
</Modal>

<style>
	:global(.quick-project-modal) {
		max-height: 90vh;
	}

	:global(.quick-project-modal .modal-content) {
		overflow-y: auto;
		max-height: calc(90vh - 120px);
	}

	.quick-project-header {
		padding: 1.5rem;
		border-bottom: 1px solid rgba(229, 231, 235, 0.5);
		backdrop-filter: blur(8px);
		border-radius: 0.75rem 0.75rem 0 0;
	}

	:global(.dark) .quick-project-header {
		border-bottom-color: rgba(55, 65, 81, 0.5);
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		width: 100%;
	}

	:global(.close-button) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		padding: 0;
		background: transparent;
		border: none;
		border-radius: 0.375rem;
		color: rgb(107 114 128);
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
		margin-left: 1rem;
	}

	:global(.close-button:hover) {
		background: rgb(243 244 246);
		color: rgb(55 65 81);
	}

	:global(.dark .close-button) {
		color: rgb(156 163 175);
	}

	:global(.dark .close-button:hover) {
		background: rgb(55 65 81);
		color: rgb(209 213 219);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.animate-fadeIn {
		animation: fadeIn 0.3s ease-out;
	}

	@media (max-width: 640px) {
		:global(.quick-project-modal .modal-content) {
			max-height: calc(100vh - 200px);
		}
	}
</style>
