<!-- apps/web/src/lib/components/project/ProjectEditModal.svelte -->
<script lang="ts">
	import FormModal from '$lib/components/ui/FormModal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import TextInput from '$lib/components/ui/TextInput.svelte';
	import Textarea from '$lib/components/ui/Textarea.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import MarkdownToggleField from '$lib/components/ui/MarkdownToggleField.svelte';
	import RecentActivityIndicator from '$lib/components/ui/RecentActivityIndicator.svelte';
	import CoreDimensionsField from '$lib/components/project/CoreDimensionsField.svelte';
	import { toastService } from '$lib/stores/toast.store';
	import { Copy, Calendar, Tag, FileText, Sparkles, Clock, X, FileDown } from 'lucide-svelte';
	import type { Project } from '$lib/types/project';
	import { format } from 'date-fns';

	interface Props {
		isOpen?: boolean;
		project: Project | null;
		onUpdated?: (project: Project) => void;
		onClose?: () => void;
	}

	let { isOpen = $bindable(false), project, onUpdated, onClose }: Props = $props();

	// Form state
	let loading = $state(false);
	let errors = $state<string[]>([]);

	// Form data - using $state for reactivity
	let nameValue = $state('');
	let descriptionValue = $state('');
	let statusValue = $state('active');
	let startDateValue = $state('');
	let endDateValue = $state('');
	let tagsValue = $state<string[]>([]);
	let executiveSummaryValue = $state('');
	let contextValue = $state('');

	// Core dimensions
	let coreIntegrityIdeals = $state<string | null>(null);
	let corePeopleBonds = $state<string | null>(null);
	let coreGoalsMomentum = $state<string | null>(null);
	let coreMeaningIdentity = $state<string | null>(null);
	let coreRealityUnderstanding = $state<string | null>(null);
	let coreTrustSafeguards = $state<string | null>(null);
	let coreOpportunityFreedom = $state<string | null>(null);
	let corePowerResources = $state<string | null>(null);
	let coreHarmonyIntegration = $state<string | null>(null);

	// Tag input
	let tagInput = $state('');

	// Computed values using $derived
	let modalTitle = $derived(project ? `Edit ${project.name || 'Project'}` : 'Edit Project');
	let submitText = $derived('Save Changes');
	let loadingText = $derived('Saving...');

	// Form configuration for FormModal compatibility
	const projectFormConfig = {};

	// Initialize form data when project changes or modal opens using $effect
	$effect(() => {
		if (project && isOpen) {
			nameValue = project.name || '';
			descriptionValue = project.description || '';
			statusValue = project.status || 'active';
			startDateValue = project.start_date || '';
			endDateValue = project.end_date || '';
			tagsValue = project.tags || [];
			executiveSummaryValue = project.executive_summary || '';
			contextValue = project.context || '';

			// Initialize core dimensions
			coreIntegrityIdeals = (project as any).core_integrity_ideals || null;
			corePeopleBonds = (project as any).core_people_bonds || null;
			coreGoalsMomentum = (project as any).core_goals_momentum || null;
			coreMeaningIdentity = (project as any).core_meaning_identity || null;
			coreRealityUnderstanding = (project as any).core_reality_understanding || null;
			coreTrustSafeguards = (project as any).core_trust_safeguards || null;
			coreOpportunityFreedom = (project as any).core_opportunity_freedom || null;
			corePowerResources = (project as any).core_power_resources || null;
			coreHarmonyIntegration = (project as any).core_harmony_integration || null;

			errors = [];
		}
	});

	// Copy context to clipboard
	async function copyContext() {
		if (!contextValue) {
			toastService.add({
				type: 'info',
				message: 'No context to copy'
			});
			return;
		}

		try {
			await navigator.clipboard.writeText(contextValue);
			toastService.add({
				type: 'success',
				message: 'Context copied to clipboard'
			});
		} catch (error) {
			toastService.add({
				type: 'error',
				message: 'Failed to copy context'
			});
		}
	}

	// Export context as PDF (browser-native print)
	function handleExportPDF() {
		if (!project?.id) {
			toastService.add({
				type: 'error',
				message: 'Project not available'
			});
			return;
		}

		// Open print-optimized view in new tab
		// Browser's print dialog will allow user to save as PDF
		window.open(`/projects/${project.id}/print`, '_blank');
		toastService.add({
			type: 'success',
			message: 'Opening print view...'
		});
	}

	// Helper functions for date formatting
	function formatDateForInput(date: Date | string | null): string {
		if (!date) return '';
		try {
			const dateObj = typeof date === 'string' ? new Date(date) : date;
			if (isNaN(dateObj.getTime())) return '';
			return format(dateObj, 'yyyy-MM-dd');
		} catch (error) {
			console.warn('Failed to format date for input:', date, error);
			return '';
		}
	}

	function parseDateFromInput(value: string): string | null {
		if (!value) return null;
		try {
			const date = new Date(value + 'T00:00:00');
			if (isNaN(date.getTime())) return null;
			return date.toISOString();
		} catch (error) {
			console.warn('Failed to parse date from input:', value, error);
			return null;
		}
	}

	// Handle tag input
	function handleTagKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			addTag();
		}
	}

	function addTag() {
		const trimmedTag = tagInput.trim();
		if (trimmedTag && !tagsValue.includes(trimmedTag)) {
			tagsValue = [...tagsValue, trimmedTag];
			tagInput = '';
		}
	}

	function removeTag(tagToRemove: string) {
		tagsValue = tagsValue.filter((tag) => tag !== tagToRemove);
	}

	// Handle core dimension updates
	function handleCoreDimensionUpdate(dimensionKey: string, value: string | null) {
		switch (dimensionKey) {
			case 'core_integrity_ideals':
				coreIntegrityIdeals = value;
				break;
			case 'core_people_bonds':
				corePeopleBonds = value;
				break;
			case 'core_goals_momentum':
				coreGoalsMomentum = value;
				break;
			case 'core_meaning_identity':
				coreMeaningIdentity = value;
				break;
			case 'core_reality_understanding':
				coreRealityUnderstanding = value;
				break;
			case 'core_trust_safeguards':
				coreTrustSafeguards = value;
				break;
			case 'core_opportunity_freedom':
				coreOpportunityFreedom = value;
				break;
			case 'core_power_resources':
				corePowerResources = value;
				break;
			case 'core_harmony_integration':
				coreHarmonyIntegration = value;
				break;
		}
	}

	// Handle form submission (compatible with FormModal)
	async function handleSubmit(formData: Record<string, any>): Promise<void> {
		if (!project?.id) {
			throw new Error('Project ID is required');
		}

		// Validate name
		if (!nameValue.trim()) {
			throw new Error('Project name is required');
		}

		try {
			// Prepare project data using the bound values
			const projectData = {
				name: nameValue.trim(),
				description: descriptionValue.trim(),
				status: statusValue,
				start_date: parseDateFromInput(startDateValue),
				end_date: parseDateFromInput(endDateValue),
				tags: tagsValue,
				executive_summary: executiveSummaryValue.trim(),
				context: contextValue.trim(),
				// Include core dimensions
				core_integrity_ideals: coreIntegrityIdeals?.trim() || null,
				core_people_bonds: corePeopleBonds?.trim() || null,
				core_goals_momentum: coreGoalsMomentum?.trim() || null,
				core_meaning_identity: coreMeaningIdentity?.trim() || null,
				core_reality_understanding: coreRealityUnderstanding?.trim() || null,
				core_trust_safeguards: coreTrustSafeguards?.trim() || null,
				core_opportunity_freedom: coreOpportunityFreedom?.trim() || null,
				core_power_resources: corePowerResources?.trim() || null,
				core_harmony_integration: coreHarmonyIntegration?.trim() || null
			};

			// Update project
			const projectResponse = await fetch(`/api/projects/${project.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(projectData)
			});

			if (!projectResponse.ok) {
				const errorData = await projectResponse.json();
				throw new Error(errorData.error || 'Failed to update project');
			}

			const result = await projectResponse.json();
			const updatedProject: Project = result.data?.project;

			toastService.add({
				type: 'success',
				message: 'Project updated successfully'
			});

			// Call success callback and close modal
			onUpdated?.(updatedProject);
			onClose?.();
		} catch (error) {
			console.error('Error updating project:', error);
			throw error;
		}
	}

	// Initial data for FormModal using $derived
	let initialData = $derived(project || {});

	// Status options
	const statusOptions = [
		{ value: 'active', label: 'Active' },
		{ value: 'paused', label: 'Paused' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'archived', label: 'Archived' }
	];

	// Compute project duration and progress using $derived
	let projectDuration = $derived.by(() => {
		if (!startDateValue || !endDateValue) return null;
		const start = new Date(startDateValue);
		const end = new Date(endDateValue);
		const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
		const progress = Math.min(
			100,
			Math.max(
				0,
				((new Date().getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100
			)
		);
		return { days, progress };
	});
</script>

<FormModal
	{isOpen}
	title=""
	{submitText}
	{loadingText}
	formConfig={projectFormConfig}
	{initialData}
	onSubmit={handleSubmit}
	onDelete={null}
	onClose={() => onClose?.()}
	size="xl"
>
	{#snippet header()}
		<div>
			<div class="sm:hidden">
				<div class="modal-grab-handle"></div>
			</div>
			<!-- Inkprint compact header -->
			<div
				class="flex h-12 items-center justify-between gap-2 px-3 sm:px-4 border-b border-border bg-muted"
			>
				<h2 class="text-sm font-semibold text-foreground truncate">
					{modalTitle}
				</h2>
				<!-- Inkprint close button -->
				<button
					type="button"
					onclick={() => onClose?.()}
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-ink transition-all pressable hover:border-red-600/50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:hover:border-red-400/50 dark:hover:text-red-400"
					aria-label="Close modal"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</div>
	{/snippet}

	{#snippet afterForm()}
		<div class="flex flex-col flex-1 min-h-0 space-y-4 -mt-4 px-4 sm:px-6 lg:px-8">
			<!-- Main Content Area -->
			<div class="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-5 min-h-[50vh] flex-1">
				<!-- Content Section (Takes most space) -->
				<div
					class="lg:col-span-3 flex flex-col space-y-3 h-full min-h-0 bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-all duration-200"
				>
					<!-- Project Name Header -->
					<div class="bg-accent/10 p-4 sm:p-5 rounded-t-xl border-b border-border">
						<label
							for="project-name"
							class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
						>
							Project Name <span class="text-red-500">*</span>
						</label>
						<TextInput
							id="project-name"
							bind:value={nameValue}
							placeholder="Enter a clear, memorable project name"
							size="lg"
							class="font-semibold bg-card border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
						/>
					</div>

					<!-- Content Body -->
					<div
						class="flex-1 flex flex-col space-y-4 px-4 sm:px-5 pb-4 sm:pb-5 overflow-y-auto"
					>
						<!-- Description -->
						<div>
							<label
								for="project-description"
								class="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
							>
								Brief Description
							</label>
							<Textarea
								id="project-description"
								bind:value={descriptionValue}
								placeholder="One-line summary of what this project achieves"
								rows={2}
								class="bg-muted border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
							/>
						</div>

						<!-- Executive Summary -->
						<div>
							<div class="flex items-center gap-2 mb-2">
								<Sparkles class="w-4 h-4 text-purple-600 dark:text-purple-400" />
								<label
									for="executive-summary"
									class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
								>
									Executive Summary
								</label>
							</div>
							<MarkdownToggleField
								value={executiveSummaryValue}
								onUpdate={(newValue) => (executiveSummaryValue = newValue)}
								placeholder="Key highlights, updates, and current status"
								rows={3}
								class="bg-muted border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
							/>
						</div>

						<!-- Project Context - Main Focus -->
						<div class="flex-1 flex flex-col">
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2">
									<FileText class="w-4 h-4 text-green-600 dark:text-green-400" />
									<label
										for="project-context"
										class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
									>
										Detailed Context
									</label>
								</div>
								<div class="flex items-center gap-2">
									<Button
										type="button"
										onclick={copyContext}
										variant="ghost"
										size="sm"
										class="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
									>
										<Copy class="w-3.5 h-3.5" />
										<span class="hidden sm:inline">Copy</span>
									</Button>

									<Button
										type="button"
										onclick={handleExportPDF}
										disabled={!project?.id}
										variant="primary"
										size="sm"
										class="flex items-center gap-1.5"
									>
										<FileDown class="w-3.5 h-3.5" />
										<span class="hidden sm:inline">Export PDF</span>
									</Button>
								</div>
							</div>
							<div class="flex-1 flex flex-col">
								<MarkdownToggleField
									value={contextValue}
									onUpdate={(newValue) => (contextValue = newValue)}
									placeholder="## Background\nWhy this project exists and its importance\n\n## Key Notes\nImportant technical and business context\n\n## Resources\nTools, documentation, and dependencies\n\n## Challenges\nCurrent blockers or areas needing attention"
									rows={10}
									maxRows={20}
									class="flex-1 leading-relaxed bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/10 dark:to-emerald-900/10 border-green-200 dark:border-green-800 focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400"
								/>
							</div>
						</div>

						<!-- Core Dimensions - Strategic Insights -->
						<div class="pt-4 border-t border-border">
							<CoreDimensionsField
								core_integrity_ideals={coreIntegrityIdeals}
								core_people_bonds={corePeopleBonds}
								core_goals_momentum={coreGoalsMomentum}
								core_meaning_identity={coreMeaningIdentity}
								core_reality_understanding={coreRealityUnderstanding}
								core_trust_safeguards={coreTrustSafeguards}
								core_opportunity_freedom={coreOpportunityFreedom}
								core_power_resources={corePowerResources}
								core_harmony_integration={coreHarmonyIntegration}
								onUpdate={handleCoreDimensionUpdate}
							/>
						</div>

						<!-- Character Counts -->
						<div
							class="flex flex-wrap gap-4 text-xs text-muted-foreground pt-3 border-t border-border"
						>
							{#if contextValue.length > 0}
								<span class="flex items-center gap-1">
									<span class="w-2 h-2 bg-green-500 rounded-full"></span>
									{contextValue.length.toLocaleString()} context
								</span>
							{/if}
							{#if executiveSummaryValue.length > 0}
								<span class="flex items-center gap-1">
									<span class="w-2 h-2 bg-purple-500 rounded-full"></span>
									{executiveSummaryValue.length.toLocaleString()} summary
								</span>
							{/if}
							{#if !contextValue && !executiveSummaryValue}
								<span class="text-gray-400 dark:text-gray-500 italic">
									Add project details to enable AI assistance
								</span>
							{/if}
						</div>
					</div>
				</div>

				<!-- Metadata Sidebar -->
				<div
					class="lg:col-span-1 bg-muted rounded-xl border border-border shadow-ink hover:shadow-ink-strong transition-all duration-200 lg:max-h-full lg:overflow-y-auto"
				>
					<div class="bg-accent/10 p-3 sm:p-4 rounded-t-xl border-b border-border">
						<h3
							class="text-sm font-semibold text-foreground uppercase tracking-wider flex items-center"
						>
							<span class="w-2 h-2 bg-indigo-500 rounded-full mr-2 animate-pulse"
							></span>
							Project Details
						</h3>
					</div>

					<div class="p-3 sm:p-4 space-y-4">
						<!-- Status -->
						<div>
							<label
								for="project-status"
								class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block"
							>
								📈 Status
							</label>
							<Select
								id="project-status"
								bind:value={statusValue}
								size="sm"
								class="bg-card border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
							>
								{#each statusOptions as option}
									<option value={option.value}>{option.label}</option>
								{/each}
							</Select>
						</div>

						<!-- Timeline Section -->
						<div class="space-y-3">
							<div
								class="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
							>
								<Calendar class="w-3.5 h-3.5" />
								Timeline
							</div>

							<!-- Start Date -->
							<div>
								<label
									for="project-start-date"
									class="text-xs text-muted-foreground mb-1 block"
								>
									Start Date
								</label>
								<TextInput
									id="project-start-date"
									type="date"
									bind:value={startDateValue}
									size="sm"
									class="bg-card border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								/>
							</div>

							<!-- End Date -->
							<div>
								<label
									for="project-end-date"
									class="text-xs text-muted-foreground mb-1 block"
								>
									End Date
								</label>
								<TextInput
									id="project-end-date"
									type="date"
									bind:value={endDateValue}
									min={startDateValue}
									size="sm"
									class="bg-card border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
								/>
							</div>
						</div>

						<!-- Duration Display -->
						{#if projectDuration}
							<div
								class="bg-blue-50 dark:bg-blue-900 rounded-lg p-3 border border-blue-200 dark:border-blue-800"
							>
								<div class="flex items-center justify-between text-xs mb-2">
									<span class="text-muted-foreground font-medium">Progress</span>
									<span class="font-semibold text-foreground">
										{projectDuration.days} days
									</span>
								</div>
								<div class="w-full bg-muted rounded-full h-2">
									<div
										class="bg-gradient-to-r from-blue-500 to-indigo-500 h-2 rounded-full transition-all duration-500 shadow-sm"
										style="width: {projectDuration.progress}%"
									></div>
								</div>
								<div class="text-xs text-muted-foreground mt-1.5 font-medium">
									{Math.round(projectDuration.progress)}% elapsed
								</div>
							</div>
						{/if}

						<!-- Tags -->
						<div>
							<label
								for="tag-input"
								class="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block flex items-center gap-1.5"
							>
								<Tag class="w-3.5 h-3.5" />
								Tags
							</label>
							<div class="space-y-2">
								<div class="flex gap-1.5">
									<TextInput
										id="tag-input"
										bind:value={tagInput}
										placeholder="Add tag..."
										onkeydown={handleTagKeydown}
										size="sm"
										class="flex-1 bg-card border-border focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
									/>
									<Button
										type="button"
										onclick={addTag}
										variant="ghost"
										size="sm"
										class="!px-3 bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-500"
									>
										+
									</Button>
								</div>
								{#if tagsValue.length > 0}
									<div class="flex flex-wrap gap-1.5">
										{#each tagsValue as tag}
											<span
												class="inline-flex items-center px-2.5 py-1.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full border border-blue-200 dark:border-blue-800"
											>
												{tag}
												<Button
													type="button"
													onclick={() => removeTag(tag)}
													variant="ghost"
													size="sm"
													class="ml-1.5 p-0.5 !text-blue-600 dark:!text-blue-300 hover:!text-blue-800 dark:hover:!text-blue-100"
												>
													<X class="w-3 h-3" />
												</Button>
											</span>
										{/each}
									</div>
								{/if}
							</div>
						</div>

						<!-- Activity Indicator (if editing) -->
						{#if project}
							<hr class="border-border" />
							<div class="bg-muted rounded-lg p-3 border border-border shadow-ink">
								<div class="flex items-center justify-between mb-3">
									<span
										class="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
									>
										⏰ Activity
									</span>
									<RecentActivityIndicator
										createdAt={project.created_at}
										updatedAt={project.updated_at}
										size="sm"
									/>
								</div>
								<div class="grid grid-cols-2 gap-3 text-xs">
									{#if project.created_at}
										<div>
											<span class="text-muted-foreground block mb-0.5"
												>Created</span
											>
											<span class="text-foreground font-medium">
												{format(
													new Date(project.created_at),
													'MMM d, yyyy'
												)}
											</span>
										</div>
									{/if}
									{#if project.updated_at}
										<div>
											<span class="text-muted-foreground block mb-0.5"
												>Updated</span
											>
											<span class="text-foreground font-medium">
												{format(
													new Date(project.updated_at),
													'MMM d, yyyy'
												)}
											</span>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/snippet}
</FormModal>

<style>
	/* Mobile grab handle */
	:global(.modal-grab-handle) {
		width: 36px;
		height: 4px;
		background: rgb(209 213 219);
		border-radius: 2px;
		margin: 0.5rem auto 1rem;
	}

	:global(.dark .modal-grab-handle) {
		background: rgb(75 85 99);
	}

	/* Premium Apple-style shadows and effects */
	:global(.modal-content > div > div) {
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.modal-content > div > div:hover) {
		transform: translateY(-2px);
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.2);
	}

	:global(.dark .modal-content > div > div:hover) {
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
	}

	/* Premium focus states */
	:global(.modal-content input),
	:global(.modal-content textarea),
	:global(.modal-content select) {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.modal-content input:focus),
	:global(.modal-content textarea:focus),
	:global(.modal-content select:focus) {
		outline: none;
		border-color: rgb(59, 130, 246);
		box-shadow:
			0 0 0 4px rgba(59, 130, 246, 0.1),
			0 2px 4px 0 rgba(0, 0, 0, 0.05);
	}

	:global(.dark .modal-content input:focus),
	:global(.dark .modal-content textarea:focus),
	:global(.dark .modal-content select:focus) {
		border-color: rgb(96, 165, 250);
		box-shadow:
			0 0 0 4px rgba(96, 165, 250, 0.15),
			0 2px 4px 0 rgba(0, 0, 0, 0.2);
	}

	/* Premium gradient animations */
	:global(.modal-content .bg-gradient-to-r) {
		background-size: 200% 200%;
		animation: gradient-shift 15s ease infinite;
	}

	@keyframes gradient-shift {
		0% {
			background-position: 0% 50%;
		}
		50% {
			background-position: 100% 50%;
		}
		100% {
			background-position: 0% 50%;
		}
	}

	/* Subtle backdrop blur for overlaying elements */
	:global(.backdrop-blur-sm) {
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
	}

	/* Premium scrollbar styling */
	:global(.modal-content *::-webkit-scrollbar) {
		width: 8px;
		height: 8px;
	}

	:global(.modal-content *::-webkit-scrollbar-track) {
		background: rgba(0, 0, 0, 0.05);
		border-radius: 4px;
	}

	:global(.modal-content *::-webkit-scrollbar-thumb) {
		background: rgba(0, 0, 0, 0.2);
		border-radius: 4px;
	}

	:global(.modal-content *::-webkit-scrollbar-thumb:hover) {
		background: rgba(0, 0, 0, 0.3);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-track) {
		background: rgba(255, 255, 255, 0.05);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-thumb) {
		background: rgba(255, 255, 255, 0.2);
	}

	:global(.dark .modal-content *::-webkit-scrollbar-thumb:hover) {
		background: rgba(255, 255, 255, 0.3);
	}
</style>
